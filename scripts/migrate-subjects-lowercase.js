#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

let prisma;

const SHOULD_EXECUTE = process.argv.includes("--execute");
const MANIFEST_COLLECTION = "subject_migration_manifests";
const BACKUP_COLLECTIONS = [
  "generic_subject_masters",
  "tag_masters",
  "summary_transaction_generic_subjects",
  "summary_transaction_specific_tags",
  "user_default_generic_subjects",
  "user_default_specific_tags",
];

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const fileContents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of fileContents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function loadLocalEnv() {
  const rootDir = path.resolve(__dirname, "..");
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, ".env.local"));
}

function normalizeWhitespace(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeSubjectName(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function pickPreferredText(...values) {
  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (normalized) return normalized;
  }
  return null;
}

function compareSubjects(a, b, normalizedName, type) {
  const aExact = a.name === normalizedName ? 1 : 0;
  const bExact = b.name === normalizedName ? 1 : 0;
  if (aExact !== bExact) return bExact - aExact;

  const aTransactionCount = a._count?.summaryTransactions || 0;
  const bTransactionCount = b._count?.summaryTransactions || 0;
  if (aTransactionCount !== bTransactionCount) return bTransactionCount - aTransactionCount;

  const aDefaultCount = a._count?.defaultForUsers || 0;
  const bDefaultCount = b._count?.defaultForUsers || 0;
  if (aDefaultCount !== bDefaultCount) return bDefaultCount - aDefaultCount;

  const aHasDescription = a.description ? 1 : 0;
  const bHasDescription = b.description ? 1 : 0;
  if (aHasDescription !== bHasDescription) return bHasDescription - aHasDescription;

  if (type === "specific") {
    const aHasCategory = a.category ? 1 : 0;
    const bHasCategory = b.category ? 1 : 0;
    if (aHasCategory !== bHasCategory) return bHasCategory - aHasCategory;
  }

  const createdAtDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  if (createdAtDiff !== 0) return createdAtDiff;

  return String(a.id).localeCompare(String(b.id));
}

function buildPlan(subjects) {
  const grouped = new Map();
  for (const subject of subjects) {
    const normalizedName = normalizeSubjectName(subject.name);
    if (!normalizedName) continue;

    const group = grouped.get(normalizedName) || [];
    group.push(subject);
    grouped.set(normalizedName, group);
  }

  const mergeGroups = [];
  const renameOnly = [];

  for (const [normalizedName, group] of grouped.entries()) {
    if (group.length > 1) {
      mergeGroups.push({
        normalizedName,
        items: group,
      });
      continue;
    }

    const subject = group[0];
    if (subject.name !== normalizedName) {
      renameOnly.push({
        id: subject.id,
        previousName: subject.name,
        normalizedName,
      });
    }
  }

  mergeGroups.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
  renameOnly.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));

  return { mergeGroups, renameOnly };
}

async function runWithConcurrency(items, limit, worker) {
  if (!items.length) return;

  let currentIndex = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (currentIndex < items.length) {
      const index = currentIndex;
      currentIndex += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

async function backupCollection(sourceCollection, backupCollection) {
  await prisma.$runCommandRaw({
    aggregate: sourceCollection,
    pipeline: [{ $match: {} }, { $out: backupCollection }],
    cursor: {},
  });

  const stats = await prisma.$runCommandRaw({
    collStats: backupCollection,
  });

  return Number(stats?.count || 0);
}

async function createManifest(document) {
  await prisma.$runCommandRaw({
    insert: MANIFEST_COLLECTION,
    documents: [document],
  });
}

async function mergeGenericGroup(group, normalizedName) {
  const sorted = [...group].sort((a, b) => compareSubjects(a, b, normalizedName, "generic"));
  const canonical = sorted[0];
  const duplicates = sorted.slice(1);
  const duplicateIds = duplicates.map((item) => item.id);

  const duplicateTransactionLinks = await prisma.summaryTransactionGenericSubject.findMany({
    where: { genericSubjectId: { in: duplicateIds } },
    select: { summaryTransactionId: true },
  });
  const duplicateTransactionIds = unique(
    duplicateTransactionLinks.map((link) => String(link.summaryTransactionId))
  );

  const canonicalTransactionLinks = duplicateTransactionIds.length
    ? await prisma.summaryTransactionGenericSubject.findMany({
        where: {
          genericSubjectId: canonical.id,
          summaryTransactionId: { in: duplicateTransactionIds },
        },
        select: { summaryTransactionId: true },
      })
    : [];
  const canonicalTransactionIdSet = new Set(
    canonicalTransactionLinks.map((link) => String(link.summaryTransactionId))
  );
  const transactionIdsToCreate = duplicateTransactionIds.filter(
    (transactionId) => !canonicalTransactionIdSet.has(transactionId)
  );

  const duplicateDefaultLinks = await prisma.userDefaultGenericSubject.findMany({
    where: { genericSubjectId: { in: duplicateIds } },
    select: { userId: true },
  });
  const duplicateDefaultUserIds = unique(
    duplicateDefaultLinks.map((link) => String(link.userId))
  );

  const canonicalDefaultLinks = duplicateDefaultUserIds.length
    ? await prisma.userDefaultGenericSubject.findMany({
        where: {
          genericSubjectId: canonical.id,
          userId: { in: duplicateDefaultUserIds },
        },
        select: { userId: true },
      })
    : [];
  const canonicalDefaultUserIdSet = new Set(
    canonicalDefaultLinks.map((link) => String(link.userId))
  );
  const defaultUserIdsToCreate = duplicateDefaultUserIds.filter(
    (userId) => !canonicalDefaultUserIdSet.has(userId)
  );

  const mergedDescription = pickPreferredText(
    canonical.description,
    ...duplicates.map((item) => item.description)
  );

  await prisma.$transaction(
    async (tx) => {
      if (transactionIdsToCreate.length) {
        await tx.summaryTransactionGenericSubject.createMany({
          data: transactionIdsToCreate.map((summaryTransactionId) => ({
            summaryTransactionId,
            genericSubjectId: canonical.id,
          })),
        });
      }

      if (defaultUserIdsToCreate.length) {
        await tx.userDefaultGenericSubject.createMany({
          data: defaultUserIdsToCreate.map((userId) => ({
            userId,
            genericSubjectId: canonical.id,
          })),
        });
      }

      await tx.summaryTransactionGenericSubject.deleteMany({
        where: {
          genericSubjectId: { in: duplicateIds },
        },
      });

      await tx.userDefaultGenericSubject.deleteMany({
        where: {
          genericSubjectId: { in: duplicateIds },
        },
      });

      await tx.genericSubjectMaster.update({
        where: { id: canonical.id },
        data: {
          name: normalizedName,
          description: mergedDescription,
        },
      });

      await tx.genericSubjectMaster.deleteMany({
        where: { id: { in: duplicateIds } },
      });
    },
    {
      maxWait: 10000,
      timeout: 60000,
    }
  );

  return {
    normalizedName,
    keptId: canonical.id,
    keptPreviousName: canonical.name,
    removedIds: duplicateIds,
    removedNames: duplicates.map((item) => item.name),
    transactionLinksAdded: transactionIdsToCreate.length,
    transactionLinksDeleted: duplicateTransactionIds.length,
    userDefaultsAdded: defaultUserIdsToCreate.length,
    userDefaultsDeleted: duplicateDefaultUserIds.length,
  };
}

async function mergeSpecificGroup(group, normalizedName) {
  const sorted = [...group].sort((a, b) => compareSubjects(a, b, normalizedName, "specific"));
  const canonical = sorted[0];
  const duplicates = sorted.slice(1);
  const duplicateIds = duplicates.map((item) => item.id);

  const duplicateTransactionLinks = await prisma.summaryTransactionSpecificTag.findMany({
    where: { tagId: { in: duplicateIds } },
    select: { summaryTransactionId: true },
  });
  const duplicateTransactionIds = unique(
    duplicateTransactionLinks.map((link) => String(link.summaryTransactionId))
  );

  const canonicalTransactionLinks = duplicateTransactionIds.length
    ? await prisma.summaryTransactionSpecificTag.findMany({
        where: {
          tagId: canonical.id,
          summaryTransactionId: { in: duplicateTransactionIds },
        },
        select: { summaryTransactionId: true },
      })
    : [];
  const canonicalTransactionIdSet = new Set(
    canonicalTransactionLinks.map((link) => String(link.summaryTransactionId))
  );
  const transactionIdsToCreate = duplicateTransactionIds.filter(
    (transactionId) => !canonicalTransactionIdSet.has(transactionId)
  );

  const duplicateDefaultLinks = await prisma.userDefaultSpecificTag.findMany({
    where: { tagId: { in: duplicateIds } },
    select: { userId: true },
  });
  const duplicateDefaultUserIds = unique(
    duplicateDefaultLinks.map((link) => String(link.userId))
  );

  const canonicalDefaultLinks = duplicateDefaultUserIds.length
    ? await prisma.userDefaultSpecificTag.findMany({
        where: {
          tagId: canonical.id,
          userId: { in: duplicateDefaultUserIds },
        },
        select: { userId: true },
      })
    : [];
  const canonicalDefaultUserIdSet = new Set(
    canonicalDefaultLinks.map((link) => String(link.userId))
  );
  const defaultUserIdsToCreate = duplicateDefaultUserIds.filter(
    (userId) => !canonicalDefaultUserIdSet.has(userId)
  );

  const mergedDescription = pickPreferredText(
    canonical.description,
    ...duplicates.map((item) => item.description)
  );
  const mergedCategory = pickPreferredText(
    canonical.category,
    ...duplicates.map((item) => item.category)
  );
  const categoryVariants = unique(duplicates.map((item) => normalizeWhitespace(item.category)))
    .concat(normalizeWhitespace(canonical.category))
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);

  await prisma.$transaction(
    async (tx) => {
      if (transactionIdsToCreate.length) {
        await tx.summaryTransactionSpecificTag.createMany({
          data: transactionIdsToCreate.map((summaryTransactionId) => ({
            summaryTransactionId,
            tagId: canonical.id,
          })),
        });
      }

      if (defaultUserIdsToCreate.length) {
        await tx.userDefaultSpecificTag.createMany({
          data: defaultUserIdsToCreate.map((userId) => ({
            userId,
            tagId: canonical.id,
          })),
        });
      }

      await tx.summaryTransactionSpecificTag.deleteMany({
        where: {
          tagId: { in: duplicateIds },
        },
      });

      await tx.userDefaultSpecificTag.deleteMany({
        where: {
          tagId: { in: duplicateIds },
        },
      });

      await tx.tagMaster.update({
        where: { id: canonical.id },
        data: {
          name: normalizedName,
          description: mergedDescription,
          category: mergedCategory,
        },
      });

      await tx.tagMaster.deleteMany({
        where: { id: { in: duplicateIds } },
      });
    },
    {
      maxWait: 10000,
      timeout: 60000,
    }
  );

  return {
    normalizedName,
    keptId: canonical.id,
    keptPreviousName: canonical.name,
    keptCategory: mergedCategory,
    removedIds: duplicateIds,
    removedNames: duplicates.map((item) => item.name),
    transactionLinksAdded: transactionIdsToCreate.length,
    transactionLinksDeleted: duplicateTransactionIds.length,
    userDefaultsAdded: defaultUserIdsToCreate.length,
    userDefaultsDeleted: duplicateDefaultUserIds.length,
    categoryVariants,
  };
}

async function main() {
  loadLocalEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set. Add it to .env or .env.local before running the migration.");
  }

  prisma = new PrismaClient({
    log: ["error"],
  });

  const [genericSubjects, specificSubjects] = await Promise.all([
    prisma.genericSubjectMaster.findMany({
      include: {
        _count: {
          select: {
            summaryTransactions: true,
            defaultForUsers: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
    prisma.tagMaster.findMany({
      include: {
        _count: {
          select: {
            summaryTransactions: true,
            defaultForUsers: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    }),
  ]);

  const genericPlan = buildPlan(genericSubjects);
  const specificPlan = buildPlan(specificSubjects);

  const plannedChanges =
    genericPlan.mergeGroups.length +
    genericPlan.renameOnly.length +
    specificPlan.mergeGroups.length +
    specificPlan.renameOnly.length;

  const preview = {
    mode: SHOULD_EXECUTE ? "execute" : "dry-run",
    totalGenericSubjects: genericSubjects.length,
    totalSpecificSubjects: specificSubjects.length,
    generic: {
      mergeGroups: genericPlan.mergeGroups.length,
      duplicateSubjectsToRemove: genericPlan.mergeGroups.reduce(
        (total, group) => total + group.items.length - 1,
        0
      ),
      renameOnly: genericPlan.renameOnly.length,
    },
    specific: {
      mergeGroups: specificPlan.mergeGroups.length,
      duplicateSubjectsToRemove: specificPlan.mergeGroups.reduce(
        (total, group) => total + group.items.length - 1,
        0
      ),
      renameOnly: specificPlan.renameOnly.length,
    },
  };

  console.log(JSON.stringify(preview, null, 2));

  if (!SHOULD_EXECUTE) {
    console.log("Dry run complete. Re-run with --execute to create backups and apply the migration.");
    return;
  }

  if (!plannedChanges) {
    console.log("No subject renames or merges are required.");
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").toLowerCase();
  const backupCollections = [];

  for (const sourceCollection of BACKUP_COLLECTIONS) {
    const backupCollectionName = `backup_${sourceCollection}_${timestamp}`;
    const copiedCount = await backupCollection(sourceCollection, backupCollectionName);
    backupCollections.push({
      sourceCollection,
      backupCollection: backupCollectionName,
      copiedCount,
    });
  }

  const report = {
    kind: "subject-lowercase-migration",
    executedAt: new Date().toISOString(),
    backupCollections,
    preview,
    generic: {
      merged: [],
      renamed: [],
    },
    specific: {
      merged: [],
      renamed: [],
    },
  };

  for (const group of genericPlan.mergeGroups) {
    const result = await mergeGenericGroup(group.items, group.normalizedName);
    report.generic.merged.push(result);
  }

  let genericRenameCount = 0;
  await runWithConcurrency(genericPlan.renameOnly, 12, async (item) => {
    await prisma.genericSubjectMaster.update({
      where: { id: item.id },
      data: { name: item.normalizedName },
    });
    report.generic.renamed.push(item);
    genericRenameCount += 1;
    if (genericRenameCount % 50 === 0 || genericRenameCount === genericPlan.renameOnly.length) {
      console.log(`Generic renames completed: ${genericRenameCount}/${genericPlan.renameOnly.length}`);
    }
  });

  for (const group of specificPlan.mergeGroups) {
    const result = await mergeSpecificGroup(group.items, group.normalizedName);
    report.specific.merged.push(result);
  }

  let specificRenameCount = 0;
  await runWithConcurrency(specificPlan.renameOnly, 12, async (item) => {
    await prisma.tagMaster.update({
      where: { id: item.id },
      data: { name: item.normalizedName },
    });
    report.specific.renamed.push(item);
    specificRenameCount += 1;
    if (specificRenameCount % 50 === 0 || specificRenameCount === specificPlan.renameOnly.length) {
      console.log(`Specific renames completed: ${specificRenameCount}/${specificPlan.renameOnly.length}`);
    }
  });

  await createManifest(report);

  const outcome = {
    executedAt: report.executedAt,
    backupCollections: backupCollections.map((item) => item.backupCollection),
    genericMerged: report.generic.merged.length,
    genericRenamed: report.generic.renamed.length,
    specificMerged: report.specific.merged.length,
    specificRenamed: report.specific.renamed.length,
  };

  console.log(JSON.stringify(outcome, null, 2));
  console.log(`Migration manifest written to collection: ${MANIFEST_COLLECTION}`);
}

main()
  .catch((error) => {
    console.error("Subject lowercase migration failed.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

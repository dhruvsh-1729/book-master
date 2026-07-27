import type { Prisma, PrismaClient } from "@prisma/client";
import {
  buildCaseInsensitiveNameFilter,
  normalizeCategory,
  normalizeOptionalText,
  normalizeSubjectName,
} from "@/lib/subjects/normalization";

type TxClient = PrismaClient | Prisma.TransactionClient;

export type PendingSubjectSuggestion = {
  name: string;
  subjectId?: string | null;
  tagId?: string | null;
  description?: string | null;
  category?: string | null;
  reason?: string | null;
  source?: "existing" | "new" | "manual" | string;
  selected?: boolean;
};

const clip = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
};

export function normalizePendingSubjectSuggestions(input: unknown): PendingSubjectSuggestion[] {
  if (!Array.isArray(input)) return [];

  const seen = new Set<string>();
  const suggestions: PendingSubjectSuggestion[] = [];

  for (const item of input) {
    const normalizedName = normalizeSubjectName(String(item?.name || ""));
    if (!normalizedName || seen.has(normalizedName)) continue;

    suggestions.push({
      name: normalizedName,
      subjectId: clip(item?.subjectId, 80),
      tagId: clip(item?.tagId, 80),
      description: clip(item?.description, 300),
      category: normalizeCategory(item?.category || null),
      reason: clip(item?.reason, 260),
      source: clip(item?.source, 40) || "manual",
      selected: item?.selected !== false,
    });
    seen.add(normalizedName);
  }

  return suggestions.slice(0, 24);
}

export function selectedSuggestions(input: unknown) {
  return normalizePendingSubjectSuggestions(input).filter((suggestion) => suggestion.selected !== false);
}

async function findGenericByName(db: TxClient, name: string) {
  return db.genericSubjectMaster.findFirst({
    where: { name: buildCaseInsensitiveNameFilter(name) },
    select: { id: true, name: true },
  });
}

async function findTagByName(db: TxClient, name: string) {
  return db.tagMaster.findFirst({
    where: { name: buildCaseInsensitiveNameFilter(name) },
    select: { id: true, name: true },
  });
}

export async function resolveGenericSubjectId(db: TxClient, suggestion: PendingSubjectSuggestion) {
  if (suggestion.subjectId) {
    const existingById = await db.genericSubjectMaster.findUnique({
      where: { id: suggestion.subjectId },
      select: { id: true },
    });
    if (existingById) return existingById.id;
  }

  const normalizedName = normalizeSubjectName(suggestion.name);
  const existingByName = await findGenericByName(db, normalizedName);
  if (existingByName) return existingByName.id;

  try {
    const created = await db.genericSubjectMaster.create({
      data: {
        name: normalizedName,
        description: normalizeOptionalText(suggestion.description),
      },
      select: { id: true },
    });
    return created.id;
  } catch (error: any) {
    if (error?.code === "P2002") {
      const existingAfterConflict = await findGenericByName(db, normalizedName);
      if (existingAfterConflict) return existingAfterConflict.id;
    }
    throw error;
  }
}

export async function resolveSpecificTagId(db: TxClient, suggestion: PendingSubjectSuggestion) {
  const providedId = suggestion.tagId || suggestion.subjectId;
  if (providedId) {
    const existingById = await db.tagMaster.findUnique({
      where: { id: providedId },
      select: { id: true },
    });
    if (existingById) return existingById.id;
  }

  const normalizedName = normalizeSubjectName(suggestion.name);
  const existingByName = await findTagByName(db, normalizedName);
  if (existingByName) return existingByName.id;

  try {
    const created = await db.tagMaster.create({
      data: {
        name: normalizedName,
        description: normalizeOptionalText(suggestion.description),
        category: normalizeCategory(suggestion.category),
      },
      select: { id: true },
    });
    return created.id;
  } catch (error: any) {
    if (error?.code === "P2002") {
      const existingAfterConflict = await findTagByName(db, normalizedName);
      if (existingAfterConflict) return existingAfterConflict.id;
    }
    throw error;
  }
}

export async function replaceTransactionSubjectLinks({
  db,
  summaryTransactionId,
  genericSubjects,
  specificSubjects,
}: {
  db: TxClient;
  summaryTransactionId: string;
  genericSubjects: unknown;
  specificSubjects: unknown;
}) {
  const genericIds: string[] = [];
  const specificIds: string[] = [];

  for (const suggestion of selectedSuggestions(genericSubjects)) {
    genericIds.push(await resolveGenericSubjectId(db, suggestion));
  }

  for (const suggestion of selectedSuggestions(specificSubjects)) {
    specificIds.push(await resolveSpecificTagId(db, suggestion));
  }

  const uniqueGenericIds = Array.from(new Set(genericIds));
  const uniqueSpecificIds = Array.from(new Set(specificIds));

  await db.summaryTransactionGenericSubject.deleteMany({ where: { summaryTransactionId } });
  await db.summaryTransactionSpecificTag.deleteMany({ where: { summaryTransactionId } });

  if (uniqueGenericIds.length) {
    await db.summaryTransactionGenericSubject.createMany({
      data: uniqueGenericIds.map((genericSubjectId) => ({
        summaryTransactionId,
        genericSubjectId,
      })),
    });
  }

  if (uniqueSpecificIds.length) {
    await db.summaryTransactionSpecificTag.createMany({
      data: uniqueSpecificIds.map((tagId) => ({
        summaryTransactionId,
        tagId,
      })),
    });
  }

  return {
    genericSubjectIds: uniqueGenericIds,
    specificSubjectIds: uniqueSpecificIds,
  };
}

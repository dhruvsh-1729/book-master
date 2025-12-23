import type { NextApiRequest, NextApiResponse } from "next";
import { getUserIdFromRequest } from "@/lib/auth";
import prisma from "@/lib/prisma";

type SubjectType = "generic" | "specific";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const {
    type,
    fromType,
    toType,
    wrongId,
    rightId,
    rightName,
    rightCategory,
  } = req.body ?? {};

  const sourceType: SubjectType | undefined = (fromType || type) as SubjectType | undefined;
  const targetType: SubjectType | undefined = (toType || type) as SubjectType | undefined;

  if (!sourceType || !targetType || !wrongId) {
    return res.status(400).json({ error: "fromType, toType, and wrongId are required" });
  }
  if (!["generic", "specific"].includes(sourceType) || !["generic", "specific"].includes(targetType)) {
    return res.status(400).json({ error: "Invalid fromType or toType" });
  }

  // Same-type replace (backward compatible with previous behavior)
  if (sourceType === targetType) {
    if (!rightId) return res.status(400).json({ error: "rightId is required for replace" });
    if (wrongId === rightId) {
      return res.status(400).json({ error: "Choose different subjects for replace" });
    }

    try {
      if (sourceType === "generic") {
        const right = await prisma.genericSubjectMaster.findFirst({ where: { id: String(rightId) } });
        if (!right) return res.status(400).json({ error: "Correct generic subject not found" });

        const txs = await prisma.summaryTransaction.findMany({
          where: {
            userId,
            genericSubjects: { some: { genericSubjectId: String(wrongId) } },
          },
          select: { id: true },
        });
        const ids = txs.map((t) => t.id);
        if (!ids.length) return res.status(200).json({ updated: 0 });

        const existingRight = await prisma.summaryTransactionGenericSubject.findMany({
          where: { summaryTransactionId: { in: ids }, genericSubjectId: String(rightId) },
          select: { summaryTransactionId: true },
        });
        const existingSet = new Set(existingRight.map((r) => r.summaryTransactionId));
        const toCreate = ids.filter((id) => !existingSet.has(id));

        const [created, deleted] = await prisma.$transaction([
          prisma.summaryTransactionGenericSubject.createMany({
            data: toCreate.map((id) => ({ summaryTransactionId: id, genericSubjectId: String(rightId) })),
          }),
          prisma.summaryTransactionGenericSubject.deleteMany({
            where: { summaryTransactionId: { in: ids }, genericSubjectId: String(wrongId) },
          }),
        ]);

        return res.status(200).json({ updated: Math.max(created.count + deleted.count, ids.length) });
      }

      const right = await prisma.tagMaster.findFirst({ where: { id: String(rightId) } });
      if (!right) return res.status(400).json({ error: "Correct specific subject not found" });

      const txs = await prisma.summaryTransaction.findMany({
        where: {
          userId,
          specificSubjects: { some: { tagId: String(wrongId) } },
        },
        select: { id: true },
      });
      const ids = txs.map((t) => t.id);
      if (!ids.length) return res.status(200).json({ updated: 0 });

      const existingRight = await prisma.summaryTransactionSpecificTag.findMany({
        where: { summaryTransactionId: { in: ids }, tagId: String(rightId) },
        select: { summaryTransactionId: true },
      });
      const existingSet = new Set(existingRight.map((r) => r.summaryTransactionId));
      const toCreate = ids.filter((id) => !existingSet.has(id));

      const [created, deleted] = await prisma.$transaction([
        prisma.summaryTransactionSpecificTag.createMany({
          data: toCreate.map((id) => ({ summaryTransactionId: id, tagId: String(rightId) })),
        }),
        prisma.summaryTransactionSpecificTag.deleteMany({
          where: { summaryTransactionId: { in: ids }, tagId: String(wrongId) },
        }),
      ]);

      return res.status(200).json({ updated: Math.max(created.count + deleted.count, ids.length) });
    } catch (error: any) {
      console.error("POST /subjects/replace error", error);
      return res.status(500).json({ error: "Failed to replace subjects" });
    }
  }

  // Cross-type exchange/move
  try {
    const isGenericToSpecific = sourceType === "generic" && targetType === "specific";
    const sourceId = String(wrongId);
    const desiredName = String(rightName || "").trim();

    if (!sourceId) {
      return res.status(400).json({ error: "Source subject is required" });
    }

    if (!rightId && !desiredName) {
      return res.status(400).json({ error: "Provide a target subject or name to create" });
    }

    if (isGenericToSpecific) {
      const source = await prisma.genericSubjectMaster.findFirst({ where: { id: sourceId } });
      if (!source) return res.status(400).json({ error: "Generic subject not found" });

      let createdTarget = false;
      let target = rightId
        ? await prisma.tagMaster.findFirst({ where: { id: String(rightId) } })
        : null;

      if (!target) {
        const targetName = desiredName || source.name;
        const existing = await prisma.tagMaster.findFirst({ where: { name: targetName } });
        target =
          existing ||
          (await prisma.tagMaster.create({
            data: {
              name: targetName,
              description: source.description ?? null,
              category: rightCategory ? String(rightCategory) : null,
            },
          }));
        createdTarget = !existing;
      }

      const txs = await prisma.summaryTransaction.findMany({
        where: {
          userId,
          genericSubjects: { some: { genericSubjectId: sourceId } },
        },
        select: { id: true },
      });
      const ids = txs.map((t) => t.id);
      if (!ids.length) return res.status(200).json({ updated: 0, targetId: target.id, createdTarget });

      const existingTargetLinks = await prisma.summaryTransactionSpecificTag.findMany({
        where: { summaryTransactionId: { in: ids }, tagId: target.id },
        select: { summaryTransactionId: true },
      });
      const existingSet = new Set(existingTargetLinks.map((r) => r.summaryTransactionId));
      const toCreate = ids.filter((id) => !existingSet.has(id));

      const [created, deleted] = await prisma.$transaction([
        prisma.summaryTransactionSpecificTag.createMany({
          data: toCreate.map((id) => ({ summaryTransactionId: id, tagId: target!.id })),
        }),
        prisma.summaryTransactionGenericSubject.deleteMany({
          where: { summaryTransactionId: { in: ids }, genericSubjectId: sourceId },
        }),
      ]);

      return res.status(200).json({
        updated: Math.max(created.count + deleted.count, ids.length),
        targetId: target.id,
        createdTarget,
      });
    }

    // specific -> generic
    const source = await prisma.tagMaster.findFirst({ where: { id: sourceId } });
    if (!source) return res.status(400).json({ error: "Specific subject not found" });

    let createdTarget = false;
    let target = rightId
      ? await prisma.genericSubjectMaster.findFirst({ where: { id: String(rightId) } })
      : null;

    if (!target) {
      const targetName = desiredName || source.name;
      const existing = await prisma.genericSubjectMaster.findFirst({ where: { name: targetName } });
      target =
        existing ||
        (await prisma.genericSubjectMaster.create({
          data: {
            name: targetName,
            description: source.description ?? null,
          },
        }));
      createdTarget = !existing;
    }

    const txs = await prisma.summaryTransaction.findMany({
      where: {
        userId,
        specificSubjects: { some: { tagId: sourceId } },
      },
      select: { id: true },
    });
    const ids = txs.map((t) => t.id);
    if (!ids.length) return res.status(200).json({ updated: 0, targetId: target.id, createdTarget });

    const existingTargetLinks = await prisma.summaryTransactionGenericSubject.findMany({
      where: { summaryTransactionId: { in: ids }, genericSubjectId: target.id },
      select: { summaryTransactionId: true },
    });
    const existingSet = new Set(existingTargetLinks.map((r) => r.summaryTransactionId));
    const toCreate = ids.filter((id) => !existingSet.has(id));

    const [created, deleted] = await prisma.$transaction([
      prisma.summaryTransactionGenericSubject.createMany({
        data: toCreate.map((id) => ({ summaryTransactionId: id, genericSubjectId: target!.id })),
      }),
      prisma.summaryTransactionSpecificTag.deleteMany({
        where: { summaryTransactionId: { in: ids }, tagId: sourceId },
      }),
    ]);

    return res.status(200).json({
      updated: Math.max(created.count + deleted.count, ids.length),
      targetId: target.id,
      createdTarget,
    });
  } catch (error: any) {
    console.error("POST /subjects/replace error", error);
    return res.status(500).json({ error: "Failed to replace subjects" });
  }
}

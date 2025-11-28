import type { NextApiRequest, NextApiResponse } from "next";
import { getUserIdFromRequest } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const { type, wrongId, rightId } = req.body ?? {};
  if (!type || !wrongId || !rightId) {
    return res.status(400).json({ error: "type, wrongId, and rightId are required" });
  }
  if (wrongId === rightId) {
    return res.status(400).json({ error: "Choose different subjects for replace" });
  }

  try {
    if (type === "generic") {
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

      // Avoid duplicate inserts: only create links that don't already exist
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

    if (type === "specific") {
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
    }

    return res.status(400).json({ error: "Invalid type" });
  } catch (error: any) {
    console.error("POST /subjects/replace error", error);
    return res.status(500).json({ error: "Failed to replace subjects" });
  }
}

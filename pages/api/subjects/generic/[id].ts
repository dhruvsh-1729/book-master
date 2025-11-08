// pages/api/subjects/generic/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = toStr(req.query.id);
  if (!id) return res.status(400).json({ error: "Generic subject ID is required" });

  if (req.method === "GET") {
    try {
      // IMPORTANT: summaryTransactions here are JOIN ROWS (SummaryTransactionGenericSubject)
      // We include the *actual* transaction via `summaryTransaction` and its `book`.
      const subject = await prisma.genericSubjectMaster.findUnique({
        where: { id },
        include: {
          summaryTransactions: {
            include: {
              summaryTransaction: {
                select: {
                  id: true,
                  srNo: true,
                  title: true,
                  book: { select: { id: true, bookName: true, libraryNumber: true } },
                },
              },
            },
            orderBy: { createdAt: "asc" }, // order join rows; we’ll still sort by srNo below just in case
          },
          _count: { select: { summaryTransactions: true } },
        },
      });

      if (!subject) return res.status(404).json({ error: "Generic subject not found" });

      // Flatten to return a clean array of transactions like before
      const flattened = (subject.summaryTransactions || [])
        .map((link) => link.summaryTransaction)
        .filter(Boolean)
        .sort((a, b) => (a.srNo ?? 0) - (b.srNo ?? 0));

      return res.status(200).json({
        ...subject,
        // replace join rows with the actual transactions for a friendly API
        summaryTransactions: flattened,
      });
    } catch (e) {
      console.error("GET /subjects/generic/[id] error", e);
      return res.status(500).json({ error: "Failed to fetch generic subject" });
    }
  } else if (req.method === "PUT") {
    try {
      const { name, description } = (req.body ?? {}) as {
        name?: string;
        description?: string | null;
      };
      if (!name || !String(name).trim())
        return res.status(400).json({ error: "Name is required" });

      const updated = await prisma.genericSubjectMaster.update({
        where: { id },
        data: {
          name: String(name).trim(),
          description: description ?? null,
        },
        include: {
          _count: { select: { summaryTransactions: true } },
        },
      });

      return res.status(200).json(updated);
    } catch (e: any) {
      // Prisma error codes still apply with Mongo provider
      if (e?.code === "P2002")
        return res.status(400).json({ error: "Generic subject name already exists" });
      if (e?.code === "P2025")
        return res.status(404).json({ error: "Generic subject not found" });
      console.error("PUT /subjects/generic/[id] error", e);
      return res.status(500).json({ error: "Failed to update generic subject" });
    }
  } else if (req.method === "DELETE") {
    try {
      // Check usage against JOIN ROWS count
      const usage = await prisma.genericSubjectMaster.findUnique({
        where: { id },
        include: { _count: { select: { summaryTransactions: true } } },
      });
      if (!usage) return res.status(404).json({ error: "Generic subject not found" });

      if (usage._count.summaryTransactions > 0) {
        return res
          .status(400)
          .json({ error: "Cannot delete a subject that is used by transactions" });
      }

      await prisma.genericSubjectMaster.delete({ where: { id } });
      return res.status(204).end();
    } catch (e) {
      console.error("DELETE /subjects/generic/[id] error", e);
      return res.status(500).json({ error: "Failed to delete generic subject" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

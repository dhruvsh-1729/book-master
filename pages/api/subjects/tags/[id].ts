// pages/api/subjects/tags/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = toStr(req.query.id);
  if (!id) return res.status(400).json({ error: "Tag ID is required" });

  if (req.method === "GET") {
    try {
      const tag = await prisma.tagMaster.findUnique({
        where: { id },
        include: { _count: { select: { summaryTransactions: true } } },
      });
      if (!tag) return res.status(404).json({ error: "Tag not found" });
      return res.status(200).json(tag);
    } catch (e) {
      console.error("GET /subjects/tags/[id] error", e);
      return res.status(500).json({ error: "Failed to fetch tag" });
    }
  } else if (req.method === "PUT") {
    try {
      const { name, description, category } = req.body ?? {};
      if (!name || !String(name).trim())
        return res.status(400).json({ error: "Name is required" });

      const updated = await prisma.tagMaster.update({
        where: { id },
        data: {
          name: String(name).trim(),
          description: description ?? null,
          category: category ?? null,
        },
        include: { _count: { select: { summaryTransactions: true } } },
      });

      return res.status(200).json(updated);
    } catch (e: any) {
      if (e?.code === "P2025")
        return res.status(404).json({ error: "Tag not found" });
      if (e?.code === "P2002")
        return res.status(400).json({ error: "Tag name already exists" });
      console.error("PUT /subjects/tags/[id] error", e);
      return res.status(500).json({ error: "Failed to update tag" });
    }
  } else if (req.method === "DELETE") {
    try {
      const usage = await prisma.tagMaster.findUnique({
        where: { id },
        include: { _count: { select: { summaryTransactions: true } } },
      });
      if (!usage) return res.status(404).json({ error: "Tag not found" });

      if (usage._count.summaryTransactions > 0) {
        return res
          .status(400)
          .json({ error: "Cannot delete tag that is used in transactions" });
      }

      await prisma.tagMaster.delete({ where: { id } });
      return res.status(204).end();
    } catch (e: any) {
      if (e?.code === "P2025")
        return res.status(404).json({ error: "Tag not found" });
      console.error("DELETE /subjects/tags/[id] error", e);
      return res.status(500).json({ error: "Failed to delete tag" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

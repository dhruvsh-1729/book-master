// pages/api/subjects/tags/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

const toInt = (v: unknown, def = 1, min = 1, max?: number): number => {
  const n = Number(toStr(v, String(def)));
  const clamped = Number.isFinite(n) ? Math.max(min, n) : def;
  return max ? Math.min(clamped, max) : clamped;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      const page = toInt(req.query.page, 1, 1);
      const limit = toInt(req.query.limit, 50, 1, 200);
      const search = toStr(req.query.search).trim();
      const category = toStr(req.query.category).trim();

      const AND: any[] = [];
      if (search) {
        AND.push({
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
            { category: { contains: search, mode: "insensitive" } },
          ],
        });
      }
      if (category) {
        AND.push({ category: { contains: category, mode: "insensitive" } });
      }
      const where = AND.length ? { AND } : undefined;

      const [tags, total] = await Promise.all([
        prisma.tagMaster.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ category: "asc" }, { name: "asc" }],
          include: { _count: { select: { summaryTransactions: true } } },
        }),
        prisma.tagMaster.count({ where }),
      ]);

      return res.status(200).json({
        tags,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (e) {
      console.error("GET /subjects/tags error", e);
      return res.status(500).json({ error: "Failed to fetch tags" });
    }
  } else if (req.method === "POST") {
    try {
      const { name, description, category } = req.body ?? {};
      if (!name || !String(name).trim())
        return res.status(400).json({ error: "Name is required" });

      const tag = await prisma.tagMaster.create({
        data: {
          name: String(name).trim(),
          description: description ?? null,
          category: category ?? null,
        },
        include: { _count: { select: { summaryTransactions: true } } },
      });

      return res.status(201).json(tag);
    } catch (e: any) {
      if (e?.code === "P2002")
        return res.status(400).json({ error: "Tag name already exists" });
      console.error("POST /subjects/tags error", e);
      return res.status(500).json({ error: "Failed to create tag" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

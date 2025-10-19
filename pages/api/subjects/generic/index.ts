// pages/api/subjects/generic/index.ts
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

      const where =
        search.length > 0
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" as const } },
                { description: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : undefined;

      const [subjects, total] = await Promise.all([
        prisma.genericSubjectMaster.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ name: "asc" }],
          include: { _count: { select: { summaryTransactions: true } } },
        }),
        prisma.genericSubjectMaster.count({ where }),
      ]);

      return res.status(200).json({
        subjects,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (e) {
      console.error("GET /subjects/generic-subjects error", e);
      return res.status(500).json({ error: "Failed to fetch generic subjects" });
    }
  } else if (req.method === "POST") {
    try {
      const { name, description } = req.body ?? {};
      if (!name || !String(name).trim())
        return res.status(400).json({ error: "Name is required" });

      const existing = await prisma.genericSubjectMaster.findUnique({
        where: { name: String(name) },
      });
      if (existing)
        return res.status(400).json({ error: "Generic subject already exists" });

      const created = await prisma.genericSubjectMaster.create({
        data: {
          name: String(name).trim(),
          description: description ?? null,
        },
        include: { _count: { select: { summaryTransactions: true } } },
      });

      return res.status(201).json(created);
    } catch (e) {
      console.error("POST /subjects/generic-subjects error", e);
      return res.status(500).json({ error: "Failed to create generic subject" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

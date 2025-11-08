// pages/api/books/index.ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

const toInt = (v: unknown, def = 1, min = 1, max?: number): number => {
  const n = Number(toStr(v, String(def)));
  const clamped = Number.isFinite(n) ? Math.max(min, n) : def;
  return max ? Math.min(clamped, max) : clamped;
};

const paginate = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "GET") {
    try {
      const page = toInt(req.query.page, 1, 1);
      const limit = toInt(req.query.limit, 10, 1, 100);
      const search = toStr(req.query.search).trim();

      const where = {
        userId,
        ...(search
          ? {
              OR: [
                { bookName: { contains: search, mode: "insensitive" as const } },
                { publisherName: { contains: search, mode: "insensitive" as const } },
                { grade: { contains: search, mode: "insensitive" as const } },
                { remark: { contains: search, mode: "insensitive" as const } },
                { libraryNumber: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [{ skip, take }] = [paginate(page, limit)];
      const [books, total] = await Promise.all([
        prisma.bookMaster.findMany({
          where,
          skip,
          take,
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            libraryNumber: true,
            bookName: true,
            bookSummary: true,
            publisherName: true,
            grade: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.bookMaster.count({ where }),
      ]);

      return res.status(200).json({
        books,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (e) {
      console.error("GET /books error", e);
      return res.status(500).json({ error: "Failed to fetch books" });
    }
  } else if (req.method === "POST") {
    try {
      const {
        libraryNumber,
        bookName,
        bookSummary,
        pageNumbers,
        grade,
        remark,
        edition,
        publisherName,
      } = req.body ?? {};

      if (!libraryNumber || !bookName) {
        return res
          .status(400)
          .json({ error: "Library number and book name are required" });
      }

      const created = await prisma.bookMaster.create({
        data: {
          libraryNumber: String(libraryNumber),
          bookName: String(bookName),
          bookSummary: bookSummary ?? null,
          pageNumbers: pageNumbers ?? null,
          grade: grade ?? null,
          remark: remark ?? null,
          edition: edition ?? null,
          publisherName: publisherName ?? null,
          userId,
        },
      });

      return res.status(201).json(created);
    } catch (e: any) {
      if (e?.code === "P2002") {
        return res.status(400).json({ error: "Library number already exists" });
      }
      console.error("POST /books error", e);
      return res.status(500).json({ error: "Failed to create book" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

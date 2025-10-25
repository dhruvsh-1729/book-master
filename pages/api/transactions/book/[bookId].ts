// pages/api/transactions/book/[bookId].ts
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
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const page = toInt(req.query.page, 1, 1);
    const limit = toInt(req.query.limit, 50, 1, 500);
    const q = toStr(req.query.search).trim();
    const bookId = toStr(req.query.bookId).trim();

    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    const book = await prisma.bookMaster.findUnique({
      where: { id: bookId },
      select: {
        id: true,
        bookName: true,
        libraryNumber: true,
        bookSummary: true,
        pageNumbers: true,
      },
    });
    if (!book) return res.status(404).json({ error: "Book not found" });

    const where = {
      bookId,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { keywords: { contains: q, mode: "insensitive" as const } },
              { remark: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [transactions, total] = await Promise.all([
      prisma.summaryTransaction.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          genericSubject: true,
          specificSubject: true,
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ srNo: "asc" }],
      }),
      prisma.summaryTransaction.count({ where }),
    ]);

    return res.status(200).json({
      book,
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (e) {
    console.error("GET /transactions/book/[bookId] error", e);
    return res.status(500).json({ error: "Failed to fetch book transactions" });
  }
}

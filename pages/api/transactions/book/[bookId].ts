// pages/api/transactions/book/[bookId].ts
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

const transactionInclude = {
  user: { select: { id: true, name: true, email: true } },
  genericSubjects: { include: { genericSubject: true } },
  specificSubjects: { include: { tag: true } },
  images: true,
} as const;

const mapTransaction = (transaction: any) => ({
  ...transaction,
  images: transaction.images || [],
  genericSubjects: (transaction.genericSubjects || [])
    .map((link: any) => link.genericSubject)
    .filter(Boolean),
  specificSubjects: (transaction.specificSubjects || [])
    .map((link: any) => link.tag)
    .filter(Boolean),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const page = toInt(req.query.page, 1, 1);
    const limit = toInt(req.query.limit, 50, 1, 500);
    const q = toStr(req.query.search).trim();
    const bookId = toStr(req.query.bookId).trim();

    if (!bookId) return res.status(400).json({ error: "bookId is required" });

    const book = await prisma.bookMaster.findFirst({
      where: { id: bookId, userId },
      select: {
        id: true,
        bookName: true,
        libraryNumber: true,
        bookSummary: true,
        pageNumbers: true,
        coverImageUrl: true,
        coverImagePublicId: true,
      },
    });
    if (!book) return res.status(404).json({ error: "Book not found" });

    const where = {
      bookId,
      userId,
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
      prisma.summaryTransaction
        .findMany({
          where,
          include: transactionInclude,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ srNo: "asc" }],
        })
        .then((list) => list.map(mapTransaction)),
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

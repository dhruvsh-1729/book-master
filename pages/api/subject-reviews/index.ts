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
    const limit = toInt(req.query.limit, 12, 1, 100);
    const status = toStr(req.query.status, "needs_review").trim() || "needs_review";
    const search = toStr(req.query.search).trim();

    const where: any = {
      userId,
      subjectReviewStatus: status,
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { keywords: { contains: search, mode: "insensitive" } },
        { summary: { contains: search, mode: "insensitive" } },
      ];
    }

    const [transactions, total] = await Promise.all([
      prisma.summaryTransaction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ updatedAt: "desc" }],
        include: {
          book: {
            select: {
              id: true,
              bookName: true,
              libraryNumber: true,
              bookSummary: true,
              pageNumbers: true,
            },
          },
          genericSubjects: { include: { genericSubject: true } },
          specificSubjects: { include: { tag: true } },
          images: true,
        },
      }),
      prisma.summaryTransaction.count({ where }),
    ]);

    return res.status(200).json({
      transactions: transactions.map(mapTransaction),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /subject-reviews error", error);
    return res.status(500).json({ error: "Failed to fetch subject reviews" });
  }
}

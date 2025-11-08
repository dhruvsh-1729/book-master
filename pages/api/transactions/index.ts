// pages/api/transactions/index.ts
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

const toIdArray = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return Array.from(new Set(input.map((value) => String(value).trim()).filter(Boolean)));
  }
  if (typeof input === "string" && input.trim()) {
    return [input.trim()];
  }
  return [];
};

const transactionInclude = {
  book: { select: { id: true, bookName: true, libraryNumber: true } },
  user: { select: { id: true, name: true, email: true } },
  genericSubjects: {
    include: { genericSubject: true },
  },
  specificSubjects: {
    include: { tag: true },
  },
} as const;

const mapTransaction = (transaction: any) => ({
  ...transaction,
  genericSubjects: (transaction.genericSubjects || [])
    .map((link: any) => link.genericSubject)
    .filter(Boolean),
  specificSubjects: (transaction.specificSubjects || [])
    .map((link: any) => link.tag)
    .filter(Boolean),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "GET") {
    try {
      const page = toInt(req.query.page, 1, 1);
      const limit = toInt(req.query.limit, 20, 1, 500);
      const bookId = toStr(req.query.bookId).trim();
      const genericSubjectId = toStr(req.query.genericSubjectId).trim();
      const specificSubjectId = toStr(req.query.specificSubjectId).trim();
      const search = toStr(req.query.search).trim();

      const where: any = { userId };
      if (bookId) where.bookId = bookId;
      if (genericSubjectId) {
        where.genericSubjects = { some: { genericSubjectId } };
      }
      if (specificSubjectId) {
        where.specificSubjects = { some: { tagId: specificSubjectId } };
      }
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { keywords: { contains: search, mode: "insensitive" } },
          { remark: { contains: search, mode: "insensitive" } },
        ];
      }

      const [transactions, total] = await Promise.all([
        prisma.summaryTransaction
          .findMany({
            where,
            include: transactionInclude,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: [{ bookId: "asc" }, { srNo: "asc" }],
          })
          .then((list) => list.map(mapTransaction)),
        prisma.summaryTransaction.count({ where }),
      ]);

      return res.status(200).json({
        transactions,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      });
    } catch (e) {
      console.error("GET /transactions error", e);
      return res.status(500).json({ error: "Failed to fetch transactions" });
    }
  } else if (req.method === "POST") {
    try {
      const {
        bookId,
        srNo,
        genericSubjectIds,
        specificSubjectIds,
        title,
        keywords,
        relevantParagraph,
        paragraphNo,
        pageNo,
        informationRating,
        remark,
        summary,
        conclusion,
      } = req.body ?? {};

      if (!bookId || srNo === undefined) {
        return res
          .status(400)
          .json({ error: "Book ID and Serial Number are required" });
      }

      const book = await prisma.bookMaster.findFirst({
        where: { id: String(bookId), userId },
        select: { id: true },
      });
      if (!book) return res.status(400).json({ error: "Book not found or access denied" });

      const exists = await prisma.summaryTransaction.findFirst({
        where: { bookId: String(bookId), srNo: Number(srNo), userId },
        select: { id: true },
      });
      if (exists)
        return res
          .status(400)
          .json({ error: "Serial number already exists for this book" });

      const genericIds = toIdArray(genericSubjectIds);
      const specificIds = toIdArray(specificSubjectIds);

      const created = await prisma.summaryTransaction.create({
        data: {
          bookId: String(bookId),
          userId,
          srNo: Number(srNo),
          title: title ?? null,
          keywords: keywords ?? null,
          relevantParagraph: relevantParagraph ?? null,
          paragraphNo: paragraphNo ?? null,
          pageNo: pageNo ?? null,
          informationRating: informationRating ?? null,
          remark: remark ?? null,
          summary: summary ?? null,
          conclusion: conclusion ?? null,
          genericSubjects: genericIds.length
            ? {
                create: genericIds.map((id) => ({
                  genericSubject: { connect: { id } },
                })),
              }
            : undefined,
          specificSubjects: specificIds.length
            ? {
                create: specificIds.map((id) => ({
                  tag: { connect: { id } },
                })),
              }
            : undefined,
        },
        include: transactionInclude,
      });

      return res.status(201).json(mapTransaction(created));
    } catch (e) {
      console.error("POST /transactions error", e);
      return res.status(500).json({ error: "Failed to create transaction" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

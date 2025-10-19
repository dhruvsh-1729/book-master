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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  if (req.method === "GET") {
    try {
      const page = toInt(req.query.page, 1, 1);
      const limit = toInt(req.query.limit, 20, 1, 200);
      const bookId = toStr(req.query.bookId).trim();
      const genericSubjectId = toStr(req.query.genericSubjectId).trim();
      const specificSubjectId = toStr(req.query.specificSubjectId).trim();
      const search = toStr(req.query.search).trim();

      const where: any = { userId };
      if (bookId) where.bookId = bookId;
      if (genericSubjectId) where.genericSubjectId = genericSubjectId;
      if (specificSubjectId) where.specificSubjectId = specificSubjectId;
      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { keywords: { contains: search, mode: "insensitive" } },
          { remark: { contains: search, mode: "insensitive" } },
        ];
      }

      const [transactions, total] = await Promise.all([
        prisma.summaryTransaction.findMany({
          where,
          include: {
            book: { select: { id: true, bookName: true, libraryNumber: true } },
            user: { select: { id: true, name: true, email: true } },
            genericSubject: true,
            specificSubject: true,
          },
          skip: (page - 1) * limit,
          take: limit,
          orderBy: [{ bookId: "asc" }, { srNo: "asc" }],
        }),
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
        genericSubjectId,
        specificSubjectId,
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

      const created = await prisma.summaryTransaction.create({
        data: {
          bookId: String(bookId),
          userId,
          srNo: Number(srNo),
          genericSubjectId: genericSubjectId ? String(genericSubjectId) : null,
          specificSubjectId: specificSubjectId ? String(specificSubjectId) : null,
          title: title ?? null,
          keywords: keywords ?? null,
          relevantParagraph: relevantParagraph ?? null,
          paragraphNo: paragraphNo ?? null,
          pageNo: pageNo ?? null,
          informationRating: informationRating ?? null,
          remark: remark ?? null,
          summary: summary ?? null,
          conclusion: conclusion ?? null,
        },
        include: {
          book: { select: { id: true, bookName: true, libraryNumber: true } },
          user: { select: { id: true, name: true, email: true } },
          genericSubject: true,
          specificSubject: true,
        },
      });

      return res.status(201).json(created);
    } catch (e) {
      console.error("POST /transactions error", e);
      return res.status(500).json({ error: "Failed to create transaction" });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

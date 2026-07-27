import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  normalizePendingSubjectSuggestions,
  replaceTransactionSubjectLinks,
} from "@/lib/services/subject-linking.service";

export const config = {
  maxDuration: 120,
  api: {
    bodyParser: {
      sizeLimit: "4mb",
    },
  },
};

const MAX_TRANSACTIONS = 80;

const toInt = (value: unknown, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.trunc(n)) : fallback;
};

const toStr = (value: unknown, maxLength = 4000) => {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
};

const pageRange = (start?: unknown, end?: unknown) => {
  const pageStart = Number(start) || undefined;
  const pageEnd = Number(end) || undefined;
  if (pageStart && pageEnd && pageStart !== pageEnd) return `${pageStart}-${pageEnd}`;
  if (pageStart) return String(pageStart);
  if (pageEnd) return String(pageEnd);
  return "";
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const bookId = String(req.body?.bookId || "");
    const inputTransactions = Array.isArray(req.body?.transactions) ? req.body.transactions.slice(0, MAX_TRANSACTIONS) : [];

    if (!bookId || !inputTransactions.length) {
      return res.status(400).json({ error: "Book and summary transactions are required" });
    }

    const book = await prisma.bookMaster.findFirst({
      where: { id: bookId, userId },
      select: { id: true, bookName: true, libraryNumber: true },
    });
    if (!book) return res.status(404).json({ error: "Book not found or access denied" });

    const requestedSrNos = inputTransactions.map((item: any, index: number) => toInt(item?.srNo, index + 1));
    const duplicateSrNo = requestedSrNos.find((srNo: number, index: number) => requestedSrNos.indexOf(srNo) !== index);
    if (duplicateSrNo) {
      return res.status(400).json({ error: `Duplicate serial number ${duplicateSrNo} in the draft list` });
    }

    const existing = await prisma.summaryTransaction.findMany({
      where: { bookId, userId, srNo: { in: requestedSrNos } },
      select: { srNo: true },
    });
    if (existing.length) {
      const conflicts = existing.map((item) => item.srNo).sort((a, b) => a - b).join(", ");
      return res.status(400).json({ error: `Serial number already exists for this book: ${conflicts}` });
    }

    const created: any[] = [];

    for (const [index, draft] of inputTransactions.entries()) {
      const genericSubjects = normalizePendingSubjectSuggestions(draft?.genericSubjects);
      const specificSubjects = normalizePendingSubjectSuggestions(draft?.specificSubjects);
      const status = draft?.subjectReviewStatus === "needs_review" ? "needs_review" : "approved";
      const extractedText = toStr(draft?.extractedText || draft?.text, 900000);
      const srNo = toInt(draft?.srNo, index + 1);

      const transaction = await prisma.summaryTransaction.create({
        data: {
          bookId,
          userId,
          srNo,
          title: toStr(draft?.title, 220) || null,
          keywords: toStr(draft?.keywords, 600) || null,
          relevantParagraph: {
            english: extractedText,
            hindi: "",
            gujarati: "",
            sanskrit: "",
          },
          paragraphNo: toStr(draft?.paragraphNo, 120) || null,
          pageNo: toStr(draft?.pageNo, 120) || pageRange(draft?.pageStart, draft?.pageEnd) || null,
          informationRating: toStr(draft?.informationRating, 20) || null,
          remark: toStr(draft?.remark, 1200) || null,
          summary: toStr(draft?.summary, 6000) || null,
          conclusion: toStr(draft?.conclusion, 3000) || null,
          footNote: toStr(draft?.footNote, 1800) || null,
          subjectReviewStatus: status,
          pendingGenericSubjects: status === "needs_review" ? genericSubjects : null,
          pendingSpecificSubjects: status === "needs_review" ? specificSubjects : null,
          subjectReviewedAt: status === "approved" ? new Date() : null,
        },
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
      });

      if (status === "approved") {
        await replaceTransactionSubjectLinks({
          db: prisma,
          summaryTransactionId: transaction.id,
          genericSubjects,
          specificSubjects,
        });
      }

      const hydrated = await prisma.summaryTransaction.findUnique({
        where: { id: transaction.id },
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
      });

      created.push({
        ...hydrated,
        genericSubjects: (hydrated?.genericSubjects || []).map((link: any) => link.genericSubject).filter(Boolean),
        specificSubjects: (hydrated?.specificSubjects || []).map((link: any) => link.tag).filter(Boolean),
      });
    }

    return res.status(201).json({
      book,
      created,
      reviewCount: created.filter((item) => item.subjectReviewStatus === "needs_review").length,
    });
  } catch (error) {
    console.error("POST /add/commit error", error);
    return res.status(500).json({ error: "Failed to save summary transactions" });
  }
}

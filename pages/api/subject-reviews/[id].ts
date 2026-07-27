import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  normalizePendingSubjectSuggestions,
  replaceTransactionSubjectLinks,
} from "@/lib/services/subject-linking.service";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

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
  if (req.method !== "PUT") {
    res.setHeader("Allow", ["PUT"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const id = toStr(req.query.id);
  if (!id) return res.status(400).json({ error: "Transaction ID is required" });

  try {
    const existing = await prisma.summaryTransaction.findFirst({
      where: { id, userId },
      select: {
        id: true,
        pendingGenericSubjects: true,
        pendingSpecificSubjects: true,
      },
    });
    if (!existing) return res.status(404).json({ error: "Subject review not found" });

    const action = toStr(req.body?.action, "save");
    const genericSubjects = normalizePendingSubjectSuggestions(
      req.body?.genericSubjects ?? existing.pendingGenericSubjects
    );
    const specificSubjects = normalizePendingSubjectSuggestions(
      req.body?.specificSubjects ?? existing.pendingSpecificSubjects
    );

    if (action === "approve") {
      await replaceTransactionSubjectLinks({
        db: prisma,
        summaryTransactionId: id,
        genericSubjects,
        specificSubjects,
      });

      await prisma.summaryTransaction.update({
        where: { id },
        data: {
          subjectReviewStatus: "approved",
          pendingGenericSubjects: genericSubjects,
          pendingSpecificSubjects: specificSubjects,
          subjectReviewedAt: new Date(),
        },
      });
    } else if (action === "reject") {
      await prisma.summaryTransaction.update({
        where: { id },
        data: {
          subjectReviewStatus: "rejected",
          pendingGenericSubjects: genericSubjects,
          pendingSpecificSubjects: specificSubjects,
          subjectReviewedAt: new Date(),
        },
      });
    } else {
      await prisma.summaryTransaction.update({
        where: { id },
        data: {
          subjectReviewStatus: "needs_review",
          pendingGenericSubjects: genericSubjects,
          pendingSpecificSubjects: specificSubjects,
          subjectReviewedAt: null,
        },
      });
    }

    const updated = await prisma.summaryTransaction.findUnique({
      where: { id },
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

    return res.status(200).json(mapTransaction(updated));
  } catch (error) {
    console.error("PUT /subject-reviews/[id] error", error);
    return res.status(500).json({ error: "Failed to update subject review" });
  }
}

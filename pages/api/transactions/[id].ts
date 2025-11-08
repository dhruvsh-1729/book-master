// pages/api/transactions/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

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
  book: {
    select: {
      id: true,
      bookName: true,
      libraryNumber: true,
      bookSummary: true,
      pageNumbers: true,
    },
  },
  user: { select: { id: true, name: true, email: true } },
  genericSubjects: { include: { genericSubject: true } },
  specificSubjects: { include: { tag: true } },
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
  const id = toStr(req.query.id);
  if (!id) return res.status(400).json({ error: "Transaction ID is required" });

  if (req.method === "GET") {
    try {
      const tx = await prisma.summaryTransaction.findUnique({
        where: { id },
        include: transactionInclude,
      });
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      return res.status(200).json(mapTransaction(tx));
    } catch (e) {
      console.error("GET /transactions/[id] error", e);
      return res.status(500).json({ error: "Failed to fetch transaction" });
    }
  } else if (req.method === "PUT") {
    try {
      const exists = await prisma.summaryTransaction.findUnique({ where: { id } });
      if (!exists) return res.status(404).json({ error: "Transaction not found" });

      const {
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

      // if srNo is changing, ensure uniqueness within the same book
      if (srNo !== undefined && Number(srNo) !== exists.srNo) {
        const dup = await prisma.summaryTransaction.findFirst({
          where: {
            bookId: exists.bookId,
            srNo: Number(srNo),
            id: { not: id },
          },
          select: { id: true },
        });
        if (dup)
          return res
            .status(400)
            .json({ error: "Serial number already exists for this book" });
      }

      const genericIds = genericSubjectIds !== undefined ? toIdArray(genericSubjectIds) : undefined;
      const specificIds = specificSubjectIds !== undefined ? toIdArray(specificSubjectIds) : undefined;

      const updated = await prisma.summaryTransaction.update({
        where: { id },
        data: {
          ...(srNo !== undefined ? { srNo: Number(srNo) } : {}),
          title: title ?? undefined,
          keywords: keywords ?? undefined,
          relevantParagraph: relevantParagraph ?? undefined,
          paragraphNo: paragraphNo ?? undefined,
          pageNo: pageNo ?? undefined,
          informationRating: informationRating ?? undefined,
          remark: remark ?? undefined,
          summary: summary ?? undefined,
          conclusion: conclusion ?? undefined,
          ...(genericIds !== undefined
            ? {
                genericSubjects: {
                  deleteMany: {},
                  ...(genericIds.length
                    ? {
                        create: genericIds.map((gid) => ({
                          genericSubject: { connect: { id: gid } },
                        })),
                      }
                    : {}),
                },
              }
            : {}),
          ...(specificIds !== undefined
            ? {
                specificSubjects: {
                  deleteMany: {},
                  ...(specificIds.length
                    ? {
                        create: specificIds.map((sid) => ({
                          tag: { connect: { id: sid } },
                        })),
                      }
                    : {}),
                },
              }
            : {}),
        },
        include: transactionInclude,
      });

      return res.status(200).json(mapTransaction(updated));
    } catch (e) {
      console.error("PUT /transactions/[id] error", e);
      return res.status(500).json({ error: "Failed to update transaction" });
    }
  } else if (req.method === "DELETE") {
    try {
      const exists = await prisma.summaryTransaction.findUnique({ where: { id } });
      if (!exists) return res.status(404).json({ error: "Transaction not found" });

      await prisma.$transaction([
        prisma.summaryTransactionGenericSubject.deleteMany({ where: { summaryTransactionId: id } }),
        prisma.summaryTransactionSpecificTag.deleteMany({ where: { summaryTransactionId: id } }),
        prisma.summaryTransaction.delete({ where: { id } }),
      ]);
      return res.status(204).end();
    } catch (e) {
      console.error("DELETE /transactions/[id] error", e);
      return res.status(500).json({ error: "Failed to delete transaction" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

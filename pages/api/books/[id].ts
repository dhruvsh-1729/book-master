// pages/api/books/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

const mapSummaryTransaction = (transaction: any) => ({
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
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const id = toStr(req.query.id);
  if (!id) return res.status(400).json({ error: "Book ID is required" });

  if (req.method === "GET") {
    try {
      const includeTransactions = toStr(req.query.includeTransactions) === "true";

      const include: any = { editor: true, images: true };
      if (includeTransactions) {
        include.transactions = {
          orderBy: [{ srNo: "asc" }],
          include: {
            genericSubjects: { include: { genericSubject: true } },
            specificSubjects: { include: { tag: true } },
            images: true,
            user: { select: { id: true, name: true, email: true } },
            book: {
              select: {
                id: true,
                bookName: true,
                libraryNumber: true,
                bookSummary: true,
                pageNumbers: true,
              },
            },
          },
        };
      }

      const book = await prisma.bookMaster.findFirst({
        where: { id, userId },
        include,
      });

      if (!book) return res.status(404).json({ error: "Book not found" });
      const { editor, transactions, ...rest } = book as any;
      const payload: any = {
        ...rest,
        editors: editor ?? [],
      };
      if (includeTransactions) {
        payload.summaryTransactions = (transactions ?? []).map(mapSummaryTransaction);
      }
      return res.status(200).json(payload);
    } catch (e) {
      console.error("GET /books/[id] error", e);
      return res.status(500).json({ error: "Failed to fetch book" });
    }
  } else if (req.method === "PUT") {
    try {
      // only update the owner's book
      const exists = await prisma.bookMaster.findFirst({ where: { id, userId } });
      if (!exists) return res.status(404).json({ error: "Book not found" });

      const {
        libraryNumber,
        bookName,
        bookSummary,
        pageNumbers,
        grade,
        remark,
        edition,
        publisherName,
        coverImageUrl,
        coverImagePublicId,
        images,
        editors,
      } = req.body ?? {};

      const normalizedImages =
        Array.isArray(images) && images.length
          ? images
              .map((img: any) => ({
                url: String(img.url || "").trim(),
                publicId: img.publicId ? String(img.publicId) : null,
              }))
              .filter((img: any) => img.url)
          : undefined;
      const primaryImage = normalizedImages?.[0];

      const editorsProvided = editors !== undefined;
      const normalizedEditors = Array.isArray(editors)
        ? (editors as any[])
            .map((e) => ({
              name: String(e?.name || "").trim(),
              role: e?.role ? String(e.role) : "Editor",
            }))
            .filter((e) => e.name)
            .slice(0, 25)
        : [];

      const updated = await prisma.$transaction(async (tx) => {
        await tx.bookMaster.update({
          where: { id },
          data: {
            ...(libraryNumber !== undefined ? { libraryNumber: String(libraryNumber) } : {}),
            ...(bookName !== undefined ? { bookName: String(bookName) } : {}),
            ...(bookSummary !== undefined ? { bookSummary: bookSummary ?? null } : {}),
            ...(pageNumbers !== undefined ? { pageNumbers: pageNumbers ?? null } : {}),
            ...(grade !== undefined ? { grade: grade ?? null } : {}),
            ...(remark !== undefined ? { remark: remark ?? null } : {}),
            ...(edition !== undefined ? { edition: edition ?? null } : {}),
            ...(publisherName !== undefined ? { publisherName: publisherName ?? null } : {}),
            ...(coverImageUrl !== undefined || primaryImage
              ? { coverImageUrl: primaryImage?.url ?? coverImageUrl ?? null }
              : {}),
            ...(coverImagePublicId !== undefined || primaryImage
              ? { coverImagePublicId: primaryImage?.publicId ?? coverImagePublicId ?? null }
              : {}),
            updatedAt: new Date(),
          },
        });

        if (normalizedImages) {
          await tx.bookImage.deleteMany({ where: { bookId: id } });
          if (normalizedImages.length) {
            await tx.bookImage.createMany({
              data: normalizedImages.map((img: any) => ({
                bookId: id,
                url: img.url,
                publicId: img.publicId,
              })),
            });
          }
        }

        if (editorsProvided) {
          await tx.bookEditor.deleteMany({ where: { bookId: id } });
          if (normalizedEditors.length) {
            await tx.bookEditor.createMany({
              data: normalizedEditors.map((e) => ({
                bookId: id,
                name: e.name,
                role: e.role,
              })),
            });
          }
        }

        return tx.bookMaster.findUnique({
          where: { id },
          include: { editor: true },
        });
      });

      const { editor: updatedEditors, ...rest } = (updated as any) || {};
      return res.status(200).json({ ...rest, editors: updatedEditors ?? [] });
    } catch (e: any) {
      console.error("PUT /books/[id] error", e);
      return res.status(500).json({ error: "Failed to update book" });
    }
  } else if (req.method === "DELETE") {
    try {
      const exists = await prisma.bookMaster.findFirst({ where: { id, userId } });
      if (!exists) return res.status(404).json({ error: "Book not found" });

      const txIds = await prisma.summaryTransaction.findMany({
        where: { bookId: id },
        select: { id: true },
      });
      const summaryIds = txIds.map((t) => t.id);

      await prisma.$transaction(async (tx) => {
        if (summaryIds.length) {
          await tx.transactionImage.deleteMany({ where: { summaryTransactionId: { in: summaryIds } } });
          await tx.summaryTransactionSpecificTag.deleteMany({ where: { summaryTransactionId: { in: summaryIds } } });
          await tx.summaryTransactionGenericSubject.deleteMany({ where: { summaryTransactionId: { in: summaryIds } } });
          await tx.summaryTransaction.deleteMany({ where: { id: { in: summaryIds } } });
        }
        await tx.bookImage.deleteMany({ where: { bookId: id } });
        await tx.bookEditor.deleteMany({ where: { bookId: id } });
        await tx.bookMaster.delete({ where: { id } });
      });
      return res.status(204).end();
    } catch (e) {
      console.error("DELETE /books/[id] error", e);
      return res.status(500).json({ error: "Failed to delete book" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

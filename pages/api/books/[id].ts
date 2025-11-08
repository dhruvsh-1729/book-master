// pages/api/books/[id].ts
import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";

const toStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? fallback) : fallback;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  const id = toStr(req.query.id);
  if (!id) return res.status(400).json({ error: "Book ID is required" });

  if (req.method === "GET") {
    try {
      const includeTransactions = toStr(req.query.includeTransactions) === "true";

      const include: any = { editor: true };
      if (includeTransactions) {
        include.transactions = {
          orderBy: [{ srNo: "asc" }],
          include: {
            genericSubject: true,
            specificSubject: true,
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
        payload.summaryTransactions = transactions ?? [];
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

      const updated = await prisma.bookMaster.update({
        where: { id },
        data: {
          libraryNumber: req.body?.libraryNumber ?? undefined,
          bookName: req.body?.bookName ?? undefined,
          bookSummary: req.body?.bookSummary ?? undefined,
          pageNumbers: req.body?.pageNumbers ?? undefined,
          grade: req.body?.grade ?? undefined,
          remark: req.body?.remark ?? undefined,
          edition: req.body?.edition ?? undefined,
          publisherName: req.body?.publisherName ?? undefined,
        },
      });

      return res.status(200).json(updated);
    } catch (e: any) {
      if (e?.code === "P2002")
        return res.status(400).json({ error: "Library number already exists" });
      console.error("PUT /books/[id] error", e);
      return res.status(500).json({ error: "Failed to update book" });
    }
  } else if (req.method === "DELETE") {
    try {
      const exists = await prisma.bookMaster.findFirst({ where: { id, userId } });
      if (!exists) return res.status(404).json({ error: "Book not found" });

      // Check if bookId is present as foreign key in summaryTransactions table
      const summaryTransaction = await prisma.summaryTransaction.findFirst({
      where: { bookId: id },
      });

      if (summaryTransaction) {
      return res.status(400).json({ error: "Delete transactions before deleting the book." });
      }

      await prisma.bookMaster.delete({ where: { id } });
      return res.status(204).end();
    } catch (e) {
      console.error("DELETE /books/[id] error", e);
      return res.status(500).json({ error: "Failed to delete book" });
    }
  }

  res.setHeader("Allow", ["GET", "PUT", "DELETE"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}

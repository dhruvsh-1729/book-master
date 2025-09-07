// pages/api/transactions/book/[bookId].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client'; // use Prisma for enums
// Prefer your singleton: import prisma from '@/lib/prisma';
const prisma = new PrismaClient();

const toStr = (v: string | string[] | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? fallback : fallback;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const pageNum  = Math.max(1, Number(toStr(req.query.page, '1')) || 1);
    const limitNum = Math.max(1, Number(toStr(req.query.limit, '50')) || 50);
    const q        = toStr(req.query.search).trim();
    const bookId   = toStr(req.query.bookId).trim();

    if (!bookId) return res.status(400).json({ error: 'bookId is required' });

    // Ensure book exists
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
    if (!book) return res.status(404).json({ error: 'Book not found' });

    const where: Prisma.SummaryTransactionWhereInput = {
      bookId,
      ...(q
        ? {
            OR: [
              { title:    { contains: q, mode: Prisma.QueryMode.insensitive } },
              { keywords: { contains: q, mode: Prisma.QueryMode.insensitive } },
              { remark:   { contains: q, mode: Prisma.QueryMode.insensitive } },
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
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { srNo: 'asc' },
      }),
      prisma.summaryTransaction.count({ where }),
    ]);

    res.status(200).json({
      book,
      transactions,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching book transactions:', error);
    res.status(500).json({ error: 'Failed to fetch book transactions' });
  }
}

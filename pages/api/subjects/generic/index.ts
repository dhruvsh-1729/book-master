// pages/api/generic-subjects/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client';
// Prefer your singleton: import prisma from '@/lib/prisma';
const prisma = new PrismaClient();

const toStr = (v: string | string[] | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? fallback : fallback;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'GET': {
      try {
        const pageNum  = Math.max(1, Number(toStr(req.query.page, '1')) || 1);
        const limitNum = Math.max(1, Number(toStr(req.query.limit, '50')) || 50);
        const q = toStr(req.query.search).trim();

        const where: Prisma.GenericSubjectMasterWhereInput | undefined = q
          ? {
              OR: [
                { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { description: { contains: q, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : undefined;

        const [subjects, total] = await Promise.all([
          prisma.genericSubjectMaster.findMany({
            where,
            include: { _count: { select: { summaryTransactions: true, bookGenericTags: true } } },
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            orderBy: { name: 'asc' },
          }),
          prisma.genericSubjectMaster.count({ where }),
        ]);

        res.status(200).json({
          subjects,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            pages: Math.ceil(total / limitNum),
          },
        });
      } catch (error) {
        console.error('Error fetching generic subjects:', error);
        res.status(500).json({ error: 'Failed to fetch generic subjects' });
      }
      break;
    }

    case 'POST': {
      try {
        const { name, description } = req.body as { name?: string; description?: string | null };
        if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

        const existing = await prisma.genericSubjectMaster.findUnique({ where: { name } });
        if (existing) return res.status(400).json({ error: 'Generic subject already exists' });

        const subject = await prisma.genericSubjectMaster.create({
          data: { name: name.trim(), description: description ?? null },
          include: { _count: { select: { summaryTransactions: true, bookGenericTags: true } } },
        });

        res.status(201).json(subject);
      } catch (error) {
        console.error('Error creating generic subject:', error);
        res.status(500).json({ error: 'Failed to create generic subject' });
      }
      break;
    }

    default: {
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
    }
  }
}

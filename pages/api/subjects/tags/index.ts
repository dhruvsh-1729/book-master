// pages/api/tags/index.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { Prisma, PrismaClient } from '@prisma/client'; // note: import Prisma for enums

const prisma = new PrismaClient();

const toStr = (v: string | string[] | undefined, fallback = ''): string =>
  typeof v === 'string' ? v : Array.isArray(v) ? v[0] ?? fallback : fallback;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method } = req;

  switch (method) {
    case 'GET':
      try {
        const pageNum  = Math.max(1, Number(toStr(req.query.page, '1')) || 1);
        const limitNum = Math.max(1, Number(toStr(req.query.limit, '50')) || 50);
        const q   = toStr(req.query.search).trim();
        const cat = toStr(req.query.category).trim();

        const AND: Prisma.TagMasterWhereInput[] = [];

        if (q) {
          AND.push({
            OR: [
              { name:        { contains: q,   mode: Prisma.QueryMode.insensitive } },
              { description: { contains: q,   mode: Prisma.QueryMode.insensitive } },
              { category:    { contains: q,   mode: Prisma.QueryMode.insensitive } },
            ],
          });
        }

        if (cat) {
          AND.push({ category: { contains: cat, mode: Prisma.QueryMode.insensitive } });
        }

        const where: Prisma.TagMasterWhereInput | undefined = AND.length ? { AND } : undefined;

        const [tags, total] = await Promise.all([
          prisma.tagMaster.findMany({
            where,
            include: { _count: { select: { summaryTransactions: true, bookSpecificTags: true } } },
            skip: (pageNum - 1) * limitNum,
            take: limitNum,
            orderBy: [{ category: 'asc' }, { name: 'asc' }],
          }),
          prisma.tagMaster.count({ where }),
        ]);

        res.status(200).json({
          tags,
          pagination: { page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) },
        });
      } catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: 'Failed to fetch tags' });
      }
      break;

    case 'POST':
      try {
        const { name, description, category } = req.body as {
          name?: string;
          description?: string | null;
          category?: string | null;
        };

        if (!name || !name.trim()) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const tag = await prisma.tagMaster.create({
          data: {
            name: name.trim(),
            description: description ?? null,
            category: category ?? null,
          },
          include: { _count: { select: { summaryTransactions: true, bookSpecificTags: true } } },
        });

        res.status(201).json(tag);
      } catch (error: any) {
        console.error('Error creating tag:', error);
        if (error?.code === 'P2002') return res.status(400).json({ error: 'Tag name already exists' });
        res.status(500).json({ error: 'Failed to create tag' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}

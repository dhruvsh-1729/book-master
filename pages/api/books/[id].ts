import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserIdFromRequest } from '../../../lib/auth';
import { Prisma } from '@prisma/client';

const toStr = (v: unknown, fb = '') =>
  typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? fb) : fb;

const pick = <T extends object, K extends keyof T>(obj: T, keys: K[]) => {
  const out = {} as Pick<T, K>;
  keys.forEach((k) => {
    const v = (obj as any)[k];
    if (v !== undefined) (out as any)[k] = v;
  });
  return out;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { method, query: { id } } = req;

  switch (method) {
    case 'GET':
      try {
        const book = await prisma.bookMaster.findFirst({
          where: { 
            id: id as string,
            userId // Ensure user can only access their own books
          },
          include: {
            user: { select: { id: true, name: true, email: true } },
            editors: true,
            genericTags: {
              include: { genericSubject: true }
            },
            specificTags: {
              include: { tag: true }
            },
            summaryTransactions: {
              include: {
                genericSubject: true,
                specificSubject: true
              },
              orderBy: { srNo: 'asc' }
            }
          }
        });

        if (!book) {
          return res.status(404).json({ error: 'Book not found' });
        }

        res.status(200).json(book);
      } catch (error: any) {
        console.error('Error fetching book:', error);
        res.status(500).json({ error: 'Failed to fetch book' });
      }
      break;


      case 'PUT':
        try {
          // If you enforce ownership, get userId from auth/session (example fallback below)
          const userId = toStr((req as any).userId || req.body.userId || req.query.userId);
  
          const existingBook = await prisma.bookMaster.findFirst({
            where: userId ? { id: Array.isArray(id) ? id[0] : id, userId } : { id: Array.isArray(id) ? id[0] : id },
            select: { id: true },
          });
          if (!existingBook) return res.status(404).json({ error: 'Book not found' });
  
          // Only allow updating these scalar fields on BookMaster
          const allowedKeys: (keyof Prisma.BookMasterUncheckedUpdateInput)[] = [
            'libraryNumber',
            'bookName',
            'bookSummary',
            'pageNumbers',
            'grade',
            'remark',
            'edition',
            'publisherName',
          ];
  
          const body = req.body ?? {};
          const scalarUpdate = pick(body, allowedKeys);
  
          const updatedBook = await prisma.$transaction(async (tx) => {
            // 1) Update main book (never update createdAt; set updatedAt explicitly)
            const book = await tx.bookMaster.update({
              where: { id: id as string },
              data: {
                ...scalarUpdate,
                updatedAt: new Date(),
                // Do NOT pass user / _count / title / author / description here
              },
            });
  
            // 2) Generic tags (book_generic_tags)
            const genericTags: string[] | undefined = Array.isArray(body.genericTags)
              ? body.genericTags
              : undefined;
            if (genericTags) {
              await tx.bookGenericTag.deleteMany({ where: { bookId: id as string } });
              if (genericTags.length) {
                await tx.bookGenericTag.createMany({
                  data: genericTags.map((tagId) => ({ bookId: id as string, genericSubjectId: tagId })),
                });
              }
            }
  
            // 3) Specific tags (book_specific_tags)
            const specificTags: string[] | undefined = Array.isArray(body.specificTags)
              ? body.specificTags
              : undefined;
            if (specificTags) {
              await tx.bookSpecificTag.deleteMany({ where: { bookId: id as string } });
              if (specificTags.length) {
                await tx.bookSpecificTag.createMany({
                  data: specificTags.map((tagId) => ({ bookId: id as string, tagId })),
                });
              }
            }
  
            // 4) Summary transactions
            type IncomingTx = {
              genericSubjectId?: string | null;
              specificSubjectId?: string | null;
              content?: {
                title?: string | null;
                keywords?: string | null;
                relevantParagraph?: unknown; // JSON
                paragraphNo?: string | null;
                pageNo?: string | null;
                informationRating?: string | null;
                remark?: string | null;
              };
            };
  
            const summaryTransactions: IncomingTx[] | undefined = Array.isArray(body.summaryTransactions)
              ? body.summaryTransactions
              : undefined;
  
            if (summaryTransactions) {
              await tx.summaryTransaction.deleteMany({ where: { bookId: id as string } });
  
              let srNo = 1;
              for (const item of summaryTransactions) {
                const c = item?.content ?? {};
                await tx.summaryTransaction.create({
                  data: {
                    bookId: id as string,
                    srNo: srNo++,
                    genericSubjectId: item.genericSubjectId ?? null,
                    specificSubjectId: item.specificSubjectId ?? null,
                    title: (c.title ?? null) as string | null,
                    keywords: (c.keywords ?? null) as string | null,
                    relevantParagraph: c.relevantParagraph ?? null,
                    paragraphNo: (c.paragraphNo ?? null) as string | null,
                    pageNo: (c.pageNo ?? null) as string | null,
                    informationRating: (c.informationRating ?? null) as string | null,
                    remark: (c.remark ?? null) as string | null,
                    userId: userId || existingBook.id, // fallback if you must; better: always use auth userId
                  },
                });
              }
            }
  
            // 5) Editors
            type IncomingEditor = { name: string; role?: string | null };
            const editors: IncomingEditor[] | undefined = Array.isArray(body.editors)
              ? body.editors
              : undefined;
  
            if (editors) {
              await tx.bookEditor.deleteMany({ where: { bookId: id as string } });
              if (editors.length) {
                await tx.bookEditor.createMany({
                  data: editors.map((e) => ({
                    bookId: id as string,
                    name: e.name,
                    role: e.role ?? null,
                  })),
                });
              }
            }
  
            return book;
          });
  
          return res.status(200).json(updatedBook);
        } catch (err) {
          console.error('Error updating book:', err);
          return res.status(500).json({ error: 'Failed to update book' });
        }
      
    case 'DELETE':
      try {
        const book = await prisma.bookMaster.findFirst({
          where: { 
            id: id as string,
            userId 
          }
        });

        if (!book) {
          return res.status(404).json({ error: 'Book not found' });
        }

        // Manual cascade delete for MongoDB
        await prisma.$transaction(async (tx) => {
          await tx.bookEditor.deleteMany({ where: { bookId: id as string } });
          await tx.bookGenericTag.deleteMany({ where: { bookId: id as string } });
          await tx.bookSpecificTag.deleteMany({ where: { bookId: id as string } });
          await tx.summaryTransaction.deleteMany({ where: { bookId: id as string } });
          await tx.bookMaster.delete({ where: { id: id as string } });
        });

        res.status(204).end();
      } catch (error: any) {
        console.error('Error deleting book:', error);
        res.status(500).json({ error: 'Failed to delete book' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
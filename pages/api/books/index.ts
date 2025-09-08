// pages/api/books/index.ts - Updated with Authentication
import { NextApiRequest, NextApiResponse } from 'next';
import { getUserIdFromRequest } from '../../../lib/auth';
import prisma from '@/lib/prisma'; 

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get user ID from token
  const userId = getUserIdFromRequest(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { method } = req;

  switch (method) {
    case 'GET':
      try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        const where = {
          // userId, // Only show books for authenticated user
          ...(search ? {
            OR: [
              { bookName: { contains: search as string } },
              { libraryNumber: { contains: search as string } },
              { bookSummary: { contains: search as string } }
            ]
          } : {})
        };

        const [books, total] = await Promise.all([
          prisma.bookMaster.findMany({
            where,
            include: {
              user: { select: { id: true, name: true, email: true } },
              editors: true,
              genericTags: {
                include: { genericSubject: true }
              },
              specificTags: {
                include: { tag: true }
              },
              _count: {
                select: { summaryTransactions: true }
              }
            },
            skip,
            take: parseInt(limit as string),
            orderBy: { createdAt: 'desc' }
          }),
          prisma.bookMaster.count({ where })
        ]);

        res.status(200).json({
          books,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string))
          }
        });
      } catch (error: any) {
        console.error('Error fetching books:', error);
        res.status(500).json({ error: 'Failed to fetch books' });
      }
      break;

    case 'POST':
      try {
        const {
          libraryNumber,
          bookName,
          bookSummary,
          pageNumbers,
          grade,
          remark,
          edition,
          publisherName,
          editors = [],
          genericTags = [],
          specificTags = []
        } = req.body;

        // Validate required fields
        if (!libraryNumber || !bookName) {
          return res.status(400).json({ 
            error: 'Library number and book name are required' 
          });
        }

        // Check if library number already exists for this user
        const existingBook = await prisma.bookMaster.findFirst({
          where: { 
            libraryNumber,
            userId 
          }
        });

        if (existingBook) {
          return res.status(400).json({ 
            error: 'Library number already exists in your collection' 
          });
        }

        // Create book with transaction for data consistency
        const book = await prisma.$transaction(async (tx:any) => {
          // Create the book with authenticated user's ID
          const newBook = await tx.bookMaster.create({
            data: {
              libraryNumber,
              bookName,
              bookSummary,
              pageNumbers,
              grade,
              remark,
              edition,
              publisherName,
              userId // Automatically use authenticated user's ID
            }
          });

          // Create editors
          if (editors.length > 0) {
            await tx.bookEditor.createMany({
              data: editors.map((editor: any) => ({
                bookId: newBook.id,
                name: editor.name,
                role: editor.role || 'Editor'
              }))
            });
          }

          // Create generic tag relationships
          if (genericTags.length > 0) {
            await tx.bookGenericTag.createMany({
              data: genericTags.map((tagId: string) => ({
                bookId: newBook.id,
                genericSubjectId: tagId
              }))
            });
          }

          // Create specific tag relationships
          if (specificTags.length > 0) {
            await tx.bookSpecificTag.createMany({
              data: specificTags.map((tagId: string) => ({
                bookId: newBook.id,
                tagId: tagId
              }))
            });
          }

          return newBook;
        });

        // Fetch the complete book with all relationships
        const completeBook = await prisma.bookMaster.findUnique({
          where: { id: book.id },
          include: {
            user: { select: { id: true, name: true, email: true } },
            editors: true,
            genericTags: {
              include: { genericSubject: true }
            },
            specificTags: {
              include: { tag: true }
            }
          }
        });

        res.status(201).json(completeBook);
      } catch (error: any) {
        console.error('Error creating book:', error);
        res.status(500).json({ error: 'Failed to create book' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
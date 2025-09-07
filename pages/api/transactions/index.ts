import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserIdFromRequest } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = getUserIdFromRequest(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { method } = req;

  switch (method) {
    case 'GET':
      try {
        const { 
          page = 1, 
          limit = 20, 
          bookId, 
          genericSubjectId, 
          specificSubjectId,
          search = ''
        } = req.query;
        
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

        // Build where clause - only show user's transactions
        const where: any = { userId };
        
        if (bookId) where.bookId = bookId as string;
        if (genericSubjectId) where.genericSubjectId = genericSubjectId as string;
        if (specificSubjectId) where.specificSubjectId = specificSubjectId as string;
        
        if (search) {
          where.OR = [
            { title: { contains: search as string } },
            { keywords: { contains: search as string } },
            { remark: { contains: search as string } }
          ];
        }

        const [transactions, total] = await Promise.all([
          prisma.summaryTransaction.findMany({
            where,
            include: {
              book: { 
                select: { 
                  id: true, 
                  bookName: true, 
                  libraryNumber: true 
                } 
              },
              user: { 
                select: { 
                  id: true, 
                  name: true, 
                  email: true 
                } 
              },
              genericSubject: true,
              specificSubject: true
            },
            skip,
            take: parseInt(limit as string),
            orderBy: [
              { bookId: 'asc' },
              { srNo: 'asc' }
            ]
          }),
          prisma.summaryTransaction.count({ where })
        ]);

        res.status(200).json({
          transactions,
          pagination: {
            page: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string))
          }
        });
      } catch (error: any) {
        console.error('Error fetching transactions:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
      }
      break;

    case 'POST':
      try {
        const {
          bookId,
          srNo,
          genericSubjectId,
          specificSubjectId,
          title,
          keywords,
          relevantParagraph,
          paragraphNo,
          pageNo,
          informationRating,
          remark
        } = req.body;

        // Validate required fields
        if (!bookId || srNo === undefined) {
          return res.status(400).json({ 
            error: 'Book ID and Serial Number are required' 
          });
        }

        // Check if book exists and belongs to user
        const book = await prisma.bookMaster.findFirst({
          where: { 
            id: bookId,
            userId 
          }
        });

        if (!book) {
          return res.status(400).json({ error: 'Book not found or access denied' });
        }

        // Check if srNo is unique for this book
        const existingTransaction = await prisma.summaryTransaction.findFirst({
          where: {
            bookId,
            srNo: parseInt(srNo),
            userId
          }
        });

        if (existingTransaction) {
          return res.status(400).json({ 
            error: 'Serial number already exists for this book' 
          });
        }

        const transaction = await prisma.summaryTransaction.create({
          data: {
            bookId,
            userId, // Automatically use authenticated user's ID
            srNo: parseInt(srNo),
            genericSubjectId: genericSubjectId || null,
            specificSubjectId: specificSubjectId || null,
            title,
            keywords,
            relevantParagraph,
            paragraphNo,
            pageNo,
            informationRating,
            remark
          },
          include: {
            book: { 
              select: { 
                id: true, 
                bookName: true, 
                libraryNumber: true 
              } 
            },
            user: { 
              select: { 
                id: true, 
                name: true, 
                email: true 
              } 
            },
            genericSubject: true,
            specificSubject: true
          }
        });

        res.status(201).json(transaction);
      } catch (error: any) {
        console.error('Error creating transaction:', error);
        res.status(500).json({ error: 'Failed to create transaction' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'POST']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
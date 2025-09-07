// pages/api/transactions/[id].js
import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();

export default async function handler(req:NextApiRequest, res:NextApiResponse) {
  const { method, query: { id } } = req;

  switch (method) {
    case 'GET':
      try {
        const transaction = await prisma.summaryTransaction.findUnique({
          where: { id: id as string },
          include: {
            book: { 
              select: { 
                id: true, 
                bookName: true, 
                libraryNumber: true,
                bookSummary: true,
                pageNumbers: true
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

        if (!transaction) {
          return res.status(404).json({ error: 'Transaction not found' });
        }

        res.status(200).json(transaction);
      } catch (error) {
        console.error('Error fetching transaction:', error);
        res.status(500).json({ error: 'Failed to fetch transaction' });
      }
      break;

    case 'PUT':
      try {
        const {
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

        // Check if transaction exists
        const existingTransaction = await prisma.summaryTransaction.findUnique({
          where: { id: id as string }
        });

        if (!existingTransaction) {
          return res.status(404).json({ error: 'Transaction not found' });
        }

        // If srNo is being updated, check for uniqueness within the book
        if (srNo !== undefined && srNo !== existingTransaction.srNo) {
          const duplicateTransaction = await prisma.summaryTransaction.findFirst({
            where: {
              bookId: existingTransaction.bookId,
              srNo: parseInt(srNo),
              id: { not: id as string }
            }
          });

          if (duplicateTransaction) {
            return res.status(400).json({ 
              error: 'Serial number already exists for this book' 
            });
          }
        }

        const transaction = await prisma.summaryTransaction.update({
          where: { id: id as string },
          data: {
            ...(srNo !== undefined && { srNo: parseInt(srNo) }),
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

        res.status(200).json(transaction);
      } catch (error) {
        console.error('Error updating transaction:', error);
        res.status(500).json({ error: 'Failed to update transaction' });
      }
      break;

    case 'DELETE':
      try {
        const transaction = await prisma.summaryTransaction.findUnique({
          where: { id: id as string }
        });

        if (!transaction) {
          return res.status(404).json({ error: 'Transaction not found' });
        }

        await prisma.summaryTransaction.delete({
          where: { id: id as string }
        });

        res.status(204).end();
      } catch (error) {
        console.error('Error deleting transaction:', error);
        res.status(500).json({ error: 'Failed to delete transaction' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
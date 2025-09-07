import { PrismaClient } from '@prisma/client';
import { NextApiRequest, NextApiResponse } from 'next';

const prisma = new PrismaClient();

export default async function handler(req:NextApiRequest, res:NextApiResponse) {
  const { method, query: { id } } = req;

  switch (method) {
    case 'GET':
      try {
        const subject = await prisma.genericSubjectMaster.findUnique({
          where: { id: id as string },
          include: {
            summaryTransactions: {
              include: {
                book: { select: { id: true, bookName: true, libraryNumber: true } }
              }
            },
            bookGenericTags: {
              include: {
                book: { select: { id: true, bookName: true, libraryNumber: true } }
              }
            },
            _count: {
              select: { 
                summaryTransactions: true,
                bookGenericTags: true
              }
            }
          }
        });

        if (!subject) {
          return res.status(404).json({ error: 'Generic subject not found' });
        }

        res.status(200).json(subject);
      } catch (error) {
        console.error('Error fetching generic subject:', error);
        res.status(500).json({ error: 'Failed to fetch generic subject' });
      }
      break;

    case 'PUT':
      try {
        const { name, description } = req.body;

        if (!name) {
          return res.status(400).json({ error: 'Name is required' });
        }

        const subject = await prisma.genericSubjectMaster.update({
          where: { id: id as string },
          data: { name, description },
          include: {
            _count: {
              select: { 
                summaryTransactions: true,
                bookGenericTags: true
              }
            }
          }
        });

        res.status(200).json(subject);
      } catch (error:any) {
        console.error('Error updating generic subject:', error);
        if (error.code === 'P2002') {
          res.status(400).json({ error: 'Generic subject name already exists' });
        } else if (error.code === 'P2025') {
          res.status(404).json({ error: 'Generic subject not found' });
        } else {
          res.status(500).json({ error: 'Failed to update generic subject' });
        }
      }
      break;

    case 'DELETE':
      try {
        // Check if subject is being used
        const usage = await prisma.genericSubjectMaster.findUnique({
          where: { id: id as string },
          include: {
            _count: {
              select: { 
                summaryTransactions: true,
                bookGenericTags: true
              }
            }
          }
        });

        if (!usage) {
          return res.status(404).json({ error: 'Generic subject not found' });
        }

        if (usage._count.summaryTransactions > 0 || usage._count.bookGenericTags > 0) {
          return res.status(400).json({ 
            error: 'Cannot delete generic subject that is being used in books or transactions' 
          });
        }

        await prisma.genericSubjectMaster.delete({
          where: { id: id as string }
        });

        res.status(204).end();
      } catch (error) {
        console.error('Error deleting generic subject:', error);
        res.status(500).json({ error: 'Failed to delete generic subject' });
      }
      break;

    default:
      res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
      res.status(405).end(`Method ${method} Not Allowed`);
  }
}
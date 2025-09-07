import { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '../../../lib/prisma';
import { getUserIdFromRequest } from '../../../lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  const userId = getUserIdFromRequest(req);
  
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Get current date for monthly statistics
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get stats for authenticated user only
    const [
      totalBooks,
      totalTransactions,
      totalGenericSubjects,
      totalSpecificTags,
      newBooksThisMonth,
      newTransactionsThisMonth
    ] = await Promise.all([
      prisma.bookMaster.count({ where: { userId } }),
      prisma.summaryTransaction.count({ where: { userId } }),
      prisma.genericSubjectMaster.count(), // These are global
      prisma.tagMaster.count(), // These are global
      prisma.bookMaster.count({
        where: { 
          userId,
          createdAt: { gte: startOfMonth } 
        }
      }),
      prisma.summaryTransaction.count({
        where: { 
          userId,
          createdAt: { gte: startOfMonth } 
        }
      })
    ]);

    const statsResponse = {
      totalBooks,
      totalTransactions,
      totalGenericSubjects,
      totalSpecificTags,
      newBooksThisMonth,
      newTransactionsThisMonth,
      lastUpdated: new Date().toISOString()
    };

    res.status(200).json(statsResponse);
  } catch (error: any) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch dashboard stats',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
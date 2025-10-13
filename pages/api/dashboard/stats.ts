// pages/api/dashboard/stats.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { getUserIdFromRequest } from '../../../lib/auth';
import { withErrorHandler } from '../../../lib/middleware/error-handler';
import { ApiError } from '../../../lib/utils/api-helpers';
import prisma from '../../../lib/prisma';

export default withErrorHandler(async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    throw new ApiError(405, `Method ${req.method} Not Allowed`, 'METHOD_NOT_ALLOWED');
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) {
    throw new ApiError(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  // Use Promise.all for parallel queries
  const [
    totalBooks,
    totalTransactions,
    totalGenericSubjects,
    totalSpecificTags,
    recentActivity
  ] = await Promise.all([
    prisma.bookMaster.count({ where: { userId } }),
    prisma.summaryTransaction.count({ where: { userId } }),
    prisma.genericSubjectMaster.count(),
    prisma.tagMaster.count(),
    // Get activity for the current month
    prisma.$transaction([
      prisma.bookMaster.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      }),
      prisma.summaryTransaction.count({
        where: {
          userId,
          createdAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          }
        }
      })
    ])
  ]);

  const [newBooksThisMonth, newTransactionsThisMonth] = recentActivity;

  return res.status(200).json({
    totalBooks,
    totalTransactions,
    totalGenericSubjects,
    totalSpecificTags,
    newBooksThisMonth,
    newTransactionsThisMonth,
    lastUpdated: new Date()
  });
});
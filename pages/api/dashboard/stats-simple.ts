import { NextApiRequest, NextApiResponse } from "next";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// pages/api/dashboard/stats-simple.ts
export async function getSimpleStats(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Just get basic counts first
    const [
      totalBooks,
      totalTransactions,
      totalGenericSubjects,
      totalSpecificTags
    ] = await Promise.all([
      prisma.bookMaster.count(),
      prisma.summaryTransaction.count(),
      prisma.genericSubjectMaster.count(),
      prisma.tagMaster.count()
    ]);

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [newBooksThisMonth, newTransactionsThisMonth] = await Promise.all([
      prisma.bookMaster.count({
        where: { createdAt: { gte: startOfMonth } }
      }),
      prisma.summaryTransaction.count({
        where: { createdAt: { gte: startOfMonth } }
      })
    ]);

    const simpleResponse = {
      totalBooks,
      totalTransactions,
      totalGenericSubjects,
      totalSpecificTags,
      newBooksThisMonth,
      newTransactionsThisMonth,
      lastUpdated: new Date().toISOString()
    };

    res.status(200).json(simpleResponse);
  } catch (error: any) {
    console.error('Error fetching simple stats:', error);
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    await prisma.$disconnect();
  }
}
// pages/api/dashboard/charts.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    // Get data for the last 12 months
    const now = new Date();
    const monthsData = [];
    
    // Generate monthly data for charts
    for (let i = 11; i >= 0; i--) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      const [bookCount, transactionCount] = await Promise.all([
        prisma.bookMaster.count({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate
            }
          }
        }),
        prisma.summaryTransaction.count({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate
            }
          }
        })
      ]);
      
      monthsData.push({
        month: startDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        books: bookCount,
        transactions: transactionCount
      });
    }

    // Get transaction distribution by information rating
    const ratingDistribution = await prisma.summaryTransaction.groupBy({
      by: ['informationRating'],
      _count: {
        informationRating: true
      },
      orderBy: {
        _count: {
          informationRating: 'desc'
        }
      }
    });

    // Get top publishers
    const topPublishers = await prisma.bookMaster.groupBy({
      by: ['publisherName'],
      _count: {
        publisherName: true
      },
      where: {
        AND: [
          { publisherName: { not: null } },
          { publisherName: { not: '' } }
        ]
      },
      orderBy: {
        _count: {
          publisherName: 'desc'
        }
      },
      take: 10
    });

    const chartsResponse = {
      monthlyTrends: monthsData,
      ratingDistribution: ratingDistribution.map((item:any) => ({
        rating: item.informationRating || 'Unrated',
        count: item._count.informationRating
      })),
      topPublishers: topPublishers.map((item:any) => ({
        publisher: item.publisherName,
        count: item._count.publisherName
      })),
      lastUpdated: new Date().toISOString()
    };

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    res.status(200).json(chartsResponse);

  } catch (error:any) {
    console.error('Error fetching charts data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch charts data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    await prisma.$disconnect();
  }
}
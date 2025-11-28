// pages/transactions/index.tsx
import { GetServerSideProps } from 'next';
import TransactionSearch from '@/components/TransactionSearch';
import { prisma } from '@/lib/prisma';

interface FilterOptions {
  books: Array<{ id: string; bookName: string; libraryNumber: string }>;
  genericSubjects: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; category: string }>;
}

interface TransactionsPageProps {
  initialFilterOptions: FilterOptions;
}

export default function TransactionsPage({ initialFilterOptions }: TransactionsPageProps) {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">
        Transaction Search
      </h1>
      <TransactionSearch initialFilterOptions={initialFilterOptions} />
    </div>
  );
}

// Pre-fetch filter options server-side for better initial load
export const getServerSideProps: GetServerSideProps = async (context) => {
  try {
    const [books, genericSubjects, tags] = await Promise.all([
      prisma.bookMaster.findMany({
        select: {
          id: true,
          bookName: true,
          libraryNumber: true,
        },
        orderBy: { bookName: 'asc' },
        take: 100, // Limit to avoid large payload
      }),
      prisma.genericSubjectMaster.findMany({
        select: {
          id: true,
          name: true,
        },
        orderBy: { name: 'asc' },
      }),
      prisma.tagMaster.findMany({
        select: {
          id: true,
          name: true,
          category: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      props: {
        initialFilterOptions: {
          books: JSON.parse(JSON.stringify(books)),
          genericSubjects: JSON.parse(JSON.stringify(genericSubjects)),
          tags: JSON.parse(JSON.stringify(tags)),
        },
      },
    };
  } catch (error) {
    console.error('Failed to fetch initial data:', error);
    return {
      props: {
        initialFilterOptions: {
          books: [],
          genericSubjects: [],
          tags: [],
        },
      },
    };
  }
};
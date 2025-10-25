// pages/index.tsx
import React, { useState, useEffect } from 'react';
import { Book, FileText, Tag, TrendingUp } from 'lucide-react';
import { Card, StatsCard } from '../components/CoreComponents';
import {
  DashboardStats,
  BookMaster,
  SummaryTransaction,
  BooksResponse,
  TransactionsResponse,
  GenericSubjectsResponse,
  TagsResponse,
} from '../types';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalBooks: 0,
    totalTransactions: 0,
    totalGenericSubjects: 0,
    totalSpecificTags: 0,
  });
  const [recentBooks, setRecentBooks] = useState<BookMaster[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<SummaryTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // recent lists
        const [booksRes, txRes] = await Promise.all([
          fetch('/api/books?page=1'),
          fetch('/api/transactions?page=1'),
        ]);
        const booksData: BooksResponse = await booksRes.json();
        const txData: TransactionsResponse = await txRes.json();
        setRecentBooks(booksData?.books ?? []);
        setRecentTransactions(txData?.transactions ?? []);

        // stats via totals on small requests
        const [booksTotalRes, txTotalRes, genRes, tagRes] = await Promise.all([
          fetch('/api/books?page=1'),
          fetch('/api/transactions?page=1'),
          fetch('/api/subjects/generic?page=1'),
          fetch('/api/subjects/tags?page=1'),
        ]);

        const booksTotal: BooksResponse = await booksTotalRes.json();
        const txTotal: TransactionsResponse = await txTotalRes.json();
        const generic: GenericSubjectsResponse = await genRes.json();
        const tags: TagsResponse = await tagRes.json();

        setStats((s) => ({
          ...s,
          totalBooks: booksTotal?.pagination?.total ?? 0,
          totalTransactions: txTotal?.pagination?.total ?? 0,
          totalGenericSubjects: generic?.pagination?.total ?? 0,
          totalSpecificTags: tags?.pagination?.total ?? 0,
        }));
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Welcome to your BookMaster system</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard title="Total Books" value={stats.totalBooks} icon={Book} color="blue" />
        <StatsCard title="Total Transactions" value={stats.totalTransactions} icon={FileText} color="green" />
        <StatsCard title="Generic Subjects" value={stats.totalGenericSubjects} icon={Tag} color="yellow" />
        <StatsCard title="Specific Tags" value={stats.totalSpecificTags} icon={Tag} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Books */}
        <Card title="Recent Books" icon={Book}>
          <div className="space-y-4">
            {recentBooks.length > 0 ? (
              recentBooks.map((book) => (
                <div key={book.id} className="flex items-start justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900 truncate">{book.bookName}</h4>
                    <p className="text-sm text-gray-600">Library: {book.libraryNumber}</p>
                    <span className="text-xs text-gray-500">
                      Added {new Date(book.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <button
                    onClick={() => (window.location.href = `/books/${book.id}`)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View →
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">{loading ? 'Loading...' : 'No books available'}</p>
            )}
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => (window.location.href = '/books')}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View all books →
              </button>
            </div>
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card title="Recent Transactions" icon={TrendingUp}>
          <div className="space-y-4">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((t) => (
                <div key={t.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">#{t.srNo}</span>
                        <span className="text-sm font-medium text-gray-900 truncate">{t.title || 'Untitled'}</span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Book: {t.book?.bookName}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        {t.genericSubject && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {t.genericSubject.name}
                          </span>
                        )}
                        {t.specificSubject && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {t.specificSubject.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {t.pageNo && <p className="text-xs text-gray-500">Page {t.pageNo}</p>}
                      <p className="text-xs text-gray-500">{new Date(t.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">{loading ? 'Loading...' : 'No transactions available'}</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

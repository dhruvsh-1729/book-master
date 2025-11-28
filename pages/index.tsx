// pages/index.tsx
import React, { useState, useEffect } from 'react';
import { Book, FileText, Tag, TrendingUp, BarChart2, Activity, Users, Search } from 'lucide-react';
import { useRouter } from 'next/router';
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
  const [charts, setCharts] = useState<any>({
    monthlyTrends: [],
    ratingDistribution: [],
    topPublishers: [],
  });
  const [insightsError, setInsightsError] = useState<string | null>(null);

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
        try {
          const chartsRes = await fetch('/api/dashboard/charts');
          if (chartsRes.ok) {
            const chartJson = await chartsRes.json();
            setCharts(chartJson);
          } else {
            setInsightsError('Unable to load insights');
          }
        } catch (e) {
          setInsightsError('Unable to load insights');
        }
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const router = useRouter();

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
        <StatsCard title="Specific Subjects" value={stats.totalSpecificTags} icon={Tag} color="red" />
      </div>

      <div className="mt-6">
        <Card title="Transaction Search" icon={Search}>
          <p className="text-sm text-gray-600">
            Use the advanced survey to find any transaction across books, keywords, subjects, and more.
          </p>
          <div className="pt-4">
            <button
              type="button"
              onClick={() => router.push('/transactions/search')}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              Open Transaction Search
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card title="Monthly Trends" icon={BarChart2}>
          {charts.monthlyTrends?.length ? (
            <div className="space-y-3">
              {charts.monthlyTrends.slice(-6).map((item: any) => {
                const max = Math.max(...charts.monthlyTrends.map((m: any) => m.books + m.transactions), 1);
                const combined = (item.books || 0) + (item.transactions || 0);
                const width = Math.max(8, Math.min(100, Math.round((combined / max) * 100)));
                return (
                  <div key={item.month}>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>{item.month}</span>
                      <span>{item.books} books / {item.transactions} txns</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-blue-500" style={{ width: `${width}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-sm text-gray-500">{insightsError || 'No trend data yet'}</div>
          )}
        </Card>

        <Card title="Rating Distribution" icon={Activity}>
          {charts.ratingDistribution?.length ? (
            <div className="space-y-3">
              {charts.ratingDistribution.map((item: any) => {
                const max = Math.max(...charts.ratingDistribution.map((r: any) => r.count), 1);
                const width = Math.max(10, Math.min(100, Math.round((item.count / max) * 100)));
                return (
                  <div key={item.rating} className="flex items-center gap-3">
                    <span className="w-20 text-xs text-gray-600">{item.rating}</span>
                    <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-xs text-gray-600">{item.count}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-6 text-sm text-gray-500">{insightsError || 'No rating data yet'}</div>
          )}
        </Card>

        <Card title="Top Publishers" icon={Users}>
          {charts.topPublishers?.length ? (
            <div className="space-y-2">
              {charts.topPublishers.slice(0, 6).map((p: any) => (
                <div key={p.publisher} className="flex justify-between text-sm text-gray-700">
                  <span className="truncate max-w-[70%]">{p.publisher}</span>
                  <span className="text-gray-500">{p.count} books</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-sm text-gray-500">{insightsError || 'No publisher data yet'}</div>
          )}
        </Card>
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
                      <div className="flex flex-wrap gap-2 mt-2">
                        {(t.genericSubjects || []).slice(0, 2).map((subject) => (
                          <span key={subject.id} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {subject.name}
                          </span>
                        ))}
                        {(t.specificSubjects || []).slice(0, 2).map((tag) => (
                          <span key={tag.id} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {tag.name}
                          </span>
                        ))}
                        {((t.genericSubjects?.length || 0) + (t.specificSubjects?.length || 0)) > 4 && (
                          <span className="text-[11px] text-gray-500">+more</span>
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

// pages/index.tsx - Dashboard
import React, { useState, useEffect } from 'react';
import { Book, FileText, Tag, Users, TrendingUp, Calendar } from 'lucide-react';
import { Card, StatsCard } from '../components/CoreComponents';
import { DashboardStats, BookMaster, SummaryTransaction } from '../types';

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalBooks: 0,
    totalTransactions: 0,
    totalGenericSubjects: 0,
    totalSpecificTags: 0
  });
  const [recentBooks, setRecentBooks] = useState<BookMaster[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<SummaryTransaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [booksResponse, transactionsResponse] = await Promise.all([
          // fetch('/api/dashboard/stats'),
          fetch('/api/books?page=1&limit=5'),
          fetch('/api/transactions?page=1&limit=5')
        ]);

        // const statsData: DashboardStats = await statsResponse.json();
        const booksData = await booksResponse.json();
        const transactionsData = await transactionsResponse.json();

        // setStats(statsData);
        setRecentBooks(booksData.books || []);
        setRecentTransactions(transactionsData.transactions || []);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
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
          <p className="text-gray-600">Welcome to your Book Master system</p>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-500">
            {/* Last updated: {new Date().toLocaleDateString()} */}
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Total Books"
          value={stats.totalBooks || 0}
          icon={Book}
          color="blue"
          trend={stats.newBooksThisMonth ? `+${stats.newBooksThisMonth} this month` : undefined}
        />
        <StatsCard
          title="Total Transactions"
          value={stats.totalTransactions || 0}
          icon={FileText}
          color="green"
          trend={stats.newTransactionsThisMonth ? `+${stats.newTransactionsThisMonth} this month` : undefined}
        />
        <StatsCard
          title="Generic Subjects"
          value={stats.totalGenericSubjects || 0}
          icon={Tag}
          color="yellow"
        />
        <StatsCard
          title="Specific Tags"
          value={stats.totalSpecificTags || 0}
          icon={Tag}
          color="red"
        />
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
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {book._count?.summaryTransactions || 0} transactions
                      </span>
                      <span className="text-xs text-gray-500">
                        Added {new Date(book.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => window.location.href = `/books/${book.id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    View →
                  </button>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">No books available</p>
            )}
            <div className="pt-4 border-t border-gray-200">
              <button
                onClick={() => window.location.href = '/books'}
                className="text-blue-600 hover:text-blue-800 text-sm font-medium"
              >
                View all books →
              </button>
            </div>
          </div>
        </Card>

        {/* Recent Transactions */}
        <Card title="Recent Transactions" icon={FileText}>
          <div className="space-y-4">
            {recentTransactions.length > 0 ? (
              recentTransactions.map((transaction) => (
                <div key={transaction.id} className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                          #{transaction.srNo}
                        </span>
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {transaction.title || 'Untitled'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Book: {transaction.book?.bookName}
                      </p>
                      <div className="flex items-center space-x-2 mt-2">
                        {transaction.genericSubject && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {transaction.genericSubject.name}
                          </span>
                        )}
                        {transaction.specificSubject && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            {transaction.specificSubject.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {transaction.pageNo && (
                        <p className="text-xs text-gray-500">Page {transaction.pageNo}</p>
                      )}
                      <p className="text-xs text-gray-500">
                        {new Date(transaction.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">No transactions available</p>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card title="Quick Actions">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => window.location.href = '/books'}
            className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            <Book className="h-8 w-8 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-gray-900">Manage Books</h3>
            <p className="text-xs text-gray-500">Add, edit, and view books</p>
          </button>

          <button
            onClick={() => window.location.href = '/subjects'}
            className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-400 hover:bg-green-50 transition-colors"
          >
            <Tag className="h-8 w-8 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-gray-900">Manage Subjects</h3>
            <p className="text-xs text-gray-500">Generic and specific subjects</p>
          </button>

          <button
            onClick={() => window.location.href = '/transactions'}
            className="p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-colors"
          >
            <FileText className="h-8 w-8 text-gray-400 mx-auto mb-4" />
            <h3 className="text-sm font-medium text-gray-900">View Transactions</h3>
            <p className="text-xs text-gray-500">Browse all transactions</p>
          </button>
        </div>
      </Card>
    </div>
  );
};

export default Dashboard;
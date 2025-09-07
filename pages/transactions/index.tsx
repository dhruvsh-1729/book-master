// pages/transactions/index.tsx - All Transactions Page
import React, { useState, useEffect } from 'react';
import { FileText, Filter } from 'lucide-react';
import { DataTable, FormInput, Card, Breadcrumb } from '../../components/CoreComponents';
import { 
  SummaryTransaction, 
  BookMaster, 
  GenericSubjectMaster, 
  TagMaster,
  DataTableColumn,
  PaginationInfo 
} from '../../types';

const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<SummaryTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filters, setFilters] = useState<{
    bookId: string;
    genericSubjectId: string;
    specificSubjectId: string;
  }>({
    bookId: '',
    genericSubjectId: '',
    specificSubjectId: ''
  });
  const [books, setBooks] = useState<BookMaster[]>([]);
  const [genericSubjects, setGenericSubjects] = useState<GenericSubjectMaster[]>([]);
  const [specificTags, setSpecificTags] = useState<TagMaster[]>([]);

  const fetchTransactions = async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        search: searchTerm,
        ...Object.fromEntries(
          Object.entries(filters).filter(([_, value]) => value !== '')
        )
      });

      const response = await fetch(`/api/transactions?${params}`);
      const data = await response.json();
      setTransactions(data.transactions);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilterOptions = async () => {
    try {
      const [booksResponse, genericResponse, specificResponse] = await Promise.all([
        fetch('/api/books?limit=100'),
        fetch('/api/subjects/generic?limit=100'),
        fetch('/api/subjects/tags?limit=100')
      ]);

      const booksData = await booksResponse.json();
      const genericData = await genericResponse.json();
      const specificData = await specificResponse.json();

      setBooks(booksData.books || []);
      setGenericSubjects(genericData.subjects || []);
      setSpecificTags(specificData.tags || []);
    } catch (error) {
      console.error('Error fetching filter options:', error);
    }
  };

  useEffect(() => {
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [searchTerm, filters]);

  const handleSearch = (search: string) => {
    setSearchTerm(search);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ bookId: '', genericSubjectId: '', specificSubjectId: '' });
    setSearchTerm('');
  };

  const columns: DataTableColumn<SummaryTransaction>[] = [
    {
      key: 'srNo',
      label: 'Sr No.',
      render: (value: number) => (
        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
          {value}
        </span>
      )
    },
    {
      key: 'book',
      label: 'Book',
      render: (value: any) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{value.bookName}</div>
          <div className="text-sm text-gray-500">{value.libraryNumber}</div>
        </div>
      )
    },
    {
      key: 'genericSubject',
      label: 'Generic Subject',
      render: (value: GenericSubjectMaster | null) => value ? (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {value.name}
        </span>
      ) : <span className="text-gray-400 text-xs">Not set</span>
    },
    {
      key: 'specificSubject',
      label: 'Specific Subject',
      render: (value: TagMaster | null) => value ? (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          {value.name}
        </span>
      ) : <span className="text-gray-400 text-xs">Not set</span>
    },
    {
      key: 'title',
      label: 'Title',
      render: (value: string | null) => value ? (
        <span className="font-medium">{value}</span>
      ) : <span className="text-gray-400">No title</span>
    },
    { key: 'pageNo', label: 'Page' },
    {
      key: 'informationRating',
      label: 'Rating',
      render: (value: string | null) => value ? (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          {value}
        </span>
      ) : '-'
    }
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb 
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'All Transactions' }
        ]} 
      />

      <Card
        title="All Transactions"
        icon={FileText}
        headerActions={
          <div className="flex items-center space-x-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-600">
              {transactions.length} transactions
            </span>
          </div>
        }
      >
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <FormInput
            label="Book"
            name="bookId"
            type="select"
            value={filters.bookId}
            onChange={handleFilterChange}
            options={books.map(book => ({
              value: book.id,
              label: `${book.bookName} (${book.libraryNumber})`
            }))}
            placeholder="All books"
          />

          <FormInput
            label="Generic Subject"
            name="genericSubjectId"
            type="select"
            value={filters.genericSubjectId}
            onChange={handleFilterChange}
            options={genericSubjects.map(subject => ({
              value: subject.id,
              label: subject.name
            }))}
            placeholder="All generic subjects"
          />

          <FormInput
            label="Specific Subject"
            name="specificSubjectId"
            type="select"
            value={filters.specificSubjectId}
            onChange={handleFilterChange}
            options={specificTags.map(tag => ({
              value: tag.id,
              label: tag.name
            }))}
            placeholder="All specific subjects"
          />

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>

        <DataTable
          data={transactions}
          columns={columns}
          pagination={pagination}
          onPageChange={fetchTransactions}
          loading={loading}
          searchable={true}
          onSearch={handleSearch}
          searchPlaceholder="Search transactions..."
        />
      </Card>
    </div>
  );
};

export default TransactionsPage;
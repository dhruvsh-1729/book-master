// pages/transactions/index.tsx - All Transactions Page
import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Filter, Plus, PencilLine } from 'lucide-react';
import {
  DataTable,
  FormInput,
  Card,
  Breadcrumb,
  Alert,
  LoadingSpinner,
} from '../../components/CoreComponents';
import {
  SummaryTransaction,
  BookMaster,
  GenericSubjectMaster,
  TagMaster,
  DataTableColumn,
  PaginationInfo,
  AlertProps,
} from '../../types';
import {
  TransactionEditorForm,
  TransactionDetailView,
  InlineModal,
  TransactionEditorValues,
  formatDateTime,
} from '../../components/transactions/TransactionComponents';

const PAGE_SIZE = 20;

const TransactionsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<SummaryTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filters, setFilters] = useState({ bookId: '', genericSubjectId: '', specificSubjectId: '' });
  const [books, setBooks] = useState<BookMaster[]>([]);
  const [genericSubjects, setGenericSubjects] = useState<GenericSubjectMaster[]>([]);
  const [specificTags, setSpecificTags] = useState<TagMaster[]>([]);
  const [globalAlert, setGlobalAlert] = useState<AlertProps | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [activeTransaction, setActiveTransaction] = useState<SummaryTransaction | null>(null);
  const [deleteInProgressId, setDeleteInProgressId] = useState<string | null>(null);

  const fetchTransactions = useCallback(
    async (page: number = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: page.toString(), limit: PAGE_SIZE.toString() });
        if (searchTerm) params.append('search', searchTerm);
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, value);
        });

        const response = await fetch(`/api/transactions?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch transactions');
        const data = await response.json();
        setTransactions(data.transactions || []);
        setPagination(data.pagination || { page, limit: PAGE_SIZE, total: 0, pages: 0 });
      } catch (error) {
        console.error('Error fetching transactions:', error);
        setGlobalAlert({ type: 'error', message: 'Failed to load transactions' });
      } finally {
        setLoading(false);
      }
    },
    [filters, searchTerm]
  );

  const fetchFilterOptions = useCallback(async () => {
    try {
      const [booksResponse, genericResponse, specificResponse] = await Promise.all([
        fetch('/api/books?limit=200'),
        fetch('/api/subjects/generic?limit=200'),
        fetch('/api/subjects/tags?limit=200'),
      ]);

      const booksData = await booksResponse.json();
      const genericData = await genericResponse.json();
      const specificData = await specificResponse.json();

      setBooks(booksData.books || []);
      setGenericSubjects(genericData.subjects || []);
      setSpecificTags(specificData.tags || []);
    } catch (error) {
      console.error('Error fetching filter options:', error);
      setGlobalAlert({ type: 'error', message: 'Failed to load filter options' });
    }
  }, []);

  useEffect(() => {
    fetchFilterOptions();
  }, [fetchFilterOptions]);

  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  const handleSearch = (search: string) => {
    setSearchTerm(search);
  };

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ bookId: '', genericSubjectId: '', specificSubjectId: '' });
    setSearchTerm('');
  };

  const handleRowClick = async (row: SummaryTransaction) => {
    setDetailModalOpen(true);
    setDetailEditing(false);
    setDetailError(null);
    setDetailLoading(true);
    setActiveTransaction(row);

    try {
      const response = await fetch(`/api/transactions/${row.id}`);
      if (!response.ok) throw new Error('Unable to load transaction');
      const data = (await response.json()) as SummaryTransaction;
      setActiveTransaction(data);
    } catch (error: any) {
      setDetailError(error?.message || 'Failed to load transaction details');
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setActiveTransaction(null);
    setDetailEditing(false);
    setDetailError(null);
  };

  const handleCreateSubmit = async (payload: TransactionEditorValues) => {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error || 'Failed to create transaction');
    }
    await response.json();
    setShowCreateModal(false);
    setGlobalAlert({ type: 'success', message: 'Summary transaction created successfully' });
    fetchTransactions(1);
  };

  const handleUpdateSubmit = async (payload: TransactionEditorValues) => {
    if (!activeTransaction) return;
    const response = await fetch(`/api/transactions/${activeTransaction.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error?.error || 'Failed to update transaction');
    }
    const updated = (await response.json()) as SummaryTransaction;
    setActiveTransaction(updated);
    setTransactions((prev) => prev.map((tx) => (tx.id === updated.id ? updated : tx)));
    setDetailEditing(false);
    setGlobalAlert({ type: 'success', message: 'Summary transaction updated successfully' });
    fetchTransactions(pagination.page);
  };

  const handleDeleteTransaction = async (transaction: SummaryTransaction) => {
    const confirmation = confirm(`Delete summary transaction #${transaction.srNo}? This will not remove linked subjects or tags.`);
    if (!confirmation) return;
    setDeleteInProgressId(transaction.id);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete transaction');

      setTransactions((prev) => prev.filter((tx) => tx.id !== transaction.id));
      setGlobalAlert({ type: 'success', message: 'Summary transaction deleted successfully' });
      if (activeTransaction?.id === transaction.id) {
        closeDetailModal();
      }
      fetchTransactions(pagination.page);
    } catch (error: any) {
      setGlobalAlert({ type: 'error', message: error?.message || 'Failed to delete transaction' });
    } finally {
      setDeleteInProgressId(null);
    }
  };

  const columns: DataTableColumn<SummaryTransaction>[] = [
    {
      key: 'srNo',
      label: 'Sr No.',
      render: (value: number) => <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{value}</span>,
    },
    {
      key: 'book',
      label: 'Book',
      render: (value: any) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{value?.bookName || 'Unknown Book'}</div>
          <div className="text-sm text-gray-500">{value?.libraryNumber || '—'}</div>
        </div>
      ),
    },
    {
      key: 'genericSubjects',
      label: 'Generic Subjects',
      render: (value: GenericSubjectMaster[] | undefined) =>
        value && value.length ? (
          <div className="flex flex-wrap gap-1">
            {value.slice(0, 3).map((subject) => (
              <span key={subject.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {subject.name}
              </span>
            ))}
            {value.length > 3 && <span className="text-[11px] text-blue-600">+{value.length - 3} more</span>}
          </div>
        ) : (
          <span className="text-gray-400 text-xs">Not set</span>
        ),
    },
    {
      key: 'specificSubjects',
      label: 'Specific Tags',
      render: (value: TagMaster[] | undefined) =>
        value && value.length ? (
          <div className="flex flex-wrap gap-1">
            {value.slice(0, 3).map((tag) => (
              <span key={tag.id} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {tag.name}
              </span>
            ))}
            {value.length > 3 && <span className="text-[11px] text-green-600">+{value.length - 3} more</span>}
          </div>
        ) : (
          <span className="text-gray-400 text-xs">Not set</span>
        ),
    },
    {
      key: 'title',
      label: 'Title',
      render: (value: string | null) => (value ? <span className="font-medium">{value}</span> : <span className="text-gray-400">No title</span>),
    },
    { key: 'pageNo', label: 'Page' },
    {
      key: 'informationRating',
      label: 'Rating',
      render: (value: string | null) =>
        value ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{value}</span>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'All Transactions' }]} />

      {globalAlert && <Alert type={globalAlert.type} message={globalAlert.message} onClose={() => setGlobalAlert(null)} />}

      <Card
        title="All Transactions"
        icon={FileText}
        headerActions={
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Summary Transaction
            </button>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <Filter className="h-4 w-4 text-gray-400" />
              <span>{transactions.length} transactions</span>
            </div>
          </div>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          <FormInput
            label="Book"
            name="bookId"
            type="select"
            value={filters.bookId}
            onChange={handleFilterChange}
            options={books.map((book) => ({ value: book.id, label: `${book.bookName} (${book.libraryNumber})` }))}
            placeholder="All books"
          />

          <FormInput
            label="Generic Subject"
            name="genericSubjectId"
            type="select"
            value={filters.genericSubjectId}
            onChange={handleFilterChange}
            options={genericSubjects.map((subject) => ({ value: subject.id, label: subject.name }))}
            placeholder="All generic subjects"
          />

          <FormInput
            label="Specific Subject"
            name="specificSubjectId"
            type="select"
            value={filters.specificSubjectId}
            onChange={handleFilterChange}
            options={specificTags.map((tag) => ({ value: tag.id, label: tag.name }))}
            placeholder="All specific subjects"
          />

          <div className="flex items-end">
            <button
              onClick={clearFilters}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
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
          searchable
          onSearch={handleSearch}
          searchPlaceholder="Search transactions..."
          rowClickable
          onRowClick={handleRowClick}
          onDelete={handleDeleteTransaction}
        />
      </Card>

      <InlineModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Summary Transaction" size="xl">
        <TransactionEditorForm
          key={showCreateModal ? 'create' : 'create-hidden'}
          mode="create"
          books={books}
          defaultBookId={filters.bookId}
          onSubmit={handleCreateSubmit}
          onCancel={() => setShowCreateModal(false)}
        />
      </InlineModal>

      <InlineModal isOpen={detailModalOpen} onClose={closeDetailModal} title="Summary Transaction Details" size="xl">
        {detailLoading && (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!detailLoading && detailError && (
          <Alert type="error" message={detailError} onClose={() => setDetailError(null)} />
        )}

        {!detailLoading && !detailError && activeTransaction && (
          <div className="space-y-6">
            <TransactionDetailView transaction={activeTransaction} />

            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-gray-500">Updated {formatDateTime(activeTransaction.updatedAt)}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => setDetailEditing((prev) => !prev)}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <PencilLine className="h-4 w-4 mr-2" />
                  {detailEditing ? 'Close Editor' : 'Edit Transaction'}
                </button>
                <button
                  onClick={() => handleDeleteTransaction(activeTransaction)}
                  disabled={deleteInProgressId === activeTransaction.id}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-60"
                >
                  {deleteInProgressId === activeTransaction.id ? 'Deleting...' : 'Delete Transaction'}
                </button>
              </div>
            </div>

            {detailEditing && (
              <div className="border-t pt-6">
                <TransactionEditorForm
                  key={activeTransaction.id}
                  mode="edit"
                  books={books}
                  defaultBookId={activeTransaction.bookId}
                  initialData={activeTransaction}
                  onSubmit={handleUpdateSubmit}
                  onCancel={() => setDetailEditing(false)}
                  lockBookSelection
                />
              </div>
            )}
          </div>
        )}
      </InlineModal>
    </div>
  );
};

export default TransactionsPage;

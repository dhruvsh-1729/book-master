import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Plus, Book, ArrowLeft, PencilLine } from 'lucide-react';
import { DataTable, Alert, Card, Breadcrumb, LoadingSpinner } from './CoreComponents';
import {
  BookMaster,
  SummaryTransaction,
  GenericSubjectMaster,
  TagMaster,
  DataTableColumn,
  PaginationInfo,
  AlertProps,
} from '../types';
import {
  InlineModal,
  TransactionEditorForm,
  TransactionDetailView,
  TransactionEditorValues,
  formatDateTime,
} from './transactions/TransactionComponents';

interface BookDetailWithTransactionsProps {
  bookId: string;
}

const PAGE_SIZE = 20;

const BookDetailWithTransactions: React.FC<BookDetailWithTransactionsProps> = ({ bookId }) => {
  const [book, setBook] = useState<BookMaster | null>(null);
  const [transactions, setTransactions] = useState<SummaryTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    pages: 0,
  });
  const [bookLoading, setBookLoading] = useState(true);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [activeTransaction, setActiveTransaction] = useState<SummaryTransaction | null>(null);
  const [deleteInProgressId, setDeleteInProgressId] = useState<string | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);

  const fetchBookDetails = useCallback(async () => {
    if (!bookId) return;
    setBookLoading(true);
    try {
      const response = await fetch(`/api/books/${bookId}?includeTransactions=true`);
      if (!response.ok) throw new Error('Book not found');
      const data: BookMaster & { summaryTransactions?: SummaryTransaction[] } = await response.json();
      setBook(data);
      if (data.summaryTransactions?.length) {
        setTransactions(data.summaryTransactions);
        setPagination((prev) => ({
          ...prev,
          total: data.summaryTransactions!.length,
          pages: Math.max(1, Math.ceil(data.summaryTransactions!.length / PAGE_SIZE)),
        }));
      }
    } catch (error) {
      console.error('Error fetching book:', error);
      setAlert({ type: 'error', message: 'Failed to fetch book details' });
    } finally {
      setBookLoading(false);
    }
  }, [bookId]);

  const fetchTransactions = useCallback(
    async (page = 1, search = '') => {
      if (!bookId) return;
      setTransactionsLoading(true);
      try {
        const response = await fetch(`/api/transactions/book/${bookId}?page=${page}&limit=${PAGE_SIZE}&search=${encodeURIComponent(search)}`);
        if (!response.ok) throw new Error('Failed to fetch transactions');
        const data = await response.json();
        setTransactions(data.transactions || []);
        setPagination(data.pagination || { page, limit: PAGE_SIZE, total: data.transactions?.length || 0, pages: 1 });
        setBook((prev) => prev ?? data.book);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        setAlert({ type: 'error', message: 'Failed to fetch transactions' });
      } finally {
        setTransactionsLoading(false);
      }
    },
    [bookId]
  );

  useEffect(() => {
    if (!bookId) return;
    fetchBookDetails();
    fetchTransactions(1, '');
  }, [bookId, fetchBookDetails, fetchTransactions]);

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    fetchTransactions(1, term);
  };

  const handlePageChange = (page: number) => {
    fetchTransactions(page, searchTerm);
  };

  const openTransactionDetail = async (transaction: SummaryTransaction, startEditing = false) => {
    setDetailModalOpen(true);
    setDetailEditing(startEditing);
    setDetailError(null);
    setDetailLoading(true);
    setActiveTransaction(transaction);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`);
      if (!response.ok) throw new Error('Unable to load transaction');
      const data = (await response.json()) as SummaryTransaction;
      setActiveTransaction(data);
    } catch (error: any) {
      setDetailError(error?.message || 'Failed to load transaction details');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRowClick = (transaction: SummaryTransaction) => openTransactionDetail(transaction, false);
  const handleEditTransaction = (transaction: SummaryTransaction) => openTransactionDetail(transaction, true);

  const closeDetailModal = () => {
    setDetailModalOpen(false);
    setActiveTransaction(null);
    setDetailEditing(false);
    setDetailError(null);
  };

  const handleCreateSubmit = async (payload: TransactionEditorValues) => {
    const targetBookId = book?.id || payload.bookId;
    if (!targetBookId) {
      setAlert({ type: 'error', message: 'Book information missing for transaction creation' });
      return;
    }
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, bookId: targetBookId }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'Failed to create transaction');
      }
      setShowCreateModal(false);
      setAlert({ type: 'success', message: 'Summary transaction created successfully' });
      fetchTransactions(1, searchTerm);
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Failed to create transaction' });
    }
  };

  const handleUpdateSubmit = async (payload: TransactionEditorValues) => {
    if (!activeTransaction) return;
    try {
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
      setAlert({ type: 'success', message: 'Summary transaction updated successfully' });
      fetchTransactions(pagination.page, searchTerm);
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Failed to update transaction' });
    }
  };

  const handleDeleteTransaction = async (transaction: SummaryTransaction) => {
    const confirmation = confirm(`Delete summary transaction #${transaction.srNo}? This cannot be undone.`);
    if (!confirmation) return;
    setDeleteInProgressId(transaction.id);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete transaction');
      setTransactions((prev) => prev.filter((tx) => tx.id !== transaction.id));
      setAlert({ type: 'success', message: 'Summary transaction deleted successfully' });
      if (activeTransaction?.id === transaction.id) {
        closeDetailModal();
      }
      fetchTransactions(pagination.page, searchTerm);
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Failed to delete transaction' });
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
      label: 'Title/Heading',
      render: (value: string | null, row) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{value || 'No title'}</div>
          {row.keywords && <div className="text-sm text-gray-500 truncate">Keywords: {row.keywords}</div>}
        </div>
      ),
    },
    { key: 'pageNo', label: 'Page No.', render: (value: string | null) => value || '-' },
    {
      key: 'informationRating',
      label: 'Rating',
      render: (value: string | null) =>
        value ? <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{value}</span> : '-',
    },
  ];

  if (bookLoading && !book) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Book not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Book Master', href: '/books' }, { label: book.bookName }]} />

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <Card
        title="Book Information"
        icon={Book}
        headerActions={
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Books
          </button>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{book.bookName}</h3>
              <p className="text-sm text-gray-600">Library: {book.libraryNumber}</p>
            </div>

            {book.bookSummary && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Summary</h4>
                <p className="text-sm text-gray-600 leading-relaxed">{book.bookSummary}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              {book.pageNumbers && (
                <div>
                  <span className="font-medium text-gray-700">Pages:</span>
                  <span className="ml-2 text-gray-600">{book.pageNumbers}</span>
                </div>
              )}
              {book.edition && (
                <div>
                  <span className="font-medium text-gray-700">Edition:</span>
                  <span className="ml-2 text-gray-600">{book.edition}</span>
                </div>
              )}
              {book.publisherName && (
                <div>
                  <span className="font-medium text-gray-700">Publisher:</span>
                  <span className="ml-2 text-gray-600">{book.publisherName}</span>
                </div>
              )}
              {book.grade && (
                <div>
                  <span className="font-medium text-gray-700">Grade:</span>
                  <span className="ml-2 text-gray-600">{book.grade}</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {book.editors && book.editors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Editors</h4>
                <div className="space-y-1">
                  {book.editors.map((editor) => (
                    <div key={editor.id} className="text-sm text-gray-600">
                      {editor.name} {editor.role ? <span className="text-gray-500">— {editor.role}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card
        title="Summary Transactions"
        icon={FileText}
        headerActions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Summary Transaction
          </button>
        }
      >
        <DataTable
          data={transactions}
          columns={columns}
          pagination={pagination}
          onPageChange={handlePageChange}
          loading={bookLoading || transactionsLoading}
          searchable
          onSearch={handleSearch}
          searchPlaceholder="Search transactions..."
          rowClickable
          onRowClick={handleRowClick}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
        />
      </Card>

      <InlineModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Summary Transaction" size="xl">
        <TransactionEditorForm
          key={showCreateModal ? 'create' : 'create-hidden'}
          mode="create"
          books={book ? [book] : []}
          defaultBookId={book?.id}
          onSubmit={handleCreateSubmit}
          onCancel={() => setShowCreateModal(false)}
          lockBookSelection
        />
      </InlineModal>

      <InlineModal isOpen={detailModalOpen} onClose={closeDetailModal} title="Summary Transaction Details" size="xl">
        {detailLoading && (
          <div className="flex justify-center items-center py-12">
            <LoadingSpinner />
          </div>
        )}

        {!detailLoading && detailError && <Alert type="error" message={detailError} onClose={() => setDetailError(null)} />}

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
                  books={book ? [book] : []}
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

export default BookDetailWithTransactions;

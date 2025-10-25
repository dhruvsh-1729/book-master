// components/BookDetailWithTransactions.tsx
import React, { useState, useEffect } from 'react';
import { FileText, Plus, Book, ArrowLeft } from 'lucide-react';
import {
  DataTable,
  Modal,
  FormInput,
  Alert,
  Card,
  Breadcrumb,
  LoadingSpinner,
} from './CoreComponents';
import {
  BookMaster,
  SummaryTransaction,
  TransactionFormData,
  GenericSubjectMaster,
  TagMaster,
  DataTableColumn,
  PaginationInfo,
  AlertProps,
  MultilingualText,
  Language,
  LanguageCode,
} from '../types';

interface BookDetailWithTransactionsProps {
  bookId: string;
}

const BookDetailWithTransactions: React.FC<BookDetailWithTransactionsProps> = ({ bookId }) => {
  const [book, setBook] = useState<BookMaster | null>(null);
  const [transactions, setTransactions] = useState<SummaryTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0,
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [selectedTransaction, setSelectedTransaction] = useState<SummaryTransaction | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);

  const fetchBookDetails = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/books/${bookId}?includeTransactions=true`);
      if (!response.ok) throw new Error('Book not found');
      const data: BookMaster & { summaryTransactions?: SummaryTransaction[] } = await response.json();
      setBook(data);
      setTransactions(data.summaryTransactions || []);
    } catch (error) {
      console.error('Error fetching book:', error);
      setAlert({ type: 'error', message: 'Failed to fetch book details' });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (page = 1, search = '') => {
    try {
      const res = await fetch(`/api/transactions/book/${bookId}?page=${page}&limit=20&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setPagination(data.pagination);
      if (!book) setBook(data.book);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      setAlert({ type: 'error', message: 'Failed to fetch transactions' });
    }
  };

  useEffect(() => {
    if (bookId) fetchBookDetails();
  }, [bookId]);

  const handleSearch = (q: string) => {
    setSearchTerm(q);
    fetchTransactions(1, q);
  };
  const handlePageChange = (page: number) => fetchTransactions(page, searchTerm);
  const handleEditTransaction = (t: SummaryTransaction) => {
    setSelectedTransaction(t);
    setShowEditModal(true);
  };
  const handleDeleteTransaction = async (t: SummaryTransaction) => {
    if (!confirm(`Delete transaction #${t.srNo}?`)) return;
    try {
      const res = await fetch(`/api/transactions/${t.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete transaction');
      setAlert({ type: 'success', message: 'Transaction deleted successfully' });
      fetchTransactions(pagination.page, searchTerm);
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to delete transaction' });
    }
  };

  const columns: DataTableColumn<SummaryTransaction>[] = [
    {
      key: 'srNo',
      label: 'Sr No.',
      render: (v: number) => <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{v}</span>,
    },
    {
      key: 'genericSubject',
      label: 'Generic Subject',
      render: (v: GenericSubjectMaster | null) =>
        v ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            {v.name}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">Not set</span>
        ),
    },
    {
      key: 'specificSubject',
      label: 'Specific Subject',
      render: (v: TagMaster | null) =>
        v ? (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            {v.name}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">Not set</span>
        ),
    },
    {
      key: 'title',
      label: 'Title/Heading',
      render: (v: string | null, row) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{v || 'No title'}</div>
          {row.keywords && <div className="text-sm text-gray-500 truncate">Keywords: {row.keywords}</div>}
        </div>
      ),
    },
    { key: 'pageNo', label: 'Page No.', render: (v: string | null) => v || '-' },
    {
      key: 'informationRating',
      label: 'Rating',
      render: (v: string | null) =>
        v ? <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">{v}</span> : '-',
    },
  ];

  if (loading) {
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
            {/* Editors */}
            {book.editors && book.editors.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Editors</h4>
                <div className="space-y-1">
                  {book.editors.map((e) => (
                    <div key={e.id} className="text-sm text-gray-600">
                      {e.name} {e.role ? <span className="text-gray-500">— {e.role}</span> : null}
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
            Add Transaction
          </button>
        }
      >
        <DataTable
          data={transactions}
          columns={columns}
          pagination={pagination}
          onPageChange={handlePageChange}
          loading={loading}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
          searchable
          onSearch={handleSearch}
          searchPlaceholder="Search transactions..."
        />
      </Card>

      {/* Create */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Add New Transaction" size="xl">
        <TransactionForm
          bookId={bookId}
          onSubmit={async (fd) => {
            try {
              const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...fd, bookId }),
              });
              if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e?.error || 'Failed to create transaction');
              }
              setAlert({ type: 'success', message: 'Transaction created successfully' });
              setShowCreateModal(false);
              fetchTransactions(pagination.page, searchTerm);
            } catch (e: any) {
              setAlert({ type: 'error', message: e.message });
            }
          }}
          onCancel={() => setShowCreateModal(false)}
        />
      </Modal>

      {/* Edit */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} title="Edit Transaction" size="xl">
        {selectedTransaction && (
          <TransactionForm
            bookId={bookId}
            initialData={selectedTransaction}
            onSubmit={async (fd) => {
              try {
                const res = await fetch(`/api/transactions/${selectedTransaction.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(fd),
                });
                if (!res.ok) {
                  const e = await res.json().catch(() => ({}));
                  throw new Error(e?.error || 'Failed to update transaction');
                }
                setAlert({ type: 'success', message: 'Transaction updated successfully' });
                setShowEditModal(false);
                setSelectedTransaction(null);
                fetchTransactions(pagination.page, searchTerm);
              } catch (e: any) {
                setAlert({ type: 'error', message: e.message });
              }
            }}
            onCancel={() => {
              setShowEditModal(false);
              setSelectedTransaction(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
};

export default BookDetailWithTransactions;

/* TransactionForm (inner component) */

interface TransactionFormProps {
  bookId: string;
  initialData?: Partial<SummaryTransaction>;
  onSubmit: (formData: TransactionFormData) => Promise<void>;
  onCancel: () => void;
}

export const TransactionForm: React.FC<TransactionFormProps> = ({
  bookId,
  initialData = {},
  onSubmit,
  onCancel,
}) => {
  const initialRelevant: MultilingualText =
    initialData.relevantParagraph && typeof initialData.relevantParagraph === 'object'
      ? (initialData.relevantParagraph as MultilingualText)
      : { english: initialData.relevantParagraph ? String(initialData.relevantParagraph) : '', hindi: '', gujarati: '', sanskrit: '' };

  const [formData, setFormData] = useState<TransactionFormData>({
    srNo: typeof initialData.srNo === 'number' ? initialData.srNo : 0,
    genericSubjectId: initialData.genericSubjectId || '',
    specificSubjectId: initialData.specificSubjectId || '',
    title: initialData.title || '',
    keywords: initialData.keywords || '',
    paragraphNo: initialData.paragraphNo || '',
    pageNo: initialData.pageNo || '',
    informationRating: initialData.informationRating || '',
    remark: initialData.remark || '',
    bookId,
    relevantParagraph: initialRelevant,
  });

  const [genericSubjects, setGenericSubjects] = useState<GenericSubjectMaster[]>([]);
  const [specificTags, setSpecificTags] = useState<TagMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Partial<Record<keyof TransactionFormData, string>>>({});
  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>('english');

  const languages: Language[] = [
    { code: 'english', name: 'English', icon: '🇺🇸' },
    { code: 'hindi', name: 'Hindi', icon: '🇮🇳' },
    { code: 'gujarati', name: 'Gujarati', icon: '🇮🇳' },
    { code: 'sanskrit', name: 'Sanskrit', icon: '🕉️' },
  ];

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [g, t] = await Promise.all([
          fetch('/api/subjects/generic-subjects?limit=100'),
          fetch('/api/subjects/tags?limit=100'),
        ]);
        const gJson = await g.json();
        const tJson = await t.json();
        setGenericSubjects(gJson.subjects || []);
        setSpecificTags(tJson.tags || []);
      } catch (e) {
        console.error('Failed to load dropdowns', e);
      }
    };
    loadOptions();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: name === 'srNo' ? parseInt(value || '0', 10) || 0 : value }));
    if (errors[name as keyof TransactionFormData]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleParagraphChange = (lang: LanguageCode, value: string) => {
    setFormData((p) => ({ ...p, relevantParagraph: { ...p.relevantParagraph, [lang]: value } }));
  };

  const validate = () => {
    const e: Partial<Record<keyof TransactionFormData, string>> = {};
    if (!formData.srNo || formData.srNo <= 0) e.srNo = 'Serial number is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await onSubmit({
        ...formData,
        genericSubjectId: formData.genericSubjectId || undefined,
        specificSubjectId: formData.specificSubjectId || undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormInput label="Serial Number" name="srNo" type="number" value={formData.srNo} onChange={handleChange} required error={errors.srNo} placeholder="1" />
        <FormInput
          label="Generic Subject"
          name="genericSubjectId"
          type="select"
          value={formData.genericSubjectId}
          onChange={handleChange}
          options={genericSubjects.map((s) => ({ value: s.id, label: s.name }))}
          placeholder="Select generic subject..."
        />
        <FormInput
          label="Specific Subject"
          name="specificSubjectId"
          type="select"
          value={formData.specificSubjectId}
          onChange={handleChange}
          options={specificTags.map((t) => ({ value: t.id, label: t.name }))}
          placeholder="Select specific subject..."
        />
      </div>

      <FormInput label="Title / Heading" name="title" value={formData.title} onChange={handleChange} placeholder="Enter title or heading..." />
      <FormInput label="Keywords" name="keywords" value={formData.keywords} onChange={handleChange} placeholder="Enter relevant keywords..." />

      {/* Multilingual paragraph */}
      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">Relevant Paragraph / Excerpts</label>

        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {languages.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setActiveLanguage(lang.code)}
                className={`py-2 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 ${
                  activeLanguage === lang.code ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{lang.icon}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="space-y-4">
          {languages.map((lang) => (
            <div key={lang.code} className={activeLanguage === lang.code ? 'block' : 'hidden'}>
              <textarea
                rows={6}
                placeholder={`Enter relevant paragraph in ${lang.name}...`}
                value={formData.relevantParagraph[lang.code] || ''}
                onChange={(e) => handleParagraphChange(lang.code, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir={['hindi', 'gujarati', 'sanskrit'].includes(lang.code) ? 'auto' : 'ltr'}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormInput label="Paragraph Number" name="paragraphNo" value={formData.paragraphNo} onChange={handleChange} placeholder="e.g., P1" />
        <FormInput label="Page Number" name="pageNo" value={formData.pageNo} onChange={handleChange} placeholder="e.g., 45" />
        <FormInput
          label="Information Rating"
          name="informationRating"
          type="select"
          value={formData.informationRating}
          onChange={handleChange}
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
          placeholder="Select rating..."
        />
      </div>

      <FormInput label="Remark" name="remark" type="textarea" rows={3} value={formData.remark} onChange={handleChange} placeholder="Additional remarks..." />

      <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : initialData.id ? 'Update Transaction' : 'Create Transaction'}
        </button>
      </div>
    </div>
  );
};

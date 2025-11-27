// components/BookMasterList.tsx
import React, { useState, useEffect } from 'react';
import { Book, Plus, FileText, Tag as TagIcon } from 'lucide-react';
import {
  DataTable,
  Modal,
  FormInput,
  Alert,
  Card,
  Breadcrumb,
  StatsCard,
  LoadingSpinner,
} from './CoreComponents';
import CreatableSelect from 'react-select/creatable';
import {
  BookMaster,
  BooksResponse,
  DashboardStats,
  BookFormData,
  GenericSubjectMaster,
  TagMaster,
  DataTableColumn,
  PaginationInfo,
  AlertProps,
} from '../types';
import ImageUploader from './ImageUploader';

const BookMasterList: React.FC = () => {
  const [books, setBooks] = useState<BookMaster[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({ page: 1, limit: 10, total: 0, pages: 0 });
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [selectedBook, setSelectedBook] = useState<BookMaster | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const [stats, setStats] = useState<DashboardStats>({
    totalBooks: 0,
    totalTransactions: 0,
    totalGenericSubjects: 0,
    totalSpecificTags: 0,
  });

  const fetchBooks = async (page = 1, search = '') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/books?page=${page}&limit=10&search=${encodeURIComponent(search)}`);
      const data: BooksResponse = await res.json();
      setBooks(data.books || []);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching books:', error);
      setAlert({ type: 'error', message: 'Failed to fetch books' });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [booksTotalRes, txTotalRes, genRes, tagRes] = await Promise.all([
        fetch('/api/books?page=1&limit=1'),
        fetch('/api/transactions?page=1&limit=1'),
        fetch('/api/subjects/generic?page=1&limit=1'),
        fetch('/api/subjects/tags?page=1&limit=1'),
      ]);
      const booksTotal: BooksResponse = await booksTotalRes.json();
      const txTotal = await txTotalRes.json();
      const generic = await genRes.json();
      const tags = await tagRes.json();
      setStats({
        totalBooks: booksTotal?.pagination?.total ?? 0,
        totalTransactions: txTotal?.pagination?.total ?? 0,
        totalGenericSubjects: generic?.pagination?.total ?? 0,
        totalSpecificTags: tags?.pagination?.total ?? 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchStats();
  }, []);

  const handleSearch = (q: string) => {
    setSearchTerm(q);
    fetchBooks(1, q);
  };
  const handlePageChange = (page: number) => fetchBooks(page, searchTerm);
  const handleViewBook = (b: BookMaster) => (window.location.href = `/books/${b.id}`);
  const handleEditBook = async (b: BookMaster) => {
    setSelectedBook(null);
    try {
      const res = await fetch(`/api/books/${b.id}`);
      if (!res.ok) throw new Error('Failed to load book details');
      const data = await res.json();
      setSelectedBook({ ...data, editors: data.editors ?? [] });
      setShowEditModal(true);
    } catch (error: any) {
      console.error('Error loading book', error);
      setAlert({ type: 'error', message: error?.message || 'Unable to load book details' });
    }
  };
  const handleDeleteBook = async (b: BookMaster) => {
    if (!confirm(`Delete "${b.bookName}"?`)) return;
    try {
      const res = await fetch(`/api/books/${b.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete book');
      setAlert({ type: 'success', message: 'Book deleted successfully' });
      fetchBooks(pagination.page, searchTerm);
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message });
    }
  };

  const columns: DataTableColumn<BookMaster>[] = [
    {
      key: 'coverImageUrl',
      label: 'Image',
      render: (v: string | null, row) =>
        v ? (
          <img src={v} alt={row.bookName} className="h-12 w-10 rounded object-cover border border-gray-200" />
        ) : (
          <div className="h-12 w-10 rounded border border-dashed border-gray-300 bg-gray-50"></div>
        ),
    },
    {
      key: 'libraryNumber',
      label: 'Library Number',
      render: (v: string) => <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{v}</span>,
    },
    {
      key: 'bookName',
      label: 'Book Name',
      render: (v: string, row) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{v}</div>
          {row.bookSummary && <div className="text-sm text-gray-500 truncate">{row.bookSummary}</div>}
        </div>
      ),
    },
    {
      key: 'publisherName',
      label: 'Publisher',
      render: (v: string | null) => v || '-',
    },
    {
      key: 'grade',
      label: 'Grade',
      render: (v: string | null) => v || '-',
    },
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Book Master' }]} />

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard title="Total Books" value={stats.totalBooks} icon={Book} color="blue" />
        <StatsCard title="Total Transactions" value={stats.totalTransactions} icon={FileText} color="green" />
        <StatsCard title="Generic Subjects" value={stats.totalGenericSubjects} icon={TagIcon} color="yellow" />
        <StatsCard title="Specific Tags" value={stats.totalSpecificTags} icon={TagIcon} color="red" />
      </div>

      <Card
        title="Book Master"
        icon={Book}
        headerActions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Book
          </button>
        }
      >
        <DataTable
          data={books}
          columns={columns}
          pagination={pagination}
          onPageChange={handlePageChange}
          loading={loading}
          onView={handleViewBook}
          onEdit={handleEditBook}
          onDelete={handleDeleteBook}
          searchable
          onSearch={handleSearch}
          searchPlaceholder="Search books, library numbers..."
        />
      </Card>

      {/* Create */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowCreateModal(false)} />
          <div className="relative max-w-4xl mx-auto my-8 p-6 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium">Add New Book</h3>
              <button className="text-gray-400 hover:text-gray-500" onClick={() => setShowCreateModal(false)}>
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <BookForm
              onSubmit={async (fd: BookFormData) => {
                try {
                  const res = await fetch('/api/books', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fd),
                  });
                  if (!res.ok) {
                    const e = await res.json().catch(() => ({}));
                    throw new Error(e?.error || 'Failed to create book');
                  }
                  setAlert({ type: 'success', message: 'Book created successfully' });
                  setShowCreateModal(false);
                  fetchBooks(pagination.page, searchTerm);
                } catch (e: any) {
                  setAlert({ type: 'error', message: e.message });
                }
              }}
              onCancel={() => setShowCreateModal(false)}
            />
          </div>
        </div>
      )}

      {/* Edit */}
      {showEditModal && selectedBook && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowEditModal(false)} />
          <div className="relative max-w-4xl mx-auto my-8 p-6 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium">Edit Book</h3>
              <button className="text-gray-400 hover:text-gray-500" onClick={() => setShowEditModal(false)}>
                <span className="sr-only">Close</span>×
              </button>
            </div>
            <BookForm
              initialData={selectedBook}
              onSubmit={async (fd: BookFormData) => {
                try {
                  const res = await fetch(`/api/books/${selectedBook.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(fd),
                  });
                  if (!res.ok) {
                    const e = await res.json().catch(() => ({}));
                    throw new Error(e?.error || 'Failed to update book');
                  }
                  setAlert({ type: 'success', message: 'Book updated successfully' });
                  setShowEditModal(false);
                  setSelectedBook(null);
                  fetchBooks(pagination.page, searchTerm);
                } catch (e: any) {
                  setAlert({ type: 'error', message: e.message });
                }
              }}
              onCancel={() => {
                setShowEditModal(false);
                setSelectedBook(null);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BookMasterList;

/* BookForm */

interface BookFormProps {
  initialData?: Partial<BookMaster>;
  onSubmit: (formData: BookFormData) => Promise<void>;
  onCancel: () => void;
}

export const BookForm: React.FC<BookFormProps> = ({ initialData = {}, onSubmit, onCancel }) => {
  const ROLE_OPTIONS = ['Editor', 'Co-editor', 'Chief Editor', 'Assistant Editor', 'Author', 'Translator'];

  const baseDefaults = {
    libraryNumber: '',
    bookName: '',
    bookSummary: '',
    pageNumbers: '',
    grade: '',
    remark: '',
    edition: '',
    publisherName: '',
    coverImageUrl: null,
    coverImagePublicId: null,
    editors: [],
  };

  const normalizeInitial = (data: Partial<BookMaster> = {}): BookFormData => ({
    ...baseDefaults,
    ...data,
    libraryNumber: data.libraryNumber ?? '',
    bookName: data.bookName ?? '',
    bookSummary: data.bookSummary ?? '',
    pageNumbers: data.pageNumbers ?? '',
    grade: data.grade ?? '',
    remark: data.remark ?? '',
    edition: data.edition ?? '',
    publisherName: data.publisherName ?? '',
    coverImageUrl: data.coverImageUrl ?? null,
    coverImagePublicId: data.coverImagePublicId ?? null,
    editors: Array.isArray(data.editors)
      ? data.editors.map((editor) => ({
          name: editor?.name ?? '',
          role: editor?.role ?? null,
        }))
      : [],
  });

  const [formData, setFormData] = useState<BookFormData>(normalizeInitial(initialData));

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BookFormData, string>>>({});

  useEffect(() => {
    if ((initialData as any)?.id) {
      setFormData(normalizeInitial(initialData));
      setErrors({});
    }
  }, [(initialData as any)?.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((p) => ({ ...p, [name]: value }));
    if (errors[name as keyof BookFormData]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const setEditor = (idx: number, field: keyof BookFormData['editors'][number], val: string) => {
    const next = [...(formData.editors || [])];
    next[idx] = { ...next[idx], [field]: val };
    setFormData((p) => ({ ...p, editors: next }));
  };

  const addEditor = () =>
    setFormData((p) => ({ ...p, editors: [...(p.editors || []), { name: '', role: 'Editor' }] }));
  const removeEditor = (idx: number) =>
    setFormData((p) => ({ ...p, editors: (p.editors || []).filter((_, i) => i !== idx) }));

  const validate = () => {
    const e: Partial<Record<keyof BookFormData, string>> = {};
    if (!formData.libraryNumber?.trim()) e.libraryNumber = 'Library number is required';
    if (!formData.bookName?.trim()) e.bookName = 'Book name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const editors = (formData.editors || [])
        .map((ed) => ({ ...ed, name: (ed.name || '').trim() }))
        .filter((ed) => ed.name);
      await onSubmit({ ...formData, editors });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormInput label="Library Number" name="libraryNumber" value={formData.libraryNumber} onChange={handleChange} required error={errors.libraryNumber} placeholder="B009361" />
        <FormInput label="Book Name" name="bookName" value={formData.bookName} onChange={handleChange} required error={errors.bookName} placeholder="Enter book name" />
      </div>

      <ImageUploader
        label="Book Image"
        value={formData.coverImageUrl ? { url: formData.coverImageUrl, publicId: formData.coverImagePublicId } : null}
        onChange={(val) =>
          setFormData((p) => ({
            ...p,
            coverImageUrl: val?.url ?? null,
            coverImagePublicId: val?.publicId ?? null,
          }))
        }
        aspect={3 / 4}
        uploadFolder="books"
        helpText="Use a cropped cover or reference image for this book."
      />

      <FormInput label="Book Summary" name="bookSummary" type="textarea" rows={4} value={formData.bookSummary} onChange={handleChange} placeholder="Enter a comprehensive book summary..." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormInput label="Page Numbers" name="pageNumbers" value={formData.pageNumbers} onChange={handleChange} placeholder="1-272" />
        <FormInput label="Grade" name="grade" value={formData.grade} onChange={handleChange} placeholder="A, B, C" />
        <FormInput label="Edition" name="edition" value={formData.edition} onChange={handleChange} placeholder="1st Edition" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormInput label="Publisher" name="publisherName" value={formData.publisherName} onChange={handleChange} placeholder="Publisher name" />
        <FormInput label="Remark" name="remark" type="textarea" rows={3} value={formData.remark} onChange={handleChange} placeholder="Additional remarks..." />
      </div>

      {/* Editors */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Editors</label>
          <button type="button" onClick={addEditor} className="text-sm text-blue-600 hover:text-blue-700">
            + Add Editor
          </button>
        </div>

        {(formData.editors || []).map((ed, i) => {
          const selectValue = ed.role ? { value: ed.role, label: ed.role } : null;
          return (
          <div key={i} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-md">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Editor name"
                value={ed.name || ''}
                onChange={(e) => setEditor(i, 'name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-40">
              <CreatableSelect
                isClearable
                value={selectValue}
                onChange={(option) => setEditor(i, 'role', option?.value || '')}
                options={ROLE_OPTIONS.map((r) => ({ value: r, label: r }))}
                classNamePrefix="react-select"
                placeholder="Role"
                styles={{
                  menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                  control: (base) => ({ ...base, minHeight: '42px' }),
                }}
                menuPortalTarget={typeof document !== 'undefined' ? document.body : undefined}
              />
            </div>
            <button type="button" onClick={() => removeEditor(i)} className="text-red-600 hover:text-red-700">
              Remove
            </button>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : initialData.id ? 'Update Book' : 'Create Book'}
        </button>
      </div>
    </div>
  );
};

// components/BookMasterList.tsx

import React, { useState, useEffect } from 'react';
import { Book, Plus, Search, Tag as TagIcon, FileText, Users } from 'lucide-react';
import { 
  DataTable, 
  Modal, 
  FormInput, 
  Alert, 
  Card, 
  Breadcrumb, 
  StatsCard,
  LoadingSpinner 
} from './CoreComponents';
import {
  BookMaster,
  BooksResponse,
  DashboardStats,
  BookFormData,
  GenericSubjectMaster,
  TagMaster,
  DataTableColumn,
  PaginationInfo,
  AlertProps
} from '../types';

// Book Master List Component
const BookMasterList: React.FC = () => {
  const [books, setBooks] = useState<BookMaster[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });
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
    totalSpecificTags: 0
  });

  // Fetch books
  const fetchBooks = async (page: number = 1, search: string = '') => {
    setLoading(true);
    try {
      const response = await fetch(`/api/books?page=${page}&limit=10&search=${search}`);
      const data: BooksResponse = await response.json();
      setBooks(data.books);
      setPagination(data.pagination);
    } catch (error) {
      console.error('Error fetching books:', error);
      setAlert({ type: 'error', message: 'Failed to fetch books' });
    } finally {
      setLoading(false);
    }
  };

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      const data: DashboardStats = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  useEffect(() => {
    fetchBooks();
    fetchStats();
  }, []);

  // Handle search
  const handleSearch = (search: string) => {
    setSearchTerm(search);
    fetchBooks(1, search);
  };

  // Handle page change
  const handlePageChange = (page: number) => {
    fetchBooks(page, searchTerm);
  };

  // Handle view book
  const handleViewBook = (book: BookMaster) => {
    window.location.href = `/books/${book.id}`;
  };

  // Handle edit book
  const handleEditBook = (book: BookMaster) => {
    setSelectedBook(book);
    setShowEditModal(true);
  };

  // Handle delete book
  const handleDeleteBook = async (book: BookMaster) => {
    if (!confirm(`Are you sure you want to delete "${book.bookName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/books/${book.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setAlert({ type: 'success', message: 'Book deleted successfully' });
        fetchBooks(pagination.page, searchTerm);
      } else {
        throw new Error('Failed to delete book');
      }
    } catch (error) {
      console.error('Error deleting book:', error);
      setAlert({ type: 'error', message: 'Failed to delete book' });
    }
  };

  // Table columns configuration
  const columns: DataTableColumn<BookMaster>[] = [
    {
      key: 'libraryNumber',
      label: 'Library Number',
      render: (value: string) => (
        <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
          {value}
        </span>
      )
    },
    {
      key: 'bookName',
      label: 'Book Name',
      render: (value: string, row: BookMaster) => (
        <div className="max-w-xs">
          <div className="font-medium text-gray-900 truncate">{value}</div>
          {row.bookSummary && (
            <div className="text-sm text-gray-500 truncate">
              {row.bookSummary.substring(0, 100)}...
            </div>
          )}
        </div>
      )
    },
    {
      key: 'genericTags',
      label: 'Generic Tags',
      render: (value: any) => (
        <div className="flex flex-wrap gap-1">
          {value?.slice(0, 2).map((tag: any, index: number) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {tag.genericSubject.name}
            </span>
          ))}
          {value?.length > 2 && (
            <span className="text-xs text-gray-500">+{value.length - 2} more</span>
          )}
        </div>
      )
    },
    {
      key: 'specificTags',
      label: 'Specific Tags',
      render: (value: any) => (
        <div className="flex flex-wrap gap-1">
          {value?.slice(0, 2).map((tag: any, index: number) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
            >
              {tag.tag.name}
            </span>
          ))}
          {value?.length > 2 && (
            <span className="text-xs text-gray-500">+{value.length - 2} more</span>
          )}
        </div>
      )
    },
    {
      key: '_count',
      label: 'Transactions',
      render: (value: any) => (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
          {value?.summaryTransactions || 0}
        </span>
      )
    }
  ];

  return (
    <div className="space-y-6">
      <Breadcrumb 
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Book Master' }
        ]} 
      />

      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatsCard
          title="Total Books"
          value={stats.totalBooks || 0}
          icon={Book}
          color="blue"
        />
        <StatsCard
          title="Total Transactions"
          value={stats.totalTransactions || 0}
          icon={FileText}
          color="green"
        />
        <StatsCard
          title="Generic Subjects"
          value={stats.totalGenericSubjects || 0}
          icon={TagIcon}
          color="yellow"
        />
        <StatsCard
          title="Specific Tags"
          value={stats.totalSpecificTags || 0}
          icon={TagIcon}
          color="red"
        />
      </div>

      <Card
        title="Book Master"
        icon={Book}
        headerActions={
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
          searchable={true}
          onSearch={handleSearch}
          searchPlaceholder="Search books, library numbers..."
        />
      </Card>

      {/* Create Book Modal */}
      {/* Create Book Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowCreateModal(false)}></div>
          <div className="relative max-w-4xl mx-auto my-8 p-6 bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium">Add New Book</h3>
          <button 
            className="text-gray-400 hover:text-gray-500" 
            onClick={() => setShowCreateModal(false)}
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <BookForm
          onSubmit={async (formData: BookFormData) => {
            try {
          const response = await fetch('/api/books', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          });

          if (response.ok) {
            setAlert({ type: 'success', message: 'Book created successfully' });
            setShowCreateModal(false);
            fetchBooks(pagination.page, searchTerm);
          } else {
            const error = await response.json();
            throw new Error(error.error || 'Failed to create book');
          }
            } catch (error: any) {
          setAlert({ type: 'error', message: error.message });
            }
          }}
          onCancel={() => setShowCreateModal(false)}
        />
          </div>
        </div>
      )}

      {/* Edit Book Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowEditModal(false)}></div>
          <div className="relative max-w-4xl mx-auto my-8 p-6 bg-white rounded-lg shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium">Edit Book</h3>
          <button 
            className="text-gray-400 hover:text-gray-500" 
            onClick={() => setShowEditModal(false)}
          >
            <span className="sr-only">Close</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {selectedBook && (
          <BookForm
            initialData={selectedBook}
            onSubmit={async (formData: BookFormData) => {
          try {
            const response = await fetch(`/api/books/${selectedBook.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(formData),
            });

            if (response.ok) {
              setAlert({ type: 'success', message: 'Book updated successfully' });
              setShowEditModal(false);
              setSelectedBook(null);
              fetchBooks(pagination.page, searchTerm);
            } else {
              const error = await response.json();
              throw new Error(error.error || 'Failed to update book');
            }
          } catch (error: any) {
            setAlert({ type: 'error', message: error.message });
          }
            }}
            onCancel={() => {
          setShowEditModal(false);
          setSelectedBook(null);
            }}
          />
        )}
          </div>
        </div>
      )}
    </div>
  );
};

// Book Form Component
interface BookFormProps {
  initialData?: Partial<BookMaster>;
  onSubmit: (formData: BookFormData) => Promise<void>;
  onCancel: () => void;
}

const BookForm: React.FC<BookFormProps> = ({ initialData = {}, onSubmit, onCancel }) => {
  const [formData, setFormData] = useState<BookFormData>({
    libraryNumber: '',
    bookName: '',
    bookSummary: '',
    pageNumbers: '',
    grade: '',
    remark: '',
    edition: '',
    publisherName: '',
    editors: [],
    genericTags: [],
    specificTags: [],
    ...initialData
  });

  const [genericSubjects, setGenericSubjects] = useState<GenericSubjectMaster[]>([]);
  const [specificTags, setSpecificTags] = useState<TagMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BookFormData, string>>>({});

  // Fetch options for dropdowns
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [genericResponse, specificResponse] = await Promise.all([
          fetch('/api/subjects/generic?limit=100'),
          fetch('/api/subjects/tags?limit=100')
        ]);

        const genericData = await genericResponse.json();
        const specificData = await specificResponse.json();

        setGenericSubjects(genericData.subjects || []);
        setSpecificTags(specificData.tags || []);
      } catch (error) {
        console.error('Error fetching options:', error);
      }
    };

    fetchOptions();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof BookFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleEditorChange = (index: number, field: string, value: string) => {
    const updatedEditors = [...formData.editors];
    updatedEditors[index] = { ...updatedEditors[index], [field]: value };
    setFormData(prev => ({ ...prev, editors: updatedEditors }));
  };

  const addEditor = () => {
    setFormData(prev => ({
      ...prev,
      editors: [...prev.editors, { name: '', role: 'Editor' }]
    }));
  };

  const removeEditor = (index: number) => {
    setFormData(prev => ({
      ...prev,
      editors: prev.editors.filter((_, i) => i !== index)
    }));
  };

  const handleTagChange = (type: 'genericTags' | 'specificTags', selectedValues: string[]) => {
    setFormData(prev => ({ ...prev, [type]: selectedValues }));
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof BookFormData, string>> = {};

    if (!formData.libraryNumber?.trim()) {
      newErrors.libraryNumber = 'Library number is required';
    }

    if (!formData.bookName?.trim()) {
      newErrors.bookName = 'Book name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormInput
          label="Library Number"
          name="libraryNumber"
          value={formData.libraryNumber}
          onChange={handleChange}
          required
          error={errors.libraryNumber}
          placeholder="B009361"
        />

        <FormInput
          label="Book Name"
          name="bookName"
          value={formData.bookName}
          onChange={handleChange}
          required
          error={errors.bookName}
          placeholder="Enter book name"
        />
      </div>

      <FormInput
        label="Book Summary"
        name="bookSummary"
        type="textarea"
        rows={4}
        value={formData.bookSummary}
        onChange={handleChange}
        placeholder="Enter a comprehensive book summary..."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormInput
          label="Page Numbers"
          name="pageNumbers"
          value={formData.pageNumbers}
          onChange={handleChange}
          placeholder="1-272"
        />

        <FormInput
          label="Grade"
          name="grade"
          value={formData.grade}
          onChange={handleChange}
          placeholder="A, B, C, etc."
        />

        <FormInput
          label="Edition"
          name="edition"
          value={formData.edition}
          onChange={handleChange}
          placeholder="1st Edition"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <FormInput
          label="Publisher"
          name="publisherName"
          value={formData.publisherName}
          onChange={handleChange}
          placeholder="Publisher name"
        />

        <FormInput
          label="Remark"
          name="remark"
          type="textarea"
          rows={3}
          value={formData.remark}
          onChange={handleChange}
          placeholder="Additional remarks..."
        />
      </div>

      {/* Editors Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Editors</label>
          <button
            type="button"
            onClick={addEditor}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            + Add Editor
          </button>
        </div>
        
        {formData.editors?.map((editor, index) => (
          <div key={index} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-md">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Editor name"
                value={editor.name || ''}
                onChange={(e) => handleEditorChange(index, 'name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-32">
              <select
                value={editor.role || 'Editor'}
                onChange={(e) => handleEditorChange(index, 'role', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Editor">Editor</option>
                <option value="Co-editor">Co-editor</option>
                <option value="Chief Editor">Chief Editor</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => removeEditor(index)}
              className="text-red-600 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {/* Tags Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <MultiSelectTags
          label="Generic Subjects"
          options={genericSubjects}
          selectedValues={formData.genericTags.map(it => it.id)}
          onChange={(values) => handleTagChange('genericTags', values)}
          placeholder="Select generic subjects..."
        />

        <MultiSelectTags
          label="Specific Tags"
          options={specificTags}
          selectedValues={formData.specificTags.map(it => it.id)}
          onChange={(values) => handleTagChange('specificTags', values)}
          placeholder="Select specific tags..."
        />
      </div>

      {/* Form Actions */}
      <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" className="mr-2" />
              {initialData.id ? 'Updating...' : 'Creating...'}
            </>
          ) : (
            initialData.id ? 'Update Book' : 'Create Book'
          )}
        </button>
      </div>
    </div>
  );
};

// Multi-select Tags Component
interface MultiSelectTagsProps {
  label: string;
  options: Array<{ id: string; name: string }>;
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}

const MultiSelectTags: React.FC<MultiSelectTagsProps> = ({ 
  label, 
  options, 
  selectedValues = [], 
  onChange, 
  placeholder 
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filteredOptions = options.filter(option =>
    option.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleOption = (optionId: string) => {
    const newValues = selectedValues.includes(optionId)
      ? selectedValues.filter(id => id !== optionId)
      : [...selectedValues, optionId];
    onChange(newValues);
  };

  const selectedNames = options
    .filter(option => selectedValues.includes(option.id))
    .map(option => option.name);

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-left bg-white"
        >
          {selectedNames.length > 0 ? (
            <span className="text-sm">
              {selectedNames.length === 1 
                ? selectedNames[0] 
                : `${selectedNames.length} selected`
              }
            </span>
          ) : (
            <span className="text-gray-500 text-sm">{placeholder}</span>
          )}
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg">
            <div className="p-2 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.map((option) => (
                <label
                  key={option.id}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option.id)}
                    onChange={() => handleToggleOption(option.id)}
                    className="mr-2 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm">{option.name}</span>
                </label>
              ))}
              {filteredOptions.length === 0 && (
                <div className="px-3 py-2 text-sm text-gray-500">No options found</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Selected tags display */}
      {selectedNames.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {selectedNames.slice(0, 5).map((name, index) => (
            <span
              key={index}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              {name}
            </span>
          ))}
          {selectedNames.length > 5 && (
            <span className="text-xs text-gray-500">+{selectedNames.length - 5} more</span>
          )}
        </div>
      )}
    </div>
  );
};

export default BookMasterList;
export { BookForm, MultiSelectTags };
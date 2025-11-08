import React, { useEffect, useMemo, useState } from 'react';
import { FormInput, Alert, LoadingSpinner } from '../CoreComponents';
import {
  SummaryTransaction,
  BookMaster,
  GenericSubjectMaster,
  TagMaster,
  TransactionFormData,
  MultilingualText,
  Language,
  LanguageCode,
} from '../../types';
import { useDebounce } from '../../hooks/useDebounce';

type RemoteCollectionKey = 'subjects' | 'tags';

export type TransactionEditorValues = TransactionFormData & {
  summary?: string;
  conclusion?: string;
};

const LANGUAGES: Language[] = [
  { code: 'english', name: 'English', icon: '🇺🇸' },
  { code: 'hindi', name: 'Hindi', icon: '🇮🇳' },
  { code: 'gujarati', name: 'Gujarati', icon: '🇮🇳' },
  { code: 'sanskrit', name: 'Sanskrit', icon: '🕉️' },
];

const EMPTY_PARAGRAPH: MultilingualText = {
  english: '',
  hindi: '',
  gujarati: '',
  sanskrit: '',
};

export const normalizeParagraph = (value?: SummaryTransaction['relevantParagraph']): MultilingualText => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...EMPTY_PARAGRAPH, ...(value as MultilingualText) };
  }
  if (typeof value === 'string') {
    return { ...EMPTY_PARAGRAPH, english: value };
  }
  return { ...EMPTY_PARAGRAPH };
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const useRemoteSearch = <T extends { id: string; name: string }>(endpoint: string, dataKey: RemoteCollectionKey) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 300);

  const loadOptions = React.useCallback(
    async (searchTerm: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: '10' });
        if (searchTerm) params.append('search', searchTerm);
        const response = await fetch(`${endpoint}?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch options');
        const data = await response.json();
        setOptions(data[dataKey] || []);
      } catch (error) {
        console.error(`Error fetching options from ${endpoint}`, error);
      } finally {
        setLoading(false);
      }
    },
    [endpoint, dataKey]
  );

  useEffect(() => {
    loadOptions(debouncedQuery);
  }, [debouncedQuery, loadOptions]);

  const fetchById = React.useCallback(
    async (id: string) => {
      if (!id) return null;
      try {
        const response = await fetch(`${endpoint}/${id}`);
        if (!response.ok) return null;
        return (await response.json()) as T;
      } catch (error) {
        console.error(`Error fetching entity ${id} from ${endpoint}`, error);
        return null;
      }
    },
    [endpoint]
  );

  return { query, setQuery, options, loading, fetchById };
};

export interface TransactionEditorFormProps {
  mode: 'create' | 'edit';
  books: BookMaster[];
  defaultBookId?: string;
  initialData?: SummaryTransaction;
  onSubmit: (payload: TransactionEditorValues) => Promise<void>;
  onCancel: () => void;
  lockBookSelection?: boolean;
}

export const TransactionEditorForm: React.FC<TransactionEditorFormProps> = ({
  mode,
  books,
  defaultBookId,
  initialData,
  onSubmit,
  onCancel,
  lockBookSelection = false,
}) => {
  const initialParagraph = normalizeParagraph(initialData?.relevantParagraph);
  const [formData, setFormData] = useState<TransactionEditorValues>({
    srNo: initialData?.srNo ?? 1,
    genericSubjectIds: initialData?.genericSubjects?.map((subject) => subject.id) ?? [],
    specificSubjectIds: initialData?.specificSubjects?.map((tag) => tag.id) ?? [],
    title: initialData?.title || '',
    keywords: initialData?.keywords || '',
    paragraphNo: initialData?.paragraphNo || '',
    pageNo: initialData?.pageNo || '',
    informationRating: initialData?.informationRating || '',
    remark: initialData?.remark || '',
    summary: initialData?.summary || '',
    conclusion: initialData?.conclusion || '',
    bookId: initialData?.bookId || defaultBookId || '',
    relevantParagraph: initialParagraph,
  });
  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>('english');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedGenerics, setSelectedGenerics] = useState<GenericSubjectMaster[]>(initialData?.genericSubjects ?? []);
  const [selectedSpecifics, setSelectedSpecifics] = useState<TagMaster[]>(initialData?.specificSubjects ?? []);

  const {
    query: genericQuery,
    setQuery: setGenericQuery,
    options: genericOptions,
    loading: genericLoading,
  } = useRemoteSearch<GenericSubjectMaster>('/api/subjects/generic', 'subjects');

  const {
    query: tagQuery,
    setQuery: setTagQuery,
    options: tagOptions,
    loading: tagLoading,
  } = useRemoteSearch<TagMaster>('/api/subjects/tags', 'tags');

  const bookOptions = useMemo(() => {
    const options = books.map((book) => ({ value: book.id, label: `${book.bookName} (${book.libraryNumber})` }));
    const initialBook = initialData?.book;
    if (initialBook && !options.find((option) => option.value === initialBook.id)) {
      options.push({ value: initialBook.id, label: `${initialBook.bookName} (${initialBook.libraryNumber})` });
    }
    return options;
  }, [books, initialData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: name === 'srNo' ? parseInt(value || '0', 10) || 0 : value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleParagraphChange = (lang: LanguageCode, value: string) => {
    setFormData((prev) => ({ ...prev, relevantParagraph: { ...prev.relevantParagraph, [lang]: value } }));
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!formData.bookId) nextErrors.bookId = 'Book is required';
    if (!formData.srNo || formData.srNo <= 0) nextErrors.srNo = 'Serial number is required';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setFormError(null);
    try {
      await onSubmit({ ...formData });
    } catch (error: any) {
      setFormError(error?.message || 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  };

  const renderSearchResults = <T extends { id: string; name: string; description?: string | null }>(
    list: T[],
    selectedIds: string[],
    onSelect: (item: T) => void,
    loading: boolean
  ) => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-6">
          <LoadingSpinner size="sm" />
        </div>
      );
    }
    if (list.length === 0) {
      return <p className="text-sm text-gray-500 px-3 py-2">No matches found</p>;
    }
    return list.map((item) => (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelect(item)}
        className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-blue-50 ${
          selectedIds.includes(item.id) ? 'bg-blue-50 text-blue-700' : 'bg-white text-gray-700'
        }`}
      >
        <p className="text-sm font-medium">{item.name}</p>
        {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
      </button>
    ));
  };

  const addGenericSubject = (subject: GenericSubjectMaster) => {
    setSelectedGenerics((prev) => (prev.some((item) => item.id === subject.id) ? prev : [...prev, subject]));
    setFormData((prev) => {
      const ids = prev.genericSubjectIds || [];
      if (ids.includes(subject.id)) return prev;
      return { ...prev, genericSubjectIds: [...ids, subject.id] };
    });
    setGenericQuery('');
  };

  const removeGenericSubject = (id: string) => {
    setSelectedGenerics((prev) => prev.filter((subject) => subject.id !== id));
    setFormData((prev) => ({
      ...prev,
      genericSubjectIds: (prev.genericSubjectIds || []).filter((subjectId) => subjectId !== id),
    }));
  };

  const addSpecificTag = (tag: TagMaster) => {
    setSelectedSpecifics((prev) => (prev.some((item) => item.id === tag.id) ? prev : [...prev, tag]));
    setFormData((prev) => {
      const ids = prev.specificSubjectIds || [];
      if (ids.includes(tag.id)) return prev;
      return { ...prev, specificSubjectIds: [...ids, tag.id] };
    });
    setTagQuery('');
  };

  const removeSpecificTag = (id: string) => {
    setSelectedSpecifics((prev) => prev.filter((tag) => tag.id !== id));
    setFormData((prev) => ({
      ...prev,
      specificSubjectIds: (prev.specificSubjectIds || []).filter((tagId) => tagId !== id),
    }));
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {formError && <Alert type="error" message={formError} onClose={() => setFormError(null)} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormInput
          label="Book"
          name="bookId"
          type="select"
          value={formData.bookId}
          onChange={handleInputChange}
          options={bookOptions}
          placeholder="Select book"
          required
          error={errors.bookId}
          disabled={lockBookSelection}
        />
        <FormInput
          label="Serial Number"
          name="srNo"
          type="number"
          value={formData.srNo}
          onChange={handleInputChange}
          required
          error={errors.srNo}
          placeholder="1"
        />
        <FormInput label="Page Number" name="pageNo" value={formData.pageNo} onChange={handleInputChange} placeholder="e.g., 45" />
      </div>

      <FormInput label="Title / Heading" name="title" value={formData.title} onChange={handleInputChange} placeholder="Enter title or heading" />
      <FormInput label="Keywords" name="keywords" value={formData.keywords} onChange={handleInputChange} placeholder="Comma separated keywords" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Generic Subjects</label>
            {selectedGenerics.length > 0 && (
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => {
                  setSelectedGenerics([]);
                  setFormData((prev) => ({ ...prev, genericSubjectIds: [] }));
                  setGenericQuery('');
                }}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="min-h-[44px] rounded-md border border-dashed border-blue-200 bg-blue-50/40 p-2 flex flex-wrap gap-2">
            {selectedGenerics.length === 0 && <p className="text-xs text-gray-500">No generic subjects selected</p>}
            {selectedGenerics.map((subject) => (
              <span key={subject.id} className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                {subject.name}
                <button type="button" className="ml-1 text-blue-600 hover:text-blue-900" onClick={() => removeGenericSubject(subject.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={genericQuery}
            onChange={(e) => setGenericQuery(e.target.value)}
            placeholder="Search generic subjects..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto bg-white">
            {renderSearchResults(genericOptions, formData.genericSubjectIds || [], addGenericSubject, genericLoading)}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Specific Tags</label>
            {selectedSpecifics.length > 0 && (
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => {
                  setSelectedSpecifics([]);
                  setFormData((prev) => ({ ...prev, specificSubjectIds: [] }));
                  setTagQuery('');
                }}
              >
                Clear all
              </button>
            )}
          </div>
          <div className="min-h-[44px] rounded-md border border-dashed border-green-200 bg-green-50/40 p-2 flex flex-wrap gap-2">
            {selectedSpecifics.length === 0 && <p className="text-xs text-gray-500">No specific tags selected</p>}
            {selectedSpecifics.map((tag) => (
              <span key={tag.id} className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs text-green-800">
                {tag.name}
                <button type="button" className="ml-1 text-green-600 hover:text-green-900" onClick={() => removeSpecificTag(tag.id)}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <input
            type="text"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="Search specific tags..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto bg-white">
            {renderSearchResults(tagOptions, formData.specificSubjectIds || [], addSpecificTag, tagLoading)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FormInput label="Paragraph Number" name="paragraphNo" value={formData.paragraphNo} onChange={handleInputChange} placeholder="e.g., P1" />
        <FormInput
          label="Information Rating"
          name="informationRating"
          type="select"
          value={formData.informationRating}
          onChange={handleInputChange}
          options={[
            { value: 'High', label: 'High' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Low', label: 'Low' },
          ]}
          placeholder="Select rating"
        />
        <FormInput label="Remark" name="remark" value={formData.remark} onChange={handleInputChange} placeholder="Short remark" />
      </div>

      <div className="space-y-4">
        <label className="block text-sm font-medium text-gray-700">Relevant Paragraph / Excerpts</label>
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-6">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                type="button"
                onClick={() => setActiveLanguage(lang.code)}
                className={`py-2 px-1 border-b-2 text-sm font-medium flex items-center space-x-2 ${
                  activeLanguage === lang.code ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{lang.icon}</span>
                <span>{lang.name}</span>
              </button>
            ))}
          </nav>
        </div>
        {LANGUAGES.map((lang) => (
          <div key={lang.code} className={activeLanguage === lang.code ? 'block' : 'hidden'}>
            <textarea
              rows={5}
              value={formData.relevantParagraph[lang.code] || ''}
              onChange={(e) => handleParagraphChange(lang.code, e.target.value)}
              placeholder={`Enter paragraph in ${lang.name}...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>

      <FormInput label="Summary" name="summary" type="textarea" rows={3} value={formData.summary} onChange={handleInputChange} placeholder="Add a concise summary" />
      <FormInput label="Conclusion" name="conclusion" type="textarea" rows={3} value={formData.conclusion} onChange={handleInputChange} placeholder="Add your conclusion" />

      <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : mode === 'edit' ? 'Update Transaction' : 'Create Transaction'}
        </button>
      </div>
    </form>
  );
};

export const TransactionDetailView: React.FC<{ transaction: SummaryTransaction }> = ({ transaction }) => {
  const paragraph = normalizeParagraph(transaction.relevantParagraph);
  const paragraphEntries = Object.entries(paragraph).filter(([_, value]) => value);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DetailItem label="Serial Number" value={`#${transaction.srNo}`} />
        <DetailItem label="Book" value={`${transaction.book?.bookName || 'Unknown'} (${transaction.book?.libraryNumber || '—'})`} />
        <DetailItem
          label="Generic Subjects"
          value={
            transaction.genericSubjects && transaction.genericSubjects.length
              ? transaction.genericSubjects.map((subject) => subject.name).join(', ')
              : 'Not set'
          }
        />
        <DetailItem
          label="Specific Tags"
          value={
            transaction.specificSubjects && transaction.specificSubjects.length
              ? transaction.specificSubjects.map((tag) => tag.name).join(', ')
              : 'Not set'
          }
        />
        <DetailItem label="Paragraph" value={transaction.paragraphNo || '—'} />
        <DetailItem label="Page" value={transaction.pageNo || '—'} />
        <DetailItem label="Rating" value={transaction.informationRating || '—'} />
        <DetailItem label="Keywords" value={transaction.keywords || '—'} />
      </div>

      {transaction.title && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Title</h4>
          <p className="text-base text-gray-900">{transaction.title}</p>
        </div>
      )}

      {paragraphEntries.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-2">Relevant Paragraph</h4>
          <div className="space-y-3">
            {paragraphEntries.map(([lang, value]) => (
              <div key={lang}>
                <p className="text-xs uppercase tracking-wide text-gray-500">{lang}</p>
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">{value as string}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {transaction.summary && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Summary</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{transaction.summary}</p>
        </div>
      )}

      {transaction.conclusion && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Conclusion</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{transaction.conclusion}</p>
        </div>
      )}

      {transaction.remark && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Remark</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{transaction.remark}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-500">
        <DetailItem label="Created" value={formatDateTime(transaction.createdAt)} />
        <DetailItem label="Updated" value={formatDateTime(transaction.updatedAt)} />
      </div>
    </div>
  );
};

const DetailItem: React.FC<{ label: string; value?: React.ReactNode }> = ({ label, value }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
    <p className="mt-1 text-sm text-gray-900">{value || '—'}</p>
  </div>
);

export interface InlineModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
}

const modalWidths: Record<NonNullable<InlineModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
  full: 'max-w-6xl',
};

export const InlineModal: React.FC<InlineModalProps> = ({ isOpen, onClose, title, size = 'md', children }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto">
      <div className="fixed inset-0 bg-gray-900/60" onClick={onClose} />
      <div className={`relative w-full ${modalWidths[size]} mx-auto my-10`}>
        <div className="overflow-hidden rounded-xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600" aria-label="Close modal">
              ×
            </button>
          </div>
          <div className="px-6 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
};

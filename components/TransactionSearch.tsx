// components/TransactionSearch.tsx
import { useState, useEffect, useCallback, useMemo, ChangeEvent, KeyboardEvent, Dispatch, SetStateAction } from 'react';
import { Filter, Loader2, Plus, X } from 'lucide-react';
import { useRouter } from 'next/router';
import {
  TransactionDetailView,
  TransactionEditorForm,
  TransactionEditorValues,
  TransactionBook,
} from './transactions/TransactionComponents';
import debounce from 'lodash/debounce';

type FilterOperator = 'contains' | 'equals' | 'notEquals' | 'startsWith' | 'endsWith' | 'gt' | 'lt' | 'gte' | 'lte' | 'word';

type SubjectSearchMode = 'text' | 'exact';
type SubjectMatchType = 'AND' | 'OR';
type SubjectTextOperator = 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'word';
type TextFilterField = 'title' | 'remark' | 'footNote' | 'relevantParagraph' | 'informationRating';
type SubjectTextEntry = { id: string; value: string; operator: SubjectTextOperator };

interface FilterConfig {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string | number;
  caseSensitive?: boolean;
}

interface Transaction {
  id: string;
  srNo: number;
  title: string;
  keywords: string;
  summary: string;
  pageNo: string;
  book: {
    id: string;
    bookName: string;
    libraryNumber: string;
  };
  genericSubjects: Array<{
    id: string;
    name: string;
  }>;
  specificTags: Array<{
    id: string;
    name: string;
    category?: string | null;
  }>;
  specificSubjects?: Array<{
    id: string;
    name: string;
    category?: string | null;
  }>;
  images?: any[];
  remark?: string | null;
  footNote?: string | null;
  informationRating?: string | null;
  bookId?: string;
}

interface FilterOptions {
  books: TransactionBook[];
  genericSubjects: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string; category: string }>;
}

interface TransactionSearchProps {
  initialFilterOptions?: FilterOptions;
}

const FIELD_OPTIONS = [];

const OPERATOR_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'notEquals', label: 'Not Equals' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
  { value: 'gt', label: 'Greater Than' },
  { value: 'lt', label: 'Less Than' },
  { value: 'gte', label: 'Greater Than or Equal' },
  { value: 'lte', label: 'Less Than or Equal' },
];

const SUBJECT_TEXT_OPERATOR_OPTIONS: Array<{ value: SubjectTextOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
  { value: 'equals', label: 'Exact Match' },
  { value: 'word', label: 'Word Search' },
];

const FIELD_TEXT_OPERATOR_OPTIONS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'contains', label: 'Contains' },
  { value: 'startsWith', label: 'Starts With' },
  { value: 'endsWith', label: 'Ends With' },
  { value: 'equals', label: 'Exact Match' },
  { value: 'word', label: 'Word Search' },
];

const TEXT_FILTER_FIELDS: Array<{ key: TextFilterField; label: string; placeholder: string }> = [
  { key: 'title', label: 'Title', placeholder: 'Search titles' },
  { key: 'informationRating', label: 'Information Rating', placeholder: 'High / Medium / Low' },
  { key: 'relevantParagraph', label: 'Relevant Paragraph', placeholder: 'Paragraph snippet or keyword' },
  { key: 'remark', label: 'Remarks', placeholder: 'Remark text' },
  { key: 'footNote', label: 'Footnote', placeholder: 'Footnote text' },
];

export default function TransactionSearch({ initialFilterOptions }: TransactionSearchProps) {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(
    initialFilterOptions || {
      books: [],
      genericSubjects: [],
      tags: [],
    }
  );

  // Search state
  const [selectedGenericSubjects, setSelectedGenericSubjects] = useState<string[]>([]);
  const [selectedSpecificTags, setSelectedSpecificTags] = useState<string[]>([]);
  const [selectedBookIds, setSelectedBookIds] = useState<string[]>([]);
  const [genericMode, setGenericMode] = useState<SubjectSearchMode>('text');
  const [genericMatchType, setGenericMatchType] = useState<SubjectMatchType>('AND');
  const [genericTextOperator, setGenericTextOperator] = useState<SubjectTextOperator>('word');
  const [genericSearchText, setGenericSearchText] = useState('');
  const [genericEntries, setGenericEntries] = useState<SubjectTextEntry[]>([]);
  const [genericOptionQuery, setGenericOptionQuery] = useState('');
  const [specificMode, setSpecificMode] = useState<SubjectSearchMode>('text');
  const [specificMatchType, setSpecificMatchType] = useState<SubjectMatchType>('AND');
  const [specificTextOperator, setSpecificTextOperator] = useState<SubjectTextOperator>('word');
  const [specificSearchText, setSpecificSearchText] = useState('');
  const [specificEntries, setSpecificEntries] = useState<SubjectTextEntry[]>([]);
  const [specificOptionQuery, setSpecificOptionQuery] = useState('');
  const defaultTextFilters = () =>
    TEXT_FILTER_FIELDS.reduce(
      (acc, field) => {
        acc[field.key] = { value: '', operator: 'contains' as FilterOperator };
        return acc;
      },
      {} as Record<TextFilterField, { value: string; operator: FilterOperator }>
    );
  const [textFilters, setTextFilters] = useState<Record<TextFilterField, { value: string; operator: FilterOperator }>>(
    defaultTextFilters
  );

  const activeFieldFilters = useMemo<FilterConfig[]>(() => {
    const entries: FilterConfig[] = [];
    for (const field of TEXT_FILTER_FIELDS) {
      const { value, operator } = textFilters[field.key];
      const trimmed = value.trim();
      if (!trimmed) continue;
      entries.push({
        id: `${field.key}-${operator}`,
        field: field.key,
        operator,
        value: trimmed,
        caseSensitive: false,
      });
    }
    return entries;
  }, [textFilters]);

  const filteredGenericSubjects = useMemo(() => {
    const query = genericOptionQuery.trim().toLowerCase();
    if (!query) return filterOptions.genericSubjects;
    return filterOptions.genericSubjects.filter((subject) =>
      subject.name.toLowerCase().includes(query)
    );
  }, [filterOptions.genericSubjects, genericOptionQuery]);

  const filteredSpecificTags = useMemo(() => {
    const query = specificOptionQuery.trim().toLowerCase();
    if (!query) return filterOptions.tags;
    return filterOptions.tags.filter((tag) =>
      `${tag.name} ${tag.category || ''}`.toLowerCase().includes(query)
    );
  }, [filterOptions.tags, specificOptionQuery]);

  const hasSubjectFilters = useMemo(() => {
    const hasGenericText = genericEntries.length > 0;
    const hasSpecificText = specificEntries.length > 0;
    return (
      hasGenericText ||
      hasSpecificText ||
      selectedGenericSubjects.length > 0 ||
      selectedSpecificTags.length > 0 ||
      genericMode === 'exact' ||
      specificMode === 'exact' ||
      genericMatchType !== 'OR' ||
      specificMatchType !== 'OR'
    );
  }, [
    selectedGenericSubjects,
    selectedSpecificTags,
    genericMode,
    specificMode,
    genericMatchType,
    specificMatchType,
    genericEntries,
    specificEntries,
  ]);

  const subjectBadgeCount = useMemo(() => {
    const genericTextCount = genericMode === 'exact' ? selectedGenericSubjects.length : genericEntries.length;
    const specificTextCount = specificMode === 'exact' ? selectedSpecificTags.length : specificEntries.length;
    let count = 0;
    count += genericTextCount;
    count += specificTextCount;
    return count;
  }, [
    genericMode,
    genericEntries,
    selectedGenericSubjects,
    specificMode,
    specificEntries,
    selectedSpecificTags,
  ]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [globalSearch, setGlobalSearch] = useState<string>('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTx, setActiveTx] = useState<Transaction | null>(null);
  const [detailEditing, setDetailEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Sorting (fixed)
  const sortBy = 'srNo';
  const sortOrder: 'asc' | 'desc' = 'asc';

  // Load filter options
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const response = await fetch('/api/transactions/search');
        if (!response.ok) {
          throw new Error('Failed to fetch filter options');
        }
        const data = await response.json();
        setFilterOptions(data);
      } catch (error) {
        console.error('Failed to load filter options:', error);
      }
    };

    // Only load if not provided via props
    if (!initialFilterOptions) {
      loadFilterOptions();
    }
  }, [initialFilterOptions]);

  // Debounced search function
  const performSearch = useCallback(
    async (searchParams: any) => {
      setLoading(true);
      try {
        const response = await fetch('/api/transactions/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchParams),
        });

        if (!response.ok) {
          throw new Error('Search request failed');
        }

        const data = await response.json();
        setTransactions(data.transactions || []);
        setTotalCount(data.pagination?.totalCount || 0);
        setTotalPages(data.pagination?.totalPages || 0);
      } catch (error) {
        console.error('Search failed:', error);
        setTransactions([]);
        setTotalCount(0);
        setTotalPages(0);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const debouncedSearch = useMemo(
    () => debounce(performSearch, 300),
    [performSearch]
  );

  const activeTxForEdit = useMemo(() => {
    if (!activeTx) return null;
    return {
      ...activeTx,
      specificSubjects: activeTx.specificTags?.map((tag) => ({
        id: tag.id,
        name: tag.name,
        category: tag.category,
      })),
      images: activeTx.images || [],
    };
  }, [activeTx]);

  const transformTransaction = useCallback((tx: any): Transaction => {
    const mappedGeneric = Array.isArray(tx?.genericSubjects)
      ? tx.genericSubjects.map((gs: any) =>
          gs?.genericSubject ? gs.genericSubject : { id: gs.id, name: gs.name }
        )
      : [];
    const mappedSpecific = Array.isArray(tx?.specificSubjects)
      ? tx.specificSubjects.map((st: any) =>
          st?.tag ? { id: st.tag.id, name: st.tag.name, category: st.tag.category } : { id: st.id, name: st.name, category: st.category }
        )
      : Array.isArray(tx?.specificTags)
      ? tx.specificTags
      : [];

    return {
      ...tx,
      genericSubjects: mappedGeneric,
      specificTags: mappedSpecific,
      images: tx?.images || [],
    };
  }, []);

  // Trigger search when parameters change
  useEffect(() => {
    const searchParams = {
      page,
      pageSize,
      filters: activeFieldFilters,
      bookIds: selectedBookIds,
      genericSubjectIds: genericMode === 'exact' ? selectedGenericSubjects : [],
      specificTagIds: specificMode === 'exact' ? selectedSpecificTags : [],
      globalSearch: globalSearch.trim(),
      sortBy,
      sortOrder,
      genericSubjectFilter: {
        mode: genericMode,
        matchType: genericMatchType,
        searchTextFilters: genericEntries.map((entry) => ({
          text: entry.value,
          operator: entry.operator,
        })),
        selectedIds: selectedGenericSubjects,
      },
      specificTagFilter: {
        mode: specificMode,
        matchType: specificMatchType,
        searchTextFilters: specificEntries.map((entry) => ({
          text: entry.value,
          operator: entry.operator,
        })),
        selectedIds: selectedSpecificTags,
      },
    };

    debouncedSearch(searchParams);

    return () => {
      debouncedSearch.cancel();
    };
  }, [
    page,
    pageSize,
    activeFieldFilters,
    selectedGenericSubjects,
    selectedSpecificTags,
    selectedBookIds,
    sortBy,
    sortOrder,
    debouncedSearch,
    genericMode,
    genericMatchType,
    genericEntries,
    specificMode,
    specificMatchType,
    specificEntries,
    globalSearch,
  ]);

  const clearAllFilters = () => {
    setSelectedGenericSubjects([]);
    setSelectedSpecificTags([]);
    setSelectedBookIds([]);
    setGenericMode('text');
    setSpecificMode('text');
    setGenericMatchType('AND');
    setSpecificMatchType('AND');
    setGenericTextOperator('word');
    setSpecificTextOperator('word');
    setGenericSearchText('');
    setGenericEntries([]);
    setSpecificSearchText('');
    setSpecificEntries([]);
    setGenericOptionQuery('');
    setSpecificOptionQuery('');
    setTextFilters(defaultTextFilters());
    setGlobalSearch('');
    setPage(1);
  };

  const handleMultiSelectChange = (
    event: ChangeEvent<HTMLSelectElement>,
    setter: (values: string[]) => void
  ) => {
    const values = Array.from(event.target.selectedOptions).map((option) => option.value);
    setter(values);
  };

  const addEntry = (
    value: string,
    operator: SubjectTextOperator,
    setter: Dispatch<SetStateAction<SubjectTextEntry[]>>,
    resetInput?: () => void
  ) => {
    const term = value.trim();
    if (!term) return;
    setter((prev) => {
      const exists = prev.some((entry) => entry.value === term && entry.operator === operator);
      if (exists) return prev;
      return [...prev, { id: `${Date.now()}-${Math.random()}`, value: term, operator }];
    });
    if (resetInput) resetInput();
  };

  const handleEntryKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    value: string,
    operator: SubjectTextOperator,
    setter: Dispatch<SetStateAction<SubjectTextEntry[]>>,
    resetInput: () => void
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addEntry(value, operator, setter, resetInput);
    }
  };

  const handleEntryRemove = (id: string, setter: Dispatch<SetStateAction<SubjectTextEntry[]>>) => {
    setter((prev) => prev.filter((entry) => entry.id !== id));
  };

  const handleEntryValueChange = (
    id: string,
    newValue: string,
    setter: Dispatch<SetStateAction<SubjectTextEntry[]>>
  ) => {
    setter((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, value: newValue } : entry))
    );
  };

  const handleEntryOperatorChange = (
    id: string,
    newOperator: SubjectTextOperator,
    setter: Dispatch<SetStateAction<SubjectTextEntry[]>>
  ) => {
    setter((prev) =>
      prev.map((entry) => (entry.id === id ? { ...entry, operator: newOperator } : entry))
    );
  };

  const closeDetailModal = () => {
    setDetailOpen(false);
    setActiveTx(null);
    setDetailEditing(false);
    setActionError(null);
  };

  const handleUpdateSubmit = async (payload: TransactionEditorValues) => {
    if (!activeTx) return;
    setActionError(null);
    try {
      const response = await fetch(`/api/transactions/${activeTx.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'Failed to update transaction');
      }
      const updated = await response.json();
      const normalized = transformTransaction(updated);
      setActiveTx(normalized);
      setTransactions((prev) => prev.map((tx) => (tx.id === normalized.id ? normalized : tx)));
      setDetailEditing(false);
    } catch (error: any) {
      setActionError(error?.message || 'Failed to update transaction');
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Transaction Search</h2>
          <p className="text-sm text-gray-600">Filter by subjects; open advanced filters for title, rating, remarks, footnote.</p>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            showFilters
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(activeFieldFilters.length > 0 || hasSubjectFilters) && (
            <span className="bg-blue-500 text-white text-xs rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center">
              {Math.max(subjectBadgeCount, 1)}
            </span>
          )}
        </button>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4">
          {/* Quick Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Generic Subjects Filter */}
            <div className="space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Generic Subjects</label>
                  <p className="text-xs text-gray-500">Search by name or switch to exact subject selection.</p>
                </div>
                <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs font-medium">
                  <button
                    className={`px-3 py-1 rounded-full ${genericMode === 'text' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
                    onClick={() => setGenericMode('text')}
                  >
                    Text Search
                  </button>
                  <button
                    className={`px-3 py-1 rounded-full ${genericMode === 'exact' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
                    onClick={() => setGenericMode('exact')}
                  >
                    Exact Match
                  </button>
                </div>
              </div>

              {genericMode === 'text' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-stretch gap-2">
                    <input
                      type="text"
                      value={genericSearchText}
                      onChange={(e) => setGenericSearchText(e.target.value)}
                      onKeyDown={(e) =>
                        handleEntryKeyDown(
                          e,
                          genericSearchText,
                          genericTextOperator,
                          setGenericEntries,
                          () => setGenericSearchText('')
                        )
                      }
                      placeholder="Type subject phrase"
                      className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <select
                      value={genericTextOperator}
                      onChange={(e) => setGenericTextOperator(e.target.value as SubjectTextOperator)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {SUBJECT_TEXT_OPERATOR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        addEntry(genericSearchText, genericTextOperator, setGenericEntries, () =>
                          setGenericSearchText('')
                        )
                      }
                      className="h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                      aria-label="Add generic subject term"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {genericEntries.length > 0 && (
                    <div className="space-y-2">
                      {genericEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-lg px-3 py-2"
                        >
                          <input
                            type="text"
                            value={entry.value}
                            onChange={(e) => handleEntryValueChange(entry.id, e.target.value, setGenericEntries)}
                            className="flex-1 min-w-[180px] border border-gray-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <select
                            value={entry.operator}
                            onChange={(e) =>
                              handleEntryOperatorChange(entry.id, e.target.value as SubjectTextOperator, setGenericEntries)
                            }
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            {SUBJECT_TEXT_OPERATOR_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleEntryRemove(entry.id, setGenericEntries)}
                            className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                            aria-label="Remove generic subject filter"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Add one row per subject phrase with its own match style.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Match Logic</span>
                    <select
                      value={genericMatchType}
                      onChange={(e) => setGenericMatchType(e.target.value as SubjectMatchType)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="OR">Match any (OR)</option>
                      <option value="AND">Match all (AND)</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={genericOptionQuery}
                    onChange={(e) => setGenericOptionQuery(e.target.value)}
                    placeholder="Filter subjects list"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <select
                    multiple
                    size={8}
                    value={selectedGenericSubjects}
                    onChange={(event) => handleMultiSelectChange(event, setSelectedGenericSubjects)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    {filteredGenericSubjects.length === 0 ? (
                      <option disabled>No subjects available</option>
                    ) : (
                      filteredGenericSubjects.map((subject) => (
                        <option key={subject.id} value={subject.id}>
                          {subject.name}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500">Select one or more generic subjects to match.</p>
                </div>
              )}
            </div>

          {/* Specific Subjects Filter */}
            <div className="space-y-3">
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Specific Subjects / Tags</label>
                  <p className="text-xs text-gray-500">Search by tag text or pick exact tags with AND/OR logic.</p>
                </div>
                <div className="inline-flex rounded-full bg-gray-100 p-1 text-xs font-medium">
                  <button
                    className={`px-3 py-1 rounded-full ${specificMode === 'text' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
                    onClick={() => setSpecificMode('text')}
                  >
                    Text Search
                  </button>
                  <button
                    className={`px-3 py-1 rounded-full ${specificMode === 'exact' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}
                    onClick={() => setSpecificMode('exact')}
                  >
                    Exact Match
                  </button>
                </div>
              </div>

              {specificMode === 'text' ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-stretch gap-2">
                    <input
                      type="text"
                      value={specificSearchText}
                      onChange={(e) => setSpecificSearchText(e.target.value)}
                      onKeyDown={(e) =>
                        handleEntryKeyDown(
                          e,
                          specificSearchText,
                          specificTextOperator,
                          setSpecificEntries,
                          () => setSpecificSearchText('')
                        )
                      }
                      placeholder="Type specific subject phrase"
                      className="flex-1 min-w-[200px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <select
                      value={specificTextOperator}
                      onChange={(e) => setSpecificTextOperator(e.target.value as SubjectTextOperator)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {SUBJECT_TEXT_OPERATOR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        addEntry(specificSearchText, specificTextOperator, setSpecificEntries, () =>
                          setSpecificSearchText('')
                        )
                      }
                      className="h-[44px] px-3 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 flex items-center justify-center"
                      aria-label="Add specific subject term"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  {specificEntries.length > 0 && (
                    <div className="space-y-2">
                      {specificEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-lg px-3 py-2"
                        >
                          <input
                            type="text"
                            value={entry.value}
                            onChange={(e) => handleEntryValueChange(entry.id, e.target.value, setSpecificEntries)}
                            className="flex-1 min-w-[180px] border border-gray-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                          <select
                            value={entry.operator}
                            onChange={(e) =>
                              handleEntryOperatorChange(entry.id, e.target.value as SubjectTextOperator, setSpecificEntries)
                            }
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            {SUBJECT_TEXT_OPERATOR_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleEntryRemove(entry.id, setSpecificEntries)}
                            className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                            aria-label="Remove specific subject filter"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-500">Add one row per specific subject phrase with its own match style.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Match Logic</span>
                    <select
                      value={specificMatchType}
                      onChange={(e) => setSpecificMatchType(e.target.value as SubjectMatchType)}
                      className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="OR">Match any (OR)</option>
                      <option value="AND">Match all (AND)</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={specificOptionQuery}
                    onChange={(e) => setSpecificOptionQuery(e.target.value)}
                    placeholder="Filter tags list"
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <select
                    multiple
                    size={8}
                    value={selectedSpecificTags}
                    onChange={(event) => handleMultiSelectChange(event, setSelectedSpecificTags)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  >
                    {filteredSpecificTags.length === 0 ? (
                      <option disabled>No tags available</option>
                    ) : (
                      filteredSpecificTags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                          {tag.category ? ` (${tag.category})` : ''}
                        </option>
                      ))
                    )}
                  </select>
                  <p className="text-xs text-gray-500">Select tags to match. Use Cmd/Ctrl + click to choose multiple.</p>
                </div>
              )}
            </div>
          </div>

          {/* Subject Filters only */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-sm text-gray-600">Combine text-based searches with exact selections to refine transaction results.</p>
            {hasSubjectFilters && (
              <button
                onClick={clearAllFilters}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
              >
                Reset Subject Filters
              </button>
            )}
          </div>

          {/* Advanced Filters */}
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              {showAdvancedFilters ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
            </button>

            {showAdvancedFilters && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {TEXT_FILTER_FIELDS.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-sm font-medium text-gray-700">{field.label}</label>
                      {field.key === 'informationRating' ? (
                        <select
                          value={textFilters[field.key].value}
                          onChange={(e) =>
                            setTextFilters((prev) => ({
                              ...prev,
                              [field.key]: { ...prev[field.key], value: e.target.value },
                            }))
                          }
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Any</option>
                          <option value="A">A</option>
                          <option value="A+">A+</option>
                          <option value="I">I</option>
                          <option value="I+">I+</option>
                          <option value="null">Empty</option>
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={textFilters[field.key].value}
                          onChange={(e) =>
                            setTextFilters((prev) => ({
                              ...prev,
                              [field.key]: { ...prev[field.key], value: e.target.value },
                            }))
                          }
                          placeholder={field.placeholder}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      )}
                      {field.key !== 'informationRating' && (
                        <select
                          value={textFilters[field.key].operator}
                          onChange={(e) =>
                            setTextFilters((prev) => ({
                              ...prev,
                              [field.key]: { ...prev[field.key], operator: e.target.value as FilterOperator },
                            }))
                          }
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {FIELD_TEXT_OPERATOR_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={clearAllFilters}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Count and Sort */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-gray-600">
          {loading ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </span>
          ) : (
            <span>
              Showing {transactions.length} of {totalCount} transactions
            </span>
          )}
        </div>

        <div className="text-sm text-gray-600">Sorted by SR Number (asc)</div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  SR No
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Title
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Book
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Page
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Subjects
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Specific Subjects
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr
                    key={transaction.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => {
                      setActiveTx(transaction);
                      setDetailEditing(false);
                      setActionError(null);
                      setDetailOpen(true);
                    }}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">{transaction.srNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="max-w-xs truncate">{transaction.title || '-'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="max-w-xs truncate">{transaction.book?.bookName}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{transaction.pageNo || '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {transaction.genericSubjects.map((subject) => (
                          <span
                            key={subject.id}
                            className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded"
                          >
                            {subject.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        {transaction.specificTags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-block px-2 py-1 text-xs bg-green-100 text-green-800 rounded"
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Per page:</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <div className="flex items-center gap-2 px-3">
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
            </div>

            <button
              onClick={() => setPage(page + 1)}
              disabled={page === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-3 py-1 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailOpen && activeTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={closeDetailModal}>
            <div
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <p className="text-xs text-gray-500">Transaction #{activeTx.srNo}</p>
                <p className="text-base font-semibold text-gray-800 truncate">{activeTx.title || 'Untitled'}</p>
              </div>
              <button
                onClick={closeDetailModal}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <TransactionDetailView transaction={activeTx as any} />

              <div className="flex flex-wrap items-center justify-between gap-3">
                {activeTx.book && (
                  <div className="flex items-center justify-between border rounded-md p-3 bg-gray-50 flex-1">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{activeTx.book.bookName}</p>
                      <p className="text-xs text-gray-600">Library #{activeTx.book.libraryNumber}</p>
                    </div>
                    <button
                      onClick={() => router.push(`/books/${activeTx.book.id}`)}
                      className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                    >
                      View Book Details
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setDetailEditing((prev) => !prev);
                      setActionError(null);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    {detailEditing ? 'Close Editor' : 'Edit Transaction'}
                  </button>
                </div>
              </div>

              {actionError && (
                <div className="text-sm text-red-600 border border-red-200 bg-red-50 rounded-md px-3 py-2">
                  {actionError}
                </div>
              )}

              {detailEditing && activeTxForEdit && (
                <div className="border-t pt-4">
                  <TransactionEditorForm
                    key={activeTxForEdit.id}
                    mode="edit"
                    books={filterOptions.books}
                    defaultBookId={activeTxForEdit.bookId || activeTxForEdit.book?.id}
                    initialData={activeTxForEdit as any}
                    onSubmit={handleUpdateSubmit}
                    onCancel={() => setDetailEditing(false)}
                    lockBookSelection
                  />
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
}

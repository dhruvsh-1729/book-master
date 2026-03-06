import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { FormInput, Alert, LoadingSpinner } from '../CoreComponents';
import { Loader2, Plus, RefreshCw, Sparkles } from 'lucide-react';
import {
  AISubjectSuggestion,
  SummaryTransaction,
  BookMaster,
  GenericSubjectMaster,
  TagMaster,
  TransactionFormData,
  SubjectSuggestionResponse,
  MultilingualText,
  Language,
  LanguageCode,
} from '../../types';
import { useDebounce } from '../../hooks/useDebounce';
import MultiImageUploader from '../MultiImageUploader';
import { MediaImage } from '../../types';
import { extractPlainParagraphText } from '../../lib/subjects/normalization';

type RemoteCollectionKey = 'subjects' | 'tags';

export type TransactionEditorValues = TransactionFormData & {
  summary?: string;
  conclusion?: string;
};

export type TransactionBook = Pick<BookMaster, 'id' | 'bookName' | 'libraryNumber'>;

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

const normalizeSubjectLabel = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();

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

const sectionPalette = {
  generic: {
    shell: 'border-blue-200 bg-blue-50/70',
    muted: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800',
    button: 'bg-blue-600 hover:bg-blue-700',
    ring: 'focus:ring-blue-500',
  },
  specific: {
    shell: 'border-emerald-200 bg-emerald-50/70',
    muted: 'text-emerald-700',
    badge: 'bg-emerald-100 text-emerald-800',
    button: 'bg-emerald-600 hover:bg-emerald-700',
    ring: 'focus:ring-emerald-500',
  },
} as const;

const SubjectChip: React.FC<{
  label: string;
  tone: keyof typeof sectionPalette;
  onRemove?: () => void;
}> = ({ label, tone, onRemove }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${sectionPalette[tone].badge}`}>
    <span className="truncate">{label}</span>
    {onRemove && (
      <button
        type="button"
        className="rounded-full text-current/80 transition hover:text-current"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
    )}
  </span>
);

const SuggestedSubjectCard: React.FC<{
  suggestion: AISubjectSuggestion;
  tone: keyof typeof sectionPalette;
  busy: boolean;
  selected: boolean;
  onApply: () => void;
}> = ({ suggestion, tone, busy, selected, onApply }) => (
  <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-gray-900">{suggestion.name}</p>
        {suggestion.category && (
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-gray-500">{suggestion.category}</p>
        )}
      </div>
      <span
        className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
          suggestion.source === 'existing'
            ? 'bg-slate-100 text-slate-700'
            : 'bg-amber-100 text-amber-700'
        }`}
      >
        {suggestion.source === 'existing' ? 'Existing' : 'New'}
      </span>
    </div>
    <p className="mt-2 text-xs leading-5 text-gray-600">{suggestion.reason}</p>
    <div className="mt-3 flex items-center justify-between gap-3">
      <span className="text-[11px] text-gray-500">
        {selected ? 'Already linked to this transaction' : 'Tap to add to this transaction'}
      </span>
      <button
        type="button"
        onClick={onApply}
        disabled={busy || selected}
        className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${sectionPalette[tone].button}`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {selected ? 'Selected' : suggestion.source === 'existing' ? 'Add' : 'Create & add'}
      </button>
    </div>
  </div>
);

export interface TransactionEditorFormProps {
  mode: 'create' | 'edit';
  books: TransactionBook[];
  defaultBookId?: string;
  initialData?: SummaryTransaction;
  nextSrNo?: number;
  onSubmit: (payload: TransactionEditorValues) => Promise<void>;
  onCancel: () => void;
  lockBookSelection?: boolean;
}

export const TransactionEditorForm: React.FC<TransactionEditorFormProps> = ({
  mode,
  books,
  defaultBookId,
  initialData,
  nextSrNo,
  onSubmit,
  onCancel,
  lockBookSelection = false,
}) => {
  const initialParagraph = normalizeParagraph(initialData?.relevantParagraph);
  const [formData, setFormData] = useState<TransactionEditorValues>({
    srNo: initialData?.srNo ?? nextSrNo ?? 1,
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
    footNote: initialData?.footNote || '',
    imageUrl: initialData?.imageUrl || '',
    imagePublicId: initialData?.imagePublicId || '',
    bookId: initialData?.bookId || defaultBookId || '',
    relevantParagraph: initialParagraph,
  });
  const [activeLanguage, setActiveLanguage] = useState<LanguageCode>('english');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [srNoTouched, setSrNoTouched] = useState(false);
  const [selectedGenerics, setSelectedGenerics] = useState<GenericSubjectMaster[]>(initialData?.genericSubjects ?? []);
  const [selectedSpecifics, setSelectedSpecifics] = useState<TagMaster[]>(initialData?.specificSubjects ?? []);
  const [defaultGenerics, setDefaultGenerics] = useState<GenericSubjectMaster[]>([]);
  const [defaultSpecifics, setDefaultSpecifics] = useState<TagMaster[]>([]);
  const [newGenericName, setNewGenericName] = useState('');
  const [newGenericDesc, setNewGenericDesc] = useState('');
  const [newGenericError, setNewGenericError] = useState<string | null>(null);
  const [newGenericSaving, setNewGenericSaving] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagCategory, setNewTagCategory] = useState('');
  const [newTagError, setNewTagError] = useState<string | null>(null);
  const [newTagSaving, setNewTagSaving] = useState(false);
  const [images, setImages] = useState<MediaImage[]>(
    initialData?.images && initialData.images.length
      ? initialData.images
      : initialData?.imageUrl
      ? [{ url: initialData.imageUrl, publicId: initialData.imagePublicId }]
      : []
  );

  const {
    query: genericQuery,
    setQuery: setGenericQuery,
    options: genericOptions,
    loading: genericLoading,
    fetchById: fetchGenericById,
  } = useRemoteSearch<GenericSubjectMaster>('/api/subjects/generic', 'subjects');

  const {
    query: tagQuery,
    setQuery: setTagQuery,
    options: tagOptions,
    loading: tagLoading,
    fetchById: fetchTagById,
  } = useRemoteSearch<TagMaster>('/api/subjects/tags', 'tags');

  const [aiSuggestions, setAiSuggestions] = useState<SubjectSuggestionResponse | null>(null);
  const [aiSuggestionError, setAiSuggestionError] = useState<string | null>(null);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiActionKey, setAiActionKey] = useState<string | null>(null);

  const paragraphReferenceText = useMemo(
    () => extractPlainParagraphText(formData.relevantParagraph),
    [formData.relevantParagraph]
  );
  const canSuggestSubjects = Boolean((formData.title || '').trim() || paragraphReferenceText.trim());
  const selectedGenericIds = useMemo(
    () => new Set((formData.genericSubjectIds || []).map((value) => String(value))),
    [formData.genericSubjectIds]
  );
  const selectedSpecificIds = useMemo(
    () => new Set((formData.specificSubjectIds || []).map((value) => String(value))),
    [formData.specificSubjectIds]
  );
  const selectedGenericNames = useMemo(
    () => new Set(selectedGenerics.map((subject) => normalizeSubjectLabel(subject.name))),
    [selectedGenerics]
  );
  const selectedSpecificNames = useMemo(
    () => new Set(selectedSpecifics.map((subject) => normalizeSubjectLabel(subject.name))),
    [selectedSpecifics]
  );

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
    if (name === 'srNo') {
      setSrNoTouched(true);
    }
    setFormData((prev) => ({ ...prev, [name]: name === 'srNo' ? parseInt(value || '0', 10) || 0 : value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  useEffect(() => {
    if (mode !== 'create') return;
    if (nextSrNo === undefined) return;
    if (srNoTouched) return;
    setFormData((prev) => ({ ...prev, srNo: nextSrNo }));
  }, [nextSrNo, mode, srNoTouched]);

  useEffect(() => {
    if (mode === 'create') {
      setSrNoTouched(false);
    }
  }, [mode, defaultBookId]);

  useEffect(() => {
    setAiSuggestions(null);
    setAiSuggestionError(null);
    setAiActionKey(null);
  }, [initialData?.id, mode]);

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
      await onSubmit({
        ...formData,
        imageUrl: images[0]?.url ?? null,
        imagePublicId: images[0]?.publicId ?? null,
        images,
        footNote: formData.footNote || null,
      });
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

  const addGenericSubject = useCallback((subject: GenericSubjectMaster) => {
    setSelectedGenerics((prev) => (prev.some((item) => item.id === subject.id) ? prev : [...prev, subject]));
    setFormData((prev) => {
      const ids = prev.genericSubjectIds || [];
      if (ids.includes(subject.id)) return prev;
      return { ...prev, genericSubjectIds: [...ids, subject.id] };
    });
    setGenericQuery('');
  }, []);

  const removeGenericSubject = (id: string) => {
    setSelectedGenerics((prev) => prev.filter((subject) => subject.id !== id));
    setFormData((prev) => ({
      ...prev,
      genericSubjectIds: (prev.genericSubjectIds || []).filter((subjectId) => subjectId !== id),
    }));
  };

  const addSpecificTag = useCallback((tag: TagMaster) => {
    setSelectedSpecifics((prev) => (prev.some((item) => item.id === tag.id) ? prev : [...prev, tag]));
    setFormData((prev) => {
      const ids = prev.specificSubjectIds || [];
      if (ids.includes(tag.id)) return prev;
      return { ...prev, specificSubjectIds: [...ids, tag.id] };
    });
    setTagQuery('');
  }, []);

  useEffect(() => {
    const loadDefaults = async () => {
      try {
        const res = await fetch('/api/users/defaults');
        if (!res.ok) return;
        const data = await res.json();
        const gen = (data.genericSubjects || []) as GenericSubjectMaster[];
        const spec = (data.specificTags || []) as TagMaster[];
        setDefaultGenerics(gen);
        setDefaultSpecifics(spec);
        if (mode === 'create') {
          gen.forEach(addGenericSubject);
          spec.forEach(addSpecificTag);
        }
      } catch (e) {
        console.error('Failed to load defaults', e);
      }
    };
    loadDefaults();
  }, [mode, addGenericSubject, addSpecificTag]);

  const createGenericSubject = async () => {
    if (!newGenericName.trim()) {
      setNewGenericError('Name is required');
      return;
    }
    setNewGenericSaving(true);
    setNewGenericError(null);
    try {
      const res = await fetch('/api/subjects/generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGenericName.trim(), description: newGenericDesc.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create subject');
      addGenericSubject(data as GenericSubjectMaster);
      setNewGenericName('');
      setNewGenericDesc('');
    } catch (e: any) {
      setNewGenericError(e?.message || 'Unable to create subject');
    } finally {
      setNewGenericSaving(false);
    }
  };

  const createSpecificTag = async () => {
    if (!newTagName.trim()) {
      setNewTagError('Name is required');
      return;
    }
    setNewTagSaving(true);
    setNewTagError(null);
    try {
      const res = await fetch('/api/subjects/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName.trim(), category: newTagCategory.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create tag');
      addSpecificTag(data as TagMaster);
      setNewTagName('');
      setNewTagCategory('');
    } catch (e: any) {
      setNewTagError(e?.message || 'Unable to create tag');
    } finally {
      setNewTagSaving(false);
    }
  };

  const requestAiSuggestions = async () => {
    if (!canSuggestSubjects) {
      setAiSuggestionError('Add a title or relevant paragraph before asking for suggestions.');
      return;
    }

    setAiSuggesting(true);
    setAiSuggestionError(null);

    try {
      const res = await fetch('/api/subjects/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          relevantParagraph: formData.relevantParagraph,
          genericSubjectIds: formData.genericSubjectIds || [],
          specificSubjectIds: formData.specificSubjectIds || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to suggest subjects');
      setAiSuggestions(data as SubjectSuggestionResponse);
    } catch (error: any) {
      setAiSuggestionError(error?.message || 'Unable to fetch AI suggestions');
    } finally {
      setAiSuggesting(false);
    }
  };

  const lookupGenericSubjectByName = async (name: string) => {
    const res = await fetch(`/api/subjects/generic?limit=20&search=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const subjects = (data.subjects || []) as GenericSubjectMaster[];
    return subjects.find((subject) => subject.name.toLowerCase() === name.toLowerCase()) || null;
  };

  const lookupSpecificTagByName = async (name: string) => {
    const res = await fetch(`/api/subjects/tags?limit=20&search=${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const tags = ((await res.json()).tags || []) as TagMaster[];
    return tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase()) || null;
  };

  const applyGenericSuggestion = async (suggestion: AISubjectSuggestion) => {
    const key = `generic:${suggestion.subjectId || suggestion.name}`;
    setAiActionKey(key);
    setAiSuggestionError(null);

    try {
      if (suggestion.subjectId) {
        const existing = await fetchGenericById(suggestion.subjectId);
        if (existing) {
          addGenericSubject(existing);
          return;
        }
      }

      const createRes = await fetch('/api/subjects/generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: suggestion.name,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        const fallback = await lookupGenericSubjectByName(suggestion.name);
        if (!fallback) {
          throw new Error(created?.error || 'Unable to add suggested generic subject');
        }
        addGenericSubject(fallback);
        return;
      }

      addGenericSubject(created as GenericSubjectMaster);
    } catch (error: any) {
      setAiSuggestionError(error?.message || 'Unable to apply generic suggestion');
    } finally {
      setAiActionKey(null);
    }
  };

  const applySpecificSuggestion = async (suggestion: AISubjectSuggestion) => {
    const key = `specific:${suggestion.subjectId || suggestion.name}`;
    setAiActionKey(key);
    setAiSuggestionError(null);

    try {
      if (suggestion.subjectId) {
        const existing = await fetchTagById(suggestion.subjectId);
        if (existing) {
          addSpecificTag(existing);
          return;
        }
      }

      const createRes = await fetch('/api/subjects/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: suggestion.name,
          category: suggestion.category || undefined,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) {
        const fallback = await lookupSpecificTagByName(suggestion.name);
        if (!fallback) {
          throw new Error(created?.error || 'Unable to add suggested specific subject');
        }
        addSpecificTag(fallback);
        return;
      }

      addSpecificTag(created as TagMaster);
    } catch (error: any) {
      setAiSuggestionError(error?.message || 'Unable to apply specific suggestion');
    } finally {
      setAiActionKey(null);
    }
  };

  const removeSpecificTag = (id: string) => {
    setSelectedSpecifics((prev) => prev.filter((tag) => tag.id !== id));
    setFormData((prev) => ({
      ...prev,
      specificSubjectIds: (prev.specificSubjectIds || []).filter((tagId) => tagId !== id),
    }));
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {formError && <Alert type="error" message={formError} onClose={() => setFormError(null)} />}

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_36%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.14),_transparent_34%),linear-gradient(135deg,_#ffffff,_#f8fafc_56%,_#eef2ff)] p-4 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Transaction editor</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                {mode === 'edit' ? 'Refine a summary transaction' : 'Create a summary transaction'}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Keep subject mapping consistent, store the supporting paragraph in any language, and use AI suggestions when you want a fast first pass.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {selectedGenerics.length} generic linked
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {selectedSpecifics.length} specific linked
              </span>
              <span className="rounded-full bg-white/80 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                {images.length} image{images.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">AI subject assistant</p>
                <h4 className="mt-2 text-lg font-semibold text-slate-900">Suggest generic and specific subjects</h4>
              </div>
              <Sparkles className="h-5 w-5 text-sky-600" />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              The suggestion engine uses the title and relevant paragraph, prefers existing subjects, and only proposes new lowercase names when needed.
            </p>
            <div className="mt-4 rounded-2xl bg-slate-100/80 p-3 text-xs text-slate-600">
              <p className="font-semibold text-slate-700">Reference snapshot</p>
              <p className="mt-2 line-clamp-3">{(formData.title || '').trim() || 'No title yet.'}</p>
              <p className="mt-2 line-clamp-4">{paragraphReferenceText || 'Add a relevant paragraph excerpt to improve suggestions.'}</p>
            </div>
            {aiSuggestionError && <p className="mt-3 text-sm text-red-600">{aiSuggestionError}</p>}
            {aiSuggestions?.meta?.usedFallback && (
              <p className="mt-3 text-xs text-amber-700">
                Using ranked fallback suggestions for part of this request.
              </p>
            )}
            <button
              type="button"
              onClick={requestAiSuggestions}
              disabled={aiSuggesting || !canSuggestSubjects}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiSuggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {aiSuggesting ? 'Generating suggestions...' : 'Suggest subjects'}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Transaction basics</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">Anchor the record before tagging it</h4>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
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
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
          <FormInput label="Title / Heading" name="title" value={formData.title} onChange={handleInputChange} placeholder="Enter title or heading" />
          <FormInput label="Keywords" name="keywords" value={formData.keywords} onChange={handleInputChange} placeholder="Comma separated keywords" />
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-3">
          <FormInput label="Paragraph Number" name="paragraphNo" value={formData.paragraphNo} onChange={handleInputChange} placeholder="e.g., P1" />
          <FormInput
            label="Information Rating"
            name="informationRating"
            type="select"
            value={formData.informationRating}
            onChange={handleInputChange}
            options={[
              { value: '', label: 'None' },
              { value: 'A', label: 'A' },
              { value: 'A+', label: 'A+' },
              { value: 'I', label: 'I' },
              { value: 'I+', label: 'I+' },
            ]}
            placeholder="Select rating"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Subject mapping</p>
            <h4 className="mt-2 text-lg font-semibold text-slate-900">Link, refine, or replace subjects for this transaction</h4>
          </div>
          <p className="text-sm text-slate-500">Tap a chip to remove it. AI suggestions stay optional and non-destructive.</p>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className={`rounded-[24px] border p-4 ${sectionPalette.generic.shell}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Generic subjects</p>
                <h5 className="mt-2 text-base font-semibold text-slate-900">Broad themes</h5>
              </div>
              {selectedGenerics.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600"
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
            {defaultGenerics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {defaultGenerics.map((subject) => (
                  <SubjectChip key={subject.id} label={subject.name} tone="generic" />
                ))}
              </div>
            )}
            <div className="mt-4 min-h-[72px] rounded-[20px] border border-dashed border-blue-200 bg-white/90 p-3">
              {selectedGenerics.length === 0 ? (
                <p className="text-sm text-slate-500">No generic subjects selected yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedGenerics.map((subject) => (
                    <SubjectChip key={subject.id} label={subject.name} tone="generic" onRemove={() => removeGenericSubject(subject.id)} />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={genericQuery}
                onChange={(e) => setGenericQuery(e.target.value)}
                placeholder="Search generic subjects..."
                className={`w-full rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${sectionPalette.generic.ring}`}
              />
              <div className="max-h-52 overflow-y-auto rounded-[20px] border border-white/70 bg-white shadow-sm">
                {renderSearchResults(genericOptions, formData.genericSubjectIds || [], addGenericSubject, genericLoading)}
              </div>
              <div className="rounded-[20px] border border-dashed border-blue-200 bg-white/85 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">Quick add</p>
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={newGenericName}
                    onChange={(e) => setNewGenericName(e.target.value)}
                    placeholder="New generic subject"
                    className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 ${sectionPalette.generic.ring}`}
                  />
                  <input
                    type="text"
                    value={newGenericDesc}
                    onChange={(e) => setNewGenericDesc(e.target.value)}
                    placeholder="Description (optional)"
                    className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 ${sectionPalette.generic.ring}`}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-red-600">{newGenericError}</span>
                    <button
                      type="button"
                      onClick={createGenericSubject}
                      disabled={newGenericSaving}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${sectionPalette.generic.button}`}
                    >
                      {newGenericSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {newGenericSaving ? 'Saving...' : 'Add generic'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-[20px] border border-white/70 bg-white/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">AI picks</p>
                    <p className="mt-1 text-sm text-slate-600">Choose a suggestion or create a new subject directly from it.</p>
                  </div>
                  <Sparkles className="h-4 w-4 text-blue-600" />
                </div>
                <div className="mt-4 grid gap-3">
                  {aiSuggestions?.genericSuggestions?.length ? (
                    aiSuggestions.genericSuggestions.map((suggestion) => {
                      const key = `generic:${suggestion.subjectId || suggestion.name}`;
                      const selected = suggestion.subjectId
                        ? selectedGenericIds.has(suggestion.subjectId)
                        : selectedGenericNames.has(normalizeSubjectLabel(suggestion.name));
                      return (
                        <SuggestedSubjectCard
                          key={key}
                          suggestion={suggestion}
                          tone="generic"
                          busy={aiActionKey === key}
                          selected={selected}
                          onApply={() => applyGenericSuggestion(suggestion)}
                        />
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">AI suggestions appear here after you run the assistant.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`rounded-[24px] border p-4 ${sectionPalette.specific.shell}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Specific subjects</p>
                <h5 className="mt-2 text-base font-semibold text-slate-900">Precise details</h5>
              </div>
              {selectedSpecifics.length > 0 && (
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600"
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
            {defaultSpecifics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {defaultSpecifics.map((subject) => (
                  <SubjectChip key={subject.id} label={subject.name} tone="specific" />
                ))}
              </div>
            )}
            <div className="mt-4 min-h-[72px] rounded-[20px] border border-dashed border-emerald-200 bg-white/90 p-3">
              {selectedSpecifics.length === 0 ? (
                <p className="text-sm text-slate-500">No specific subjects selected yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedSpecifics.map((subject) => (
                    <SubjectChip key={subject.id} label={subject.name} tone="specific" onRemove={() => removeSpecificTag(subject.id)} />
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="Search specific subjects..."
                className={`w-full rounded-2xl border border-white/70 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:outline-none focus:ring-2 ${sectionPalette.specific.ring}`}
              />
              <div className="max-h-52 overflow-y-auto rounded-[20px] border border-white/70 bg-white shadow-sm">
                {renderSearchResults(tagOptions, formData.specificSubjectIds || [], addSpecificTag, tagLoading)}
              </div>
              <div className="rounded-[20px] border border-dashed border-emerald-200 bg-white/85 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Quick add</p>
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New specific subject"
                    className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 ${sectionPalette.specific.ring}`}
                  />
                  <input
                    type="text"
                    value={newTagCategory}
                    onChange={(e) => setNewTagCategory(e.target.value)}
                    placeholder="Category (optional)"
                    className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 ${sectionPalette.specific.ring}`}
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-red-600">{newTagError}</span>
                    <button
                      type="button"
                      onClick={createSpecificTag}
                      disabled={newTagSaving}
                      className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${sectionPalette.specific.button}`}
                    >
                      {newTagSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      {newTagSaving ? 'Saving...' : 'Add specific'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="rounded-[20px] border border-white/70 bg-white/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">AI picks</p>
                    <p className="mt-1 text-sm text-slate-600">Apply a suggestion directly or create a new specific subject from it.</p>
                  </div>
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="mt-4 grid gap-3">
                  {aiSuggestions?.specificSuggestions?.length ? (
                    aiSuggestions.specificSuggestions.map((suggestion) => {
                      const key = `specific:${suggestion.subjectId || suggestion.name}`;
                      const selected = suggestion.subjectId
                        ? selectedSpecificIds.has(suggestion.subjectId)
                        : selectedSpecificNames.has(normalizeSubjectLabel(suggestion.name));
                      return (
                        <SuggestedSubjectCard
                          key={key}
                          suggestion={suggestion}
                          tone="specific"
                          busy={aiActionKey === key}
                          selected={selected}
                          onApply={() => applySpecificSuggestion(suggestion)}
                        />
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-500">AI suggestions appear here after you run the assistant.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Source material</p>
        <h4 className="mt-2 text-lg font-semibold text-slate-900">Paragraphs, evidence, and editorial notes</h4>
        <div className="mt-5 space-y-5">
          <MultiImageUploader
            label="Reference Images"
            value={images}
            onChange={setImages}
            uploadFolder="transactions"
            helpText="Add one or more images. The first image remains the primary preview."
          />

          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">Relevant Paragraph / Excerpts</label>
            <div className="overflow-x-auto border-b border-gray-200">
              <nav className="-mb-px flex min-w-max gap-4 sm:gap-6">
                {LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    type="button"
                    onClick={() => setActiveLanguage(lang.code)}
                    className={`flex items-center gap-2 border-b-2 px-1 py-2 text-sm font-medium ${
                      activeLanguage === lang.code ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
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
                  rows={6}
                  value={formData.relevantParagraph[lang.code] || ''}
                  onChange={(e) => handleParagraphChange(lang.code, e.target.value)}
                  placeholder={`Enter paragraph in ${lang.name}...`}
                  className="w-full rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <FormInput
              label="Remarks / Comments"
              name="remark"
              type="textarea"
              rows={4}
              value={formData.remark}
              onChange={handleInputChange}
              placeholder="Add any remarks or comments..."
            />
            <FormInput
              label="Footnote"
              name="footNote"
              type="textarea"
              rows={4}
              value={formData.footNote || ''}
              onChange={handleInputChange}
              placeholder="Add footnote or references..."
            />
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <FormInput label="Summary" name="summary" type="textarea" rows={4} value={formData.summary} onChange={handleInputChange} placeholder="Add a concise summary" />
            <FormInput label="Conclusion" name="conclusion" type="textarea" rows={4} value={formData.conclusion} onChange={handleInputChange} placeholder="Add your conclusion" />
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving...' : mode === 'edit' ? 'Update transaction' : 'Create transaction'}
          </button>
        </div>
      </div>
    </form>
  );
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const highlightParagraphText = (text: string, terms: string[]) => {
  if (!text || !terms.length) return text;

  const escaped = terms.map((t) => escapeRegExp(t)).filter(Boolean);
  if (!escaped.length) return text;

  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const lowerTerms = terms.map((t) => t.toLowerCase());

  return text.split(regex).map((part, index) => {
    const match = lowerTerms.includes(part.toLowerCase());
    if (!match) return <React.Fragment key={index}>{part}</React.Fragment>;
    return (
      <mark key={index} className="bg-yellow-200 px-0.5">
        {part}
      </mark>
    );
  });
};

export const TransactionDetailView: React.FC<{ transaction: SummaryTransaction; highlightTerms?: string[] }> = ({
  transaction,
  highlightTerms = [],
}) => {
  const paragraph = normalizeParagraph(transaction.relevantParagraph);
  const paragraphEntries = Object.entries(paragraph).filter(([_, value]) => value);
  const normalizedHighlightTerms = highlightTerms.map((term) => term.trim()).filter(Boolean);
  const footNote = transaction.footNote?.trim();

  return (
    <div className="space-y-6">
      {(transaction.images && transaction.images.length > 0) ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {transaction.images.map((img) => (
              <div key={img.url} className="overflow-hidden rounded-lg border border-gray-200 bg-black/5">
                <img
                  src={img.url}
                  alt={transaction.title || 'Transaction image'}
                  className="w-full max-h-[420px] object-contain"
                />
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {transaction.images.map((img) => (
              <a
                key={`${img.url}-link`}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
              >
                View image
              </a>
            ))}
          </div>
        </div>
      ) : transaction.imageUrl ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-black/5">
            <img
              src={transaction.imageUrl}
              alt={transaction.title || 'Transaction image'}
              className="w-full max-h-[480px] object-contain"
            />
          </div>
          <a
            href={transaction.imageUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            View full image
          </a>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <DetailItem label="Serial Number" value={`#${transaction.srNo}`} />
        <DetailItem label="Book" value={`${transaction.book?.bookName || 'Unknown'} (${transaction.book?.libraryNumber || '—'})`} />
        <DetailItem
          label="Generic Subjects"
          value={
            transaction.genericSubjects && transaction.genericSubjects.length
              ? transaction.genericSubjects.map((subject) => subject.name).join(', ')
              : ''
          }
        />
        <DetailItem
          label="Specific Subjects"
          value={
            transaction.specificSubjects && transaction.specificSubjects.length
              ? transaction.specificSubjects.map((tag) => tag.name).join(', ')
              : ''
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
                <p className="mt-1 whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                  {highlightParagraphText(value as string, normalizedHighlightTerms)}
                </p>
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

      {footNote && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-1">Footnote</h4>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{footNote}</p>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-sm">
      <div className="fixed inset-0" onClick={onClose} />
      <div className="relative flex min-h-full items-end justify-center p-0 sm:items-start sm:p-4">
        <div className={`relative w-full ${modalWidths[size]} mx-auto sm:my-8`}>
          <div className="flex min-h-[100dvh] flex-col overflow-hidden bg-white shadow-2xl sm:min-h-0 sm:rounded-[28px]">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur sm:px-6">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button onClick={onClose} className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600" aria-label="Close modal">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

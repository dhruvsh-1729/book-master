import React, { useEffect, useMemo, useState } from 'react';

export interface AsyncOption {
  value: string;
  label: string;
  data?: any;
}

interface AsyncSelectProps {
  label: string;
  placeholder?: string;
  fetchUrl: string;
  onChange: (option: AsyncOption | null) => void;
  value: AsyncOption | null;
  onQueryChange?: (query: string) => void;
}

export const AsyncSelect: React.FC<AsyncSelectProps> = ({ label, placeholder, fetchUrl, onChange, value, onQueryChange }) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<AsyncOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const url = new URL(fetchUrl, window.location.origin);
        if (query.trim()) url.searchParams.set('search', query.trim());
        url.searchParams.set('limit', '25');
        const res = await fetch(url.toString());
        const data = await res.json();
        const list = data.subjects || data.tags || [];
        const mapped = list.map((item: any) => ({
          value: item.id,
          label: item.name + (item.category ? ` (${item.category})` : ''),
          data: item,
        }));
        if (active) setOptions(mapped);
      } catch (e) {
        if (active) setOptions([]);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchUrl, query]);

  const placeholderText = useMemo(() => placeholder || 'Search...', [placeholder]);

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          onQueryChange?.(e.target.value);
        }}
        placeholder={placeholderText}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
      <select
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        value={value?.value || ''}
        onChange={(e) => {
          const opt = options.find((o) => o.value === e.target.value) || null;
          onChange(opt);
        }}
      >
        <option value="">{loading ? 'Loading...' : 'Select'}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default AsyncSelect;

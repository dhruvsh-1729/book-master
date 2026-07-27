// components/CoreComponents.tsx
import React, { useState } from 'react';
import { Search, Edit, Trash2, Eye, ChevronRight } from 'lucide-react';
import {
  DataTableProps,
  ModalProps,
  FormInputProps,
  AlertProps,
  CardProps,
  BreadcrumbProps,
  StatsCardProps,
  PaginationInfo,
} from '../types';

export const DataTable = <T extends { id: string }>({
  data,
  columns,
  pagination,
  onPageChange,
  loading = false,
  onEdit,
  onDelete,
  onView,
  renderActions,
  onRowClick,
  rowClickable = false,
  searchable = false,
  onSearch,
  searchPlaceholder = 'Search...',
  actionBusyRowId,
  actionBusyMessage = 'Processing...',
}: DataTableProps<T>) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const hasActions = Boolean(onView || onEdit || onDelete || renderActions);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    onSearch?.(value);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="flex items-center space-x-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="min-w-0 flex-1 border-0 text-sm text-slate-900 placeholder-slate-500 focus:outline-none focus:ring-0"
          />
        </div>
      )}

      <div className="grid gap-3 md:hidden">
        {data?.map((row) => {
          const isBusyRow = actionBusyRowId === row.id;
          return (
            <div
              key={row.id}
              className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${onRowClick || rowClickable ? 'cursor-pointer active:bg-indigo-50' : ''}`}
              onClick={() => onRowClick?.(row)}
            >
              <div className="space-y-3">
                {columns.map((column) => (
                  <div key={String(column.key)}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{column.label}</p>
                    <div className="mt-1 text-sm text-slate-900">
                      {column.render
                        ? column.render((row as any)[column.key], row)
                        : String((row as any)[column.key] ?? '')}
                    </div>
                  </div>
                ))}
              </div>
              {hasActions && (
                <div className="mt-4 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
                  {renderActions?.(row)}
                  {onView && (
                    <button type="button" onClick={() => onView(row)} className="inline-flex items-center rounded-md border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-40" disabled={isBusyRow}>
                      <Eye className="mr-1.5 h-4 w-4" />
                      View
                    </button>
                  )}
                  {onEdit && (
                    <button type="button" onClick={() => onEdit(row)} className="inline-flex items-center rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40" disabled={isBusyRow}>
                      <Edit className="mr-1.5 h-4 w-4" />
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button type="button" onClick={() => onDelete(row)} className="inline-flex items-center rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-40" disabled={isBusyRow}>
                      {isBusyRow ? (
                        <>
                          <LoadingSpinner size="sm" colorClass="border-current" className="mr-1.5" />
                          {actionBusyMessage}
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          Delete
                        </>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {data?.length === 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            No data available
          </div>
        )}
      </div>

      <div className="hidden overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  >
                    {column.label}
                  </th>
                ))}
                {hasActions && (
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {data?.map((row) => {
                const isBusyRow = actionBusyRowId === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50 ${onRowClick || rowClickable ? 'cursor-pointer hover:bg-indigo-50/60' : ''}`}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((column) => (
                      <td key={String(column.key)} className="px-6 py-4 text-sm text-slate-900">
                        {column.render
                          ? column.render((row as any)[column.key], row)
                          : String((row as any)[column.key] ?? '')}
                      </td>
                    ))}
                    {hasActions && (
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        {renderActions && (
                          <span
                            className="inline-flex items-center gap-2 align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {renderActions(row)}
                          </span>
                        )}
                        {onView && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onView(row);
                            }}
                            className="text-indigo-600 hover:text-indigo-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isBusyRow}
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                        )}
                        {onEdit && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(row);
                            }}
                            className="text-slate-600 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
                            disabled={isBusyRow}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(row);
                            }}
                            className="text-red-600 hover:text-red-900 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                            disabled={isBusyRow}
                            title="Delete"
                          >
                            {isBusyRow ? (
                              <span className="inline-flex items-center gap-2 text-xs font-medium">
                                <LoadingSpinner size="sm" colorClass="border-current" />
                                <span>{actionBusyMessage}</span>
                              </span>
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {data?.length === 0 && <div className="py-12 text-center text-slate-500">No data available</div>}
      </div>

      {pagination && pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={onPageChange} />}
    </div>
  );
};

interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange?: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ pagination, onPageChange }) => {
  const { page, pages, total, limit } = pagination;
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  const generate = (): (number | string)[] => {
    const delta = 2;
    const range: number[] = [];
    const out: (number | string)[] = [];

    for (let i = Math.max(2, page - delta); i <= Math.min(pages - 1, page + delta); i++) {
      range.push(i);
    }

    if (page - delta > 2) out.push(1, '...');
    else out.push(1);

    out.push(...range);

    if (page + delta < pages - 1) out.push('...', pages);
    else if (pages > 1) out.push(pages);

    return out;
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center text-sm text-slate-700">
        Showing {from} to {to} of {total} results
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => onPageChange?.(page - 1)}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Previous
        </button>

        {generate().map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-3 py-2 text-sm font-medium text-gray-700">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange?.(p as number)}
              className={`rounded-md px-3 py-2 text-sm font-semibold ${
                p === page ? 'bg-indigo-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange?.(page + 1)}
          disabled={page >= pages}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

// Modal
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-4xl', xl: 'max-w-6xl', full: 'max-w-7xl' };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-slate-950/70 transition-opacity" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        <div className={`inline-block w-full ${sizes[size]} my-8 overflow-hidden rounded-lg bg-white p-6 text-left align-middle shadow-xl transition-all`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">×</button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

// FormInput
export const FormInput: React.FC<FormInputProps> = ({
  label,
  name,
  value,
  onChange,
  type = 'text',
  required = false,
  error,
  placeholder,
  rows,
  options,
  disabled = false,
}) => {
  const base = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';
  const err = error ? 'border-red-500' : '';
  const disabledClasses = disabled ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : '';

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-semibold text-slate-700">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {type === 'textarea' ? (
        <textarea
          name={name}
          value={value || ''}
          onChange={onChange}
          rows={rows || 3}
          placeholder={placeholder}
          className={`${base} ${err} ${disabledClasses}`}
          disabled={disabled}
        />
      ) : type === 'select' ? (
        <select
          name={name}
          value={value ?? ''}
          onChange={onChange}
          className={`${base} ${err} ${disabledClasses}`}
          disabled={disabled}
        >
          <option value="">{placeholder || 'Select an option'}</option>
          {options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={value ?? ''}
          onChange={onChange}
          placeholder={placeholder}
          className={`${base} ${err} ${disabledClasses}`}
          disabled={disabled}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

export const Alert: React.FC<AlertProps> = ({ type = 'info', message, onClose }) => {
  const tone = {
    success: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
  };
  return (
    <div className={`border rounded-md p-4 ${tone[type]}`}>
      <div className="flex justify-between items-center">
        <p className="text-sm">{message}</p>
        {onClose && (
          <button onClick={onClose} className="text-current opacity-70 hover:opacity-100">
            ×
          </button>
        )}
      </div>
    </div>
  );
};

export const Card: React.FC<CardProps> = ({ title, children, icon: Icon, className = '', headerActions }) => (
  <div className={`rounded-lg border border-slate-200 bg-white shadow-sm ${className}`}>
    {title && (
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
        <div className="flex items-center space-x-2">
          {Icon && <Icon className="h-5 w-5 text-slate-600" />}
          <h3 className="text-base font-semibold text-slate-950 sm:text-lg">{title}</h3>
        </div>
        {headerActions && <div className="flex items-center space-x-2">{headerActions}</div>}
      </div>
    )}
    <div className="p-4 sm:p-6">{children}</div>
  </div>
);

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => (
  <nav className="flex mb-6">
    <ol className="flex items-center space-x-2 text-sm">
      {items.map((item, index) => (
        <li key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400 mx-2" />}
          {item.href ? (
            <a href={item.href} className="text-blue-600 hover:text-blue-800 font-medium">
              {item.label}
            </a>
          ) : (
            <span className={index === items.length - 1 ? 'text-gray-900 font-medium' : 'text-gray-500'}>{item.label}</span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

export const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon: Icon, trend, color = 'blue' }) => {
  const tone = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-600">{title}</p>
          <p className="text-2xl font-bold text-slate-950">{value}</p>
          {trend && <p className="text-sm text-slate-500">{trend}</p>}
        </div>
        {Icon && (
          <div className={`p-3 rounded-full ${tone[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
};

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; className?: string; colorClass?: string }> = ({ size = 'md', className = '', colorClass = 'border-blue-600' }) => {
  const s = { sm: 'h-4 w-4', md: 'h-8 w-8', lg: 'h-12 w-12' }[size];
  return <div className={`animate-spin rounded-full border-b-2 ${colorClass} ${s} ${className}`} />;
};

// components/CoreComponents.tsx

import React, { useState } from 'react';
import { Search, Plus, Edit, Trash2, Eye, ChevronRight, Book, Tag, FileText } from 'lucide-react';
import { 
  DataTableProps, 
  ModalProps, 
  FormInputProps, 
  AlertProps, 
  CardProps, 
  BreadcrumbProps, 
  StatsCardProps,
  PaginationInfo 
} from '../types';

// Generic Data Table Component
export const DataTable = <T extends { id: string }>({ 
  data, 
  columns, 
  pagination, 
  onPageChange, 
  loading = false, 
  onEdit, 
  onDelete, 
  onView,
  searchable = false,
  onSearch,
  searchPlaceholder = "Search..."
}: DataTableProps<T>) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    if (onSearch) {
      onSearch(value);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {searchable && (
        <div className="flex items-center space-x-2 bg-white p-4 rounded-lg shadow-sm border">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 border-0 focus:ring-0 focus:outline-none"
          />
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((column) => (
                  <th
                    key={String(column.key)}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {column.label}
                  </th>
                ))}
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.map((row, index) => (
                <tr key={row.id || index} className="hover:bg-gray-50">
                  {columns.map((column) => (
                    <td key={String(column.key)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {column.render ? column.render((row as any)[column.key], row) : String((row as any)[column.key] || '')}
                    </td>
                  ))}
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    {onView && (
                      <button
                        onClick={() => onView(row)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    )}
                    {onEdit && (
                      <button
                        onClick={() => onEdit(row)}
                        className="text-indigo-600 hover:text-indigo-900"
                        title="Edit"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(row)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No data available
          </div>
        )}
      </div>

      {pagination && pagination.pages > 1 && (
        <Pagination 
          pagination={pagination} 
          onPageChange={onPageChange} 
        />
      )}
    </div>
  );
};

// Pagination Component
interface PaginationProps {
  pagination: PaginationInfo;
  onPageChange?: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ pagination, onPageChange }) => {
  const { page, pages, total } = pagination;

  const generatePageNumbers = (): (number | string)[] => {
    const delta = 2;
    const range: number[] = [];
    const rangeWithDots: (number | string)[] = [];

    for (let i = Math.max(2, page - delta); i <= Math.min(pages - 1, page + delta); i++) {
      range.push(i);
    }

    if (page - delta > 2) {
      rangeWithDots.push(1, '...');
    } else {
      rangeWithDots.push(1);
    }

    rangeWithDots.push(...range);

    if (page + delta < pages - 1) {
      rangeWithDots.push('...', pages);
    } else if (pages > 1) {
      rangeWithDots.push(pages);
    }

    return rangeWithDots;
  };

  return (
    <div className="flex items-center justify-between bg-white px-4 py-3 border rounded-lg">
      <div className="flex items-center text-sm text-gray-700">
        Showing {((page - 1) * 10) + 1} to {Math.min(page * 10, total)} of {total} results
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange?.(page - 1)}
          disabled={page <= 1}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        
        {generatePageNumbers().map((pageNum, index) => (
          <React.Fragment key={index}>
            {pageNum === '...' ? (
              <span className="px-3 py-2 text-sm font-medium text-gray-700">...</span>
            ) : (
              <button
                onClick={() => onPageChange?.(pageNum as number)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  pageNum === page
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {pageNum}
              </button>
            )}
          </React.Fragment>
        ))}
        
        <button
          onClick={() => onPageChange?.(page + 1)}
          disabled={page >= pages}
          className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
};

// Modal Component
export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md' }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-7xl'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose}></div>
        
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        
        <div className={`inline-block w-full ${sizeClasses[size]} p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium leading-6 text-gray-900">{title}</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              ×
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
};

// Form Input Component
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
  options
}) => {
  const baseClasses = "w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const errorClasses = error ? "border-red-500" : "";

  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
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
          className={`${baseClasses} ${errorClasses}`}
        />
      ) : type === 'select' ? (
        <select
          name={name}
          value={value || ''}
          onChange={onChange}
          className={`${baseClasses} ${errorClasses}`}
        >
          <option value="">{placeholder || 'Select an option'}</option>
          {options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={value || ''}
          onChange={onChange}
          placeholder={placeholder}
          className={`${baseClasses} ${errorClasses}`}
        />
      )}
      
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};

// Loading Spinner
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]} ${className}`}></div>
  );
};

// Alert Component
export const Alert: React.FC<AlertProps> = ({ type = 'info', message, onClose }) => {
  const typeClasses = {
    success: 'bg-green-50 border-green-200 text-green-800',
    error: 'bg-red-50 border-red-200 text-red-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800'
  };

  return (
    <div className={`border rounded-md p-4 ${typeClasses[type]}`}>
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

// Card Component
export const Card: React.FC<CardProps> = ({ title, children, icon: Icon, className = '', headerActions }) => {
  return (
    <div className={`bg-white shadow-sm rounded-lg border ${className}`}>
      {title && (
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {Icon && <Icon className="h-5 w-5 text-gray-600" />}
            <h3 className="text-lg font-medium text-gray-900">{title}</h3>
          </div>
          {headerActions && (
            <div className="flex items-center space-x-2">
              {headerActions}
            </div>
          )}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
};

// Breadcrumb Component
export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav className="flex mb-6">
      <ol className="flex items-center space-x-2 text-sm">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400 mx-2" />}
            {item.href ? (
              <a 
                href={item.href}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                {item.label}
              </a>
            ) : (
              <span className={index === items.length - 1 ? "text-gray-900 font-medium" : "text-gray-500"}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

// Stats Card Component
export const StatsCard: React.FC<StatsCardProps> = ({ title, value, icon: Icon, trend, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    red: 'bg-red-50 text-red-600'
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {trend && (
            <p className="text-sm text-gray-500">{trend}</p>
          )}
        </div>
        {Icon && (
          <div className={`p-3 rounded-full ${colorClasses[color]}`}>
            <Icon className="h-6 w-6" />
          </div>
        )}
      </div>
    </div>
  );
};
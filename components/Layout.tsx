// components/Layout.tsx
// Updated components/Layout.tsx - Add user info and logout
import React, { useState, ReactNode, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useAuth';
import { 
  Book, 
  FileText, 
  Tag, 
  Home, 
  Menu, 
  X, 
  Search,
  User,
  Settings,
  LogOut,
  UploadCloud,
  Download
} from 'lucide-react';
import { Modal, FormInput, Alert, LoadingSpinner } from './CoreComponents';
import { BookMaster, GenericSubjectMaster, TagMaster } from '../types';


interface LayoutProps {
  children: ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

// Main Layout Component
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importState, setImportState] = useState({
    fileName: '',
    csvText: '',
    loading: false,
    error: '',
    stats: null as null | { created: number; skipped: number },
  });
  const [exportFilters, setExportFilters] = useState({
    bookId: '',
    genericSubjectId: '',
    specificSubjectId: '',
    search: '',
  });
  const [exportState, setExportState] = useState({
    loading: false,
    error: '',
    success: '',
  });
  const [exportOptions, setExportOptions] = useState({
    books: [] as BookMaster[],
    genericSubjects: [] as GenericSubjectMaster[],
    specificTags: [] as TagMaster[],
  });
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const router = useRouter();

  const navigation: NavigationItem[] = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Book Master', href: '/books', icon: Book },
    { name: 'Subject Management', href: '/subjects', icon: Tag },
    { name: 'All Transactions', href: '/transactions', icon: FileText },
  ];

  const isActive = (href: string): boolean => {
    if (href === '/') {
      return router.pathname === '/';
    }
    return router.pathname.startsWith(href);
  };

  useEffect(() => {
    if (!showExportModal || optionsLoaded || optionsLoading) return;
    const loadOptions = async () => {
      setOptionsLoading(true);
      try {
        const [booksRes, genericRes, tagsRes] = await Promise.all([
          fetch('/api/books?limit=200'),
          fetch('/api/subjects/generic?limit=200'),
          fetch('/api/subjects/tags?limit=200'),
        ]);
        const [booksJson, genericJson, tagsJson] = await Promise.all([booksRes.json(), genericRes.json(), tagsRes.json()]);
        setExportOptions({
          books: booksJson.books || [],
          genericSubjects: genericJson.subjects || [],
          specificTags: tagsJson.tags || [],
        });
        setOptionsLoaded(true);
      } catch (error) {
        console.error('Failed to load export options', error);
        setExportState((prev) => ({ ...prev, error: 'Failed to load filter options' }));
      } finally {
        setOptionsLoading(false);
      }
    };
    loadOptions();
  }, [showExportModal, optionsLoaded, optionsLoading]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result ?? '';
      setImportState((prev) => ({
        ...prev,
        csvText: typeof content === 'string' ? content : '',
        fileName: file.name,
        error: '',
        stats: null,
      }));
    };
    reader.readAsText(file);
  };

  const triggerImport = async () => {
    if (!importState.csvText.trim()) {
      setImportState((prev) => ({ ...prev, error: 'Please select a CSV file first.' }));
      return;
    }
    setImportState((prev) => ({ ...prev, loading: true, error: '' }));
    try {
      const response = await fetch('/api/book-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: importState.csvText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to import CSV');
      setImportState((prev) => ({
        ...prev,
        loading: false,
        stats: data?.stats || null,
        error: '',
      }));
    } catch (error: any) {
      setImportState((prev) => ({
        ...prev,
        loading: false,
        error: error?.message || 'Import failed',
      }));
    }
  };

  const resetImportModal = () => {
    setImportState({
      fileName: '',
      csvText: '',
      loading: false,
      error: '',
      stats: null,
    });
    setShowImportModal(false);
  };

  const updateExportFilter = (name: keyof typeof exportFilters, value: string) => {
    setExportFilters((prev) => ({ ...prev, [name]: value }));
    setExportState((prev) => ({ ...prev, error: '', success: '' }));
  };

  const triggerExport = async () => {
    if (!exportFilters.bookId) {
      setExportState((prev) => ({ ...prev, error: 'Select a book to export.' }));
      return;
    }
    setExportState({ loading: true, error: '', success: '' });
    try {
      const params = new URLSearchParams();
      Object.entries(exportFilters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const response = await fetch(`/api/book-import?${params.toString()}`);
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error || 'Failed to export CSV');
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `book-export-${exportFilters.bookId}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setExportState({ loading: false, error: '', success: 'Export ready. Check your downloads.' });
    } catch (error: any) {
      setExportState({ loading: false, error: error?.message || 'Export failed', success: '' });
    }
  };

  const closeExportModal = () => {
    setShowExportModal(false);
    setExportState({ loading: false, error: '', success: '' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 flex z-40 md:hidden ${sidebarOpen ? '' : 'pointer-events-none'}`}>
        <div
          className={`fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity duration-300 ease-linear ${
            sidebarOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setSidebarOpen(false)}
        />

        <div
          className={`relative flex-1 flex flex-col max-w-xs w-full bg-white transform transition duration-300 ease-in-out ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="absolute top-0 right-0 -mr-12 pt-2">
            <button
              type="button"
              className="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6 text-white" />
            </button>
          </div>
          <MobileSidebar navigation={navigation} isActive={isActive} />
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <Sidebar navigation={navigation} isActive={isActive} />
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onImportClick={() => setShowImportModal(true)}
          onExportClick={() => setShowExportModal(true)}
        />
        <main className="flex-1">
          <div className="py-6 px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Import Book & Summary Transactions</h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {importState.error && <Alert type="error" message={importState.error} onClose={() => setImportState((prev) => ({ ...prev, error: '' }))} />}
              {importState.stats && (
                <Alert
                  type="success"
                  message={`Import complete. Created ${importState.stats.created} transaction(s), skipped ${importState.stats.skipped}.`}
                  onClose={() => setImportState((prev) => ({ ...prev, stats: null }))}
                />
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Upload CSV</label>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100"
                />
                {importState.fileName && <p className="text-xs text-gray-500">Selected: {importState.fileName}</p>}
              </div>

              <p className="text-sm text-gray-600">
                The first data row should contain book details. Subsequent rows will create summary transactions. Blank cells in the Title, Generic Subject, or Specific Tag
                columns automatically reuse the last non-empty value above them.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={resetImportModal}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={importState.loading}
              >
                Close
              </button>
              <button
                onClick={triggerImport}
                disabled={!importState.csvText || importState.loading}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {importState.loading ? 'Importing...' : 'Start Import'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-auto">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg leading-6 font-medium text-gray-900">Export Book & Summary Transactions</h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {exportState.error && <Alert type="error" message={exportState.error} onClose={() => setExportState((prev) => ({ ...prev, error: '' }))} />}
              {exportState.success && <Alert type="success" message={exportState.success} onClose={() => setExportState((prev) => ({ ...prev, success: '' }))} />}

              {optionsLoading && (
                <div className="flex items-center justify-center py-6">
                  <LoadingSpinner />
                </div>
              )}

              {!optionsLoading && (
                <>
                  <FormInput
                    label="Book"
                    name="bookId"
                    type="select"
                    value={exportFilters.bookId}
                    onChange={(e) => updateExportFilter('bookId', e.target.value)}
                    options={exportOptions.books.map((bookOption) => ({
                      value: bookOption.id,
                      label: `${bookOption.bookName} (${bookOption.libraryNumber})`,
                    }))}
                    required
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormInput
                      label="Generic Subject"
                      name="genericSubjectId"
                      type="select"
                      value={exportFilters.genericSubjectId}
                      onChange={(e) => updateExportFilter('genericSubjectId', e.target.value)}
                      options={exportOptions.genericSubjects.map((subject) => ({ value: subject.id, label: subject.name }))}
                    />
                    <FormInput
                      label="Specific Tag"
                      name="specificSubjectId"
                      type="select"
                      value={exportFilters.specificSubjectId}
                      onChange={(e) => updateExportFilter('specificSubjectId', e.target.value)}
                      options={exportOptions.specificTags.map((tag) => ({ value: tag.id, label: tag.name }))}
                    />
                  </div>

                  <FormInput
                    label="Search keyword"
                    name="search"
                    value={exportFilters.search}
                    onChange={(e) => updateExportFilter('search', e.target.value)}
                    placeholder="Optional text filter"
                  />

                  <p className="text-sm text-gray-600">Exports match the import template exactly. You can immediately re-import the downloaded file after editing.</p>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={closeExportModal}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                disabled={exportState.loading}
              >
                Close
              </button>
              <button
                onClick={triggerExport}
                disabled={exportState.loading || !exportFilters.bookId}
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
              >
                {exportState.loading ? 'Preparing...' : 'Download CSV'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Desktop Sidebar Component
interface SidebarProps {
  navigation: NavigationItem[];
  isActive: (href: string) => boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ navigation, isActive }) => {
  return (
    <div className="flex-1 flex flex-col min-h-0 border-r border-gray-200 bg-white">
      <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4">
          <div className="flex items-center">
            <Book className="h-8 w-8 text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900">BookMaster</span>
          </div>
        </div>
        <nav className="mt-8 flex-1 px-2 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.name} href={item.href}>
                <div
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive(item.href)
                      ? 'bg-blue-100 text-blue-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon
                    className={`mr-3 flex-shrink-0 h-5 w-5 ${
                      isActive(item.href) ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                    }`}
                  />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* User section */}
      <UserSection />
    </div>
  );
};

const UserSection: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex-shrink-0 flex border-t border-gray-200 p-4">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <User className="h-8 w-8 text-gray-400 bg-gray-100 rounded-full p-1" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-700">{user?.name || 'User'}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
          </div>
        </div>
        <button 
          onClick={logout}
          className="text-gray-400 hover:text-gray-600"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// Mobile Sidebar Component
const MobileSidebar: React.FC<SidebarProps> = ({ navigation, isActive }) => {
  return (
    <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
      <div className="flex-shrink-0 flex items-center px-4">
        <Book className="h-8 w-8 text-blue-600" />
        <span className="ml-2 text-xl font-bold text-gray-900">BookMaster</span>
      </div>
      <nav className="mt-5 px-2 space-y-1">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={`group flex items-center px-2 py-2 text-base font-medium rounded-md ${
                  isActive(item.href)
                    ? 'bg-blue-100 text-blue-900'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon
                  className={`mr-4 flex-shrink-0 h-6 w-6 ${
                    isActive(item.href) ? 'text-blue-500' : 'text-gray-400'
                  }`}
                />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

// Header Component
interface HeaderProps {
  onMenuClick: () => void;
  onImportClick: () => void;
  onExportClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onImportClick, onExportClick }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');

  const handleGlobalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      // Implement global search functionality
      console.log('Global search:', searchTerm);
    }
  };

  return (
    <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 bg-white shadow border-b border-gray-200">
      <button
        type="button"
        className="px-4 border-r border-gray-200 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 md:hidden"
        onClick={onMenuClick}
      >
        <Menu className="h-6 w-6" />
      </button>

      <div className="flex-1 px-4 flex justify-between items-center">
        <div className="flex-1 flex">
          <div className="w-full flex md:ml-0">
            <label htmlFor="search-field" className="sr-only">
              Search
            </label>
            <div className="relative w-full text-gray-400 focus-within:text-gray-600">
              <div className="absolute inset-y-0 left-0 flex items-center pointer-events-none">
                <Search className="h-5 w-5" />
              </div>
              <input
                id="search-field"
                className="block w-full h-full pl-8 pr-3 py-2 border-transparent text-gray-900 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-0 focus:border-transparent"
                placeholder="Search books, transactions..."
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleGlobalSearch(e as any);
                  }
                }}
              />
            </div>
          </div>
        </div>

        <div className="ml-4 flex items-center md:ml-6 space-x-3">
          <button
            onClick={onImportClick}
            className="inline-flex items-center px-3 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <UploadCloud className="h-4 w-4 mr-2 text-blue-600" />
            <span className="hidden sm:inline">Import</span>
            <span className="sm:hidden">Import</span>
          </button>
          <button
            onClick={onExportClick}
            className="inline-flex items-center px-3 py-2 rounded-md border border-transparent text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Download className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Export</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Layout;

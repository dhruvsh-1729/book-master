// components/Layout.tsx
// Updated components/Layout.tsx - Add user info and logout
import React, { useState, ReactNode, useEffect, useRef } from 'react';
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
import {
  BookMaster,
  GenericSubjectMaster,
  TagMaster,
  ImportJobSummary,
} from '../types';


interface LayoutProps {
  children: ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

type ImportStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

interface SelectedUpload {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
}

interface ImportLogEntry {
  id: string;
  timestamp: string;
  message: string;
}

const createLocalId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const inferMimeTypeFromName = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.tsv')) return 'text/tab-separated-values';
  if (lower.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
};

// Main Layout Component
const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user } = useAuth();
  const importPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSummaryRef = useRef<ImportJobSummary | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [importState, setImportState] = useState({
    files: [] as SelectedUpload[],
    jobId: '',
    uploading: false,
    status: 'idle' as ImportStatus,
    error: '',
    summary: null as ImportJobSummary | null,
    logs: [] as ImportLogEntry[],
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
    ...(user?.role === 'admin' ? [{ name: 'Admin', href: '/admin', icon: Settings }] : []),
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

  const cleanupImportPolling = () => {
    if (importPollRef.current) {
      clearInterval(importPollRef.current);
      importPollRef.current = null;
    }
  };

  useEffect(() => () => cleanupImportPolling(), []);

  const appendImportLog = (message: string) => {
    setImportState((prev) => {
      const nextLogs = [...prev.logs, { id: createLocalId(), timestamp: new Date().toISOString(), message }];
      return { ...prev, logs: nextLogs.slice(-200) };
    });
  };
  const logSummaryDiff = (prev: ImportJobSummary | null, next: ImportJobSummary) => {
    if (!prev || prev.status !== next.status) {
      appendImportLog(`Status → ${next.status.toUpperCase()}`);
    }

    next.files.forEach((file) => {
      const prevFile = prev?.files.find((f) => f.fileName === file.fileName);
      if (!prevFile || prevFile.status !== file.status) {
        appendImportLog(`File ${file.fileName}: ${file.status}`);
      }

      file.sheets.forEach((sheet) => {
        const prevSheet = prevFile?.sheets.find((s) => s.name === sheet.name);
        const countsChanged =
          !prevSheet || prevSheet.created !== sheet.created || prevSheet.skipped !== sheet.skipped;
        const errorChanged = sheet.error && sheet.error !== prevSheet?.error;
        if (countsChanged || errorChanged) {
          appendImportLog(
            `Sheet ${sheet.name}: created ${sheet.created}, skipped ${sheet.skipped}${
              sheet.error ? `, error: ${sheet.error}` : ''
            }`
          );
        }
      });
    });
  };

  const handleSummaryUpdate = (summary: ImportJobSummary) => {
    logSummaryDiff(lastSummaryRef.current, summary);
    lastSummaryRef.current = summary;
    setImportState((prev) => ({
      ...prev,
      summary,
      status:
        summary.status === 'completed'
          ? 'completed'
          : summary.status === 'failed'
          ? 'failed'
          : 'processing',
    }));

    if (summary.status === 'completed' || summary.status === 'failed') {
      cleanupImportPolling();
      if (summary.status === 'failed') {
        setImportState((prev) => ({
          ...prev,
          error: prev.error || 'Import failed. Review the logs for details.',
        }));
      }
    }
  };

  const startImportStatusPolling = (jobId: string) => {
    cleanupImportPolling();

    const fetchSummary = async () => {
      try {
        const response = await fetch(`/api/book-import/jobs/${jobId}`);
        const payload = await response.json().catch(() => null);

        if (!response.ok || !payload) {
          throw new Error(payload?.error || 'Failed to fetch import status');
        }

        handleSummaryUpdate(payload as ImportJobSummary);
      } catch (error: any) {
        appendImportLog(`Status polling error: ${error?.message || error}`);
        cleanupImportPolling();
        setImportState((prev) => ({
          ...prev,
          status: prev.status === 'completed' ? prev.status : 'failed',
          error: prev.error || 'Import status polling failed.',
        }));
      }
    };

    fetchSummary();
    importPollRef.current = setInterval(fetchSummary, 2000);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files ? Array.from(event.target.files) : [];
    if (!files.length) return;
    setImportState((prev) => ({
      ...prev,
      files: files.map((file) => ({
        id: createLocalId(),
        file,
        name: file.name,
        size: file.size,
        type: file.type || inferMimeTypeFromName(file.name),
      })),
      error: '',
      logs: [],
      summary: null,
      status: 'idle',
    }));
    event.target.value = '';
  };

  const removeImportFile = (id: string) => {
    setImportState((prev) => ({
      ...prev,
      files: prev.files.filter((file) => file.id !== id),
    }));
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (result instanceof ArrayBuffer) {
          resolve(arrayBufferToBase64(result));
        } else if (typeof result === 'string') {
          resolve(typeof btoa === 'function' ? btoa(result) : Buffer.from(result, 'utf8').toString('base64'));
        } else {
          reject(new Error('Unsupported file format'));
        }
      };
      reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
      reader.readAsArrayBuffer(file);
    });

  const triggerImport = async () => {
    if (!importState.files.length) {
      setImportState((prev) => ({ ...prev, error: 'Please select at least one CSV or XLSX file.' }));
      return;
    }
    setImportState((prev) => ({
      ...prev,
      uploading: true,
      error: '',
      logs: [],
      summary: null,
      status: 'uploading',
    }));

    try {
      const payloadFiles = await Promise.all(
        importState.files.map(async (upload) => ({
          name: upload.name,
          type: upload.type,
          data: await fileToBase64(upload.file),
        }))
      );

      const response = await fetch('/api/book-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payloadFiles }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to start import');

      appendImportLog(`Job ${data.jobId} accepted. Processing will begin shortly.`);
      setImportState((prev) => ({
        ...prev,
        uploading: false,
        status: 'processing',
        jobId: data.jobId,
      }));
      lastSummaryRef.current = null;
      startImportStatusPolling(data.jobId);
    } catch (error: any) {
      cleanupImportPolling();
      setImportState((prev) => ({
        ...prev,
        uploading: false,
        status: 'failed',
        error: error?.message || 'Import failed',
      }));
    }
  };

  const resetImportModal = () => {
    cleanupImportPolling();
    lastSummaryRef.current = null;
    setImportState({
      files: [],
      jobId: '',
      uploading: false,
      status: 'idle',
      error: '',
      summary: null,
      logs: [],
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

              {importState.summary && (
                <Alert
                  type={importState.summary.status === 'completed' ? 'success' : 'warning'}
                  message={`Job ${importState.summary.jobId} ${importState.summary.status}. Created ${importState.summary.totalCreated} record(s), skipped ${importState.summary.totalSkipped}.`}
                  onClose={() => setImportState((prev) => ({ ...prev, summary: null }))}
                />
              )}

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Upload CSV or XLSX</label>
                <input
                  type="file"
                  multiple
                  accept=".csv,.tsv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileChange}
                  disabled={importState.status === 'processing' || importState.uploading}
                  className="w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 disabled:opacity-50"
                />
                {importState.files.length > 0 && (
                  <div className="mt-2 border border-gray-200 rounded-md divide-y bg-gray-50">
                    {importState.files.map((file) => (
                      <div key={file.id} className="flex items-center justify-between py-2 px-3 text-sm">
                        <div>
                          <p className="font-medium text-gray-800">{file.name}</p>
                          <p className="text-xs text-gray-500">{formatBytes(file.size)} · {file.type || 'Unknown type'}</p>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-red-600 hover:underline"
                          onClick={() => removeImportFile(file.id)}
                          disabled={importState.status === 'processing' || importState.uploading}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-600">
                Each file may contain one or many sheets. The first row should describe the book, and all subsequent rows are treated as summary transactions. Blank values in Title,
                Generic Subject, or Specific Tag columns will automatically reuse the last non-empty value above them.
              </p>

              <div className="border border-gray-200 rounded-md bg-gray-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-800">Live status</p>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      importState.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : importState.status === 'failed'
                        ? 'bg-red-100 text-red-800'
                        : importState.status === 'processing'
                        ? 'bg-indigo-100 text-indigo-800'
                        : importState.status === 'uploading'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {importState.status.toUpperCase()}
                  </span>
                </div>
                <div className="mt-2 max-h-48 overflow-y-auto text-xs font-mono space-y-1 bg-white border border-gray-200 rounded-md px-3 py-2">
                  {importState.logs.length === 0 && <p className="text-gray-500">Events will appear here once the import starts.</p>}
                  {importState.logs.map((log) => (
                    <div key={log.id} className="flex space-x-3">
                      <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span className="text-gray-800">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {importState.summary && (
                <div className="space-y-3">
                  {importState.summary.files.map((file) => (
                    <div key={file.fileName} className="border border-gray-200 rounded-lg p-4 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{file.fileName}</p>
                          <p className="text-xs text-gray-500">Sheets: {file.sheets.length} · Type: {file.fileType}</p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            file.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : file.status === 'failed'
                              ? 'bg-red-100 text-red-800'
                              : file.status === 'processing'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {file.status.toUpperCase()}
                        </span>
                      </div>
                      {file.error && <p className="text-sm text-red-600">File error: {file.error}</p>}
                      {file.sheets.map((sheet) => (
                        <div key={sheet.name} className="border border-gray-100 rounded-md p-3 bg-gray-50 space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <p className="font-medium text-gray-800">Sheet: {sheet.name}</p>
                            <p className="text-gray-600">
                              Created {sheet.created} · Skipped {sheet.skipped}
                            </p>
                          </div>
                          {sheet.error && <p className="text-xs text-red-600">Sheet error: {sheet.error}</p>}
                          {sheet.errors.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="min-w-full text-xs text-left">
                                <thead className="text-gray-500">
                                  <tr>
                                    <th className="px-2 py-1">Row</th>
                                    <th className="px-2 py-1">Message</th>
                                    <th className="px-2 py-1">Fields</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {sheet.errors.map((error, idx) => (
                                    <tr key={`${sheet.name}-${idx}`} className="border-t border-gray-200">
                                      <td className="px-2 py-1 text-gray-700">{error.rowIndex}</td>
                                      <td className="px-2 py-1 text-gray-800">{error.message}</td>
                                      <td className="px-2 py-1 text-gray-600">{error.fields?.join(', ') || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
              <button
                onClick={resetImportModal}
                className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                disabled={importState.uploading || importState.status === 'processing'}
              >
                Close
              </button>
              <button
                onClick={triggerImport}
                disabled={
                  importState.files.length === 0 ||
                  importState.status === 'processing' ||
                  importState.uploading
                }
                className="px-4 py-2 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
              >
                {importState.status === 'processing'
                  ? 'Processing...'
                  : importState.uploading
                  ? 'Uploading...'
                  : 'Start Import'}
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

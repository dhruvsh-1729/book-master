// pages/subjects/index.tsx - Subjects Management Page
import React, { useState, useEffect, useRef } from 'react';
import { Tag, Plus, Upload, Download, RefreshCw } from 'lucide-react';
import { DataTable, FormInput, Alert, Card, Breadcrumb } from '../../components/CoreComponents';
import { 
  GenericSubjectMaster, 
  TagMaster, 
  DataTableColumn, 
  AlertProps,
  SubjectFormData 
} from '../../types';
import AsyncSelect, { AsyncOption } from '../../components/AsyncSelect';

const SubjectsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'generic' | 'specific'>('generic');
  const [genericSubjects, setGenericSubjects] = useState<GenericSubjectMaster[]>([]);
  const [specificTags, setSpecificTags] = useState<TagMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<GenericSubjectMaster | TagMaster | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceFromType, setReplaceFromType] = useState<'generic' | 'specific'>('generic');
  const [replaceToType, setReplaceToType] = useState<'generic' | 'specific'>('generic');
  const [wrongSubject, setWrongSubject] = useState<AsyncOption | null>(null);
  const [rightSubject, setRightSubject] = useState<AsyncOption | null>(null);
  const [replaceLoading, setReplaceLoading] = useState(false);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceSummary, setReplaceSummary] = useState<string | null>(null);
  const [targetName, setTargetName] = useState<string>('');
  const [targetCategory, setTargetCategory] = useState<string>('');

  const fetchGenericSubjects = async () => {
    try {
      const response = await fetch('/api/subjects/generic?limit=500');
      const data = await response.json();
      setGenericSubjects(data.subjects || []);
    } catch (error) {
      console.error('Error fetching generic subjects:', error);
    }
  };

  const fetchSpecificTags = async () => {
    try {
      const response = await fetch('/api/subjects/tags?limit=500');
      const data = await response.json();
      setSpecificTags(data.tags || []);
    } catch (error) {
      console.error('Error fetching specific subjects:', error);
    }
  };

  const handleReplace = async () => {
    if (!wrongSubject) {
      setReplaceError('Select the subject you want to replace/move');
      return;
    }

    const sameType = replaceFromType === replaceToType;
    const effectiveTargetName =
      targetName?.trim() ||
      rightSubject?.data?.name ||
      rightSubject?.label ||
      (!sameType ? wrongSubject?.data?.name || wrongSubject?.label || '' : '');

    if (sameType && !rightSubject) {
      setReplaceError('Select both the incorrect and correct subjects');
      return;
    }

    if (!sameType && !rightSubject && !effectiveTargetName) {
      setReplaceError('Provide a target subject (select or enter a name)');
      return;
    }
    setReplaceLoading(true);
    setReplaceError(null);
    setReplaceSummary(null);
    try {
      const res = await fetch('/api/subjects/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromType: replaceFromType,
          toType: replaceToType,
          wrongId: wrongSubject.value,
          rightId: rightSubject?.value,
          rightName: effectiveTargetName || undefined,
          rightCategory: replaceToType === 'specific' ? (targetCategory?.trim() || rightSubject?.data?.category) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Replace failed');
      setReplaceSummary(`Updated ${data.updated || 0} transaction(s).`);
      fetchGenericSubjects();
      fetchSpecificTags();
    } catch (error: any) {
      setReplaceError(error?.message || 'Failed to replace');
    } finally {
      setReplaceLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      await Promise.all([fetchGenericSubjects(), fetchSpecificTags()]);
      setLoading(false);
    };
    fetchData();
  }, []);

  const genericColumns: DataTableColumn<GenericSubjectMaster>[] = [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    {
      key: '_count',
      label: 'Usage (transactions only)',
      render: (value: any) => `${value?.summaryTransactions || 0}`
    }
  ];

  const specificColumns: DataTableColumn<TagMaster>[] = [
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    {
      key: '_count',
      label: 'Usage (transactions only)',
      render: (value: any) => `${value?.summaryTransactions || 0}`
    }
  ];

  const handleCreate = () => {
    setEditingItem(null);
    setShowModal(true);
  };

  const handleEdit = (item: GenericSubjectMaster | TagMaster) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const handleDelete = async (item: GenericSubjectMaster | TagMaster) => {
    const itemType = activeTab === 'generic' ? 'generic subject' : 'specific subject';
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) {
      return;
    }

    try {
      const endpoint = activeTab === 'generic' 
        ? `/api/subjects/generic/${item.id}` 
        : `/api/subjects/tags/${item.id}`;
      
      const response = await fetch(endpoint, { method: 'DELETE' });

      if (response.ok) {
        setAlert({ type: 'success', message: `${itemType} deleted successfully` });
        if (activeTab === 'generic') {
          fetchGenericSubjects();
        } else {
          fetchSpecificTags();
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || `Failed to delete ${itemType}`);
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    }
  };

  const handleSubmit = async (formData: SubjectFormData) => {
    try {
      const isEditing = !!editingItem && 'id' in editingItem && !!editingItem.id;
      const id = isEditing ? (editingItem as GenericSubjectMaster | TagMaster).id : undefined;

      const endpoint = activeTab === 'generic' 
        ? (isEditing ? `/api/subjects/generic/${id}` : '/api/subjects/generic')
        : (isEditing ? `/api/subjects/tags/${id}` : '/api/subjects/tags');
      
      const response = await fetch(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const itemType = activeTab === 'generic' ? 'generic subject' : 'specific subject';
        setAlert({ 
          type: 'success', 
          message: `${itemType} ${isEditing ? 'updated' : 'created'} successfully` 
        });
        setShowModal(false);
        if (activeTab === 'generic') {
          fetchGenericSubjects();
        } else {
          fetchSpecificTags();
        }
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save');
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error.message });
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch('/api/subjects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText: text, type: activeTab === 'generic' ? 'generic' : 'specific' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed');
      setAlert({ type: 'success', message: `Imported successfully (created: ${data.created ?? 0}, updated: ${data.updated ?? 0})` });
      if (activeTab === 'generic') {
        fetchGenericSubjects();
      } else {
        fetchSpecificTags();
      }
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Import failed' });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const type = activeTab === 'generic' ? 'generic' : 'specific';
      const res = await fetch(`/api/subjects/export?type=${type}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-subjects.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      setAlert({ type: 'error', message: error?.message || 'Export failed' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Breadcrumb 
        items={[
          { label: 'Dashboard', href: '/' },
          { label: 'Subject Management' }
        ]} 
      />

      {alert && (
        <Alert
          type={alert.type}
          message={alert.message}
          onClose={() => setAlert(null)}
        />
      )}

      <Card
        title="Subject Management"
        icon={Tag}
        headerActions={
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleImportClick}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              disabled={importing}
            >
              <Upload className="h-4 w-4 mr-2" />
              {importing ? 'Importing...' : 'Import Subjects'}
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              disabled={exporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting...' : 'Export Subjects'}
            </button>
            <button
              onClick={handleCreate}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add {activeTab === 'generic' ? 'Generic Subject' : 'Specific Subject'}
            </button>
            <button
              onClick={() => {
                setReplaceFromType(activeTab);
                setReplaceToType(activeTab);
                setTargetName('');
                setTargetCategory('');
                setShowReplaceModal(true);
                setReplaceError(null);
                setReplaceSummary(null);
                setWrongSubject(null);
                setRightSubject(null);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Find & Replace / Transfer
            </button>
          </div>
        }
      >
        <input type="file" accept=".csv,text/csv" ref={fileInputRef} onChange={handleImportFile} className="hidden" />
        <div className="text-xs text-gray-600 mb-4 space-y-1">
          <p className="font-semibold">CSV format</p>
          {activeTab === 'generic' ? (
            <>
              <p>Headers: <code className="bg-gray-100 px-1 py-0.5 rounded">name</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">description</code> (optional)</p>
              <p>Example: <code className="bg-gray-100 px-1 py-0.5 rounded">"Physics","Basic principles"</code></p>
            </>
          ) : (
            <>
              <p>Headers: <code className="bg-gray-100 px-1 py-0.5 rounded">name</code>, <code className="bg-gray-100 px-1 py-0.5 rounded">category</code> (optional), <code className="bg-gray-100 px-1 py-0.5 rounded">description</code> (optional)</p>
              <p>Example: <code className="bg-gray-100 px-1 py-0.5 rounded">"Thermodynamics","Physics","Heat and energy"</code></p>
            </>
          )}
        </div>
        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('generic')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'generic'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Generic Subjects ({genericSubjects.length})
            </button>
            <button
              onClick={() => setActiveTab('specific')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'specific'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Specific Subjects ({specificTags.length})
            </button>
          </nav>
        </div>

        {/* Tables */}
        {activeTab === 'generic' ? (
          <DataTable
            data={genericSubjects}
            columns={genericColumns}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <DataTable
            data={specificTags}
            columns={specificColumns}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        )}
      </Card>

      {/* Create/Edit Modal (custom div overlay) */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          aria-labelledby="subject-modal-title"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setShowModal(false)}
          />
          {/* Panel */}
          <div className="relative z-10 w-[70vw] mx-4 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 id="subject-modal-title" className="text-lg font-medium text-gray-900">
                {`${editingItem ? 'Edit' : 'Add'} ${activeTab === 'generic' ? 'Generic Subject' : 'Specific Subject'}`}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 max-h-[80vh] overflow-y-auto">
              <SubjectForm
                activeTab={activeTab}
                initialData={editingItem}
                onSubmit={handleSubmit}
                onCancel={() => setShowModal(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Replace Modal */}
      {showReplaceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowReplaceModal(false)} />
          <div className="relative z-10 w-[90vw] max-w-2xl mx-4 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="text-lg font-medium text-gray-900">Find & Replace Subjects</h3>
              <button
                onClick={() => setShowReplaceModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">From type</label>
                  <select
                    value={replaceFromType}
                    onChange={(e) => {
                      setReplaceFromType(e.target.value as 'generic' | 'specific');
                      setWrongSubject(null);
                      setTargetName('');
                      setReplaceSummary(null);
                      setReplaceError(null);
                    }}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="generic">Generic Subject</option>
                    <option value="specific">Specific Subject</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">To type</label>
                  <select
                    value={replaceToType}
                    onChange={(e) => {
                      const next = e.target.value as 'generic' | 'specific';
                      setReplaceToType(next);
                      setRightSubject(null);
                      setTargetName('');
                      setReplaceSummary(null);
                      setReplaceError(null);
                      if (next !== 'specific') {
                        setTargetCategory('');
                      }
                    }}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="generic">Generic Subject</option>
                    <option value="specific">Specific Subject</option>
                  </select>
                </div>
              </div>

              <AsyncSelect
                label={`From ${replaceFromType === 'generic' ? 'Generic Subject' : 'Specific Subject'}`}
                fetchUrl={replaceFromType === 'generic' ? '/api/subjects/generic' : '/api/subjects/tags'}
                value={wrongSubject}
                onChange={setWrongSubject}
                placeholder="Search the subject to replace"
              />
              <AsyncSelect
                label={`${replaceToType === 'generic' ? 'To Generic Subject' : 'To Specific Subject'}`}
                fetchUrl={replaceToType === 'generic' ? '/api/subjects/generic' : '/api/subjects/tags'}
                value={rightSubject}
                onChange={(opt) => {
                  setRightSubject(opt);
                  if (opt) {
                    setTargetName(opt.data?.name || opt.label);
                    if (replaceToType === 'specific') {
                      setTargetCategory(opt.data?.category || '');
                    }
                  }
                }}
                onQueryChange={(value) => setTargetName(value)}
                placeholder="Search the replacement/target subject (or type a new name)"
              />

              {replaceToType === 'specific' && (
                <FormInput
                  label="Target Category (optional)"
                  name="targetCategory"
                  value={targetCategory}
                  onChange={(e) => setTargetCategory(e.target.value)}
                  placeholder="Enter category for new specific subject"
                />
              )}

              {replaceFromType !== replaceToType && (
                <p className="text-xs text-gray-600 bg-blue-50 border border-blue-100 rounded-md px-3 py-2">
                  Moving subjects between Generic and Specific will remove the links from the source type and add them to the selected target type. If the target subject does not exist, it will be created using the name you select or type above.
                </p>
              )}

              {replaceError && <p className="text-sm text-red-600">{replaceError}</p>}
              {replaceSummary && <p className="text-sm text-green-700">{replaceSummary}</p>}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowReplaceModal(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  disabled={replaceLoading}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReplace}
                  disabled={replaceLoading}
                  className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-60"
                >
                  {replaceLoading ? 'Updating...' : 'Replace in Transactions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Subject Form Component
interface SubjectFormProps {
  activeTab: 'generic' | 'specific';
  initialData?: GenericSubjectMaster | TagMaster | null;
  onSubmit: (formData: SubjectFormData) => Promise<void>;
  onCancel: () => void;
}

const SubjectForm: React.FC<SubjectFormProps> = ({ 
  activeTab, 
  initialData = null, 
  onSubmit, 
  onCancel 
}) => {
  const [formData, setFormData] = useState<SubjectFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    category: (initialData as TagMaster)?.category || '',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [errors, setErrors] = useState<Partial<Record<keyof SubjectFormData, string>>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name as keyof SubjectFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof SubjectFormData, string>> = {};
    if (!formData.name?.trim()) {
      newErrors.name = 'Name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormInput
        label="Name"
        name="name"
        value={formData.name || ''}
        onChange={handleChange}
        required
        error={errors.name}
        placeholder={`Enter ${activeTab === 'generic' ? 'generic' : 'specific'} subject name`}
      />

      <FormInput
        label="Description"
        name="description"
        type="textarea"
        rows={3}
        value={formData.description || ''}
        onChange={handleChange}
        placeholder="Enter description (optional)"
      />

      {activeTab === 'specific' && (
        <FormInput
          label="Category"
          name="category"
          value={formData.category || ''}
          onChange={handleChange}
          placeholder="Enter category (optional)"
        />
      )}

      <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : (initialData && 'id' in (initialData as any) ? 'Update' : 'Create')}
        </button>
      </div>
    </form>
  );
};

export default SubjectsPage;

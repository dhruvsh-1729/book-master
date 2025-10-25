// pages/subjects/index.tsx - Subjects Management Page
import React, { useState, useEffect } from 'react';
import { Tag, Plus } from 'lucide-react';
import { DataTable, FormInput, Alert, Card, Breadcrumb } from '../../components/CoreComponents';
import { 
  GenericSubjectMaster, 
  TagMaster, 
  DataTableColumn, 
  AlertProps,
  SubjectFormData 
} from '../../types';

const SubjectsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'generic' | 'specific'>('generic');
  const [genericSubjects, setGenericSubjects] = useState<GenericSubjectMaster[]>([]);
  const [specificTags, setSpecificTags] = useState<TagMaster[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<GenericSubjectMaster | TagMaster | null>(null);
  const [alert, setAlert] = useState<AlertProps | null>(null);

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
      console.error('Error fetching specific tags:', error);
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
      label: 'Usage',
      render: (value: any) => `${value?.summaryTransactions || 0} transactions, ${value?.bookGenericTags || 0} books`
    }
  ];

  const specificColumns: DataTableColumn<TagMaster>[] = [
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'description', label: 'Description' },
    {
      key: '_count',
      label: 'Usage',
      render: (value: any) => `${value?.summaryTransactions || 0} transactions, ${value?.bookSpecificTags || 0} books`
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
    const itemType = activeTab === 'generic' ? 'generic subject' : 'specific tag';
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
        const itemType = activeTab === 'generic' ? 'generic subject' : 'specific tag';
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
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add {activeTab === 'generic' ? 'Generic Subject' : 'Specific Tag'}
          </button>
        }
      >
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
              Specific Tags ({specificTags.length})
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
                {`${editingItem ? 'Edit' : 'Add'} ${activeTab === 'generic' ? 'Generic Subject' : 'Specific Tag'}`}
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
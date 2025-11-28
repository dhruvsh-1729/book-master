import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Breadcrumb, Card, Alert, LoadingSpinner } from '../../components/CoreComponents';
import { Settings, ShieldCheck, Shield, Tag, Bookmark } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { GenericSubjectMaster, TagMaster } from '../../types';
import AsyncCreatableSelect from 'react-select/async-creatable';

interface AdminUser {
  id: string;
  email: string;
  name?: string | null;
  role?: string | null;
  defaultGenericSubjects: GenericSubjectMaster[];
  defaultSpecificTags: TagMaster[];
}

type Option = { value: string; label: string };

const AdminPage: React.FC = () => {
  const { user, loading: authLoading, checkAuth } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [genericOptions, setGenericOptions] = useState<GenericSubjectMaster[]>([]);
  const [tagOptions, setTagOptions] = useState<TagMaster[]>([]);
  const [loadersReady, setLoadersReady] = useState(false);

  const mapGenericOption = (g: GenericSubjectMaster): Option => ({ value: g.id, label: g.name });
  const mapTagOption = (t: TagMaster): Option => ({ value: t.id, label: t.name });
  const portalTarget = useMemo(() => (typeof document !== 'undefined' ? document.body : undefined), []);
  const selectStyles = {
    menuPortal: (base: any) => ({ ...base, zIndex: 9999 }),
    menu: (base: any) => ({ ...base, zIndex: 9999 }),
  };

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, genRes, tagRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/subjects/generic?limit=200'),
        fetch('/api/subjects/tags?limit=200'),
      ]);
      if (usersRes.status === 401 || usersRes.status === 403) {
        await checkAuth();
        router.replace('/');
        return;
      }
      const [usersJson, genJson, tagJson] = await Promise.all([usersRes.json(), genRes.json(), tagRes.json()]);
      if (!usersRes.ok) throw new Error(usersJson?.error || 'Failed to load users');
      setUsers(usersJson.users || []);
      setGenericOptions(genJson.subjects || []);
      setTagOptions(tagJson.tags || []);
      setLoadersReady(true);
    } catch (e: any) {
      setError(e?.message || 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (user.role !== 'admin') {
      router.back();
      return;
    }
    loadData();
  }, [user, authLoading]);

  const updateUser = async (u: AdminUser, nextRole?: string, genericIds?: string[], tagIds?: string[]) => {
    setSavingId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: nextRole ?? u.role ?? 'user',
          defaultGenericSubjectIds: genericIds ?? u.defaultGenericSubjects.map((g) => g.id),
          defaultSpecificTagIds: tagIds ?? u.defaultSpecificTags.map((t) => t.id),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to update user');
      setUsers((prev) => prev.map((item) => (item.id === u.id ? { ...item, ...data } : item)));
    } catch (e: any) {
      setError(e?.message || 'Update failed');
    } finally {
      setSavingId(null);
    }
  };

  const loadGenericOptions = useMemo(() => {
    let timer: any;
    return (inputValue: string) =>
      new Promise<Option[]>((resolve) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const params = new URLSearchParams({ limit: '20' });
            if (inputValue) params.append('search', inputValue);
            const res = await fetch(`/api/subjects/generic?${params.toString()}`);
            const data = await res.json();
            const list: GenericSubjectMaster[] = data.subjects || [];
            setGenericOptions((prev) => {
              const merged = [...prev];
              list.forEach((g) => {
                if (!merged.find((m) => m.id === g.id)) merged.push(g);
              });
              return merged;
            });
            resolve(list.map(mapGenericOption));
          } catch {
            resolve([]);
          }
        }, 300);
      });
  }, []);

  const loadTagOptions = useMemo(() => {
    let timer: any;
    return (inputValue: string) =>
      new Promise<Option[]>((resolve) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
          try {
            const params = new URLSearchParams({ limit: '20' });
            if (inputValue) params.append('search', inputValue);
            const res = await fetch(`/api/subjects/tags?${params.toString()}`);
            const data = await res.json();
            const list: TagMaster[] = data.tags || [];
            setTagOptions((prev) => {
              const merged = [...prev];
              list.forEach((t) => {
                if (!merged.find((m) => m.id === t.id)) merged.push(t);
              });
              return merged;
            });
            resolve(list.map(mapTagOption));
          } catch {
            resolve([]);
          }
        }, 300);
      });
  }, []);

  const handleCreateGeneric = async (u: AdminUser, inputValue: string) => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/subjects/generic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Create failed');
      const newItem = data as GenericSubjectMaster;
      setGenericOptions((prev) => (prev.find((g) => g.id === newItem.id) ? prev : [...prev, newItem]));
      const ids = Array.from(new Set([...u.defaultGenericSubjects.map((g) => g.id), newItem.id]));
      await updateUser(u, u.role ?? 'user', ids, undefined);
    } catch (e) {
      console.error('Create generic failed', e);
    }
  };

  const handleCreateTag = async (u: AdminUser, inputValue: string) => {
    const name = inputValue.trim();
    if (!name) return;
    try {
      const res = await fetch('/api/subjects/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Create failed');
      const newItem = data as TagMaster;
      setTagOptions((prev) => (prev.find((t) => t.id === newItem.id) ? prev : [...prev, newItem]));
      const ids = Array.from(new Set([...u.defaultSpecificTags.map((t) => t.id), newItem.id]));
      await updateUser(u, u.role ?? 'user', undefined, ids);
    } catch (e) {
      console.error('Create tag failed', e);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Admin' }]} />
        <Alert type="error" message={error} onClose={() => setError(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Dashboard', href: '/' }, { label: 'Admin' }]} />
      <Card title="Authorization Management" icon={Settings}>
        <div className="grid gap-4">
          {users.map((u) => (
            <div
              key={u.id}
              className="rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md transition overflow-hidden"
            >
              <div className="flex flex-col gap-3 border-b border-gray-100 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-semibold uppercase">
                    {(u.name || u.email || '?').slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{u.name || u.email}</p>
                    <p className="text-xs text-gray-500">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Role</span>
                  <select
                    value={u.role || 'user'}
                    onChange={(e) => updateUser(u, e.target.value)}
                    disabled={savingId === u.id}
                    className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white shadow-sm"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                  {u.role === 'admin' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                      <ShieldCheck className="h-3 w-3" />
                      Admin
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                      <Shield className="h-3 w-3" />
                      User
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-t border-gray-100">
                <div className="border-b border-gray-100 md:border-b-0 md:border-r p-4 space-y-3">
                  <div className="flex items-center gap-2 text-blue-700">
                    <Bookmark className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Default Generic Subjects</p>
                  </div>
                  <AsyncCreatableSelect
                    isMulti
                    cacheOptions
                    defaultOptions={genericOptions.map(mapGenericOption)}
                    loadOptions={loadGenericOptions}
                    isDisabled={savingId === u.id || !loadersReady}
                    value={u.defaultGenericSubjects.map(mapGenericOption)}
                    onChange={(selected) => {
                      const ids = (selected || []).map((s) => s.value);
                      updateUser(u, u.role ?? 'user', ids, undefined);
                    }}
                    onCreateOption={(val) => handleCreateGeneric(u, val)}
                    menuPortalTarget={portalTarget}
                    menuPosition="fixed"
                    styles={selectStyles}
                    className="text-sm"
                    classNamePrefix="react-select"
                    placeholder="Search or create generic subjects..."
                  />
                  <p className="text-xs text-gray-500">Search to find or create subjects; selections auto-save.</p>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-700">
                    <Tag className="h-4 w-4" />
                    <p className="text-xs font-semibold uppercase tracking-wide">Default Specific Subjects</p>
                  </div>
                  <AsyncCreatableSelect
                    isMulti
                    cacheOptions
                    defaultOptions={tagOptions.map(mapTagOption)}
                    loadOptions={loadTagOptions}
                    isDisabled={savingId === u.id || !loadersReady}
                    value={u.defaultSpecificTags.map(mapTagOption)}
                    onChange={(selected) => {
                      const ids = (selected || []).map((s) => s.value);
                      updateUser(u, u.role ?? 'user', undefined, ids);
                    }}
                    onCreateOption={(val) => handleCreateTag(u, val)}
                    menuPortalTarget={portalTarget}
                    menuPosition="fixed"
                    styles={selectStyles}
                    className="text-sm"
                    classNamePrefix="react-select"
                    placeholder="Search or create specific subjects..."
                  />
                  <p className="text-xs text-gray-500">Search to find or create tags; selections auto-save.</p>
                </div>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
              No users found.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default AdminPage;

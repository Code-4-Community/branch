'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Header from '../components/Header';
import Button from '../components/Button';
import DataTable, { type DataTableColumn } from '../components/DataTable';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import TextInputField from '../components/TextInputField';
import { useApi } from '@/hooks/useApi';
import { useAuth, type ImpersonationMode } from '@/context/AuthContext';
import { LOGIN_PATH, landingPathFor } from '@/lib/routes';

interface Target {
  userId: number;
  name: string;
  email: string;
  isAdmin: boolean;
  pending: boolean;
  directorProjectCount: number;
  memberProjectCount: number;
}

const SEARCH_DEBOUNCE_MS = 250;

function roleOf(t: Target): string {
  if (t.isAdmin) return 'Admin';
  if (t.directorProjectCount > 0) return 'Director';
  return t.memberProjectCount > 0 ? 'Member' : 'No projects';
}

export default function StaffConsolePage() {
  const api = useApi();
  const router = useRouter();
  const { startImpersonation, logout } = useAuth();
  const [search, setSearch] = useState('');
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<number | null>(null);
  const [confirmFull, setConfirmFull] = useState<Target | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setError(null);
      try {
        const query = search.trim()
          ? `?search=${encodeURIComponent(search.trim())}`
          : '';
        const json = await api.get<{ users: Target[] }>(
          `/auth/impersonation/targets${query}`,
        );
        if (!cancelled) setTargets(json.users ?? []);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : 'Failed to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, search]);

  const switchInto = async (target: Target, mode: ImpersonationMode) => {
    setSwitching(target.userId);
    setError(null);
    try {
      const me = await startImpersonation(target.userId, mode);
      router.replace(landingPathFor(me.rbac));
    } catch (err) {
      setSwitching(null);
      setError(
        err instanceof Error ? err.message : 'Could not switch into this user',
      );
      throw err;
    }
  };

  const columns: DataTableColumn<Target>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (t) => (
        <span>
          {t.name}
          {t.pending && (
            <span className="!pl-2 text-xs text-gray-500">
              (never signed in)
            </span>
          )}
        </span>
      ),
    },
    { key: 'email', header: 'Email', cell: (t) => t.email },
    { key: 'role', header: 'Role', width: '120px', cell: roleOf },
    {
      key: 'actions',
      header: '',
      width: '220px',
      align: 'right',
      cell: (t) => (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            isLoading={switching === t.userId}
            disabled={switching !== null}
            onClick={() => switchInto(t, 'read_only').catch(() => undefined)}
          >
            View as
          </Button>
          <Button
            variant="danger"
            disabled={switching !== null}
            onClick={() => setConfirmFull(t)}
          >
            Act as
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-core-white">
      <Header text="Staff console" />
      <main className="!p-6">
        <div className="flex flex-wrap items-end justify-between gap-4 !pb-4">
          <div className="w-full max-w-sm">
            <TextInputField
              label="Search by name or email"
              value={search}
              onChange={setSearch}
            />
          </div>
          <Button
            variant="ghost"
            onClick={async () => {
              await logout();
              router.replace(LOGIN_PATH);
            }}
          >
            Sign out
          </Button>
        </div>
        <p className="!pb-4 text-sm text-gray-600">
          <strong>View as</strong> is read-only. <strong>Act as</strong> makes
          real changes in that user&apos;s name. Every change is recorded
          against your account. A switch-in lasts one hour.
        </p>
        {error && (
          <p role="alert" className="!pb-4 text-sm !text-error-red">
            {error}
          </p>
        )}
        <DataTable
          columns={columns}
          rows={targets}
          rowKey={(t) => t.userId}
          isLoading={loading}
          loadingLabel="Loading users"
          emptyMessage={
            search ? 'No users match that search.' : 'No users yet.'
          }
        />
      </main>

      <ConfirmDeleteDialog
        open={confirmFull !== null}
        onClose={() => setConfirmFull(null)}
        onConfirm={() =>
          confirmFull ? switchInto(confirmFull, 'full') : undefined
        }
        title="Act as this user with full access?"
        prompt={
          confirmFull && (
            <>
              Switch into{' '}
              <span className="!font-bold">
                {`${confirmFull.name} (${confirmFull.email})`}
              </span>{' '}
              for one hour?
            </>
          )
        }
        consequences="Anything you create, edit, approve or delete is real and is saved as this user. Each change is also recorded against your staff account."
        irreversible={false}
        confirmLabel="Act as"
        pendingLabel="Switching…"
      />
    </div>
  );
}

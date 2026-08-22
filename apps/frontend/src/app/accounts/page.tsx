'use client';

import React, { useCallback, useEffect, useState } from 'react';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import StaffCard from '../components/StaffCard';
import AddUserModal from '../components/AddUserModal';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import Button from '../components/Button';
import LoadingState from '../components/LoadingState';
import { FaPlus } from 'react-icons/fa';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { User } from '@/types';

export default function AccountsPage() {
  const api = useApi();
  const { user: currentUser } = useAuth();

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // The page used to render a hardcoded list, so accounts created through
  // "Add User" were invisible here and could never be removed.
  const load = useCallback(async () => {
    setError(null);
    try {
      const json = await api.get<{ users: User[] }>('/users');
      setUsers(json.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const facilitationTeam = users.filter((u) => u.is_admin);
  const teamMembers = users.filter((u) => !u.is_admin);

  const section = (heading: string, list: User[], emptyCopy: string) => (
    <>
      <h3 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">
        {heading}
      </h3>
      {list.length === 0 ? (
        <p className="!pt-3 !pb-7 !text-black-700">{emptyCopy}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 !pt-3 !pb-7">
          {list.map((user) => (
            <StaffCard
              key={user.user_id}
              name={user.name}
              email={user.email}
              image={user.profile_image ?? undefined}
              // Deleting yourself would revoke the session mid-request and
              // could remove the last admin, locking everyone out.
              onDelete={
                user.user_id === currentUser?.userId
                  ? undefined
                  : () => setUserToDelete(user)
              }
            />
          ))}
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-screen">
      <NavBar />
      <main className="min-w-0 flex-1 bg-core-white">
        <Header />
        <div className="!p-6">
          <div className="flex items-center justify-between !mb-4">
            <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">
              Accounts
            </h1>
            <Button
              icon={<FaPlus aria-hidden />}
              onClick={() => setIsModalOpen(true)}
            >
              Add User
            </Button>
          </div>

          {error && (
            <p role="alert" className="!font-bold !text-error-red">
              {error}
            </p>
          )}

          {loading ? (
            <LoadingState label="Loading accounts…" variant="section" />
          ) : (
            !error && (
              <>
                {section(
                  'Core BRANCH Facilitation Team',
                  facilitationTeam,
                  'No admins yet.',
                )}
                {section(
                  'BRANCH Team Members',
                  teamMembers,
                  'No team members yet.',
                )}
              </>
            )
          )}

          <AddUserModal
            open={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            onSuccess={() => {
              setIsModalOpen(false);
              void load();
            }}
          />

          <ConfirmDeleteDialog
            open={userToDelete !== null}
            onClose={() => setUserToDelete(null)}
            onConfirm={async () => {
              if (!userToDelete) return;
              await api.del(`/users/${userToDelete.user_id}`);
              await load();
            }}
            title="Delete User"
            itemName={userToDelete?.name}
            confirmLabel="Delete User"
            consequences={
              <>
                <p>{userToDelete?.email}</p>
                <p className="!mt-2">
                  Their sign-in is removed and they are unassigned from every
                  project. Expenses they entered stay, but lose their author.
                </p>
              </>
            }
          />
        </div>
      </main>
    </div>
  );
}

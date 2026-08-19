"use client";

import React, { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import StaffCard from '../components/StaffCard';
import AddUserModal from '../components/AddUserModal';
import { Button } from '@chakra-ui/react';
import { facilitationTeam, teamMembers } from './mockUsers';
import { User } from '@/types';

export default function AccountsPage() {
    const api = useApi();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchUsers() {
            try {
                const json = await api.get<User[] | { data: User[] }>('http://localhost:3001/users');
                const list = Array.isArray(json) ? json : (json && 'data' in json ? json.data : []);
                setUsers(list);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load users');
                setUsers([]);
            } finally {
                setLoading(false);
            }
        }
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const shownFacilitation = users.length ? users.filter(u => u.is_admin) : facilitationTeam;
    const shownTeam = users.length ? users.filter(u => !u.is_admin) : teamMembers;
    const [isModalOpen, setIsModalOpen] = useState(false);
    return (
        <div className="!p-6">
            <div className="flex items-center justify-between !mb-4">
                <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">Accounts</h1>
                <Button
                    backgroundColor="var(--color-core-green)"
                    color="var(--color-core-white)"
                    onClick={() => setIsModalOpen(true)}
                >
                    + Add User
                </Button>
            </div>
            <h3 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">Core BRANCH Facilitation Team</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 !pt-3 !pb-7">
                {loading && <p>Loading users...</p>}
                {error && <p style={{ color: 'var(--color-error-red)' }}>{error}</p>}
                {!loading && !error && shownFacilitation.map(user => (
                    <StaffCard key={user.user_id} name={user.name} email={user.email} />
                ))}
            </div>
            <h3 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">BRANCH Team Members</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 !pt-3 !pb-7">
                {!loading && !error && shownTeam.map(user => (
                    <StaffCard key={user.user_id} name={user.name} email={user.email} />
                ))}
            </div>
            <AddUserModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => setIsModalOpen(false)}
            />
        </div>
    );
}

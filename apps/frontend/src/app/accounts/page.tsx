"use client";

import React, { useState } from 'react';
import { useUsers } from '@/hooks/useUsers';
import StaffCard from '../components/StaffCard';
import AddUserModal from '../components/AddUserModal';
import { Button } from '@chakra-ui/react';

export default function AccountsPage() {
    const { users, loading, error } = useUsers();
    const shownFacilitation = users.filter(u => u.is_admin);
    const shownTeam = users.filter(u => !u.is_admin);
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

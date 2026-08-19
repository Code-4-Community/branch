'use client';

import React, { useState } from 'react';
import NavBar from '../components/Navbar';
import Header from '../components/Header';
import StaffCard from '../components/StaffCard';
import AddUserModal from '../components/AddUserModal';
import { Button } from '@chakra-ui/react';
import { facilitationTeam, teamMembers } from './mockUsers';

export default function AccountsPage() {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="flex min-h-screen">
            <NavBar />
            <main className="min-w-0 flex-1 bg-core-white">
                <Header />
                <div className="flex flex-col !gap-4 !px-4 !py-5 sm:!px-8">
                    <div className="flex items-center justify-between !mb-2">
                        <h1>Accounts</h1>
                        <Button
                            backgroundColor="var(--color-core-green)"
                            color="var(--color-core-white)"
                            onClick={() => setIsModalOpen(true)}
                        >
                            + Add User
                        </Button>
                    </div>

                    <section className="flex flex-col !gap-3">
                        <h3 className="!font-semibold">Core BRANCH Facilitation Team</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {facilitationTeam.map(user => (
                                <StaffCard key={user.user_id} name={user.name} email={user.email} />
                            ))}
                        </div>
                    </section>

                    <section className="flex flex-col !gap-3 !pt-2">
                        <h3 className="!font-semibold">BRANCH Team Members</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {teamMembers.map(user => (
                                <StaffCard key={user.user_id} name={user.name} email={user.email} />
                            ))}
                        </div>
                    </section>
                </div>
            </main>

            <AddUserModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => setIsModalOpen(false)}
            />
        </div>
    );
}

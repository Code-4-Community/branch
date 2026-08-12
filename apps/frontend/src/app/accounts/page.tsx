'use client';

import React from 'react';
import StaffCard from '../components/StaffCard';
import { facilitationTeam, teamMembers } from './mockUsers';


export default function AccountsPage() {
    return (
        <div className="!p-6">
            <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">Accounts</h1>
            <h3 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">Core BRANCH Facilitation Team</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 !pt-3 !pb-7">
                {facilitationTeam.map(user => (
                    <StaffCard key={user.user_id} name={user.name} email={user.email} />
                ))}
            </div>
            <h3 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">BRANCH Team Members</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 !pt-3 !pb-7">
                {teamMembers.map(user => (
                    <StaffCard key={user.user_id} name={user.name} email={user.email} />
                ))}
            </div>
        </div>
    );
}
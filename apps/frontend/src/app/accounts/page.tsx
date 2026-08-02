'use client';

import React, { useState } from 'react';
import StaffCard from '../components/StaffCard';
import AddUserModal from '../components/AddUserModal';
import { Button } from '@chakra-ui/react';
import { User } from '@/types';
import { getAccessToken } from '@/lib/authTokens';

const mockUsers: User[] = [
    { user_id: 1,  name: 'Mehana Nagarur',   email: 'nagarur.m@northeastern.edu', is_admin: true  },
    { user_id: 2,  name: 'Alex Rivera',       email: 'rivera.a@northeastern.edu',  is_admin: true  },
    { user_id: 3,  name: 'Jordan Lee',        email: 'lee.j@northeastern.edu',     is_admin: true  },
    { user_id: 4,  name: 'Priya Sharma',      email: 'sharma.p@northeastern.edu',  is_admin: true  },
    { user_id: 5,  name: 'Chris Nguyen',      email: 'nguyen.c@northeastern.edu',  is_admin: true  },
    { user_id: 6,  name: 'Taylor Brooks',     email: 'brooks.t@northeastern.edu',  is_admin: false },
    { user_id: 7,  name: 'Sam Patel',         email: 'patel.s@northeastern.edu',   is_admin: false },
    { user_id: 8,  name: 'Morgan Clarke',     email: 'clarke.m@northeastern.edu',  is_admin: false },
    { user_id: 9,  name: 'Jamie Wu',          email: 'wu.j@northeastern.edu',      is_admin: false },
    { user_id: 10, name: 'Riley Thompson',    email: 'thompson.r@northeastern.edu',is_admin: false },
    { user_id: 11, name: 'Avery Johnson',     email: 'johnson.a@northeastern.edu', is_admin: false },
    { user_id: 12, name: 'Casey Martinez',    email: 'martinez.c@northeastern.edu',is_admin: false },
    { user_id: 13, name: 'Drew Hassan',       email: 'hassan.d@northeastern.edu',  is_admin: false },
    { user_id: 14, name: 'Quinn Okafor',      email: 'okafor.q@northeastern.edu',  is_admin: false },
    { user_id: 15, name: 'Blake Fernandez',   email: 'fernandez.b@northeastern.edu',is_admin: false },
];

export const facilitationTeam = mockUsers.filter(u => u.is_admin);
export const teamMembers = mockUsers.filter(u => !u.is_admin);



export default function AccountsPage() {
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
            <AddUserModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => setIsModalOpen(false)}
                token={getAccessToken() ?? ''}
            />
        </div>
    );
}

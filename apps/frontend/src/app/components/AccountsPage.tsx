'use client';

import React from 'react';
import StaffCard from './StaffCard';

interface User {
    user_id: number;
    name: string;
    email: string;
    is_admin: boolean;
    created_at?: string;
}

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

const facilitationTeam = mockUsers.filter(u => u.is_admin);
const teamMembers = mockUsers.filter(u => !u.is_admin);



export default function AccountsPage() {
    return (
        <div>
            <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">Accounts</h1>
            <h2 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">Core BRANCH Facilitation Team</h2>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-3 !pt-3 !pb-7">
                {facilitationTeam.map(user => (
                    <StaffCard key={user.user_id} name={user.name} />
                ))}
            </div>
            <h2 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-3)] !font-semibold">BRANCH Team Members</h2>
            <div className="grid grid-cols-3 md:grid-cols-7 gap-3 !pt-3 !pb-7">
                {teamMembers.map(user => (
                    <StaffCard key={user.user_id} name={user.name} />
                ))}
            </div>
        </div>
    );
}
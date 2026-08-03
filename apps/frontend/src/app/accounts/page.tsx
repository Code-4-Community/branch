"use client";

import React, { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import StaffCard from '../components/StaffCard';
import { User } from '@/types';

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
    return (
        <div className="!p-6">
            <h1 className="![font-family:var(--font-heading)] !text-[length:var(--font-size-heading-1)] !font-semibold">Accounts</h1>
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
        </div>
    );
}
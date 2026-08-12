import { User } from '@/types';

// Lives outside page.tsx because Next.js rejects non-page exports from a page
// module, and the accounts tests read these lists directly.
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

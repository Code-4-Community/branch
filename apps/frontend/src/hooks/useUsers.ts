'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/hooks/useApi';
import { User } from '@/types';

type UsersResponse = {
  users?: User[];
  data?: User[];
  pagination?: {
    page: number;
    limit: number;
    totalUsers: number;
    totalPages: number;
  };
};

export function useUsers() {
  const api = useApi();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchUsers() {
      try {
        const json = await api.get<User[] | UsersResponse>('/users');

        const list = Array.isArray(json)
          ? json
          : Array.isArray(json.users)
            ? json.users
            : Array.isArray(json.data)
              ? json.data
              : [];

        if (!cancelled) {
          setUsers(list);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load users');
          setUsers([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [api]);

  return { users, loading, error };
}

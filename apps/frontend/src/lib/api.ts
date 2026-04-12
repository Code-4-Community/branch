const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3006';

interface RequestOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  { token, headers, ...options }: RequestOptions = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

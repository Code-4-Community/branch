const SERVICE_PORTS: Record<string, string> = {
  auth: '3006',
  users: '3001',
  projects: '3002',
  donors: '3003',
  expenditures: '3004',
  reports: '3005',
};

function resolveBaseUrl(path: string): string {
  const override = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (override) return override;
  const service = path.split('/')[1] ?? '';
  const port = SERVICE_PORTS[service] ?? '3006';
  return `http://localhost:${port}`;
}

interface RequestOptions extends RequestInit {
  token?: string;
}

export async function apiFetch<T>(
  path: string,
  { token, headers, ...options }: RequestOptions = {},
): Promise<T> {
  const res = await fetch(`${resolveBaseUrl(path)}${path}`, {
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

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

/**
 * A failed HTTP response, carrying the status so callers can branch on it.
 *
 * This is what makes transparent token refresh possible: `authedFetch` needs to
 * tell a 401 apart from a network failure or a 500, and a bare `Error` cannot
 * express that.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions extends RequestInit {
  token?: string;
}

/** Reads a JSON body, tolerating empty ones (e.g. a 204 from POST /auth/logout). */
async function readBody(res: Response): Promise<unknown> {
  if (res.status === 204 || res.status === 205) return undefined;
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * Low-level fetch wrapper. Deliberately dependency-free — it knows nothing about
 * sessions, storage or refresh, which is what keeps the import graph acyclic:
 * `authClient` imports this, not the other way round. Use `useApi()` /
 * `authedFetch` for anything that needs the caller's access token.
 */
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

  const body = await readBody(res);

  if (!res.ok) {
    const message =
      (body as { message?: string } | undefined)?.message ??
      res.statusText ??
      'Request failed';
    throw new ApiError(message, res.status, body);
  }

  return body as T;
}

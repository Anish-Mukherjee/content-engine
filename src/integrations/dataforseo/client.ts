import { ExternalApiError, TransientError } from '../../lib/errors';

const BASE = 'https://api.dataforseo.com/v3';

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN ?? '';
  const password = process.env.DATAFORSEO_PASSWORD ?? '';
  return 'Basic ' + Buffer.from(`${login}:${password}`).toString('base64');
}

export async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
  });
  const body = await res.text();
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) throw new TransientError(`dataforseo ${res.status}`);
    throw new ExternalApiError('dataforseo', res.status, body);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new ExternalApiError('dataforseo', res.status, body);
  }
}

import { dispatch } from '../src/dispatch';
import { json } from '../src/response';
import type { Route } from '../src/types';

const ok = (label: string): Route['handler'] => async (ctx) =>
  json(200, { label, params: ctx.params, path: ctx.path });

const routes: Route[] = [
  { method: 'GET', pattern: '/projects', handler: ok('list') },
  { method: 'GET', pattern: '/projects/dashboard', handler: ok('dashboard') },
  { method: 'GET', pattern: '/projects/:id', handler: ok('get-one') },
  { method: 'PUT', pattern: '/projects/:id', handler: ok('update') },
];

const event = (method: string, rawPath: string) => ({
  rawPath,
  requestContext: { http: { method } },
});

const body = (res: { body: string }) => JSON.parse(res.body);

describe('dispatch', () => {
  it('routes the full prefixed path that API Gateway forwards', async () => {
    const res = await dispatch(event('GET', '/projects'), { prefix: 'projects', routes });
    expect(res.statusCode).toBe(200);
    expect(body(res).label).toBe('list');
  });

  it('routes the prefix-stripped path the dev-server forwards', async () => {
    const res = await dispatch(event('GET', '/'), { prefix: 'projects', routes });
    expect(body(res).label).toBe('list');
  });

  it('canonicalizes a stripped sub-path back under the prefix', async () => {
    const res = await dispatch(event('GET', '/7'), { prefix: 'projects', routes });
    expect(body(res)).toMatchObject({ label: 'get-one', params: { id: '7' }, path: '/projects/7' });
  });

  it('honours route order, so a literal wins over a param pattern', async () => {
    const res = await dispatch(event('GET', '/projects/dashboard'), {
      prefix: 'projects',
      routes,
    });
    expect(body(res).label).toBe('dashboard');
  });

  it('discriminates on method', async () => {
    const res = await dispatch(event('PUT', '/projects/7'), { prefix: 'projects', routes });
    expect(body(res).label).toBe('update');
  });

  it('ignores a trailing slash', async () => {
    const res = await dispatch(event('GET', '/projects/'), { prefix: 'projects', routes });
    expect(body(res).label).toBe('list');
  });

  it('accepts the API Gateway event shape (path + httpMethod)', async () => {
    const res = await dispatch(
      { path: '/projects/7', httpMethod: 'get' },
      { prefix: 'projects', routes },
    );
    expect(body(res).label).toBe('get-one');
  });

  it('answers OPTIONS preflight with 200 and CORS headers', async () => {
    const res = await dispatch(event('OPTIONS', '/projects/7'), { prefix: 'projects', routes });
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['Access-Control-Allow-Origin']).toBe('*');
  });

  it('serves health under both path shapes without hitting a route', async () => {
    for (const path of ['/projects/health', '/health']) {
      const res = await dispatch(event('GET', path), { prefix: 'projects', routes });
      expect(res.statusCode).toBe(200);
      expect(body(res).ok).toBe(true);
    }
  });

  it('404s an unmatched path', async () => {
    const res = await dispatch(event('GET', '/projects/7/nope'), { prefix: 'projects', routes });
    expect(res.statusCode).toBe(404);
    expect(body(res)).toMatchObject({ message: 'Not Found', path: '/projects/7/nope' });
  });

  it('500s when a handler throws, without leaking the error', async () => {
    const boom: Route[] = [
      {
        method: 'GET',
        pattern: '/projects',
        handler: async () => {
          throw new Error('secret detail');
        },
      },
    ];
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await dispatch(event('GET', '/projects'), { prefix: 'projects', routes: boom });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret detail');
    spy.mockRestore();
  });
});

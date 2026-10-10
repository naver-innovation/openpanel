import { db } from '@openpanel/db';
import type { FastifyInstance } from 'fastify';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Keep the real HTTP/tRPC/auth wiring; no request in this suite needs storage.
vi.mock('@openpanel/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@openpanel/redis')>();
  const client = new Proxy(
    {},
    {
      get: (_target, key) =>
        key === 'status' ? 'ready' : vi.fn().mockResolvedValue(null),
    }
  );
  return {
    ...actual,
    getRedisCache: () => client,
    getRedisQueue: () => client,
    getRedisPub: () => client,
    getRedisSub: () => client,
    getRedisGroupQueue: () => client,
  };
});

import { buildApp } from '../app';

let app: FastifyInstance;
const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn() };
const inviteId = 'private-neoid-invitation';
const cookie = 'session=private-session-cookie';

beforeAll(async () => {
  vi.spyOn(db.session, 'findUnique').mockResolvedValue(null);
  vi.stubEnv('DASHBOARD_URL', 'https://dashboard.example.com');
  vi.stubEnv('COOKIE_SECRET', 'review-cookie-secret');
  app = await buildApp({ testing: true });
  app.addHook('onRequest', async (request) => {
    request.log.info = log.info;
    request.log.error = log.error;
    request.log.warn = log.warn;
  });
  await app.ready();
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEOID_ENTERPRISE_URL', 'https://login.example.com');
  vi.stubEnv('NEOID_CLIENT_ID', 'openpanel');
  vi.stubEnv('NEOID_CLIENT_SECRET', '');
  vi.stubEnv(
    'NEOID_REDIRECT_URI',
    'https://api.example.com/oauth/neoid/callback'
  );
  for (const key of [
    'NEOID_RESOURCE_URL',
    'NEOID_SERVICE_ID',
    'NEOID_SERVICE_KEY',
    'NEOID_CONSUMER_KEY',
  ]) {
    vi.stubEnv(key, '');
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function logOutput() {
  return JSON.stringify([
    log.info.mock.calls,
    log.error.mock.calls,
    log.warn.mock.calls,
  ]);
}

describe('NEOID HTTP error logging', () => {
  it('redacts invitation input when the OAuth client is not configured', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/trpc/neoidAuth.start',
      headers: { 'request-id': 'neoid-review-request' },
      payload: { json: { inviteId } },
    });
    expect(response.statusCode).toBe(401);
    expect(log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'neoidAuth.start',
        errorCode: 'UNAUTHORIZED',
        requestId: 'neoid-review-request',
      }),
      'trpc error'
    );
    expect(logOutput()).not.toMatch(
      /private-neoid-invitation|private-session-cookie|private-neoid-secret/
    );
  });

  it('redacts query input when GET is incorrectly used for the login mutation', async () => {
    const input = encodeURIComponent(JSON.stringify({ json: { inviteId } }));
    const response = await app.inject({
      method: 'GET',
      url: `/trpc/neoidAuth.start?input=${input}`,
    });
    expect(response.statusCode).toBe(405);
    expect(logOutput()).not.toMatch(
      /private-neoid-invitation|private-session-cookie|private-neoid-secret/
    );
  });

  it('redacts batched login query inputs', async () => {
    const input = encodeURIComponent(
      JSON.stringify({ 0: { json: { inviteId } }, 1: { json: { inviteId } } })
    );
    const response = await app.inject({
      method: 'GET',
      url: `/trpc/neoidAuth.start,neoidAuth.start?batch=1&input=${input}`,
    });
    expect(response.statusCode).toBe(405);
    expect(logOutput()).not.toMatch(
      /private-neoid-invitation|private-session-cookie|private-neoid-secret/
    );
  });

  it('redacts malformed JSON before it reaches the tRPC handler', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/trpc/neoidAuth.start',
      headers: { 'content-type': 'application/json', cookie },
      payload: `{"json":{"inviteId":"${inviteId}"} invalid`,
    });
    expect(response.statusCode).toBe(400);
    expect(logOutput()).not.toMatch(
      /private-neoid-invitation|private-session-cookie|private-neoid-secret/
    );
  });

  it('rejects invalid resource configuration before setting OAuth cookies', async () => {
    vi.stubEnv('NEOID_CLIENT_SECRET', 'private-neoid-secret');
    vi.stubEnv('NEOID_RESOURCE_URL', 'http://resource.example.com:5002');
    vi.stubEnv('NEOID_SERVICE_ID', 'service');
    vi.stubEnv('NEOID_SERVICE_KEY', 'private-neoid-secret');
    vi.stubEnv('NEOID_CONSUMER_KEY', 'consumer');
    const response = await app.inject({
      method: 'POST',
      url: '/trpc/neoidAuth.start',
      payload: { json: { inviteId } },
    });
    expect(response.statusCode).toBe(500);
    expect(response.cookies).toHaveLength(0);
    expect(response.json().error.json.message).toContain(
      'NEOID_RESOURCE_URL must be an HTTPS URL without credentials'
    );
    expect(logOutput()).not.toMatch(
      /private-neoid-invitation|private-session-cookie|private-neoid-secret/
    );
  });
});

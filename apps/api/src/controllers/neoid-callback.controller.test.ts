import type { FastifyReply, FastifyRequest } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getNeoidConfig: vi.fn(),
  exchangeNeoidCode: vi.fn(),
  getNeoidIdentity: vi.fn(),
  resolveNeoidUser: vi.fn(),
  isNeoidRegistrationAllowed: vi.fn(),
  generateSessionToken: vi.fn(),
  createSession: vi.fn(),
  setSessionTokenCookie: vi.fn(),
  setLastAuthProviderCookie: vi.fn(),
}));
const database = vi.hoisted(() => ({
  account: { findFirst: vi.fn() },
  user: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
  },
  invite: { findUnique: vi.fn() },
}));
const connectUserToOrganization = vi.hoisted(() => vi.fn());

vi.mock('@openpanel/auth', () => ({
  ...auth,
  COOKIE_OPTIONS: { domain: '.example.com', path: '/', sameSite: 'lax' },
}));
vi.mock('@openpanel/db', () => ({
  db: database,
  connectUserToOrganization,
}));

import { neoidCallback } from './neoid-callback.controller';

function request(
  cookies: Record<string, string>,
  query: Record<string, string>
) {
  return {
    id: 'request-1',
    cookies,
    query,
    log: { error: vi.fn() },
  } as unknown as FastifyRequest;
}

function reply() {
  const response = {
    clearCookie: vi.fn(),
    setCookie: vi.fn(),
    redirect: vi.fn((url: string) => url),
    request: { id: 'request-1' },
  };
  return response as unknown as FastifyReply & typeof response;
}

describe('NEOID callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DASHBOARD_URL = 'https://dashboard.example.com';
    auth.getNeoidConfig.mockReturnValue({
      baseUrl: 'https://login.example.com',
    });
    auth.exchangeNeoidCode.mockResolvedValue('access');
    auth.getNeoidIdentity.mockResolvedValue({
      sub: 'sub-1',
      email: null,
      displayName: null,
    });
    auth.resolveNeoidUser.mockResolvedValue({ userId: 'user-1', isNew: false });
    auth.generateSessionToken.mockReturnValue('session-token');
    auth.createSession.mockResolvedValue({ expiresAt: new Date('2027-01-01') });
    database.user.findUniqueOrThrow.mockResolvedValue({ id: 'user-1' });
  });

  it('rejects a mismatched state before contacting NEOID or creating a session', async () => {
    const res = reply();
    await neoidCallback(
      request(
        { neoid_oauth_state: 'expected', neoid_code_verifier: 'verifier' },
        { code: 'code-1', state: 'wrong' }
      ),
      res
    );
    expect(auth.exchangeNeoidCode).not.toHaveBeenCalled();
    expect(auth.createSession).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledWith(
      'neoid_oauth_state',
      expect.objectContaining({ domain: '.example.com', path: '/' })
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('/login?error=NEOID+sign-in+failed')
    );
  });

  it('creates only an OpenPanel session for an existing NEOID account', async () => {
    const res = reply();
    await neoidCallback(
      request(
        {
          neoid_oauth_state: 'expected',
          neoid_code_verifier: 'verifier',
          neoid_invite_id: 'invite-1',
        },
        { code: 'code-1', state: 'expected' }
      ),
      res
    );
    expect(auth.exchangeNeoidCode).toHaveBeenCalledWith(
      expect.anything(),
      'code-1',
      'verifier'
    );
    expect(auth.resolveNeoidUser).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'sub-1' }),
      'invite-1',
      expect.anything(),
      expect.any(Function)
    );
    expect(auth.createSession).toHaveBeenCalledWith('session-token', 'user-1');
    expect(connectUserToOrganization).toHaveBeenCalledWith({
      user: { id: 'user-1' },
      inviteId: 'invite-1',
    });
    expect(auth.setSessionTokenCookie).toHaveBeenCalled();
    expect(auth.setLastAuthProviderCookie).toHaveBeenCalledWith(
      expect.any(Function),
      'neoid'
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'neoid_code_verifier',
      expect.objectContaining({ domain: '.example.com', path: '/' })
    );
    expect(res.redirect).toHaveBeenCalledWith('https://dashboard.example.com');
  });

  it('does not issue a session when account resolution rejects the identity', async () => {
    auth.resolveNeoidUser.mockRejectedValue(
      Object.assign(new Error('collision'), { code: 'EMAIL_ALREADY_USED' })
    );
    const res = reply();
    await neoidCallback(
      request(
        { neoid_oauth_state: 'expected', neoid_code_verifier: 'verifier' },
        { code: 'code-1', state: 'expected' }
      ),
      res
    );
    expect(auth.createSession).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringContaining('original+authentication+method')
    );
  });
});

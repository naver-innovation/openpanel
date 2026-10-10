import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  getNeoidConfig: vi.fn(),
  createNeoidAuthorizationUrl: vi.fn(),
}));

vi.mock('@openpanel/auth', () => ({
  ...auth,
  COOKIE_OPTIONS: {},
  Arctic: {
    generateState: () => 'state-123',
    generateCodeVerifier: () => 'verifier-123',
  },
}));
vi.mock('@openpanel/db', () => ({
  runWithAlsSession: (_id: string | null, callback: () => unknown) =>
    callback(),
}));

import { neoidAuthRouter } from './neoid-auth';

function caller(setCookie = vi.fn()) {
  return {
    setCookie,
    api: neoidAuthRouter.createCaller({
      req: { log: { info: vi.fn() } },
      res: {},
      session: null,
      cookies: {},
      setCookie,
    } as never),
  };
}

describe('NEOID authorization start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getNeoidConfig.mockReturnValue({ clientId: 'openpanel' });
    auth.createNeoidAuthorizationUrl.mockReturnValue(
      new URL('https://login.example.com/oauth/authorize')
    );
  });

  it('sets short-lived state and verifier cookies and returns the redirect URL', async () => {
    const { api, setCookie } = caller();
    await expect(api.start({ inviteId: 'invite-1' })).resolves.toEqual({
      url: 'https://login.example.com/oauth/authorize',
    });
    expect(auth.createNeoidAuthorizationUrl).toHaveBeenCalledWith(
      { clientId: 'openpanel' },
      'state-123',
      'verifier-123'
    );
    expect(setCookie).toHaveBeenCalledWith('neoid_oauth_state', 'state-123', {
      maxAge: 600,
    });
    expect(setCookie).toHaveBeenCalledWith(
      'neoid_code_verifier',
      'verifier-123',
      { maxAge: 600 }
    );
    expect(setCookie).toHaveBeenCalledWith('neoid_invite_id', 'invite-1', {
      maxAge: 600,
    });
  });

  it('clears a stale invitation when a new sign-in has no invite', async () => {
    const { api, setCookie } = caller();
    await api.start({});
    expect(setCookie).toHaveBeenCalledWith('neoid_invite_id', '', {
      maxAge: 0,
    });
  });

  it('rejects an unconfigured client before setting any cookies', async () => {
    auth.getNeoidConfig.mockReturnValue(null);
    const { api, setCookie } = caller();
    await expect(api.start({})).rejects.toThrow(
      'NEOID sign-in is not configured'
    );
    expect(setCookie).not.toHaveBeenCalled();
  });
});

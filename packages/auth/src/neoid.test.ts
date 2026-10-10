import { describe, expect, it, vi } from 'vitest';
import {
  createNeoidAuthorizationUrl,
  exchangeNeoidCode,
  getNeoidConfig,
  getNeoidIdentity,
} from './neoid';

const config = {
  baseUrl: 'https://login.example.com',
  clientId: 'openpanel',
  clientSecret: 'test-secret',
  redirectUri: 'https://api.example.com/oauth/neoid/callback',
  scope: 'openid',
};

describe('NEOID OAuth adapter', () => {
  it('enables the provider only with a complete HTTPS client configuration', () => {
    expect(getNeoidConfig({})).toBeNull();
    expect(
      getNeoidConfig({
        NEOID_ENTERPRISE_URL: 'http://login.example.com',
        NEOID_CLIENT_ID: 'openpanel',
        NEOID_CLIENT_SECRET: 'secret',
        NEOID_REDIRECT_URI: config.redirectUri,
      })
    ).toBeNull();
    expect(
      getNeoidConfig({
        NEOID_ENTERPRISE_URL: `${config.baseUrl}/`,
        NEOID_CLIENT_ID: config.clientId,
        NEOID_CLIENT_SECRET: config.clientSecret,
        NEOID_REDIRECT_URI: config.redirectUri,
      })
    ).toEqual(config);
  });

  it('allows an HTTP callback only on localhost for local development', () => {
    expect(
      getNeoidConfig({
        NEOID_ENTERPRISE_URL: config.baseUrl,
        NEOID_CLIENT_ID: config.clientId,
        NEOID_CLIENT_SECRET: config.clientSecret,
        NEOID_REDIRECT_URI: 'http://localhost:3333/oauth/neoid/callback',
      })?.redirectUri
    ).toBe('http://localhost:3333/oauth/neoid/callback');
    expect(
      getNeoidConfig({
        NEOID_ENTERPRISE_URL: config.baseUrl,
        NEOID_CLIENT_ID: config.clientId,
        NEOID_CLIENT_SECRET: config.clientSecret,
        NEOID_REDIRECT_URI: 'http://api.example.com/oauth/neoid/callback',
      })
    ).toBeNull();
  });

  it('builds an authorization URL with state and PKCE S256', () => {
    const url = createNeoidAuthorizationUrl(
      config,
      'state-123',
      'verifier-123'
    );
    expect(url.origin + url.pathname).toBe(
      'https://login.example.com/oauth/authorize'
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(config.clientId);
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri);
    expect(url.searchParams.get('scope')).toBe('openid');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);
  });

  it('exchanges the code with the same verifier and rejects a missing access token', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'access-123' }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    await expect(
      exchangeNeoidCode(config, 'code-123', 'verifier-123', fetcher)
    ).resolves.toBe('access-123');
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://login.example.com/api/v1/oauth/token');
    expect(options?.method).toBe('POST');
    expect(options?.redirect).toBe('error');
    const body = new URLSearchParams(String(options?.body));
    expect(body.get('code')).toBe('code-123');
    expect(body.get('code_verifier')).toBe('verifier-123');
    expect(body.get('redirect_uri')).toBe(config.redirectUri);
    expect(body.get('forceGenYn')).toBe('Y');
    await expect(
      exchangeNeoidCode(config, 'code-123', 'verifier-123', fetcher)
    ).rejects.toThrow('Invalid NEOID token response');
  });

  it('uses the stable sub and accepts only an email-shaped verified identity', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          sub: 'stable-neoid-id',
          id: 'alice@example.com',
          name: 'Alice',
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          sub: 'stable-neoid-id',
          email: 'alice@example.com',
          email_verified: false,
        })
      );

    await expect(getNeoidIdentity(config, 'access', fetcher)).resolves.toEqual({
      sub: 'stable-neoid-id',
      email: 'alice@example.com',
      displayName: 'Alice',
    });
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer access' },
    });
    await expect(getNeoidIdentity(config, 'access', fetcher)).resolves.toEqual({
      sub: 'stable-neoid-id',
      email: null,
      displayName: null,
    });
  });

  it('rejects userinfo without a stable subject', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ id: 'alice@example.com' }));
    await expect(getNeoidIdentity(config, 'access', fetcher)).rejects.toThrow(
      'Invalid NEOID user info'
    );
  });

  it('enriches minimal userinfo via the optional NEOID resource API without replacing sub', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ sub: 'stable-sub' }))
      .mockResolvedValueOnce(
        Response.json({
          rtn_cd: 0,
          rtn_data: {
            NAME: 'Alice',
            id_no: 'different-resource-id',
            id: 'alice@example.com',
          },
        })
      );
    await expect(
      getNeoidIdentity(
        {
          ...config,
          resourceUrl: 'https://api.example.com',
          serviceId: 'service',
          serviceKey: 'service-key',
          consumerKey: 'consumer',
        },
        'access',
        fetcher
      )
    ).resolves.toEqual({
      sub: 'stable-sub',
      email: 'alice@example.com',
      displayName: 'Alice',
    });
    expect(fetcher.mock.calls[1]![0]).toBe(
      'https://api.example.com/v2/users/stable-sub/profile'
    );
    expect(fetcher.mock.calls[1]![1]?.headers).toMatchObject({
      'X-NEOID-access-token': 'access',
      'X-NEOID-service-id': 'service',
    });
    expect(fetcher.mock.calls[1]![1]?.redirect).toBe('error');
  });

  it('uses resource email when userinfo id is only a login name', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ sub: 'stable-sub', name: 'Alice', id: 'alice-login' })
      )
      .mockResolvedValueOnce(
        Response.json({
          rtn_cd: 0,
          rtn_data: { NAME: 'Alice', id: 'alice@example.com' },
        })
      );
    await expect(
      getNeoidIdentity(
        {
          ...config,
          resourceUrl: 'https://api.example.com',
          serviceId: 'service',
          serviceKey: 'service-key',
          consumerKey: 'consumer',
        },
        'access',
        fetcher
      )
    ).resolves.toMatchObject({ email: 'alice@example.com' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

const clientEnv = {
  NEOID_ENTERPRISE_URL: config.baseUrl,
  NEOID_CLIENT_ID: config.clientId,
  NEOID_CLIENT_SECRET: config.clientSecret,
  NEOID_REDIRECT_URI: config.redirectUri,
};
const resourceEnv = {
  NEOID_RESOURCE_URL: 'https://resource.example.com',
  NEOID_SERVICE_ID: 'service',
  NEOID_SERVICE_KEY: 'private-service-key',
  NEOID_CONSUMER_KEY: 'private-consumer-key',
};
const resourceConfig = {
  ...config,
  resourceUrl: resourceEnv.NEOID_RESOURCE_URL,
  serviceId: resourceEnv.NEOID_SERVICE_ID,
  serviceKey: resourceEnv.NEOID_SERVICE_KEY,
  consumerKey: resourceEnv.NEOID_CONSUMER_KEY,
};

describe('NEOID resource configuration', () => {
  it.each([
    'http://neoid-apis-dev.naver-innovation.net:5002',
    'http://neoid-apis-prod.naver-innovation.net:5002',
  ])('accepts the NEOID internal resource endpoint: %s', (resourceUrl) => {
    expect(
      getNeoidConfig({
        ...clientEnv,
        ...resourceEnv,
        NEOID_RESOURCE_URL: resourceUrl,
      })?.resourceUrl
    ).toBe(resourceUrl);
  });

  it.each([
    'http://resource.example.com:5002',
    'http://neoid-apis-dev.naver-innovation.net:5003',
    'http://neoid-apis-dev.naver-innovation.net.evil.example:5002',
    'http://neoid-apis-dev.naver-innovation.net:5002/other',
    'not-a-url',
    'https://user:private-password@resource.example.com',
  ])('rejects an unsafe or invalid resource URL: %s', (resourceUrl) => {
    expect(() =>
      getNeoidConfig({
        ...clientEnv,
        ...resourceEnv,
        NEOID_RESOURCE_URL: resourceUrl,
      })
    ).toThrow('NEOID_RESOURCE_URL must use HTTPS or an approved NEOID HTTP endpoint');
  });

  it.each(
    Object.keys(resourceEnv)
  )('rejects resource configuration missing %s', (key) => {
    expect(() =>
      getNeoidConfig({
        ...clientEnv,
        ...resourceEnv,
        [key]: '  ',
      })
    ).toThrow('NEOID resource configuration requires');
  });

  it('keeps a complete resource configuration', () => {
    expect(getNeoidConfig({ ...clientEnv, ...resourceEnv })).toEqual(
      resourceConfig
    );
  });

  it('does not include credential values in configuration errors', () => {
    try {
      getNeoidConfig({
        ...clientEnv,
        ...resourceEnv,
        NEOID_RESOURCE_URL: 'http://resource.example.com',
      });
      expect.fail('Expected invalid resource configuration to throw');
    } catch (error) {
      expect(error).toMatchObject({ code: 'NEOID_CONFIG_INVALID' });
      expect(String(error)).not.toContain('private-service-key');
      expect(String(error)).not.toContain('private-consumer-key');
    }
  });
});

describe('NEOID email verification', () => {
  it.each([
    false,
    'false',
    'true',
    null,
    0,
    1,
    {},
    [],
  ])('rejects an explicitly non-true userinfo flag: %j', async (flag) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sub: 'stable-sub',
        name: 'Alice',
        email: 'alice@example.com',
        email_verified: flag,
      })
    );
    await expect(
      getNeoidIdentity(config, 'access', fetcher)
    ).resolves.toMatchObject({
      sub: 'stable-sub',
      email: null,
    });
  });

  it.each([
    false,
    'false',
    'true',
    null,
    0,
    1,
    {},
    [],
  ])('rejects an explicitly non-true resource flag: %j', async (flag) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ sub: 'stable-sub' }))
      .mockResolvedValueOnce(
        Response.json({
          rtn_cd: 0,
          rtn_data: {
            id: 'alice@example.com',
            NAME: 'Alice',
            email_verified: flag,
          },
        })
      );
    await expect(
      getNeoidIdentity(resourceConfig, 'access', fetcher)
    ).resolves.toMatchObject({
      sub: 'stable-sub',
      email: null,
    });
  });

  it('accepts a boolean verified userinfo email and normalizes it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sub: 'stable-sub',
        email: ' Alice@Example.com ',
        email_verified: true,
      })
    );
    await expect(
      getNeoidIdentity(config, 'access', fetcher)
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('accepts a boolean verified resource email', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ sub: 'stable-sub' }))
      .mockResolvedValueOnce(
        Response.json({
          rtn_cd: 0,
          rtn_data: {
            id: 'alice@example.com',
            email_verified: true,
          },
        })
      );
    await expect(
      getNeoidIdentity(resourceConfig, 'access', fetcher)
    ).resolves.toMatchObject({ email: 'alice@example.com' });
  });

  it('does not bypass an explicit userinfo rejection through the resource fallback', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ sub: 'stable-sub', email_verified: false })
      )
      .mockResolvedValueOnce(
        Response.json({
          rtn_cd: 0,
          rtn_data: {
            id: 'alice@example.com',
            email_verified: true,
          },
        })
      );
    await expect(
      getNeoidIdentity(resourceConfig, 'access', fetcher)
    ).resolves.toMatchObject({ email: null });
  });
});

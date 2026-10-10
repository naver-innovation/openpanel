import { createHash } from 'node:crypto';

export interface NeoidConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  resourceUrl?: string;
  serviceId?: string;
  serviceKey?: string;
  consumerKey?: string;
}

export interface NeoidIdentity {
  sub: string;
  email: string | null;
  displayName: string | null;
}

export class NeoidConfigError extends Error {
  readonly code = 'NEOID_CONFIG_INVALID';
}

function allowsEmail(profile: Record<string, unknown>): boolean {
  // A missing flag still requires a trusted email contract with the provider.
  return !('email_verified' in profile) || profile.email_verified === true;
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const email = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email.toLowerCase() : null;
}

export function getNeoidConfig(
  env: Record<string, string | undefined> = process.env
): NeoidConfig | null {
  const baseUrl = env.NEOID_ENTERPRISE_URL?.trim().replace(/\/$/, '');
  const clientId = env.NEOID_CLIENT_ID?.trim();
  const clientSecret = env.NEOID_CLIENT_SECRET?.trim();
  const redirectUri = env.NEOID_REDIRECT_URI?.trim();
  if (!(baseUrl && clientId && clientSecret && redirectUri)) {
    return null;
  }
  try {
    const issuer = new URL(baseUrl);
    const callback = new URL(redirectUri);
    if (
      issuer.protocol !== 'https:' ||
      (callback.protocol !== 'https:' &&
        !(callback.protocol === 'http:' && callback.hostname === 'localhost'))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  const config: NeoidConfig = {
    baseUrl,
    clientId,
    clientSecret,
    redirectUri,
    scope: env.NEOID_SCOPE?.trim() || 'openid',
  };
  const resourceUrl = env.NEOID_RESOURCE_URL?.trim().replace(/\/$/, '');
  const serviceId = env.NEOID_SERVICE_ID?.trim();
  const serviceKey = env.NEOID_SERVICE_KEY?.trim();
  const consumerKey = env.NEOID_CONSUMER_KEY?.trim();
  if (resourceUrl || serviceId || serviceKey || consumerKey) {
    if (!(resourceUrl && serviceId && serviceKey && consumerKey)) {
      throw new NeoidConfigError(
        'NEOID resource configuration requires NEOID_RESOURCE_URL, NEOID_SERVICE_ID, NEOID_SERVICE_KEY and NEOID_CONSUMER_KEY'
      );
    }
    let resource: URL;
    try {
      resource = new URL(resourceUrl);
    } catch {
      throw new NeoidConfigError(
        'NEOID_RESOURCE_URL must use HTTPS or an approved NEOID HTTP endpoint'
      );
    }
    const approvedHttpEndpoint =
      resource.protocol === 'http:' &&
      resource.port === '5002' &&
      resource.pathname === '/' &&
      !resource.search &&
      !resource.hash &&
      [
        'neoid-apis-dev.naver-innovation.net',
        'neoid-apis-prod.naver-innovation.net',
      ].includes(resource.hostname);
    if (
      (resource.protocol !== 'https:' && !approvedHttpEndpoint) ||
      resource.username ||
      resource.password
    ) {
      throw new NeoidConfigError(
        'NEOID_RESOURCE_URL must use HTTPS or an approved NEOID HTTP endpoint'
      );
    }
    Object.assign(config, { resourceUrl, serviceId, serviceKey, consumerKey });
  }
  return config;
}

export function createNeoidAuthorizationUrl(
  config: NeoidConfig,
  state: string,
  codeVerifier: string
): URL {
  const url = new URL(`${config.baseUrl}/oauth/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set(
    'code_challenge',
    createHash('sha256').update(codeVerifier).digest('base64url')
  );
  return url;
}

export async function exchangeNeoidCode(
  config: NeoidConfig,
  code: string,
  codeVerifier: string,
  fetcher: typeof fetch = fetch
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: codeVerifier,
    forceGenYn: 'Y',
  });
  const response = await fetcher(`${config.baseUrl}/api/v1/oauth/token`, {
    method: 'POST',
    redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    throw new Error('NEOID token exchange failed');
  }
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('access_token' in data) ||
    typeof data.access_token !== 'string' ||
    !data.access_token
  ) {
    throw new Error('Invalid NEOID token response');
  }
  return data.access_token;
}

export async function getNeoidIdentity(
  config: NeoidConfig,
  accessToken: string,
  fetcher: typeof fetch = fetch
): Promise<NeoidIdentity> {
  const response = await fetcher(
    `${config.baseUrl}/api/v1/oauth/openid/userinfo`,
    {
      redirect: 'error',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!response.ok) {
    throw new Error('NEOID user info request failed');
  }
  const data: unknown = await response.json();
  if (
    !data ||
    typeof data !== 'object' ||
    !('sub' in data) ||
    typeof data.sub !== 'string' ||
    !data.sub.trim()
  ) {
    throw new Error('Invalid NEOID user info');
  }
  const profile = data as Record<string, unknown>;
  let resourceProfile: Record<string, unknown> | null = null;
  if (
    config.resourceUrl &&
    config.serviceId &&
    config.serviceKey &&
    config.consumerKey &&
    !(
      profile.name &&
      (normalizeEmail(profile.email) || normalizeEmail(profile.id))
    )
  ) {
    try {
      const resourceResponse = await fetcher(
        `${config.resourceUrl}/v2/users/${encodeURIComponent(data.sub)}/profile`,
        {
          redirect: 'error',
          headers: {
            'X-NEOID-service-id': config.serviceId,
            'X-NEOID-service-key': config.serviceKey,
            'X-NEOID-consumer-key': config.consumerKey,
            'X-NEOID-access-token': accessToken,
          },
        }
      );
      if (resourceResponse.ok) {
        const resourceData: unknown = await resourceResponse.json();
        if (
          resourceData &&
          typeof resourceData === 'object' &&
          'rtn_cd' in resourceData &&
          resourceData.rtn_cd === 0 &&
          'rtn_data' in resourceData &&
          resourceData.rtn_data &&
          typeof resourceData.rtn_data === 'object'
        ) {
          resourceProfile = resourceData.rtn_data as Record<string, unknown>;
        }
      }
    } catch {
      // A resource API failure must not prevent a previously bound user signing in.
    }
  }
  const email = allowsEmail(profile)
    ? normalizeEmail(profile.email) ||
      normalizeEmail(profile.id) ||
      (resourceProfile && allowsEmail(resourceProfile)
        ? normalizeEmail(resourceProfile.id)
        : null)
    : null;
  return {
    sub: data.sub,
    email,
    displayName:
      typeof profile.name === 'string'
        ? profile.name
        : typeof resourceProfile?.NAME === 'string'
          ? resourceProfile.NAME
          : null,
  };
}

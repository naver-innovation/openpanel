import {
  COOKIE_OPTIONS,
  createSession,
  exchangeNeoidCode,
  generateSessionToken,
  getNeoidConfig,
  getNeoidIdentity,
  isNeoidRegistrationAllowed,
  resolveNeoidUser,
  setLastAuthProviderCookie,
  setSessionTokenCookie,
} from '@openpanel/auth';
import { connectUserToOrganization, db } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

const callbackQuery = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

const accountStore = {
  findAccount: (sub: string) =>
    db.account.findFirst({
      where: { provider: 'neoid', providerId: sub },
      select: { userId: true },
    }),
  findUserByEmail: (email: string) =>
    db.user.findUnique({ where: { email }, select: { id: true } }),
  createUserWithAccount: (identity: {
    sub: string;
    email: string | null;
    displayName: string | null;
  }) =>
    db.user.create({
      data: {
        email: identity.email!,
        firstName: identity.displayName,
        accounts: {
          create: {
            provider: 'neoid',
            providerId: identity.sub,
            email: identity.email,
          },
        },
      },
      select: { id: true },
    }),
  isUniqueConflict: (error: unknown) =>
    !!error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002',
};

const registrationStore = {
  countUsers: () => db.user.count(),
  findInvite: (id: string) =>
    db.invite.findUnique({ where: { id }, select: { expiresAt: true } }),
};

function dashboardUrl() {
  return process.env.DASHBOARD_URL || process.env.NEXT_PUBLIC_DASHBOARD_URL!;
}

function redirectWithError(reply: FastifyReply, error: unknown) {
  const url = new URL('/login', dashboardUrl());
  const code =
    error && typeof error === 'object' && 'code' in error ? error.code : null;
  const message =
    code === 'EMAIL_ALREADY_USED'
      ? 'Please sign in using your original authentication method'
      : code === 'EMAIL_REQUIRED'
        ? 'NEOID did not provide an email address. Contact an administrator.'
        : code === 'REGISTRATION_CLOSED'
          ? 'Registrations are not allowed'
          : 'NEOID sign-in failed';
  url.searchParams.set('error', message);
  url.searchParams.set('correlationId', reply.request.id);
  return reply.redirect(url.toString());
}

export async function neoidCallback(req: FastifyRequest, reply: FastifyReply) {
  const storedState = req.cookies.neoid_oauth_state;
  const codeVerifier = req.cookies.neoid_code_verifier;
  const inviteId = req.cookies.neoid_invite_id ?? null;
  reply.clearCookie('neoid_oauth_state', COOKIE_OPTIONS);
  reply.clearCookie('neoid_code_verifier', COOKIE_OPTIONS);
  reply.clearCookie('neoid_invite_id', COOKIE_OPTIONS);

  try {
    const query = callbackQuery.safeParse(req.query);
    if (
      !(query.success && storedState && codeVerifier) ||
      query.data.state !== storedState
    ) {
      throw new Error('Invalid NEOID callback state');
    }
    const config = getNeoidConfig();
    if (!config) {
      throw new Error('NEOID sign-in is not configured');
    }

    const accessToken = await exchangeNeoidCode(
      config,
      query.data.code,
      codeVerifier
    );
    const identity = await getNeoidIdentity(config, accessToken);
    const account = await resolveNeoidUser(
      identity,
      inviteId,
      accountStore,
      (id) => isNeoidRegistrationAllowed(id, process.env, registrationStore)
    );

    if (inviteId) {
      try {
        const user = await db.user.findUniqueOrThrow({
          where: { id: account.userId },
        });
        await connectUserToOrganization({ user, inviteId });
      } catch (error) {
        req.log.error(
          {
            provider: 'neoid',
            userId: account.userId,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          },
          'Failed to consume NEOID invitation'
        );
      }
    }

    const sessionToken = generateSessionToken();
    const session = await createSession(sessionToken, account.userId);
    setSessionTokenCookie(
      (...args) => reply.setCookie(...args),
      sessionToken,
      session.expiresAt
    );
    setLastAuthProviderCookie((...args) => reply.setCookie(...args), 'neoid');
    return reply.redirect(dashboardUrl());
  } catch (error) {
    req.log.error(
      {
        provider: 'neoid',
        errorCode:
          error && typeof error === 'object' && 'code' in error
            ? error.code
            : 'OAUTH_CALLBACK_FAILED',
      },
      'NEOID sign-in failed'
    );
    return redirectWithError(reply, error);
  }
}

import type { NeoidIdentity } from './neoid';

export class NeoidAccountError extends Error {
  constructor(
    public code: 'EMAIL_ALREADY_USED' | 'EMAIL_REQUIRED' | 'REGISTRATION_CLOSED'
  ) {
    super(code);
  }
}

interface AccountStore {
  findAccount(sub: string): Promise<{ userId: string } | null>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  createUserWithAccount(identity: NeoidIdentity): Promise<{ id: string }>;
  isUniqueConflict(error: unknown): boolean;
}

interface RegistrationStore {
  countUsers(): Promise<number>;
  findInvite(id: string): Promise<{ expiresAt: Date } | null>;
}

export async function resolveNeoidUser(
  identity: NeoidIdentity,
  inviteId: string | null,
  store: AccountStore,
  registrationAllowed: (inviteId: string | null) => Promise<boolean>
): Promise<{ userId: string; isNew: boolean }> {
  const account = await store.findAccount(identity.sub);
  if (account) {
    return { userId: account.userId, isNew: false };
  }

  if (!identity.email) {
    throw new NeoidAccountError('EMAIL_REQUIRED');
  }
  const existingUser = await store.findUserByEmail(identity.email);
  if (existingUser) {
    throw new NeoidAccountError('EMAIL_ALREADY_USED');
  }
  if (!(await registrationAllowed(inviteId))) {
    throw new NeoidAccountError('REGISTRATION_CLOSED');
  }

  try {
    const user = await store.createUserWithAccount(identity);
    return { userId: user.id, isNew: true };
  } catch (error) {
    if (!store.isUniqueConflict(error)) {
      throw error;
    }
    const winner = await store.findAccount(identity.sub);
    if (winner) {
      return { userId: winner.userId, isNew: false };
    }
    if (await store.findUserByEmail(identity.email)) {
      throw new NeoidAccountError('EMAIL_ALREADY_USED');
    }
    throw error;
  }
}

export async function isNeoidRegistrationAllowed(
  inviteId: string | null,
  env: Record<string, string | undefined>,
  store: RegistrationStore
): Promise<boolean> {
  if (env.ALLOW_REGISTRATION === undefined) {
    return true;
  }
  if ((await store.countUsers()) === 0) {
    return true;
  }
  if (inviteId) {
    if (env.ALLOW_INVITATION === 'false') {
      return false;
    }
    const invite = await store.findInvite(inviteId);
    return !!invite && invite.expiresAt.getTime() > Date.now();
  }
  return env.ALLOW_REGISTRATION !== 'false';
}

import { describe, expect, it, vi } from 'vitest';
import { isNeoidRegistrationAllowed, resolveNeoidUser } from './neoid-account';

const identity = {
  sub: 'neoid-123',
  email: 'alice@example.com',
  displayName: 'Alice Example',
};

function store() {
  return {
    findAccount: vi.fn().mockResolvedValue(null),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    createUserWithAccount: vi.fn().mockResolvedValue({ id: 'new-user' }),
    isUniqueConflict: vi.fn().mockReturnValue(false),
  };
}

describe('NEOID account decision', () => {
  it('allows an existing binding to log in even without email or open registration', async () => {
    const db = store();
    db.findAccount.mockResolvedValue({ userId: 'existing-user' });
    const allowed = vi.fn().mockResolvedValue(false);
    await expect(
      resolveNeoidUser({ ...identity, email: null }, null, db, allowed)
    ).resolves.toEqual({ userId: 'existing-user', isNew: false });
    expect(allowed).not.toHaveBeenCalled();
    expect(db.createUserWithAccount).not.toHaveBeenCalled();
  });

  it('creates a local user and NEOID binding when registration is permitted', async () => {
    const db = store();
    const allowed = vi.fn().mockResolvedValue(true);
    await expect(
      resolveNeoidUser(identity, 'invite-1', db, allowed)
    ).resolves.toEqual({
      userId: 'new-user',
      isNew: true,
    });
    expect(allowed).toHaveBeenCalledWith('invite-1');
    expect(db.createUserWithAccount).toHaveBeenCalledWith(identity);
  });

  it('never auto-merges a new NEOID identity into a same-email user', async () => {
    const db = store();
    db.findUserByEmail.mockResolvedValue({ id: 'email-user' });
    await expect(
      resolveNeoidUser(identity, null, db, async () => true)
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
    expect(db.createUserWithAccount).not.toHaveBeenCalled();
  });

  it('refuses first sign-in without a usable email or registration permission', async () => {
    const db = store();
    await expect(
      resolveNeoidUser({ ...identity, email: null }, null, db, async () => true)
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED' });
    await expect(
      resolveNeoidUser(identity, null, db, async () => false)
    ).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
    expect(db.createUserWithAccount).not.toHaveBeenCalled();
  });

  it('re-reads the binding after a concurrent unique-key conflict', async () => {
    const db = store();
    db.createUserWithAccount.mockRejectedValue(new Error('unique'));
    db.isUniqueConflict.mockReturnValue(true);
    db.findAccount
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ userId: 'winner' });
    await expect(
      resolveNeoidUser(identity, null, db, async () => true)
    ).resolves.toEqual({ userId: 'winner', isNew: false });
  });
});

describe('NEOID registration policy', () => {
  it('keeps cloud registration open and permits the first self-hosted user', async () => {
    const countUsers = vi.fn().mockResolvedValue(0);
    const findInvite = vi.fn();
    await expect(
      isNeoidRegistrationAllowed(null, {}, { countUsers, findInvite })
    ).resolves.toBe(true);
    await expect(
      isNeoidRegistrationAllowed(
        null,
        { ALLOW_REGISTRATION: 'false' },
        { countUsers, findInvite }
      )
    ).resolves.toBe(true);
  });

  it('requires an unexpired invitation when self-hosted registration is closed', async () => {
    const countUsers = vi.fn().mockResolvedValue(2);
    const findInvite = vi
      .fn()
      .mockResolvedValueOnce({ expiresAt: new Date(Date.now() + 60_000) })
      .mockResolvedValueOnce({ expiresAt: new Date(Date.now() - 60_000) });
    const env = { ALLOW_REGISTRATION: 'false' };
    await expect(
      isNeoidRegistrationAllowed('invite-1', env, { countUsers, findInvite })
    ).resolves.toBe(true);
    await expect(
      isNeoidRegistrationAllowed('invite-1', env, { countUsers, findInvite })
    ).resolves.toBe(false);
    await expect(
      isNeoidRegistrationAllowed(null, env, { countUsers, findInvite })
    ).resolves.toBe(false);
  });

  it('respects disabled invitations', async () => {
    await expect(
      isNeoidRegistrationAllowed(
        'invite-1',
        { ALLOW_REGISTRATION: 'false', ALLOW_INVITATION: 'false' },
        {
          countUsers: async () => 2,
          findInvite: vi.fn(),
        }
      )
    ).resolves.toBe(false);
  });
});

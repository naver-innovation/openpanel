import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { requestLoggingHook } from './request-logging.hook';

describe('OAuth request logging', () => {
  it('omits the authorization code and state from NEOID callback logs', async () => {
    const info = vi.fn();
    const request = {
      method: 'GET',
      url: '/oauth/neoid/callback?code=private-code&state=private-state',
      headers: {},
      log: { info },
    } as unknown as FastifyRequest;
    const reply = { elapsedTime: 12 } as FastifyReply;

    await requestLoggingHook(request, reply);

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/oauth/neoid/callback' }),
      'request done'
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain('private-code');
    expect(JSON.stringify(info.mock.calls)).not.toContain('private-state');
  });
});

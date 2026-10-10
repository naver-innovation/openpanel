import {
  Arctic,
  createNeoidAuthorizationUrl,
  getNeoidConfig,
} from '@openpanel/auth';
import { z } from 'zod';
import { TRPCAccessError } from '../errors';
import { createTRPCRouter, publicProcedureWithoutLogging } from '../trpc';

export const neoidAuthRouter = createTRPCRouter({
  start: publicProcedureWithoutLogging
    .input(z.object({ inviteId: z.string().nullish() }))
    .mutation(({ input, ctx }) => {
      const config = getNeoidConfig();
      if (!config) {
        throw new TRPCAccessError('NEOID sign-in is not configured');
      }

      const state = Arctic.generateState();
      const codeVerifier = Arctic.generateCodeVerifier();
      ctx.setCookie('neoid_oauth_state', state, { maxAge: 600 });
      ctx.setCookie('neoid_code_verifier', codeVerifier, { maxAge: 600 });
      if (input.inviteId) {
        ctx.setCookie('neoid_invite_id', input.inviteId, { maxAge: 600 });
      } else {
        ctx.setCookie('neoid_invite_id', '', { maxAge: 0 });
      }

      return {
        url: createNeoidAuthorizationUrl(
          config,
          state,
          codeVerifier
        ).toString(),
      };
    }),
});

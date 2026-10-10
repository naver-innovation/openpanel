import type { FastifyPluginCallback } from 'fastify';
import { neoidCallback } from '@/controllers/neoid-callback.controller';
import * as controller from '@/controllers/oauth-callback.controller';

const router: FastifyPluginCallback = async (fastify) => {
  fastify.route({
    method: 'GET',
    url: '/github/callback',
    handler: controller.githubCallback,
  });
  fastify.route({
    method: 'GET',
    url: '/google/callback',
    handler: controller.googleCallback,
  });
  fastify.route({
    method: 'GET',
    url: '/neoid/callback',
    handler: neoidCallback,
  });
};

export default router;

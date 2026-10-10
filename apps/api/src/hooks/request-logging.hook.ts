import type { FastifyReply, FastifyRequest } from 'fastify';
import { path, pick } from 'ramda';

const ignoreLog = ['/healthcheck', '/healthz', '/metrics', '/misc'];
const ignoreMethods = ['OPTIONS'];

export function isNeoidCallbackRequest(url: string) {
  return url.split('?')[0] === '/oauth/neoid/callback';
}

export function isNeoidAuthRequest(url: string) {
  const pathname = url.split('?')[0] ?? '';
  return (
    isNeoidCallbackRequest(url) ||
    (pathname.startsWith('/trpc/') &&
      pathname.slice('/trpc/'.length).split(',').includes('neoidAuth.start'))
  );
}

const getTrpcInput = (
  request: FastifyRequest
): Record<string, unknown> | undefined => {
  const input = path<any>(['query', 'input'], request);
  try {
    return typeof input === 'string' ? JSON.parse(input).json : input;
  } catch {
    return undefined;
  }
};

export async function requestLoggingHook(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (ignoreMethods.includes(request.method)) {
    return;
  }
  if (ignoreLog.some((path) => request.url.startsWith(path))) {
    return;
  }
  if (request.url.includes('trpc')) {
    request.log.info(
      {
        url: request.url.split('?')[0],
        method: request.method,
        input: isNeoidAuthRequest(request.url)
          ? undefined
          : getTrpcInput(request),
        elapsed: reply.elapsedTime,
      },
      'request done'
    );
  } else {
    const payload: {
      url: string;
      method: string;
      elapsed: number;
      headers: Record<string, string | string[] | undefined>;
      body?: unknown;
    } = {
      url: isNeoidCallbackRequest(request.url)
        ? '/oauth/neoid/callback'
        : request.url,
      method: request.method,
      elapsed: reply.elapsedTime,
      headers: pick(
        ['openpanel-client-id', 'openpanel-sdk-name', 'openpanel-sdk-version'],
        request.headers
      ),
    };

    if (payload.url.startsWith('/track')) {
      payload.body = request.body;
    }

    request.log.info(payload, 'request done');
  }
}

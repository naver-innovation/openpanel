import * as HyperDX from '@hyperdx/node-opentelemetry';
import { DateTime } from 'luxon';
import pino, {
  type Bindings,
  type ChildLoggerOptions,
  type Logger,
} from 'pino';

export type ILogger = Logger;

const logLevel = process.env.LOG_LEVEL ?? 'info';
const silent = process.env.LOG_SILENT === 'true';
const LOG_TZ = process.env.LOG_TZ ?? process.env.TZ ?? 'UTC';
const REQUEST_ID_LOG_FIELD = 'reqId';

// Substring match (lowercased). Catches camelCase, snake_case, prefixed and
// suffixed variants in one entry - e.g. 'token' covers accessToken,
// refresh_token, jwtToken, etc.
const SENSITIVE_KEY_PATTERNS = [
  'password',
  'passwd',
  'pwd',
  'token',
  'secret',
  'authorization',
  'apikey',
  'accesskey',
  'privatekey',
  'cookie',
  'bearer',
  'credential',
  'salt',
  'signature',
  'ip',
  'email',
  'firstname',
  'lastname',
  'surname',
];

const MAX_REDACT_DEPTH = 5;

function getLogTimestamp() {
  const timestamp = DateTime.now().setZone(LOG_TZ);
  return (timestamp.isValid ? timestamp : DateTime.utc()).toFormat(
    'yyyy-MM-dd HH:mm:ss.SSSZZ',
  );
}

function redactSensitive(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return {
      ...value,
      message: value.message,
      stack: value.stack,
      name: value.name,
    };
  }
  if (
    depth >= MAX_REDACT_DEPTH ||
    value === null ||
    typeof value !== 'object'
  ) {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redactSensitive(v, depth + 1));
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const lowered = key.toLowerCase();
    if (SENSITIVE_KEY_PATTERNS.some((k) => lowered.includes(k))) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSensitive(val, depth + 1);
    }
  }
  return result;
}

interface CreateLoggerOptions {
  name: string;
  /** Re-label top-level Pino request correlation ids for opted-in services. */
  reqIdAlias?: string;
}

function aliasReqIdField(value: unknown, reqIdAlias?: string): unknown {
  if (
    !reqIdAlias ||
    value instanceof Error ||
    value instanceof Date ||
    Array.isArray(value) ||
    value === null ||
    typeof value !== 'object'
  ) {
    return value;
  }

  const record = value as Record<string, unknown>;
  if (!Object.hasOwn(record, REQUEST_ID_LOG_FIELD)) {
    return value;
  }

  const { [REQUEST_ID_LOG_FIELD]: reqId, ...result } = record;
  if (!Object.hasOwn(result, reqIdAlias)) {
    result[reqIdAlias] = reqId;
  }
  return result;
}

function aliasLoggerChild<CustomLevels extends string = never>(
  logger: Logger<CustomLevels>,
  reqIdAlias: string
): Logger<CustomLevels> {
  const child = logger.child.bind(logger);
  logger.child = (<ChildCustomLevels extends string = never>(
    bindings: Bindings,
    options?: ChildLoggerOptions<ChildCustomLevels>
  ) => {
    const childLogger = child<ChildCustomLevels>(
      aliasReqIdField(bindings, reqIdAlias) as Bindings,
      options
    );
    return aliasLoggerChild(childLogger, reqIdAlias);
  }) as Logger<CustomLevels>['child'];
  return logger;
}

export function createLogger({
  name,
  reqIdAlias,
}: CreateLoggerOptions): ILogger {
  const service = [process.env.LOG_PREFIX, name, process.env.NODE_ENV ?? 'dev']
    .filter(Boolean)
    .join('-');

  const useHyperDX = !!process.env.HYPERDX_API_KEY;
  const usePretty = !useHyperDX && process.env.NODE_ENV !== 'production';

  const logger = pino({
    name: service,
    level: logLevel,
    enabled: !silent,
    timestamp: () => `,"time":"${getLogTimestamp()}"`,
    formatters: {
      log: (obj) => {
        return redactSensitive(aliasReqIdField(obj, reqIdAlias)) as Record<
          string,
          unknown
        >;
      },
    },
    mixin: useHyperDX ? HyperDX.getPinoMixinFunction : undefined,
    transport: useHyperDX
      ? HyperDX.getPinoTransport(logLevel, {
          detectResources: true,
          service,
        })
      : usePretty
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: false,
              ignore: 'pid,hostname,service',
            },
          }
        : undefined,
  });

  return reqIdAlias ? aliasLoggerChild(logger, reqIdAlias) : logger;
}

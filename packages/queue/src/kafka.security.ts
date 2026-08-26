import { createLogger } from '@openpanel/logger';
import type { KafkaConfig } from 'kafkajs';

const kafkaSecurityLogger = createLogger({ name: 'kafka' });

const KAFKA_SASL_MECHANISMS = [
  'plain',
  'scram-sha-256',
  'scram-sha-512',
] as const;
type KafkaSaslMechanism = (typeof KAFKA_SASL_MECHANISMS)[number];

export const getKafkaSecurityConfig = (): Pick<KafkaConfig, 'ssl' | 'sasl'> => {
  const username = process.env.KAFKA_SASL_USERNAME;
  const password = process.env.KAFKA_SASL_PASSWORD;

  if (!username && !password) {
    return {};
  }
  if (!username || !password) {
    kafkaSecurityLogger.warn(
      'KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD must be set together; connecting without SASL'
    );
    return {};
  }

  const mechanism = process.env.KAFKA_SASL_MECHANISM || 'scram-sha-512';
  if (!KAFKA_SASL_MECHANISMS.includes(mechanism as KafkaSaslMechanism)) {
    throw new Error(
      `Unsupported KAFKA_SASL_MECHANISM: ${mechanism}. Supported values: ${KAFKA_SASL_MECHANISMS.join(', ')}`
    );
  }

  return {
    ssl: true,
    sasl: {
      mechanism: mechanism as KafkaSaslMechanism,
      username,
      password,
    },
  };
};

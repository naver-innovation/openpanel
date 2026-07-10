import { createLogger } from '@openpanel/logger';

export const logger = createLogger({
  name: 'api',
  reqIdAlias: '__wasl_op_trace_id',
});

import { createLogger } from '@openpanel/logger';

export const logger = createLogger({
  name: 'worker',
  reqIdAlias: '__wasl_op_trace_id',
});

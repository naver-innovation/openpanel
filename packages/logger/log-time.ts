import { DateTime } from 'luxon';

const LOG_TZ = process.env.LOG_TZ ?? process.env.TZ ?? 'UTC';

export function getLogTimestamp() {
  const timestamp = DateTime.now().setZone(LOG_TZ);
  return (timestamp.isValid ? timestamp : DateTime.utc()).toFormat(
    'yyyy-MM-dd HH:mm:ss.SSSZZ'
  );
}

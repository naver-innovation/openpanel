import { DateTime, TIMEZONES } from '@openpanel/common';

/**
 * Resolve the default timezone from the environment variable.
 * Falls back to 'UTC' if unset or invalid (with a warning).
 */
export function getDefaultTimezone(): string {
  const tz = process.env.DEFAULT_TIMEZONE;
  if (!tz) return 'UTC';
  if (
    DateTime.now().setZone(tz).isValid &&
    TIMEZONES.includes(tz)
  ) {
    return tz;
  }
  console.warn('Invalid DEFAULT_TIMEZONE "' + tz + '", falling back to UTC');
  return 'UTC';
}

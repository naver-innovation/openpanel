import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

async function importTimezone() {
  const mod = await import('./organization.timezone');
  return mod.getDefaultTimezone;
}

describe('getDefaultTimezone', () => {
  it('returns UTC when DEFAULT_TIMEZONE is not set', async () => {
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('UTC');
  });

  it('returns UTC when DEFAULT_TIMEZONE is empty string', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', '');
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('UTC');
  });

  it('returns the env value when valid', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Asia/Riyadh');
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('Asia/Riyadh');
  });

  it('returns UTC and warns when DEFAULT_TIMEZONE is invalid', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('DEFAULT_TIMEZONE', 'Asia/Ryiadh');
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('UTC');
    expect(warnSpy).toHaveBeenCalledWith(
      'Invalid DEFAULT_TIMEZONE "Asia/Ryiadh", falling back to UTC'
    );
  });

  it('returns UTC and warns for other invalid values', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('DEFAULT_TIMEZONE', 'Foo/Bar');
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('UTC');
    expect(warnSpy).toHaveBeenCalledWith(
      'Invalid DEFAULT_TIMEZONE "Foo/Bar", falling back to UTC'
    );
  });

  it('returns UTC and warns when DEFAULT_TIMEZONE is a Luxon-only zone like "local"', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('DEFAULT_TIMEZONE', 'local');
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('UTC');
    expect(warnSpy).toHaveBeenCalledWith(
      'Invalid DEFAULT_TIMEZONE "local", falling back to UTC'
    );
  });

  it('returns UTC and warns when DEFAULT_TIMEZONE is a fixed-offset Luxon-only zone like "UTC+3"', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubEnv('DEFAULT_TIMEZONE', 'UTC+3');
    const getDefaultTimezone = await importTimezone();
    expect(getDefaultTimezone()).toBe('UTC');
    expect(warnSpy).toHaveBeenCalledWith(
      'Invalid DEFAULT_TIMEZONE "UTC+3", falling back to UTC'
    );
  });
});

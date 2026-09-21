import { beforeEach, describe, expect, it, vi } from 'vitest';

import { db } from '../prisma-client';

const { mockedOrganizationFindUniqueOrThrow, mockedProjectFindUniqueOrThrow } =
  vi.hoisted(() => ({
    mockedOrganizationFindUniqueOrThrow: vi.fn(),
    mockedProjectFindUniqueOrThrow: vi.fn(),
  }));

vi.mock('../prisma-client', () => ({
  db: {
    organization: {
      findUniqueOrThrow: mockedOrganizationFindUniqueOrThrow,
    },
    project: {
      findUniqueOrThrow: mockedProjectFindUniqueOrThrow,
    },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function importService() {
  const mod = await import('./organization.service');
  return {
    getSettingsForOrganization: mod.getSettingsForOrganization,
    getSettingsForProject: mod.getSettingsForProject,
  };
}

describe('getSettingsForOrganization', () => {
  it('returns the organization timezone when set', async () => {
    mockedOrganizationFindUniqueOrThrow.mockResolvedValue({
      id: 'org-1',
      timezone: 'America/New_York',
    } as unknown as Awaited<ReturnType<typeof db.organization.findUniqueOrThrow>>);

    const { getSettingsForOrganization } = await importService();
    const settings = await getSettingsForOrganization('org-1');
    expect(settings.timezone).toBe('America/New_York');
  });

  it('falls back to DEFAULT_TIMEZONE when organization timezone is not set', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Asia/Riyadh');

    mockedOrganizationFindUniqueOrThrow.mockResolvedValue({
      id: 'org-1',
      timezone: null,
    } as unknown as Awaited<ReturnType<typeof db.organization.findUniqueOrThrow>>);

    const { getSettingsForOrganization } = await importService();
    const settings = await getSettingsForOrganization('org-1');
    expect(settings.timezone).toBe('Asia/Riyadh');
  });
});

describe('getSettingsForProject', () => {
  it('returns the organization timezone when set', async () => {
    mockedProjectFindUniqueOrThrow.mockResolvedValue({
      id: 'proj-1',
      organization: {
        id: 'org-1',
        timezone: 'Europe/London',
      },
    } as unknown as Awaited<ReturnType<typeof db.project.findUniqueOrThrow>>);

    const { getSettingsForProject } = await importService();
    const settings = await getSettingsForProject('proj-1');
    expect(settings.timezone).toBe('Europe/London');
  });

  it('falls back to DEFAULT_TIMEZONE when organization timezone is not set', async () => {
    vi.stubEnv('DEFAULT_TIMEZONE', 'Asia/Riyadh');

    mockedProjectFindUniqueOrThrow.mockResolvedValue({
      id: 'proj-1',
      organization: {
        id: 'org-1',
        timezone: null,
      },
    } as unknown as Awaited<ReturnType<typeof db.project.findUniqueOrThrow>>);

    const { getSettingsForProject } = await importService();
    const settings = await getSettingsForProject('proj-1');
    expect(settings.timezone).toBe('Asia/Riyadh');
  });
});

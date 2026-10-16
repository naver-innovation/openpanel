import type { IChartBreakdown, IChartEvent } from '@openpanel/validation';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ch } from '../clickhouse/client';
import {
  getAggregateChartSql as _getAggregateChartSql,
  getChartSql as _getChartSql,
} from './chart.service';

const getChartSql: (input: any) => Promise<string> = _getChartSql as any;
const getAggregateChartSql: (input: any) => Promise<string> =
  _getAggregateChartSql as any;

const PROJECT_ID = 'test-device-segment';
const START = '2026-04-14 00:00:00';
const END = '2026-05-15 00:00:00';

const event = (overrides: Partial<IChartEvent> = {}): IChartEvent => ({
  id: 'A',
  name: 'screen_view',
  segment: 'device',
  filters: [],
  ...overrides,
});

const breakdown = (name: string): IChartBreakdown => ({ id: name, name });

let chReachable = false;

async function explain(sql: string): Promise<void> {
  await ch.command({ query: `EXPLAIN ${sql}` });
}

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await ch.command({ query: 'SELECT 1' });
    chReachable = true;
  } catch {
    chReachable = false;
  }
});

afterAll(() => {
  vi.restoreAllMocks();
});

const itCH = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!chReachable) {
      console.warn(
        '[chart-device-segment] skipping: ClickHouse not reachable at CLICKHOUSE_URL'
      );
      return;
    }
    await fn();
  });

describe('chart.service / device segment', () => {
  itCH(
    'uses device_id for time-series count and total_count without breakdowns',
    async () => {
      const sql = await getChartSql({
        event: event(),
        breakdowns: [],
        interval: 'day',
        startDate: START,
        endDate: END,
        projectId: PROJECT_ID,
        timezone: 'UTC',
      });

      expect(sql).toContain('countDistinct(device_id) as count');
      // Single-pass shape: the unique state is built from device_id for the
      // device segment, then merged into the range-wide total.
      expect(sql).toContain('uniqState(device_id) as _uc_state');
      expect(sql).not.toContain('uniqState(profile_id) as _uc_state');
      expect(sql).toContain('uniqMerge(_uc_state) OVER () as total_count');
      // Guard against the two-scan _uc CTE shape making a comeback.
      expect(sql).not.toContain('_uc AS (');
      expect(sql.match(/FROM events e/g)).toHaveLength(1);

      await explain(sql);
    }
  );

  itCH(
    'uses device_id for time-series total_count with breakdowns',
    async () => {
      const sql = await getChartSql({
        event: event(),
        breakdowns: [breakdown('country')],
        interval: 'day',
        startDate: START,
        endDate: END,
        projectId: PROJECT_ID,
        timezone: 'UTC',
      });

      expect(sql).toContain('countDistinct(device_id) as count');
      expect(sql).toContain('uniqState(device_id) as _uc_state');
      expect(sql).not.toContain('uniqState(profile_id) as _uc_state');
      expect(sql).toContain(
        'uniqMerge(_uc_state) OVER (PARTITION BY label_1) as total_count',
      );
      expect(sql).not.toContain('_uc AS (');
      expect(sql).not.toContain('LEFT ANY JOIN _uc');
      expect(sql.match(/FROM events e/g)).toHaveLength(1);

      await explain(sql);
    }
  );


  itCH('uses device_id for aggregate count with breakdown', async () => {
    const sql = await getAggregateChartSql({
      event: event(),
      breakdowns: [breakdown('country')],
      startDate: START,
      endDate: END,
      projectId: PROJECT_ID,
      timezone: 'UTC',
    });

    expect(sql).toContain('countDistinct(device_id) as count');

    await explain(sql);
  });
});

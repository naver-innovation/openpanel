import fs from 'node:fs';
import path from 'node:path';
import { TABLE_NAMES } from '../src/clickhouse/client';
import { runClickhouseMigrationCommands } from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

export async function up() {
  const isClustered = getIsCluster();
  const materializedView = isClustered
    ? `${TABLE_NAMES.event_property_values_mv}_replicated`
    : TABLE_NAMES.event_property_values_mv;
  const eventsTable = isClustered ? 'events_replicated' : 'events';
  const onCluster = isClustered ? " ON CLUSTER '{cluster}'" : '';

  const sqls = [
    `ALTER TABLE ${materializedView}${onCluster}
MODIFY QUERY
SELECT
  project_id,
  name,
  property_key,
  property_value,
  max(created_at) AS created_at
FROM ${eventsTable}
ARRAY JOIN mapKeys(properties) AS property_key, mapValues(properties) AS property_value
WHERE property_value != ''
  AND property_key != ''
  AND property_key NOT IN ('__duration_from', '__properties_from')
GROUP BY project_id, name, property_key, property_value`,
  ];

  fs.writeFileSync(
    path.join(import.meta.filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';')
      )
      .join('\n\n---\n\n')
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}

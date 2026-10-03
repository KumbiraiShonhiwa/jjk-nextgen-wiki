/**
 * Content ingest CLI (docs/03). Run with `pnpm ingest` / `pnpm ingest:offline`.
 *
 *   --offline            read only from .cache/raw (and --fixtures); error on a miss
 *   --fixtures=<dir>     recorded API responses to answer offline requests
 *   --only=a,b           entity types: characters,techniques,domains,arcs,organizations,locations
 *   --limit=N            at most N pages per entity type
 *   --dry-run            map and validate, write only the report
 *   --force              re-map pages whose revision is unchanged
 *   --content-dir=<dir>  default: content
 *   --report-dir=<dir>   default: reports
 *   --cache-dir=<dir>    default: .cache/raw
 */
import { parseArgs } from 'node:util';
import { counts } from './report.ts';
import { runIngest } from './run.ts';
import { ENTITY_TYPES, type EntityType } from './slugs.ts';

const USAGE = `Usage: pnpm ingest [--offline] [--fixtures=dir] [--only=characters,...] [--limit=N] [--dry-run] [--force]
                   [--content-dir=content] [--report-dir=reports] [--cache-dir=.cache/raw]`;

export async function main(argv: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        offline: { type: 'boolean', default: false },
        fixtures: { type: 'string' },
        only: { type: 'string' },
        limit: { type: 'string' },
        'dry-run': { type: 'boolean', default: false },
        force: { type: 'boolean', default: false },
        'content-dir': { type: 'string', default: 'content' },
        'report-dir': { type: 'string', default: 'reports' },
        'cache-dir': { type: 'string', default: '.cache/raw' },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    console.error(`${(err as Error).message}\n${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(USAGE);
    return 0;
  }

  const only = values.only ? values.only.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const bad = only.filter((t) => !(ENTITY_TYPES as readonly string[]).includes(t));
  if (bad.length) {
    console.error(`Unknown --only type(s): ${bad.join(', ')}. Expected: ${ENTITY_TYPES.join(', ')}`);
    return 2;
  }
  const limit = values.limit === undefined || values.limit === '' ? undefined : Number(values.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    console.error(`--limit must be a positive integer (got "${values.limit}")`);
    return 2;
  }

  const result = await runIngest({
    offline: values.offline,
    fixturesDir: values.fixtures,
    only: only as EntityType[],
    limit,
    dryRun: values['dry-run'],
    force: values.force,
    contentDir: values['content-dir'],
    reportDir: values['report-dir'],
    cacheDir: values['cache-dir'],
  });
  const c = counts(result.report);
  console.log(
    `ingest ${result.ok ? 'finished' : 'FAILED'}: ${c.created} created, ${c.updated} updated, ${c.unchanged} unchanged, ${c.failed} failed, ${c.skipped} skipped, ${result.report.edgesAdded.length} edges added`,
  );
  if (result.reportPath) console.log(`report: ${result.reportPath}`);
  if (result.report.fatal) console.error(result.report.fatal);
  return result.ok ? 0 : 1;
}

if (process.argv[1]?.endsWith('cli.ts')) {
  process.exitCode = await main(process.argv.slice(2));
}

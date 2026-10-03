import type { EntityType } from './slugs.ts';

export type RecordStatus = 'created' | 'updated' | 'unchanged' | 'failed' | 'skipped';

export interface RecordLine {
  type: EntityType | 'edges';
  slug?: string;
  title?: string;
  revision?: number;
  status: RecordStatus;
  reason?: string;
}

export interface Report {
  startedAt: string;
  finishedAt?: string;
  mode: string[];
  licence?: string;
  requests: number;
  cacheHits: number;
  warnings: string[];
  records: RecordLine[];
  /** "<infobox template> · <param>" → pages using it. */
  unmapped: Map<string, string[]>;
  unresolved: { type: EntityType; slug: string; field: string; name: string }[];
  edgesAdded: string[];
  fatal?: string;
}

export function newReport(startedAt: string, mode: string[]): Report {
  return { startedAt, mode, requests: 0, cacheHits: 0, warnings: [], records: [], unmapped: new Map(), unresolved: [], edgesAdded: [] };
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function counts(r: Report): Record<RecordStatus, number> {
  const c: Record<RecordStatus, number> = { created: 0, updated: 0, unchanged: 0, failed: 0, skipped: 0 };
  for (const l of r.records) c[l.status]++;
  return c;
}

export function renderReport(r: Report): string {
  const c = counts(r);
  const out: string[] = [];
  out.push(`# Content ingest ${r.startedAt.slice(0, 10)}`, '');
  out.push(`- Started: ${r.startedAt}`, `- Finished: ${r.finishedAt ?? '(aborted)'}`, `- Mode: ${r.mode.join(', ') || 'default'}`);
  if (r.licence) out.push(`- Licence (from siteinfo): ${r.licence}`);
  out.push(`- Network requests: ${r.requests} · cache hits: ${r.cacheHits}`, '');
  if (r.fatal) out.push('## Fatal error', '', '```', r.fatal, '```', '');
  out.push('## Summary', '', '| Created | Updated | Unchanged | Failed | Skipped | Edges added |', '| ---: | ---: | ---: | ---: | ---: | ---: |');
  out.push(`| ${c.created} | ${c.updated} | ${c.unchanged} | ${c.failed} | ${c.skipped} | ${r.edgesAdded.length} |`, '');

  if (r.warnings.length) {
    out.push('## Warnings', '');
    for (const w of r.warnings) out.push(`- ${w}`);
    out.push('');
  }

  for (const status of ['failed', 'created', 'updated', 'unchanged', 'skipped'] as RecordStatus[]) {
    const lines = r.records.filter((l) => l.status === status);
    if (!lines.length) continue;
    out.push(`## ${status[0].toUpperCase()}${status.slice(1)} (${lines.length})`, '');
    out.push('| Type | Slug | Source page | Revision | Note |', '| --- | --- | --- | ---: | --- |');
    for (const l of lines) out.push(`| ${l.type} | ${l.slug ?? ''} | ${esc(l.title ?? '')} | ${l.revision ?? ''} | ${esc(l.reason ?? '')} |`);
    out.push('');
  }

  if (r.edgesAdded.length) {
    out.push(`## Edges added (${r.edgesAdded.length})`, '');
    for (const id of r.edgesAdded) out.push(`- \`${id}\``);
    out.push('');
  }

  if (r.unresolved.length) {
    out.push(`## Unresolved references (dropped, ${r.unresolved.length})`, '');
    out.push('| Record | Field | Source name |', '| --- | --- | --- |');
    for (const u of r.unresolved) out.push(`| ${u.type}/${u.slug} | ${u.field} | ${esc(u.name)} |`);
    out.push('');
  }

  if (r.unmapped.size) {
    out.push(`## Unmapped infobox parameters (${r.unmapped.size})`, '', 'Parameters present on source pages that no mapper reads. Add a candidate name in `scripts/ingest/map/common.ts` (or a schema field) to use one.', '');
    out.push('| Template · param | Pages | Examples |', '| --- | ---: | --- |');
    const rows = [...r.unmapped].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    for (const [k, pages] of rows) out.push(`| ${esc(k)} | ${pages.length} | ${esc(pages.slice(0, 3).join(', '))} |`);
    out.push('');
  }
  return `${out.join('\n')}\n`;
}

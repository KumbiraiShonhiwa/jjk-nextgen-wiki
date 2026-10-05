import { describe, expect, it } from 'vitest';
import { collectAliases } from '../../scripts/aliases.mjs';

const chars = (records: { slug: string; aliases?: string[] }[]) => ({ characters: records });

describe('collectAliases', () => {
  it('maps every alias to its record, keyed by full path', () => {
    const { redirects, problems } = collectAliases(
      chars([
        { slug: 'gojo-satoru', aliases: ['gojo', 'satoru'] },
        { slug: 'itadori-yuji', aliases: ['yuji'] },
      ]),
    );
    expect(problems).toEqual([]);
    expect(redirects).toEqual({
      '/characters/gojo': '/characters/gojo-satoru',
      '/characters/satoru': '/characters/gojo-satoru',
      '/characters/yuji': '/characters/itadori-yuji',
    });
  });

  it('reports two records claiming the same alias, and keeps the first', () => {
    const { redirects, problems } = collectAliases(
      chars([
        { slug: 'gojo-satoru', aliases: ['satoru'] },
        { slug: 'gojo-clan-heir', aliases: ['satoru'] },
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('claimed by both gojo-satoru and gojo-clan-heir');
    expect(redirects['/characters/satoru']).toBe('/characters/gojo-satoru');
  });

  it('refuses an alias that would shadow a real page', () => {
    // A redirect that shadows a record would make that record unreachable, which is worse than a 404.
    const { redirects, problems } = collectAliases(
      chars([
        { slug: 'mahito' },
        { slug: 'geto-suguru', aliases: ['mahito'] },
      ]),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('collides with a real page');
    expect(redirects).toEqual({});
  });

  it('reports every problem at once rather than stopping at the first', () => {
    const { problems } = collectAliases(
      chars([
        { slug: 'a', aliases: ['b'] },
        { slug: 'b' },
        { slug: 'c', aliases: ['dup'] },
        { slug: 'd', aliases: ['dup'] },
      ]),
    );
    expect(problems).toHaveLength(2);
  });

  it('is empty, not broken, when nothing declares an alias', () => {
    expect(collectAliases(chars([{ slug: 'panda' }, { slug: 'mahito', aliases: [] }]))).toEqual({ redirects: {}, problems: [] });
  });
});

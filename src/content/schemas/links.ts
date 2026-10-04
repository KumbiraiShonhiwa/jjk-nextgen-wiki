import { z } from 'astro/zod';
import { slug, spoilerLevel } from './common';

/** Hosts a community link may point to. Community sites are linked to, never copied from (docs/03). */
export const COMMUNITY_HOSTS = ['www.reddit.com', 'reddit.com'] as const;

/**
 * A curated outbound link to community discussion. The label and note are our own words:
 * the thread's title and text are never reproduced, because they belong to their authors and can spoil.
 */
export const communityLink = z
  .object({
    id: slug,
    url: z.url(),
    /** Our neutral description of what the thread is, written to be safe at `level`. */
    label: z.string().min(1).max(100),
    /** One sentence in our own words on why it is worth reading. */
    note: z.string().min(1).max(200),
    /** The subreddit, e.g. `r/JuJutsuKaisen`. */
    community: z.string().regex(/^r\/[A-Za-z0-9_]{3,21}$/, 'a subreddit such as r/JuJutsuKaisen'),
    /** Arc and character slugs whose pages list this link. */
    targets: z.array(slug).min(1),
    /** How much the thread reveals. The link is hidden below this spoiler setting. */
    level: spoilerLevel,
    addedAt: z.iso.date(),
    /** When a person last opened the URL and confirmed it is the expected thread. Reddit is never fetched in CI. */
    verifiedAt: z.iso.date(),
  })
  .superRefine((l, ctx) => {
    const u = new URL(l.url);
    if (u.protocol !== 'https:') ctx.addIssue({ code: 'custom', path: ['url'], message: 'must be https' });
    if (!(COMMUNITY_HOSTS as readonly string[]).includes(u.hostname)) {
      ctx.addIssue({ code: 'custom', path: ['url'], message: `host must be one of ${COMMUNITY_HOSTS.join(', ')}` });
    }
    const [, kind, name] = u.pathname.split('/');
    if (kind !== 'r' || `r/${name}`.toLowerCase() !== l.community.toLowerCase()) {
      ctx.addIssue({ code: 'custom', path: ['community'], message: `the URL must be under /${l.community}/` });
    }
    if (l.verifiedAt < l.addedAt) ctx.addIssue({ code: 'custom', path: ['verifiedAt'], message: 'cannot be before addedAt' });
  });

export type CommunityLink = z.infer<typeof communityLink>;

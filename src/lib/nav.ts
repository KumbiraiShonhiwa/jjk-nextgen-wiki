/** Primary navigation. Order is the order of the header and the mobile menu. */
export const NAV = [
  { href: '/characters', label: 'Characters' },
  { href: '/techniques', label: 'Techniques' },
  { href: '/domains', label: 'Domains' },
  { href: '/arcs', label: 'Arcs' },
  { href: '/media', label: 'Media' },
  { href: '/glossary', label: 'Glossary' },
  { href: '/organizations', label: 'Organizations' },
  { href: '/locations', label: 'Locations' },
  { href: '/graph', label: 'Graph' },
] as const;

/**
 * Mobile bottom tab bar (doc 04). Four thumb-reach destinations, not the whole of NAV: the
 * header menu keeps every section, so nothing lives only here. Icons are inline path data so the
 * bar costs no extra request. Add Media once A1 lands.
 */
export const TABS = [
  { href: '/', label: 'Home', icon: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>' },
  { href: '/characters', label: 'Characters', icon: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>' },
  { href: '/arcs', label: 'Arcs', icon: '<path d="M6 3v18"/><circle cx="6" cy="8" r="2"/><circle cx="6" cy="16" r="2"/><path d="M10 8h8M10 16h6"/>' },
] as const;

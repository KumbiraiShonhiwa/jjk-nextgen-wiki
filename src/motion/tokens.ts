/** Motion tokens: the single vocabulary every animation uses (doc 07). */
export const durations = {
  xs: 120,
  sm: 240,
  md: 480,
  lg: 900,
} as const;

/** Named Anime.js v4 ease strings. */
export const eases = {
  /** Default for elements entering. */
  enter: 'out(4)',
  /** Elements leaving. */
  exit: 'in(3)',
  /** Movement between two on-screen states. */
  move: 'inOut(4)',
  /** Cursed-energy surges: fast attack, long tail. */
  surge: 'outExpo',
} as const;

export const staggers = {
  /** Gap between items in a list or grid. */
  item: 40,
  /** Gap between characters in kinetic type. */
  char: 18,
} as const;

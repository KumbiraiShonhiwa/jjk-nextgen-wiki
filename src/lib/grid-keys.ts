/**
 * `j` / `k` to step between cards in a grid or list (roadmap B12).
 *
 * Moves focus rather than a private "selection", so the browser scrolls, the focus ring shows where
 * you are, and Enter already does the right thing because every card is a link.
 */
const SELECTOR = '[data-cascade] a[href], [data-grid] a[href], [data-reveal] a[href]';

/** Cards that are actually on the page: a spoiler-hidden card has no layout boxes. */
export function focusableCards(doc: Document = document): HTMLAnchorElement[] {
  return [...doc.querySelectorAll<HTMLAnchorElement>(SELECTOR)].filter((el) => el.getClientRects().length > 0);
}

/** True when the keystroke belongs to a field or an open dialog, not to the page. */
export function isTypingContext(target: EventTarget | null, doc: Document = document): boolean {
  const el = target as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName))) return true;
  return !!doc.querySelector('dialog[open]');
}

/** The card to focus next, wrapping at both ends. Returns undefined when there are none. */
export function nextCard(cards: HTMLAnchorElement[], current: Element | null, step: 1 | -1): HTMLAnchorElement | undefined {
  if (!cards.length) return undefined;
  const index = current ? cards.indexOf(current as HTMLAnchorElement) : -1;
  if (index === -1) return step === 1 ? cards[0] : cards[cards.length - 1];
  return cards[(index + step + cards.length) % cards.length];
}

/** Binds j/k on the document. Returns a cleanup. */
export function bindGridKeys(doc: Document = document): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'j' && e.key !== 'k') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingContext(e.target, doc)) return;
    const target = nextCard(focusableCards(doc), doc.activeElement, e.key === 'j' ? 1 : -1);
    if (!target) return;
    e.preventDefault();
    target.focus();
    target.scrollIntoView({ block: 'nearest' });
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}

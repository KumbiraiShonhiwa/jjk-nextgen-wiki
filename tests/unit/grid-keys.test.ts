import { describe, expect, it } from 'vitest';
import { isTypingContext, nextCard } from '../../src/lib/grid-keys';

const anchors = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}` }) as unknown as HTMLAnchorElement);

describe('nextCard', () => {
  const cards = anchors(3);

  it('starts at the first card going forward, the last going back', () => {
    expect(nextCard(cards, null, 1)).toBe(cards[0]);
    expect(nextCard(cards, null, -1)).toBe(cards[2]);
  });

  it('steps forward and back from the current card', () => {
    expect(nextCard(cards, cards[0]!, 1)).toBe(cards[1]);
    expect(nextCard(cards, cards[1]!, -1)).toBe(cards[0]);
  });

  it('wraps at both ends', () => {
    expect(nextCard(cards, cards[2]!, 1)).toBe(cards[0]);
    expect(nextCard(cards, cards[0]!, -1)).toBe(cards[2]);
  });

  it('treats an element that is not a card as no position', () => {
    expect(nextCard(cards, { id: 'elsewhere' } as unknown as HTMLAnchorElement, 1)).toBe(cards[0]);
  });

  it('is undefined when there are no cards', () => {
    expect(nextCard([], null, 1)).toBeUndefined();
  });
});

describe('isTypingContext', () => {
  const doc = (openDialog = false) =>
    ({ querySelector: (s: string) => (openDialog && s === 'dialog[open]' ? {} : null) }) as unknown as Document;

  it('is true inside form fields, so j and k can be typed', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']) {
      expect(isTypingContext({ tagName, isContentEditable: false } as HTMLElement, doc())).toBe(true);
    }
    expect(isTypingContext({ tagName: 'DIV', isContentEditable: true } as HTMLElement, doc())).toBe(true);
  });

  it('is true while a dialog is open, so the palette keeps its keys', () => {
    expect(isTypingContext({ tagName: 'DIV', isContentEditable: false } as HTMLElement, doc(true))).toBe(true);
  });

  it('is false for ordinary page content', () => {
    expect(isTypingContext({ tagName: 'A', isContentEditable: false } as HTMLElement, doc())).toBe(false);
    expect(isTypingContext(null, doc())).toBe(false);
  });
});

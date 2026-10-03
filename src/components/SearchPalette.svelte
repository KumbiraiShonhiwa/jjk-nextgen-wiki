<script lang="ts">
  /**
   * Command-palette search (docs/04, Search). Opens with "/" or Ctrl/⌘+K, loads the Pagefind index
   * on first use, and only returns pages at or below the visitor's spoiler level.
   */
  import { animate } from 'animejs/animation';
  import { stagger } from 'animejs/utils';
  import { navigate } from 'astro:transitions/client';
  import { tick, untrack } from 'svelte';
  import { readLevel, SPOILER_EVENT } from '../lib/spoiler';
  import { allowedLevels, canonicalUrl, rank, type Hit, type Pagefind } from '../lib/search';
  import { durations, eases, staggers } from '../motion/tokens';
  import { prefersReducedMotion } from '../motion/reduced';

  const MAX_RESULTS = 8;

  let dialog: HTMLDialogElement | undefined = $state();
  let panel: HTMLDivElement | undefined = $state();
  let list: HTMLUListElement | undefined = $state();
  let input: HTMLInputElement | undefined = $state();
  let query = $state('');
  let hits = $state<Hit[]>([]);
  let active = $state(0);
  let status = $state<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');

  let pagefind: Pagefind | undefined;

  async function load(): Promise<Pagefind | undefined> {
    if (pagefind || status === 'unavailable') return pagefind;
    status = 'loading';
    try {
      // Built by `pagefind --site dist` after `astro build`; absent in `astro dev`.
      const url = '/pagefind/pagefind.js';
      pagefind = (await import(/* @vite-ignore */ url)) as Pagefind;
      await pagefind.options({ excerptLength: 16 });
      await pagefind.init();
      status = 'ready';
    } catch {
      status = 'unavailable';
    }
    return pagefind;
  }

  async function run(q: string) {
    const pf = await load();
    if (!pf) return;
    if (!q.trim()) {
      hits = [];
      return;
    }
    const search = await pf.debouncedSearch(q, { filters: { level: { any: allowedLevels(readLevel()) } } }, 120);
    if (!search) return; // superseded by a newer keystroke
    const data = await Promise.all(search.results.slice(0, MAX_RESULTS * 2).map((r) => r.data()));
    if (q !== query) return;
    hits = rank(
      data.map((d) => ({ url: canonicalUrl(d.url), title: d.meta.title ?? d.url, type: d.meta.type ?? 'Page', excerpt: d.excerpt })),
      q,
    ).slice(0, MAX_RESULTS);
    active = 0;
    await tick();
    if (list && !prefersReducedMotion()) {
      animate(list.children, { opacity: [0, 1], x: [-8, 0], duration: durations.sm, ease: eases.enter, delay: stagger(staggers.item / 2) });
    }
  }

  // Only `query` drives a search; everything else run() touches is read untracked.
  $effect(() => {
    const q = query;
    untrack(() => void run(q));
  });

  // Results depend on the spoiler level; refresh them if it changes while the palette is open.
  $effect(() => {
    const onLevel = () => dialog?.open && void run(query);
    document.addEventListener(SPOILER_EVENT, onLevel);
    return () => document.removeEventListener(SPOILER_EVENT, onLevel);
  });

  export async function open() {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    input?.select();
    // The spoiler level may have changed since the last search, so re-run rather than reuse results.
    void run(query);
    if (panel && !prefersReducedMotion()) {
      animate(panel, { opacity: [0, 1], scale: [0.96, 1], y: [-12, 0], filter: ['blur(6px)', 'blur(0px)'], duration: durations.sm, ease: eases.enter });
    }
  }

  function close() {
    dialog?.close();
  }

  function go(hit: Hit | undefined) {
    if (!hit) return;
    close();
    void navigate(hit.url);
  }

  function onInputKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!hits.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length;
      document.getElementById(`search-hit-${active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Escape') {
      // A search input swallows the first Escape to clear itself; close in one press instead.
      e.preventDefault();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(hits[active]);
    }
  }

  function isTyping(target: EventTarget | null) {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  }

  function onGlobalKey(e: KeyboardEvent) {
    const combo = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
    if (combo || (e.key === '/' && !isTyping(e.target))) {
      e.preventDefault();
      void open();
    }
  }

  const groupStart = (i: number) => i === 0 || hits[i - 1]!.type !== hits[i]!.type;
</script>

<svelte:window onkeydown={onGlobalKey} />

<button
  type="button"
  class="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-step--1 text-paper-dim transition-colors hover:border-ce-blue hover:text-paper"
  aria-haspopup="dialog"
  aria-label="Search"
  aria-keyshortcuts="/ Control+K Meta+K"
  onclick={open}
>
  <svg viewBox="0 0 20 20" class="size-4" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="m13 13 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
  <span class="hidden sm:inline" aria-hidden="true">Search</span>
  <kbd class="hidden rounded-sm border border-line px-1.5 text-[0.7rem] sm:inline">/</kbd>
</button>

<dialog
  bind:this={dialog}
  aria-label="Search the wiki"
  class="m-0 mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] max-w-none bg-transparent p-0 text-paper backdrop:bg-ink/70 backdrop:backdrop-blur-sm"
  onclick={(e) => e.target === dialog && close()}
>
  <div bind:this={panel} class="overflow-hidden rounded-lg border border-line bg-ink-2 shadow-[var(--shadow-glow)]">
    <div class="flex items-center gap-3 border-b border-line px-4">
      <svg viewBox="0 0 20 20" class="size-5 shrink-0 text-paper-dim" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2" /><path d="m13 13 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      <input
        bind:this={input}
        bind:value={query}
        type="search"
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={hits.length ? `search-hit-${active}` : undefined}
        placeholder="Characters, techniques, arcs…"
        autocomplete="off"
        spellcheck="false"
        class="w-full bg-transparent py-4 text-step-1 outline-none placeholder:text-paper-dim"
        onkeydown={onInputKey}
      />
      <kbd class="rounded-sm border border-line px-1.5 text-[0.7rem] text-paper-dim">Esc</kbd>
    </div>

    <ul bind:this={list} id="search-results" role="listbox" aria-label="Results" class="max-h-[50vh] overflow-y-auto p-2">
      {#each hits as hit, i (hit.url)}
        {#if groupStart(i)}
          <li role="presentation" class="px-3 pt-3 pb-1 text-[0.7rem] uppercase tracking-[0.3em] text-paper-dim">{hit.type}</li>
        {/if}
        <li
          id="search-hit-{i}"
          role="option"
          aria-selected={i === active}
          class="cursor-pointer rounded-md px-3 py-2 {i === active ? 'bg-ink-3' : ''}"
          onclick={() => go(hit)}
          onkeydown={() => {}}
          onmousemove={() => (active = i)}
        >
          <span class="block font-display text-step-1">{hit.title}</span>
          <!-- Pagefind escapes indexed text and only adds <mark> around matches. -->
          <span class="search-excerpt mt-0.5 block text-step--1 text-paper-dim">{@html hit.excerpt}</span>
        </li>
      {/each}
    </ul>

    <p class="border-t border-line px-4 py-2 text-step--1 text-paper-dim" aria-live="polite">
      {#if status === 'unavailable'}
        Search is available in the built site (run <code>pnpm build &amp;&amp; pnpm preview</code>).
      {:else if status === 'loading'}
        Loading the index…
      {:else if query.trim() && !hits.length}
        No results at your spoiler level.
      {:else if hits.length}
        {hits.length} {hits.length === 1 ? 'result' : 'results'} · ↑↓ to move, Enter to open
      {:else}
        Results only include pages at or below your spoiler level.
      {/if}
    </p>
  </div>
</dialog>

<style>
  .search-excerpt :global(mark) {
    background: color-mix(in oklab, var(--ce-blue) 30%, transparent);
    color: var(--paper);
    border-radius: 2px;
  }
</style>

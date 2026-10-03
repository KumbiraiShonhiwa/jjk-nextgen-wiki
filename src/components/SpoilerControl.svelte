<script lang="ts">
  import { animate } from 'animejs/animation';
  import { SPOILER_LEVELS, type SpoilerLevel } from '../content/schemas/common';
  import { durations, eases } from '../motion/tokens';
  import { prefersReducedMotion } from '../motion/reduced';

  const KEY = 'jjk:spoiler-level';
  const labels: Record<SpoilerLevel, string> = {
    none: 'Safe',
    'anime-s1': 'S1',
    'anime-s2': 'S2',
    'anime-s3': 'S3',
    manga: 'Manga',
  };
  const options = SPOILER_LEVELS.filter((l) => l !== 'none');

  let level = $state<SpoilerLevel>('anime-s1');
  let indicator: HTMLSpanElement | undefined = $state();
  let buttons: HTMLButtonElement[] = $state([]);

  $effect(() => {
    try {
      const saved = localStorage.getItem(KEY) as SpoilerLevel | null;
      if (saved && SPOILER_LEVELS.includes(saved)) level = saved;
    } catch {}
  });

  // Slide the indicator under the active option with a spring-like ease.
  $effect(() => {
    const btn = buttons[options.indexOf(level as (typeof options)[number])];
    if (!indicator || !btn) return;
    const params = { x: btn.offsetLeft, width: btn.offsetWidth };
    if (prefersReducedMotion()) {
      Object.assign(indicator.style, { transform: `translateX(${params.x}px)`, width: `${params.width}px` });
      return;
    }
    const anim = animate(indicator, { ...params, duration: durations.sm, ease: eases.move });
    return () => anim.pause();
  });

  function choose(next: SpoilerLevel) {
    level = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    document.documentElement.dataset.spoiler = next;
    document.dispatchEvent(new CustomEvent('jjk:spoiler', { detail: next }));
  }
</script>

<div class="relative flex rounded-full border border-line p-0.5 text-xs" role="radiogroup" aria-label="Spoiler level">
  <span bind:this={indicator} class="absolute left-0 top-0.5 bottom-0.5 rounded-full bg-ce-blue/25" aria-hidden="true"></span>
  {#each options as option, i}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={level === option}
      class="relative rounded-full px-2.5 py-1 {level === option ? 'text-paper' : 'text-paper-dim'}"
      onclick={() => choose(option)}>{labels[option]}</button
    >
  {/each}
</div>

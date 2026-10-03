<script lang="ts">
  import { animate } from 'animejs/animation';
  import { SPOILER_LEVELS, type SpoilerLevel } from '../content/schemas/common';
  import { LEVEL_LABELS, readLevel, setLevel } from '../lib/spoiler';
  import { durations, eases } from '../motion/tokens';
  import { prefersReducedMotion } from '../motion/reduced';

  const options = SPOILER_LEVELS.filter((l) => l !== 'none');

  let level = $state<SpoilerLevel>(readLevel());
  let indicator: HTMLSpanElement | undefined = $state();
  let buttons: HTMLButtonElement[] = $state([]);

  // Slide the indicator under the active option.
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
    setLevel(next);
  }

  function onKey(e: KeyboardEvent, i: number) {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + options.length) % options.length;
    choose(options[next]!);
    buttons[next]?.focus();
  }
</script>

<div class="relative flex rounded-full border border-line p-0.5 text-step--1" role="radiogroup" aria-label="Spoiler level">
  <span bind:this={indicator} class="absolute top-0.5 bottom-0.5 left-0 rounded-full bg-ce-blue/25" aria-hidden="true"></span>
  {#each options as option, i}
    <button
      bind:this={buttons[i]}
      type="button"
      role="radio"
      aria-checked={level === option}
      tabindex={level === option ? 0 : -1}
      title={LEVEL_LABELS[option].long}
      class="relative rounded-full px-2.5 py-1 transition-colors {level === option ? 'text-paper' : 'text-paper-dim'}"
      onclick={() => choose(option)}
      onkeydown={(e) => onKey(e, i)}>{LEVEL_LABELS[option].short}</button
    >
  {/each}
</div>

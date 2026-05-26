<!--
  SoteriaIcon.vue — renders any Soteria FORGE icon.
  Icons are monochrome (single currentColor, Spectrum-style). Color is set
  by the parent context (status chip, icon-button, list-row) via CSS `color`.
  Place at `src/components/SoteriaIcon.vue`. SVGs live in `src/assets/soteria-icons/`.

  Usage:
    <SoteriaIcon name="confined-space" :size="24" />
    <SoteriaIcon name="ready" color="var(--ion-color-warning)" aria-label="Ready" />
    <SoteriaIcon name="dashboard" :size="20" decorative />
-->
<script setup lang="ts">
import { computed } from 'vue';

const sources = import.meta.glob('../assets/soteria-icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(sources).map(([path, src]) => {
    const name = path.split('/').pop()!.replace(/\.svg$/, '');
    return [name, src as string];
  })
);

export type SoteriaIconName = keyof typeof ICONS;

const props = withDefaults(defineProps<{
  /** Icon name (kebab-case, matches the SVG filename). */
  name: string;
  /** Size in px. Default 24. */
  size?: number | string;
  /** Override the icon color. Defaults to inherited `currentColor`. */
  color?: string;
  /** Accessible label. If omitted (or `decorative` is true), the icon is aria-hidden. */
  ariaLabel?: string;
  /** Explicit decorative flag — same effect as omitting ariaLabel. */
  decorative?: boolean;
}>(), {
  size: 24,
  decorative: false,
});

const svgMarkup = computed(() => {
  const raw = ICONS[props.name];
  if (!raw) {
    if (typeof console !== 'undefined') console.warn(`[SoteriaIcon] Unknown icon: "${props.name}"`);
    return '';
  }
  // Strip the outer <svg ...> wrapper; we render our own.
  return raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
});

const sizePx = computed(() => typeof props.size === 'number' ? `${props.size}px` : props.size);

const styleVars = computed(() => ({
  width: sizePx.value,
  height: sizePx.value,
  color: props.color ?? 'currentColor',
}));

const a11y = computed(() => {
  if (!props.ariaLabel || props.decorative) {
    return { 'aria-hidden': 'true', focusable: 'false' } as const;
  }
  return { role: 'img', 'aria-label': props.ariaLabel } as const;
});
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    class="soteria-icon"
    :style="styleVars"
    v-bind="a11y"
    v-html="svgMarkup"
  />
</template>

<style scoped>
.soteria-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import Player from '@vimeo/player'

type VimeoTrackEvent = {
  verb: 'played' | 'paused' | 'progressed' | 'completed'
  seconds?: number
  duration?: number
  percent?: number
}

const props = defineProps<{
  title: string
  url: string
}>()

const emit = defineEmits<{
  track: [event: VimeoTrackEvent]
}>()

const host = ref<HTMLDivElement | null>(null)
let player: Player | null = null
const progressMilestones = new Set<number>()

function trackProgress(seconds?: number, duration?: number, percent?: number) {
  const currentPercent = Math.floor((percent ?? 0) * 100)
  for (const milestone of [25, 50, 75]) {
    if (currentPercent >= milestone && !progressMilestones.has(milestone)) {
      progressMilestones.add(milestone)
      emit('track', { verb: 'progressed', seconds, duration, percent: milestone })
    }
  }
}

onMounted(() => {
  if (!host.value) return

  player = new Player(host.value, {
    url: props.url,
    responsive: true,
    dnt: true,
    title: false,
    byline: false,
    portrait: false,
  } as ConstructorParameters<typeof Player>[1])

  player.on('play', (event) => emit('track', { verb: 'played', seconds: event.seconds, duration: event.duration, percent: event.percent }))
  player.on('pause', (event) => emit('track', { verb: 'paused', seconds: event.seconds, duration: event.duration, percent: event.percent }))
  player.on('timeupdate', (event) => trackProgress(event.seconds, event.duration, event.percent))
  player.on('ended', (event) => emit('track', { verb: 'completed', seconds: event.seconds, duration: event.duration, percent: 100 }))
})

onBeforeUnmount(() => {
  void player?.destroy()
  player = null
})
</script>

<template>
  <div class="vimeo-player-shell" :aria-label="title">
    <div ref="host" class="vimeo-player"></div>
  </div>
</template>

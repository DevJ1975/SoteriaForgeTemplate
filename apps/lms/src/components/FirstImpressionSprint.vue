<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { Volume2, VolumeX } from '@lucide/vue'
import { SprintAudioController } from '../game/firstImpressionSprint/audio'
import { firstImpressionSprint } from '../game/firstImpressionSprint/data'
import { createFirstImpressionSprintGame } from '../game/firstImpressionSprint/phaserGame'
import type { ScoreCategory, ScoreMap, SprintGameEvent, SprintGameResult, SprintScene } from '../game/firstImpressionSprint/types'

const emit = defineEmits<{
  complete: [result: SprintGameResult]
}>()

const gameHost = ref<HTMLElement | null>(null)
const currentScene = ref<SprintScene>(firstImpressionSprint.scenes[0])
const sceneIndex = ref(0)
const selectedChoiceId = ref('')
const latestCoaching = ref('')
const latestCorrect = ref<boolean | null>(null)
const gameResult = ref<SprintGameResult | null>(null)
const soundEnabled = ref(true)
const audioReady = ref(false)
const categoryScores = ref<ScoreMap>({
  presence: 0,
  communication: 0,
  confidence: 0,
  accountability: 0,
})
const score = ref(0)
const audio = new SprintAudioController()
let game: ReturnType<typeof createFirstImpressionSprintGame> | null = null

const categoryLabels: Record<ScoreCategory, string> = {
  presence: 'Presence',
  communication: 'Communication',
  confidence: 'Confidence',
  accountability: 'Accountability',
}

const progressLabel = computed(() => `${sceneIndex.value + 1} of ${firstImpressionSprint.scenes.length}`)

function handleGameEvent(event: SprintGameEvent) {
  if (event.type === 'sceneChanged') {
    currentScene.value = event.scene
    sceneIndex.value = event.sceneIndex
    categoryScores.value = event.categoryScores
    score.value = event.score
    selectedChoiceId.value = ''
    latestCoaching.value = ''
    latestCorrect.value = null
    return
  }

  if (event.type === 'choiceResolved') {
    const choice = currentScene.value.choices.find((candidate) => candidate.id === event.resolution.choiceId)
    selectedChoiceId.value = event.resolution.choiceId
    latestCoaching.value = event.resolution.coaching
    latestCorrect.value = event.resolution.correct
    categoryScores.value = event.resolution.categoryScores
    score.value = event.resolution.score
    playSound(event.resolution.correct ? 'positive' : choice?.soundKey ?? 'coach')
    return
  }

  if (event.type === 'gameComplete') {
    gameResult.value = event.result
    playSound('complete')
    emit('complete', event.result)
    return
  }

  if (event.type === 'gameRestarted') {
    gameResult.value = null
    latestCoaching.value = ''
    latestCorrect.value = null
    selectedChoiceId.value = ''
  }
}

function choose(choiceId: string) {
  if (selectedChoiceId.value || gameResult.value) return
  playSound('select')
  game?.events.emit('training:choice', choiceId)
}

function restart() {
  playSound('select')
  game?.events.emit('training:restart')
}

function toggleSound() {
  soundEnabled.value = !soundEnabled.value
  if (soundEnabled.value) {
    playSound('select')
  }
}

function playSound(key: Parameters<SprintAudioController['play']>[0]) {
  void audio.play(key, soundEnabled.value).then((ready) => {
    audioReady.value = ready
  })
}

onMounted(async () => {
  await nextTick()
  if (!gameHost.value) return
  game = createFirstImpressionSprintGame(gameHost.value, handleGameEvent)
})

onBeforeUnmount(() => {
  game?.destroy(true)
  game = null
  audio.close()
})
</script>

<template>
  <section class="sprint-shell" aria-labelledby="sprint-title">
    <div class="sprint-header">
      <div>
        <p class="eyebrow">Flagship graphical game</p>
        <h3 id="sprint-title">{{ firstImpressionSprint.title }}</h3>
        <p>Tap each card to guide your avatar through a professional workday.</p>
      </div>
      <div class="sprint-actions">
        <button
          class="sound-toggle"
          type="button"
          :aria-pressed="soundEnabled"
          :aria-label="soundEnabled ? 'Mute sound effects' : 'Unmute sound effects'"
          @click="toggleSound"
        >
          <Volume2 v-if="soundEnabled" :size="18" aria-hidden="true" />
          <VolumeX v-else :size="18" aria-hidden="true" />
          <span>{{ soundEnabled ? (audioReady ? 'Sound on' : 'Tap sound') : 'Muted' }}</span>
        </button>
        <div class="sprint-score">
          <span>Score</span>
          <strong>{{ score }}</strong>
        </div>
      </div>
    </div>

    <div class="sprint-stage">
      <div ref="gameHost" class="sprint-canvas" aria-label="Professional Presence Sprint game canvas"></div>

      <aside class="sprint-panel" aria-live="polite">
        <div v-if="!gameResult" class="sprint-prompt">
          <span>{{ progressLabel }}</span>
          <h4>{{ currentScene.title }}</h4>
          <p>{{ currentScene.prompt }}</p>
        </div>

        <div v-if="!gameResult" class="sprint-choices">
          <button
            v-for="choice in currentScene.choices"
            :key="choice.id"
            class="sprint-choice"
            :class="{
              selected: selectedChoiceId === choice.id,
              correct: selectedChoiceId === choice.id && latestCorrect === true,
              coaching: selectedChoiceId === choice.id && latestCorrect === false,
            }"
            type="button"
            :disabled="Boolean(selectedChoiceId)"
            @click="choose(choice.id)"
          >
            <strong>{{ choice.shortLabel }}</strong>
            <span>{{ choice.supportingText }}</span>
          </button>
        </div>

        <p v-if="latestCoaching && !gameResult" class="sprint-coaching" :class="{ positive: latestCorrect }">
          {{ latestCoaching }}
        </p>

        <div v-if="gameResult" class="sprint-result">
          <span>{{ gameResult.completed ? 'Completed' : 'Practice again' }}</span>
          <h4>{{ gameResult.score }} Soteria Forge Score</h4>
          <p>{{ gameResult.coachingSummary }}</p>
          <button class="button button-primary" type="button" @click="restart">Replay Sprint</button>
        </div>

        <div class="score-breakdown" aria-label="Score category breakdown">
          <div v-for="category in firstImpressionSprint.scoreCategories" :key="category" class="score-row">
            <span>{{ categoryLabels[category] }}</span>
            <strong>{{ categoryScores[category] }}</strong>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

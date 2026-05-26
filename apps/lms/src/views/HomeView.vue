<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Award,
  BookOpen,
  ChartNoAxesColumn,
  Check,
  ChevronRight,
  CirclePlay,
  ClipboardList,
  Download,
  Gamepad2,
  Goal,
  LayoutDashboard,
  LogOut,
  Sparkles,
  Trophy,
  Users,
} from '@lucide/vue'
import lessonThumbnail from '../assets/lesson-thumbnail.svg'
import templateLogo from '../assets/template-logo.svg'
import { quizQuestions, seededLeaderboardEntries, teamProgress, trainingPaths } from '../data/training'
import type { LeaderboardEntry, Lesson, TrainingPath } from '../data/training'
import type { SprintGameResult } from '../game/firstImpressionSprint/types'
import { api } from '../services/api'
import { createLessonStatement, createVideoStatement } from '../learning/xapi'
import { cacheCourses, getCachedCourses } from '../offline/db'
import { enqueueSyncItem, flushSyncQueue } from '../offline/sync'
import { useSessionStore } from '../stores/session'
import type { CertificateDTO, CourseDTO, CourseLessonDTO, EnrollmentDTO, QuizQuestionDTO } from '@soteria-forge/shared'

type Section = 'dashboard' | 'learn' | 'games' | 'leaderboard' | 'goals' | 'admin'

type RankedLeaderboardEntry = LeaderboardEntry & {
  rank: number
  isCurrentUser?: boolean
}

type LmsLesson = Lesson & {
  courseId?: string
  quizQuestions?: QuizQuestionDTO[]
  transcript?: string
  offlineSummary?: string
  vimeoUrl?: string
  assetId?: string
}

type LmsTrainingPath = Omit<TrainingPath, 'lessons'> & {
  courseId?: string
  lessons: LmsLesson[]
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const FirstImpressionSprint = defineAsyncComponent(() => import('../components/FirstImpressionSprint.vue'))
const VimeoLessonPlayer = defineAsyncComponent(() => import('../components/VimeoLessonPlayer.vue'))
const session = useSessionStore()

const savedName = localStorage.getItem('soteria-forge:name') ?? ''
const isLoggedIn = ref(Boolean(savedName || session.token))
const employeeName = ref(savedName || 'Jordan Lee')
const employeeRole = ref('Training Participant')
const employeeEmail = ref('learner@soteriaforge.local')
const employeePassword = ref('SoteriaForgeDemo!2026')
const activeSection = ref<Section>('dashboard')
const selectedPathId = ref(trainingPaths[0].id)
const selectedLessonId = ref(trainingPaths[0].lessons[1].id)
const completedLessons = ref<string[]>(['professional-first-impressions'])
const apiCourses = ref<CourseDTO[]>([])
const apiEnrollments = ref<EnrollmentDTO[]>([])
const certificates = ref<CertificateDTO[]>([])
const courseSource = ref<'seed' | 'api' | 'cache'>('seed')
const quizAnswers = ref<Record<string, string>>({})
const firstImpressionResult = ref<SprintGameResult | null>(null)
const activeVideoLessons = ref<Record<string, boolean>>({})
const installPrompt = ref<BeforeInstallPromptEvent | null>(null)
const installMessage = ref('')
const syncMessage = ref('')
const isStandalonePwa = ref(false)
const goalDraft = ref('')
const goals = ref([
  'Arrive five minutes early and prepared for every team huddle this week.',
  'Ask one confident clarifying question in the next client meeting.',
])

const navItems = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'learn', label: 'Training', icon: BookOpen },
  { id: 'games', label: 'Games', icon: Gamepad2 },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'goals', label: 'Goals', icon: Goal },
  { id: 'admin', label: 'Reports', icon: ChartNoAxesColumn },
] as const

const activeTrainingPaths = computed<LmsTrainingPath[]>(() => {
  if (!apiCourses.value.length) return trainingPaths
  return apiCourses.value.map(courseToTrainingPath)
})

const selectedPath = computed<LmsTrainingPath>(() => {
  return activeTrainingPaths.value.find((path) => path.id === selectedPathId.value) ?? activeTrainingPaths.value[0] ?? trainingPaths[0]
})

const selectedLesson = computed<LmsLesson>(() => {
  return (
    selectedPath.value.lessons.find((lesson) => lesson.id === selectedLessonId.value) ??
    selectedPath.value.lessons[0]
  )
})

const selectedQuizQuestions = computed(() => {
  return selectedLesson.value.quizQuestions?.length ? selectedLesson.value.quizQuestions : quizQuestions
})

const quizScore = computed(() => {
  return selectedQuizQuestions.value.filter((question) => quizAnswers.value[question.id] === question.answer).length
})

const gameScore = computed(() => {
  return firstImpressionResult.value?.completed ? 1 : 0
})

const certificateCount = computed(() => certificates.value.length)

const totalLessonCount = computed(() => {
  return activeTrainingPaths.value.reduce((sum, path) => sum + path.lessons.length, 0)
})

const totalProgress = computed(() => {
  return Math.round((completedLessons.value.length / totalLessonCount.value) * 100)
})

const nextUp = computed(() => {
  return activeTrainingPaths.value.flatMap((path) => path.lessons).find((lesson) => lesson.status === 'current')
})

function courseToTrainingPath(course: CourseDTO): LmsTrainingPath {
  const enrollment = apiEnrollments.value.find((candidate) => candidate.courseId === course.id)
  const flatLessons = course.modules.flatMap((module) => module.lessons.map((lesson) => courseLessonToLesson(course, lesson)))
  const progress = enrollment?.progress ?? 0

  return {
    id: course.id,
    courseId: course.id,
    title: course.title,
    category: course.tags[0] ?? 'Field Ready',
    outcome: course.description,
    dueDate: enrollment?.dueAt ? new Date(enrollment.dueAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Assigned',
    progress,
    lessons: flatLessons.map((lesson, index) => ({
      ...lesson,
      status: progress >= 100 || completedLessons.value.includes(lesson.id) ? 'complete' : index === 0 ? 'current' : lesson.status,
    })),
  }
}

function courseLessonToLesson(course: CourseDTO, lesson: CourseLessonDTO): LmsLesson {
  return {
    id: lesson.id,
    courseId: course.id,
    title: lesson.title,
    type: lesson.kind,
    duration: `${lesson.durationMinutes} min`,
    description: lesson.description,
    status: 'current',
    quizQuestions: lesson.quizQuestions,
    transcript: lesson.transcript,
    offlineSummary: lesson.offlineSummary,
    vimeoUrl: lesson.vimeoUrl,
    assetId: lesson.assetId,
  }
}

const leaderboardRows = computed<RankedLeaderboardEntry[]>(() => {
  const currentPlayerEntry: LeaderboardEntry | null = firstImpressionResult.value
    ? {
        id: 'current-player',
        playerName: employeeName.value,
        department: employeeRole.value,
        gameTitle: 'Professional Presence Sprint',
        score: firstImpressionResult.value.score,
        completedAt: 'Just now',
        badge: firstImpressionResult.value.completed ? 'Soteria Forge Finisher' : 'Practice Run',
      }
    : null

  return [...seededLeaderboardEntries, ...(currentPlayerEntry ? [currentPlayerEntry] : [])]
    .sort((first, second) => second.score - first.score || first.playerName.localeCompare(second.playerName))
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
      isCurrentUser: entry.id === 'current-player',
    }))
})

const podiumEntries = computed(() => leaderboardRows.value.slice(0, 3))

const currentPlayerRank = computed(() => {
  return leaderboardRows.value.find((entry) => entry.isCurrentUser)?.rank
})

async function login() {
  const trimmedName = employeeName.value.trim() || 'Jordan Lee'
  employeeName.value = trimmedName
  localStorage.setItem('soteria-forge:name', trimmedName)

  await session.login(employeeEmail.value, employeePassword.value)
  if (session.user?.name) employeeName.value = session.user.name
  if (session.user?.jobTitle) employeeRole.value = session.user.jobTitle
  isLoggedIn.value = true
  await warmOfflineCache()
}

async function logout() {
  await session.logout()
  localStorage.removeItem('soteria-forge:name')
  isLoggedIn.value = false
}

function choosePath(pathId: string) {
  selectedPathId.value = pathId
  selectedLessonId.value =
    activeTrainingPaths.value.find((path) => path.id === pathId)?.lessons.find((lesson) => lesson.status !== 'locked')?.id ??
    activeTrainingPaths.value[0]?.lessons[0]?.id ??
    trainingPaths[0].lessons[0].id
  activeSection.value = 'learn'
}

function chooseLesson(lesson: LmsLesson) {
  if (lesson.status === 'locked') return
  selectedLessonId.value = lesson.id
}

function completeSelectedLesson() {
  if (!completedLessons.value.includes(selectedLesson.value.id)) {
    completedLessons.value.push(selectedLesson.value.id)
  }

  void recordLessonCompletion(selectedLesson.value)
}

function handleFirstImpressionComplete(result: SprintGameResult) {
  firstImpressionResult.value = result

  if (result.completed && !completedLessons.value.includes('professional-presence-sprint')) {
    completedLessons.value.push('professional-presence-sprint')
  }

  void enqueueSyncItem({
    tenantId: session.tenant?.id ?? 'offline-demo',
    userId: session.user?.id ?? 'offline-demo-user',
    type: 'attempt',
    payload: {
      courseId: selectedPathId.value,
      lessonId: 'professional-presence-sprint',
      kind: 'game',
      status: result.completed ? 'completed' : 'failed',
      score: result.score,
      payload: result,
    },
  })
}

function addGoal() {
  const nextGoal = goalDraft.value.trim()
  if (!nextGoal) return
  goals.value.unshift(nextGoal)
  goalDraft.value = ''
}

function playLessonVideo(lessonId: string) {
  activeVideoLessons.value = {
    ...activeVideoLessons.value,
    [lessonId]: true,
  }
}

async function recordLessonCompletion(lesson: LmsLesson) {
  const tenantId = session.tenant?.id ?? 'offline-demo'
  const user = session.user
  const idempotencyKey = `completion-${tenantId}-${employeeName.value}-${lesson.id}`
  const courseId = lesson.courseId ?? selectedPath.value.courseId ?? selectedPathId.value

  if (!user) return

  const statement = createLessonStatement({
    tenantId,
    user,
    verb: 'completed',
    objectId: lesson.id,
    name: lesson.title,
    description: lesson.description,
    completion: true,
    success: true,
    score: lesson.type === 'quiz' ? Math.round((quizScore.value / selectedQuizQuestions.value.length) * 100) : undefined,
  })

  try {
    const result = await api.completeLesson({
      courseId,
      lessonId: lesson.id,
      source: navigator.onLine ? 'online' : 'offline-capable',
      idempotencyKey,
    })
    await api.submitXapiStatement(statement)
    if (result.enrollment) {
      apiEnrollments.value = [
        ...apiEnrollments.value.filter((enrollment) => enrollment.id !== result.enrollment?.id),
        result.enrollment,
      ]
    }
    if (result.certificate && !certificates.value.some((certificate) => certificate.id === result.certificate?.id)) {
      certificates.value = [result.certificate, ...certificates.value]
    }
    syncMessage.value = 'Completion synced.'
  } catch {
    await enqueueSyncItem({
      tenantId,
      userId: user.id,
      type: 'completion',
      payload: {
        courseId,
        lessonId: lesson.id,
      },
      idempotencyKey,
    })
    await enqueueSyncItem({
      tenantId,
      userId: user.id,
      type: 'xapi-statement',
      payload: statement,
      idempotencyKey,
    })
    syncMessage.value = 'Completion saved offline and will sync when signal returns.'
  }
}

function canTrackVimeo(lesson: LmsLesson) {
  if (!lesson.vimeoUrl || !navigator.onLine) return false
  try {
    const pathname = new URL(lesson.vimeoUrl, window.location.origin).pathname
    return !/\/0+$/.test(pathname)
  } catch {
    return false
  }
}

async function handleVideoTrack(event: {
  verb: 'played' | 'paused' | 'progressed' | 'completed'
  seconds?: number
  duration?: number
  percent?: number
}) {
  const user = session.user
  if (!user) return

  const statement = createVideoStatement({
    tenantId: session.tenant?.id ?? 'offline-demo',
    user,
    verb: event.verb,
    objectId: selectedLesson.value.id,
    name: selectedLesson.value.title,
    description: selectedLesson.value.description,
    seconds: event.seconds,
    duration: event.duration,
    percent: event.percent,
  })

  try {
    await api.submitXapiStatement(statement)
  } catch {
    await enqueueSyncItem({
      tenantId: session.tenant?.id ?? 'offline-demo',
      userId: user.id,
      type: 'xapi-statement',
      payload: statement,
    })
  }
}

async function warmOfflineCache() {
  try {
    const response = await api.courses()
    apiCourses.value = response.courses
    apiEnrollments.value = response.enrollments
    const completionResponse = await api.completions().catch(() => ({ completions: [] }))
    completedLessons.value = Array.from(
      new Set([
        ...completedLessons.value,
        ...completionResponse.completions.map((completion) => completion.lessonId).filter((lessonId): lessonId is string => Boolean(lessonId)),
      ]),
    )
    certificates.value = await api.myCertificates().then((result) => result.certificates).catch(() => [])
    await cacheCourses(response.courses)
    courseSource.value = 'api'
    if (response.courses[0] && !response.courses.some((course) => course.id === selectedPathId.value)) {
      selectedPathId.value = response.courses[0].id
      selectedLessonId.value = response.courses[0].modules[0]?.lessons[0]?.id ?? selectedLessonId.value
    }
    syncMessage.value = 'Assigned courses cached for offline field use.'
  } catch {
    const cachedCourses = await getCachedCourses()
    if (cachedCourses.length) {
      apiCourses.value = cachedCourses
      courseSource.value = 'cache'
      selectedPathId.value = cachedCourses[0].id
      selectedLessonId.value = cachedCourses[0].modules[0]?.lessons[0]?.id ?? selectedLessonId.value
      syncMessage.value = 'Using cached assigned courses until signal returns.'
      return
    }

    courseSource.value = 'seed'
    syncMessage.value = 'Offline demo mode is active. Local lessons remain available.'
  }
}

async function syncFieldQueue() {
  try {
    const result = await flushSyncQueue()
    syncMessage.value = `${result.accepted.length} queued event${result.accepted.length === 1 ? '' : 's'} synced.`
    await warmOfflineCache()
  } catch {
    syncMessage.value = 'Still offline. Field activity remains queued.'
  }
}

async function installPwa() {
  installMessage.value = ''

  if (installPrompt.value) {
    const promptEvent = installPrompt.value
    installPrompt.value = null
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    installMessage.value =
      choice.outcome === 'accepted' ? 'Soteria Forge is installing.' : 'Install dismissed. You can try again from the browser menu.'
    return
  }

  installMessage.value = 'On iPhone or iPad, tap Share, then Add to Home Screen. On Android, use Install app from the browser menu.'
}

function handleBeforeInstallPrompt(event: Event) {
  event.preventDefault()
  installPrompt.value = event as BeforeInstallPromptEvent
}

function updateStandaloneStatus() {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }
  isStandalonePwa.value =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigatorWithStandalone && Boolean(navigatorWithStandalone.standalone))
}

onMounted(() => {
  updateStandaloneStatus()
  void session.restore().then(() => {
    if (session.user?.name) {
      employeeName.value = session.user.name
      isLoggedIn.value = true
      void warmOfflineCache()
    }
  })
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.addEventListener('appinstalled', updateStandaloneStatus)
  window.addEventListener('online', syncFieldQueue)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
  window.removeEventListener('appinstalled', updateStandaloneStatus)
  window.removeEventListener('online', syncFieldQueue)
})
</script>

<template>
  <main v-if="!isLoggedIn" class="login-screen">
    <div class="login-shell">
      <section class="login-card" aria-labelledby="login-title">
        <div class="client-logo-block">
          <img :src="templateLogo" alt="Soteria Forge" />
        </div>
        <h1 id="login-title">Soteria Forge</h1>
        <p>Corporate culture, confidence, and professional development training that feels practical.</p>

        <form class="login-form" @submit.prevent="login">
          <label for="employee-name">Employee name</label>
          <input id="employee-name" v-model="employeeName" autocomplete="name" />

          <label for="employee-role">Role</label>
          <input id="employee-role" v-model="employeeRole" autocomplete="organization-title" />

          <label for="employee-email">Email</label>
          <input id="employee-email" v-model="employeeEmail" autocomplete="email" type="email" />

          <label for="employee-password">Password</label>
          <input id="employee-password" v-model="employeePassword" autocomplete="current-password" type="password" />

          <button class="button button-primary" type="submit">
            <CirclePlay :size="18" aria-hidden="true" />
            Enter Training
          </button>

          <button v-if="!isStandalonePwa" class="button button-install" type="button" @click="installPwa">
            <Download :size="18" aria-hidden="true" />
            Download App
          </button>
          <RouterLink class="button button-secondary" to="/catalog">Browse Courses</RouterLink>
        </form>

        <p v-if="installMessage" class="install-message">{{ installMessage }}</p>
        <p v-if="session.error" class="install-message">{{ session.error }}</p>
        <footer class="powered-by">Powered by Soteria Forge</footer>
      </section>
    </div>
  </main>

  <main v-else class="product-shell">
    <aside class="sidebar" aria-label="Soteria Forge navigation">
      <div class="sidebar-brand">
        <img :src="templateLogo" alt="Soteria Forge" />
        <span>Soteria Forge</span>
      </div>

      <nav class="nav-list">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="nav-item"
          :class="{ active: activeSection === item.id }"
          type="button"
          @click="activeSection = item.id"
        >
          <component :is="item.icon" :size="18" aria-hidden="true" />
          {{ item.label }}
        </button>
      </nav>

      <button v-if="!isStandalonePwa" class="nav-item install-nav" type="button" @click="installPwa">
        <Download :size="18" aria-hidden="true" />
        Download App
      </button>

      <button class="nav-item logout-button" type="button" @click="logout">
        <LogOut :size="18" aria-hidden="true" />
        Sign out
      </button>

      <p v-if="installMessage" class="install-message install-message-sidebar">{{ installMessage }}</p>
      <p v-if="syncMessage" class="install-message install-message-sidebar">{{ syncMessage }}</p>
      <footer class="platform-footer">Powered by Soteria Forge</footer>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div class="topbar-identity">
          <img :src="templateLogo" alt="Soteria Forge" />
          <div>
            <p class="eyebrow">Learner experience</p>
            <h1>{{ employeeName }}</h1>
            <p>
              {{ employeeRole }} ·
              {{ courseSource === 'api' ? 'Live Atlas courses' : courseSource === 'cache' ? 'Cached field courses' : 'Professional Development cohort' }}
            </p>
          </div>
        </div>
        <div class="profile-chip" aria-label="Current completion">
          <Award :size="18" aria-hidden="true" />
          {{ totalProgress }}% complete
        </div>
        <button class="profile-chip sync-chip" type="button" @click="syncFieldQueue">
          <Download :size="18" aria-hidden="true" />
          Sync
        </button>
      </header>

      <section v-if="activeSection === 'dashboard'" class="screen-stack">
        <div class="hero-panel">
          <div>
            <p class="eyebrow">Next lesson</p>
            <h2>{{ nextUp?.title }}</h2>
            <p>
              Continue your assigned development path with quick lessons, scenario practice,
              and workplace-ready coaching.
            </p>
            <button class="button button-primary" type="button" @click="activeSection = 'learn'">
              <CirclePlay :size="18" aria-hidden="true" />
              Resume Training
            </button>
          </div>

          <div class="video-preview" aria-label="Training video preview">
            <div class="video-frame">
              <CirclePlay :size="54" aria-hidden="true" />
              <span>Professional Presence</span>
            </div>
          </div>
        </div>

        <div class="metric-grid">
          <article class="metric-card">
            <span>Assigned paths</span>
            <strong>{{ activeTrainingPaths.length }}</strong>
          </article>
          <article class="metric-card">
            <span>Completed lessons</span>
            <strong>{{ completedLessons.length }}</strong>
          </article>
          <article class="metric-card">
            <span>Quiz score</span>
            <strong>{{ quizScore }}/{{ selectedQuizQuestions.length }}</strong>
          </article>
          <article class="metric-card">
            <span>Game score</span>
            <strong>{{ gameScore }}/1</strong>
          </article>
          <article class="metric-card">
            <span>Certificates</span>
            <strong>{{ certificateCount }}</strong>
          </article>
          <article class="metric-card">
            <span>Leaderboard rank</span>
            <strong>{{ currentPlayerRank ? `#${currentPlayerRank}` : 'Play' }}</strong>
          </article>
        </div>

        <div class="path-grid">
          <article v-for="path in activeTrainingPaths" :key="path.id" class="path-card">
            <div>
              <span>{{ path.category }}</span>
              <h3>{{ path.title }}</h3>
              <p>{{ path.outcome }}</p>
            </div>
            <div class="progress-track" aria-hidden="true">
              <span :style="{ width: `${path.progress}%` }"></span>
            </div>
            <footer>
              <small>Due {{ path.dueDate }}</small>
              <button class="icon-button" type="button" :aria-label="`Open ${path.title}`" @click="choosePath(path.id)">
                <ChevronRight :size="18" aria-hidden="true" />
              </button>
            </footer>
          </article>
        </div>
      </section>

      <section v-else-if="activeSection === 'learn'" class="learn-layout">
        <aside class="path-list" aria-label="Training paths">
          <button
            v-for="path in activeTrainingPaths"
            :key="path.id"
            class="path-selector"
            :class="{ active: selectedPathId === path.id }"
            type="button"
            @click="choosePath(path.id)"
          >
            <span>{{ path.category }}</span>
            <strong>{{ path.title }}</strong>
          </button>
        </aside>

        <section class="lesson-workspace">
          <div class="lesson-header">
            <div>
              <p class="eyebrow">{{ selectedPath.title }}</p>
              <h2>{{ selectedLesson.title }}</h2>
              <p>{{ selectedLesson.description }}</p>
            </div>
            <span class="duration-pill">{{ selectedLesson.duration }}</span>
          </div>

          <div class="lesson-body">
            <div v-if="selectedLesson.type === 'video'" class="training-video">
              <VimeoLessonPlayer
                v-if="canTrackVimeo(selectedLesson) && selectedLesson.vimeoUrl"
                :key="selectedLesson.id"
                :title="selectedLesson.title"
                :url="selectedLesson.vimeoUrl"
                @track="handleVideoTrack"
              />
              <div v-else-if="selectedLesson.id === 'professional-first-impressions'" class="synthesia-video">
                <button
                  v-if="!activeVideoLessons[selectedLesson.id]"
                  class="video-thumbnail"
                  type="button"
                  aria-label="Play Professional First Impressions video"
                  @click="playLessonVideo(selectedLesson.id)"
                >
                  <img :src="lessonThumbnail" alt="" />
                  <span class="video-play-badge">
                    <CirclePlay :size="54" aria-hidden="true" />
                  </span>
                </button>
                <iframe
                  v-else
                  src="about:blank"
                  loading="lazy"
                  title="Replace this embed - Professional First Impressions"
                  allowfullscreen
                  allow="encrypted-media; fullscreen; microphone; screen-wake-lock;"
                ></iframe>
              </div>
              <div v-else class="video-frame video-frame-large">
                <CirclePlay :size="64" aria-hidden="true" />
                <span>{{ selectedLesson.title }}</span>
              </div>
              <div class="lesson-notes">
                <h3>{{ selectedLesson.transcript || selectedLesson.offlineSummary ? 'Offline support' : 'Key takeaways' }}</h3>
                <p v-if="selectedLesson.offlineSummary">{{ selectedLesson.offlineSummary }}</p>
                <p v-if="selectedLesson.transcript">{{ selectedLesson.transcript }}</p>
                <ul v-if="!selectedLesson.transcript && !selectedLesson.offlineSummary">
                  <li>Preparedness is visible before you say a word.</li>
                  <li>Professional presence combines tone, posture, timing, and follow-through.</li>
                  <li>Confidence grows when your actions match your commitments.</li>
                </ul>
              </div>
            </div>

            <div v-else-if="selectedLesson.type === 'scorm'" class="quiz-stack">
              <article class="question-block">
                <h3>SCORM launch ready</h3>
                <p>
                  This lesson is configured for the Soteria Forge SCORM runtime. Launch packaging will activate when a
                  SCORM asset is attached to this lesson.
                </p>
                <p v-if="selectedLesson.offlineSummary" class="coaching-note">{{ selectedLesson.offlineSummary }}</p>
              </article>
            </div>

            <div v-else-if="selectedLesson.type === 'document' || selectedLesson.type === 'reflection' || selectedLesson.type === 'practical-signoff'" class="quiz-stack">
              <article class="question-block">
                <h3>{{ selectedLesson.title }}</h3>
                <p>{{ selectedLesson.description }}</p>
                <p v-if="selectedLesson.offlineSummary" class="coaching-note">{{ selectedLesson.offlineSummary }}</p>
              </article>
            </div>

            <div v-else-if="selectedLesson.type === 'quiz'" class="quiz-stack">
              <article v-for="question in selectedQuizQuestions" :key="question.id" class="question-block">
                <h3>{{ question.prompt }}</h3>
                <label v-for="option in question.options" :key="option" class="choice-row">
                  <input v-model="quizAnswers[question.id]" type="radio" :name="question.id" :value="option" />
                  <span>{{ option }}</span>
                </label>
                <p v-if="quizAnswers[question.id]" class="coaching-note">
                  {{ quizAnswers[question.id] === question.answer ? 'Correct. ' : 'Try again. ' }}
                  {{ question.coaching }}
                </p>
              </article>
            </div>

            <div v-else class="game-board">
              <FirstImpressionSprint @complete="handleFirstImpressionComplete" />
            </div>
          </div>

          <footer class="lesson-footer">
            <div class="lesson-tabs">
              <button
                v-for="lesson in selectedPath.lessons"
                :key="lesson.id"
                class="lesson-tab"
                :class="{ active: selectedLessonId === lesson.id, locked: lesson.status === 'locked' }"
                type="button"
                @click="chooseLesson(lesson)"
              >
                <Check v-if="completedLessons.includes(lesson.id)" :size="15" aria-hidden="true" />
                {{ lesson.title }}
              </button>
            </div>
            <button class="button button-primary" type="button" @click="completeSelectedLesson">
              <Check :size="18" aria-hidden="true" />
              Mark Complete
            </button>
          </footer>
        </section>
      </section>

      <section v-else-if="activeSection === 'games'" class="screen-stack">
        <div class="section-heading">
          <p class="eyebrow">Practice arena</p>
          <h2>Professional development games</h2>
          <p>Short JavaScript games and puzzles reinforce the training paths without feeling like a heavy LMS.</p>
        </div>
        <div class="game-grid">
          <article class="game-tile featured">
            <Gamepad2 :size="26" aria-hidden="true" />
            <h3>Professional Presence Sprint</h3>
            <p>Guide an avatar through a polished workday simulation and earn a training score.</p>
            <strong>{{ firstImpressionResult?.completed ? 'Completed' : 'Ready to play' }}</strong>
          </article>
          <article class="game-tile">
            <ClipboardList :size="26" aria-hidden="true" />
            <h3>Tone Tune-Up</h3>
            <p>Choose clear, confident wording for tense workplace moments.</p>
            <strong>Coming next</strong>
          </article>
          <article class="game-tile">
            <Sparkles :size="26" aria-hidden="true" />
            <h3>Priority Puzzle</h3>
            <p>Sort tasks by urgency, importance, and business impact.</p>
            <strong>Storyboard ready</strong>
          </article>
        </div>

        <FirstImpressionSprint @complete="handleFirstImpressionComplete" />
      </section>

      <section v-else-if="activeSection === 'leaderboard'" class="screen-stack">
        <div class="section-heading">
          <p class="eyebrow">Competitive practice</p>
          <h2>Professional Presence Sprint leaderboard</h2>
          <p>Employees compete for the best training score while practicing polished workplace decisions.</p>
        </div>

        <div class="podium-grid" aria-label="Top leaderboard players">
          <article v-for="entry in podiumEntries" :key="entry.id" class="podium-card" :class="{ current: entry.isCurrentUser }">
            <span class="rank-badge">#{{ entry.rank }}</span>
            <div class="podium-avatar" aria-hidden="true">{{ entry.playerName.slice(0, 1) }}</div>
            <h3>{{ entry.playerName }}</h3>
            <p>{{ entry.department }}</p>
            <strong>{{ entry.score }}</strong>
            <small>{{ entry.badge }}</small>
          </article>
        </div>

        <div class="leaderboard-table" role="table" aria-label="Seeded game leaderboard">
          <div class="leaderboard-row leaderboard-head" role="row">
            <span role="columnheader">Rank</span>
            <span role="columnheader">Player</span>
            <span role="columnheader">Department</span>
            <span role="columnheader">Score</span>
            <span role="columnheader">Badge</span>
            <span role="columnheader">Completed</span>
          </div>
          <div
            v-for="entry in leaderboardRows"
            :key="entry.id"
            class="leaderboard-row"
            :class="{ current: entry.isCurrentUser }"
            role="row"
          >
            <span role="cell" data-label="Rank">#{{ entry.rank }}</span>
            <span role="cell" data-label="Player">
              <strong>{{ entry.playerName }}</strong>
              <small v-if="entry.isCurrentUser">You</small>
            </span>
            <span role="cell" data-label="Department">{{ entry.department }}</span>
            <span role="cell" data-label="Score">{{ entry.score }}</span>
            <span role="cell" data-label="Badge">{{ entry.badge }}</span>
            <span role="cell" data-label="Completed">{{ entry.completedAt }}</span>
          </div>
        </div>

        <div v-if="!firstImpressionResult" class="leaderboard-callout">
          <Trophy :size="22" aria-hidden="true" />
          <div>
            <h3>Play Professional Presence Sprint to enter the leaderboard.</h3>
            <p>Your score will be ranked against seeded players immediately after the run.</p>
          </div>
          <button class="button button-primary" type="button" @click="activeSection = 'games'">Play Game</button>
        </div>
      </section>

      <section v-else-if="activeSection === 'goals'" class="goals-layout">
        <div class="section-heading">
          <p class="eyebrow">Growth commitments</p>
          <h2>Turn training into workplace action</h2>
          <p>Employees set short goals after lessons so development shows up in real behavior.</p>
        </div>

        <form class="goal-form" @submit.prevent="addGoal">
          <label for="goal">New professional growth goal</label>
          <div>
            <input id="goal" v-model="goalDraft" placeholder="Example: Prepare two questions before each team meeting." />
            <button class="button button-primary" type="submit">
              <Goal :size="18" aria-hidden="true" />
              Add Goal
            </button>
          </div>
        </form>

        <div class="goal-list">
          <article v-for="goal in goals" :key="goal" class="goal-card">
            <Check :size="18" aria-hidden="true" />
            <span>{{ goal }}</span>
          </article>
        </div>
      </section>

      <section v-else class="screen-stack">
        <div class="section-heading">
          <p class="eyebrow">Manager view</p>
          <h2>Completion and coaching signals</h2>
          <p>Soteria Forge reporting should stay lightweight: completion, overdue training, and coaching prompts.</p>
        </div>

        <div class="report-table" role="table" aria-label="Team progress">
          <div class="report-row report-head" role="row">
            <span role="columnheader">Employee</span>
            <span role="columnheader">Department</span>
            <span role="columnheader">Progress</span>
            <span role="columnheader">Status</span>
          </div>
          <div v-for="member in teamProgress" :key="member.name" class="report-row" role="row">
            <span role="cell">{{ member.name }}</span>
            <span role="cell">{{ member.department }}</span>
            <span role="cell">{{ member.progress }}%</span>
            <span role="cell">{{ member.risk }}</span>
          </div>
        </div>

        <div class="admin-actions">
          <button class="button button-secondary" type="button">
            <Users :size="18" aria-hidden="true" />
            Upload Users
          </button>
          <button class="button button-secondary" type="button">
            <BookOpen :size="18" aria-hidden="true" />
            Create Path
          </button>
        </div>
      </section>
    </section>
  </main>
</template>

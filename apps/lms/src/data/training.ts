export type LessonType = 'video' | 'quiz' | 'game'

export type Lesson = {
  id: string
  title: string
  type: LessonType
  duration: string
  description: string
  status: 'complete' | 'current' | 'locked'
}

export type TrainingPath = {
  id: string
  title: string
  category: string
  outcome: string
  dueDate: string
  progress: number
  lessons: Lesson[]
}

export type QuizQuestion = {
  id: string
  prompt: string
  options: string[]
  answer: string
  coaching: string
}

export type GameScenario = {
  id: string
  setup: string
  choices: string[]
  bestChoice: string
}

export type LeaderboardEntry = {
  id: string
  playerName: string
  department: string
  gameTitle: string
  score: number
  completedAt: string
  badge: string
}

export const trainingPaths: TrainingPath[] = [
  {
    id: 'presence',
    title: 'Professional Presence',
    category: 'Culture',
    outcome: 'Show up polished, prepared, and credible in everyday workplace moments.',
    dueDate: 'Jun 7',
    progress: 64,
    lessons: [
      {
        id: 'professional-first-impressions',
        title: 'Professional First Impressions',
        type: 'video',
        duration: '6 min',
        description: 'A short lesson on visual presence, eye contact, greetings, and readiness.',
        status: 'complete',
      },
      {
        id: 'appearance-check',
        title: 'Appearance And Readiness Check',
        type: 'quiz',
        duration: '4 min',
        description: 'Practice choosing the most professional response for common workplace settings.',
        status: 'current',
      },
      {
        id: 'professional-presence-sprint',
        title: 'Professional Presence Sprint',
        type: 'game',
        duration: '5 min',
        description: 'Guide an avatar through a short professional workday and build a training score.',
        status: 'current',
      },
    ],
  },
  {
    id: 'confidence',
    title: 'Confidence In Motion',
    category: 'Professional Skills',
    outcome: 'Speak up clearly, recover from mistakes, and stay composed under pressure.',
    dueDate: 'Jun 14',
    progress: 28,
    lessons: [
      {
        id: 'steady-voice',
        title: 'Using A Steady Voice',
        type: 'video',
        duration: '7 min',
        description: 'Practical techniques for confident tone, pacing, and body language.',
        status: 'current',
      },
      {
        id: 'tone-tune-up',
        title: 'Tone Tune-Up',
        type: 'game',
        duration: '6 min',
        description: 'Rewrite rough workplace replies into clear, professional responses.',
        status: 'locked',
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goal Setting That Sticks',
    category: 'Growth',
    outcome: 'Turn vague intentions into specific actions with accountability.',
    dueDate: 'Jun 21',
    progress: 12,
    lessons: [
      {
        id: 'goal-ladder',
        title: 'Build A Goal Ladder',
        type: 'video',
        duration: '8 min',
        description: 'Convert a big professional goal into weekly actions and proof of progress.',
        status: 'current',
      },
      {
        id: 'priority-puzzle',
        title: 'Priority Puzzle',
        type: 'game',
        duration: '5 min',
        description: 'Sort tasks by urgency, importance, and impact.',
        status: 'locked',
      },
    ],
  },
]

export const quizQuestions: QuizQuestion[] = [
  {
    id: 'q1',
    prompt: 'You join a client meeting two minutes late. What is the strongest professional recovery?',
    options: [
      'Say nothing and hope the meeting moves on.',
      'Apologize briefly, join the agenda, and follow up afterward if you missed context.',
      'Explain every reason you were late.',
    ],
    answer: 'Apologize briefly, join the agenda, and follow up afterward if you missed context.',
    coaching: 'Professional recovery is brief, accountable, and focused on the meeting.',
  },
  {
    id: 'q2',
    prompt: 'Which habit most improves workplace presence before a meeting?',
    options: [
      'Arriving prepared with notes, questions, and a clear purpose.',
      'Waiting to understand the topic once the meeting starts.',
      'Multitasking until someone asks for input.',
    ],
    answer: 'Arriving prepared with notes, questions, and a clear purpose.',
    coaching: 'Preparedness is visible. It signals respect for the room and confidence in your role.',
  },
  {
    id: 'q3',
    prompt: 'A coworker gives blunt feedback. What response keeps you professional?',
    options: [
      'Defend yourself immediately.',
      'Ask one clarifying question and identify the next action.',
      'Ignore the feedback unless a manager repeats it.',
    ],
    answer: 'Ask one clarifying question and identify the next action.',
    coaching: 'Confidence is not defensiveness. It is the ability to learn without losing composure.',
  },
]

export const gameScenarios: GameScenario[] = [
  {
    id: 'g1',
    setup: 'A manager asks for an update, and the project is behind schedule.',
    choices: [
      'I am still working on it. I will let you know later.',
      'We are behind by one day. I have two blockers and a recovery plan for Friday.',
      'The delay is not really my fault.',
    ],
    bestChoice: 'We are behind by one day. I have two blockers and a recovery plan for Friday.',
  },
  {
    id: 'g2',
    setup: 'You disagree with a teammate during a meeting.',
    choices: [
      'That will not work.',
      'I see the goal. Can we compare it with another option before deciding?',
      'I already tried something like that before.',
    ],
    bestChoice: 'I see the goal. Can we compare it with another option before deciding?',
  },
  {
    id: 'g3',
    setup: 'You need help finishing a task by the end of the day.',
    choices: [
      'Can someone help me with this?',
      'I need 20 minutes of review on the client summary by 3 PM. Who has capacity?',
      'This is too much for one person.',
    ],
    bestChoice: 'I need 20 minutes of review on the client summary by 3 PM. Who has capacity?',
  },
]

export const teamProgress = [
  { name: 'Avery Chen', department: 'Operations', progress: 86, risk: 'On track' },
  { name: 'Marcus Hill', department: 'Customer Success', progress: 72, risk: 'On track' },
  { name: 'Nia Brooks', department: 'Sales', progress: 44, risk: 'Needs reminder' },
  { name: 'Jordan Lee', department: 'Field Team', progress: 31, risk: 'Overdue' },
]

export const seededLeaderboardEntries: LeaderboardEntry[] = [
  {
    id: 'lb-1',
    playerName: 'Imani Carter',
    department: 'Client Services',
    gameTitle: 'Professional Presence Sprint',
    score: 97,
    completedAt: 'Today',
    badge: 'Presence Pro',
  },
  {
    id: 'lb-2',
    playerName: 'Malik Thompson',
    department: 'Operations',
    gameTitle: 'Professional Presence Sprint',
    score: 94,
    completedAt: 'Today',
    badge: 'Clear Communicator',
  },
  {
    id: 'lb-3',
    playerName: 'Aaliyah Brooks',
    department: 'Sales',
    gameTitle: 'Professional Presence Sprint',
    score: 91,
    completedAt: 'Yesterday',
    badge: 'Confidence Builder',
  },
  {
    id: 'lb-4',
    playerName: 'Darius Williams',
    department: 'Field Team',
    gameTitle: 'Professional Presence Sprint',
    score: 88,
    completedAt: 'Yesterday',
    badge: 'Accountability Ace',
  },
  {
    id: 'lb-5',
    playerName: 'Simone Davis',
    department: 'Human Resources',
    gameTitle: 'Professional Presence Sprint',
    score: 84,
    completedAt: 'Mon',
    badge: 'Goal Setter',
  },
  {
    id: 'lb-6',
    playerName: 'Andre Johnson',
    department: 'Customer Success',
    gameTitle: 'Professional Presence Sprint',
    score: 79,
    completedAt: 'Mon',
    badge: 'Steady Voice',
  },
]

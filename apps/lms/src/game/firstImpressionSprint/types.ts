export type ScoreCategory = 'presence' | 'communication' | 'confidence' | 'accountability'

export type ScoreMap = Record<ScoreCategory, number>

export type SprintChoice = {
  id: string
  label: string
  shortLabel: string
  supportingText: string
  coaching: string
  animationKey: string
  soundKey: 'select' | 'positive' | 'coach'
  categoryImpact: Partial<ScoreMap>
}

export type SprintScene = {
  id: string
  title: string
  prompt: string
  backgroundKey: 'lobby' | 'prep' | 'meeting' | 'feedback' | 'goals'
  choices: SprintChoice[]
  correctChoiceId: string
}

export type SprintGameDefinition = {
  id: string
  title: string
  trainingPathId: string
  completionThreshold: number
  scoreCategories: ScoreCategory[]
  scenes: SprintScene[]
}

export type SceneResolution = {
  sceneId: string
  choiceId: string
  correct: boolean
  coaching: string
  categoryScores: ScoreMap
  score: number
}

export type SprintGameResult = {
  gameId: string
  score: number
  categoryScores: ScoreMap
  completed: boolean
  selectedChoices: Record<string, string>
  coachingSummary: string
}

export type SprintGameEvent =
  | {
      type: 'sceneChanged'
      scene: SprintScene
      sceneIndex: number
      totalScenes: number
      categoryScores: ScoreMap
      score: number
    }
  | {
      type: 'choiceResolved'
      resolution: SceneResolution
    }
  | {
      type: 'gameComplete'
      result: SprintGameResult
    }
  | {
      type: 'gameRestarted'
    }

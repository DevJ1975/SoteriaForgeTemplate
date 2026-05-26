import type {
  SceneResolution,
  ScoreCategory,
  ScoreMap,
  SprintChoice,
  SprintGameDefinition,
  SprintGameResult,
} from './types'

const coachingByBand = {
  high: 'Excellent work. Your choices showed preparation, confidence, and ownership across the whole workday.',
  passing: 'Good progress. You made several strong professional choices and have a clear next step to practice.',
  low: 'Keep practicing. Focus on specific preparation, clear updates, and calm responses to feedback.',
}

export class FirstImpressionSprintSession {
  readonly definition: SprintGameDefinition
  private currentIndex = 0
  private categoryScores: ScoreMap
  private selectedChoices: Record<string, string> = {}

  constructor(definition: SprintGameDefinition) {
    this.definition = definition
    this.categoryScores = this.createEmptyScores()
  }

  get currentScene() {
    return this.definition.scenes[this.currentIndex]
  }

  get sceneIndex() {
    return this.currentIndex
  }

  get totalScenes() {
    return this.definition.scenes.length
  }

  get scores() {
    return { ...this.categoryScores }
  }

  get score() {
    return Math.round((this.rawScore / this.maxScore) * 100)
  }

  get isLastScene() {
    return this.currentIndex === this.definition.scenes.length - 1
  }

  reset() {
    this.currentIndex = 0
    this.categoryScores = this.createEmptyScores()
    this.selectedChoices = {}
  }

  choose(choiceId: string): SceneResolution {
    const scene = this.currentScene
    const choice = scene.choices.find((candidate) => candidate.id === choiceId)

    if (!choice) {
      throw new Error(`Unknown choice ${choiceId}`)
    }

    this.selectedChoices[scene.id] = choice.id
    this.addChoiceImpact(choice)

    return {
      sceneId: scene.id,
      choiceId: choice.id,
      correct: choice.id === scene.correctChoiceId,
      coaching: choice.coaching,
      categoryScores: this.scores,
      score: this.score,
    }
  }

  advance() {
    this.currentIndex = Math.min(this.currentIndex + 1, this.definition.scenes.length - 1)
  }

  getResult(): SprintGameResult {
    const score = this.score

    return {
      gameId: this.definition.id,
      score,
      categoryScores: this.scores,
      completed: score >= this.definition.completionThreshold,
      selectedChoices: { ...this.selectedChoices },
      coachingSummary:
        score >= 90 ? coachingByBand.high : score >= this.definition.completionThreshold ? coachingByBand.passing : coachingByBand.low,
    }
  }

  private addChoiceImpact(choice: SprintChoice) {
    for (const category of this.definition.scoreCategories) {
      this.categoryScores[category] += choice.categoryImpact[category] ?? 0
    }
  }

  private createEmptyScores(): ScoreMap {
    return this.definition.scoreCategories.reduce((scores, category) => {
      scores[category] = 0
      return scores
    }, {} as ScoreMap)
  }

  private get rawScore() {
    return this.definition.scoreCategories.reduce((sum, category) => sum + this.categoryScores[category], 0)
  }

  private get maxScore() {
    return this.definition.scenes.reduce((sum, scene) => {
      const correctChoice = scene.choices.find((choice) => choice.id === scene.correctChoiceId)
      return sum + this.definition.scoreCategories.reduce((choiceSum, category: ScoreCategory) => {
        return choiceSum + (correctChoice?.categoryImpact[category] ?? 0)
      }, 0)
    }, 0)
  }
}

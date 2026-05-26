import Phaser from 'phaser'
import { firstImpressionSprint } from './data'
import { FirstImpressionSprintSession } from './session'
import type { SceneResolution, SprintChoice, SprintGameEvent, SprintScene } from './types'

type EmitGameEvent = (event: SprintGameEvent) => void
type SceneKey = SprintScene['backgroundKey']

const sceneColors: Record<SceneKey, { wall: number; floor: number; accent: number; secondary: number }> = {
  lobby: { wall: 0xeaf1f7, floor: 0xd9e6ef, accent: 0x1f3f86, secondary: 0x2f7d69 },
  prep: { wall: 0xf1f5f9, floor: 0xe1e8f0, accent: 0x2f7d69, secondary: 0x1f3f86 },
  meeting: { wall: 0xe8eef8, floor: 0xdbe6f2, accent: 0x294a8f, secondary: 0x2f7d69 },
  feedback: { wall: 0xf4f1ec, floor: 0xe8ded1, accent: 0x8a5a2b, secondary: 0x1f3f86 },
  goals: { wall: 0xeaf3ef, floor: 0xdcebe4, accent: 0x2f7d69, secondary: 0x1f3f86 },
}

class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene')
  }

  create() {
    this.createPersonTexture('employee-avatar', 0x1f3f86, 0x7a4a32, 0x17120f)
    this.createPersonTexture('manager-avatar', 0x6b4f36, 0x6e432d, 0x1d1512)
    this.createPersonTexture('client-avatar', 0x2f7d69, 0x8a5638, 0x16110f)
    this.scene.start('WorkdayScene')
  }

  private createPersonTexture(key: string, jacket: number, skin: number, hair: number) {
    const graphics = this.make.graphics({ x: 0, y: 0 })
    graphics.fillStyle(jacket)
    graphics.fillRoundedRect(23, 58, 50, 72, 16)
    graphics.fillStyle(0xffffff)
    graphics.fillTriangle(36, 60, 60, 60, 48, 86)
    graphics.fillStyle(skin)
    graphics.fillRoundedRect(34, 39, 28, 24, 10)
    graphics.fillCircle(48, 30, 24)
    graphics.fillStyle(hair)
    graphics.fillCircle(31, 18, 13)
    graphics.fillCircle(44, 10, 16)
    graphics.fillCircle(61, 20, 13)
    graphics.fillRoundedRect(26, 19, 44, 17, 12)
    graphics.fillStyle(0x2b1b16)
    graphics.fillCircle(40, 31, 2)
    graphics.fillCircle(56, 31, 2)
    graphics.lineStyle(2, 0x3a241c)
    graphics.beginPath()
    graphics.arc(48, 41, 7, 0.2, Math.PI - 0.2)
    graphics.strokePath()
    graphics.fillStyle(skin)
    graphics.fillRoundedRect(12, 67, 16, 42, 8)
    graphics.fillRoundedRect(68, 67, 16, 42, 8)
    graphics.generateTexture(key, 96, 142)
    graphics.destroy()
  }
}

class WorkdayScene extends Phaser.Scene {
  private isResolving = false
  private avatar?: Phaser.GameObjects.Image

  constructor(
    private readonly session: FirstImpressionSprintSession,
    private readonly emit: EmitGameEvent,
  ) {
    super('WorkdayScene')
  }

  create() {
    this.scale.on(Phaser.Scale.Events.RESIZE, this.renderScene, this)
    this.game.events.on('training:choice', this.resolveChoice, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.removeListeners, this)
    this.renderScene()
  }

  private removeListeners() {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.renderScene, this)
    this.game.events.off('training:choice', this.resolveChoice, this)
  }

  private renderScene() {
    const scene = this.session.currentScene
    this.isResolving = false
    this.children.removeAll()
    this.avatar = undefined
    this.cameras.main.setBackgroundColor('#f5f8fc')
    this.renderVignette(scene)
    this.renderProgress(scene)

    this.emit({
      type: 'sceneChanged',
      scene,
      sceneIndex: this.session.sceneIndex,
      totalScenes: this.session.totalScenes,
      categoryScores: this.session.scores,
      score: this.session.score,
    })
  }

  private renderVignette(scene: SprintScene) {
    const { width, height } = this.scale
    const colors = sceneColors[scene.backgroundKey]
    const graphics = this.add.graphics()

    graphics.fillStyle(colors.wall)
    graphics.fillRoundedRect(0, 0, width, height, 22)
    graphics.fillStyle(0xffffff, 0.38)
    graphics.fillRoundedRect(width * 0.07, height * 0.06, width * 0.86, height * 0.16, 18)
    graphics.fillStyle(colors.floor)
    graphics.fillPoints(
      [
        new Phaser.Math.Vector2(width * 0.02, height * 0.92),
        new Phaser.Math.Vector2(width * 0.5, height * 0.42),
        new Phaser.Math.Vector2(width * 0.98, height * 0.92),
        new Phaser.Math.Vector2(width * 0.5, height * 1.02),
      ],
      true,
    )
    graphics.lineStyle(2, 0xcbd7e6, 0.68)
    graphics.lineBetween(width * 0.12, height * 0.88, width * 0.5, height * 0.43)
    graphics.lineBetween(width * 0.88, height * 0.88, width * 0.5, height * 0.43)

    this.add.text(width * 0.08, height * 0.09, scene.title, {
      color: '#172033',
      fontFamily: 'Inter, Arial, sans-serif',
        fontSize: this.isMobileCanvas ? '26px' : '28px',
      fontStyle: '700',
    })

    if (scene.backgroundKey === 'lobby') this.renderLobby(colors)
    if (scene.backgroundKey === 'prep') this.renderPrep(colors)
    if (scene.backgroundKey === 'meeting') this.renderMeeting(colors)
    if (scene.backgroundKey === 'feedback') this.renderFeedback(colors)
    if (scene.backgroundKey === 'goals') this.renderGoals(colors)

    this.tweens.add({
      targets: this.avatar,
      y: this.avatar ? this.avatar.y - 6 : 0,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    })
  }

  private renderLobby(colors: { accent: number; secondary: number }) {
    const { width, height } = this.scale
    const graphics = this.add.graphics()
    this.drawReceptionDesk(graphics, width * 0.49, height * 0.47, colors.accent)
    this.drawPhone(graphics, width * 0.22, height * 0.66, false)
    this.drawDocumentStack(graphics, width * 0.36, height * 0.62, colors.secondary, 'Notes')
    this.add.image(width * 0.68, height * 0.47, 'manager-avatar').setScale(this.characterScale * 0.72)
    this.avatar = this.add.image(width * 0.25, height * 0.58, 'employee-avatar').setScale(this.characterScale)
    this.drawChoiceTag(width * 0.35, height * 0.74, 'Ready')
  }

  private renderPrep(colors: { accent: number; secondary: number }) {
    const { width, height } = this.scale
    const graphics = this.add.graphics()
    this.drawTable(graphics, width * 0.5, height * 0.58, width * 0.52, height * 0.2)
    this.drawDocumentStack(graphics, width * 0.36, height * 0.53, colors.secondary, 'Agenda')
    this.drawDocumentStack(graphics, width * 0.5, height * 0.51, colors.accent, 'Update')
    this.drawNotebook(graphics, width * 0.63, height * 0.56)
    this.drawClutter(graphics, width * 0.72, height * 0.51)
    this.avatar = this.add.image(width * 0.23, height * 0.54, 'employee-avatar').setScale(this.characterScale)
    this.drawChoiceTag(width * 0.5, height * 0.74, 'Prep stack')
  }

  private renderMeeting(colors: { accent: number; secondary: number }) {
    const { width, height } = this.scale
    const graphics = this.add.graphics()
    this.drawPresentationScreen(graphics, width * 0.5, height * 0.26, colors.accent)
    this.drawTable(graphics, width * 0.52, height * 0.64, width * 0.58, height * 0.16)
    this.avatar = this.add.image(width * 0.25, height * 0.56, 'employee-avatar').setScale(this.characterScale * 0.92)
    this.add.image(width * 0.72, height * 0.55, 'client-avatar').setScale(this.characterScale * 0.84)
    this.drawSpeechBubble(graphics, width * 0.37, height * 0.38, colors.secondary, 'Plan')
    this.drawChoiceTag(width * 0.52, height * 0.77, 'Clear update')
  }

  private renderFeedback(colors: { accent: number; secondary: number }) {
    const { width, height } = this.scale
    const graphics = this.add.graphics()
    this.drawCoachingBoard(graphics, width * 0.5, height * 0.34, colors.secondary)
    this.avatar = this.add.image(width * 0.33, height * 0.58, 'employee-avatar').setScale(this.characterScale)
    this.add.image(width * 0.64, height * 0.56, 'manager-avatar').setScale(this.characterScale * 0.92)
    this.drawSpeechBubble(graphics, width * 0.62, height * 0.36, colors.accent, 'Feedback')
    this.drawChoiceTag(width * 0.48, height * 0.76, 'Clarify')
  }

  private renderGoals(colors: { accent: number; secondary: number }) {
    const { width, height } = this.scale
    const graphics = this.add.graphics()
    this.drawGoalBoard(graphics, width * 0.57, height * 0.46, colors.accent, colors.secondary)
    this.drawNotebook(graphics, width * 0.35, height * 0.62)
    this.avatar = this.add.image(width * 0.25, height * 0.56, 'employee-avatar').setScale(this.characterScale)
    this.drawChoiceTag(width * 0.57, height * 0.75, 'Specific goal')
  }

  private drawReceptionDesk(graphics: Phaser.GameObjects.Graphics, x: number, y: number, accent: number) {
    graphics.fillStyle(0xffffff, 0.98)
    graphics.fillRoundedRect(x, y, 250, 102, 10)
    graphics.fillStyle(accent)
    graphics.fillRoundedRect(x + 32, y - 48, 138, 34, 8)
    this.add.text(x + 50, y - 39, 'RECEPTION', { color: '#ffffff', fontSize: '14px', fontStyle: '700' })
  }

  private drawTable(graphics: Phaser.GameObjects.Graphics, x: number, y: number, width: number, height: number) {
    graphics.fillStyle(0xffffff, 0.98)
    graphics.fillRoundedRect(x - width / 2, y - height / 2, width, height, 16)
    graphics.lineStyle(2, 0xd0dae8)
    graphics.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 16)
  }

  private drawPresentationScreen(graphics: Phaser.GameObjects.Graphics, x: number, y: number, accent: number) {
    graphics.fillStyle(0x172033)
    graphics.fillRoundedRect(x - 148, y - 52, 296, 104, 12)
    graphics.fillStyle(accent)
    graphics.fillRoundedRect(x - 126, y - 30, 176, 14, 5)
    graphics.fillStyle(0xffffff)
    graphics.fillRoundedRect(x - 126, y + 2, 222, 10, 5)
    graphics.fillRoundedRect(x - 126, y + 25, 146, 10, 5)
  }

  private drawCoachingBoard(graphics: Phaser.GameObjects.Graphics, x: number, y: number, accent: number) {
    graphics.fillStyle(0xffffff, 0.96)
    graphics.fillRoundedRect(x - 148, y - 58, 296, 116, 12)
    graphics.lineStyle(3, accent)
    graphics.lineBetween(x - 112, y - 18, x + 80, y - 18)
    graphics.lineBetween(x - 112, y + 16, x + 112, y + 16)
  }

  private drawGoalBoard(graphics: Phaser.GameObjects.Graphics, x: number, y: number, accent: number, secondary: number) {
    graphics.fillStyle(0xffffff, 0.98)
    graphics.fillRoundedRect(x - 160, y - 92, 320, 184, 12)
    graphics.fillStyle(0xe8f6f1)
    graphics.fillRoundedRect(x - 114, y - 48, 80, 24, 6)
    graphics.fillStyle(secondary)
    graphics.fillRoundedRect(x - 114, y - 8, 154, 24, 6)
    graphics.fillStyle(accent)
    graphics.fillRoundedRect(x - 114, y + 34, 220, 24, 6)
  }

  private drawPhone(graphics: Phaser.GameObjects.Graphics, x: number, y: number, selected: boolean) {
    graphics.fillStyle(selected ? 0xc7842f : 0x172033)
    graphics.fillRoundedRect(x - 22, y - 36, 44, 72, 8)
    graphics.fillStyle(0xeaf1f7)
    graphics.fillRoundedRect(x - 16, y - 25, 32, 50, 5)
  }

  private drawDocumentStack(graphics: Phaser.GameObjects.Graphics, x: number, y: number, accent: number, label: string) {
    graphics.fillStyle(0xffffff)
    graphics.fillRoundedRect(x - 42, y - 30, 84, 60, 7)
    graphics.fillStyle(accent)
    graphics.fillRoundedRect(x - 26, y - 15, 52, 8, 4)
    graphics.fillStyle(0xd7e0ec)
    graphics.fillRoundedRect(x - 26, y + 4, 40, 7, 3)
    this.add.text(x, y + 40, label, {
      color: '#334155',
      fontSize: '13px',
      fontStyle: '700',
    }).setOrigin(0.5)
  }

  private drawNotebook(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    graphics.fillStyle(0x1f3f86)
    graphics.fillRoundedRect(x - 40, y - 28, 80, 56, 8)
    graphics.fillStyle(0xffffff)
    graphics.fillRoundedRect(x - 28, y - 16, 56, 32, 5)
  }

  private drawClutter(graphics: Phaser.GameObjects.Graphics, x: number, y: number) {
    graphics.fillStyle(0xf8fafc)
    for (let i = 0; i < 4; i += 1) {
      graphics.fillRoundedRect(x - 44 + i * 18, y - 24 + i * 7, 72, 42, 5)
    }
  }

  private drawSpeechBubble(graphics: Phaser.GameObjects.Graphics, x: number, y: number, accent: number, label: string) {
    graphics.fillStyle(0xffffff, 0.98)
    graphics.fillRoundedRect(x - 72, y - 34, 144, 58, 16)
    graphics.fillTriangle(x - 12, y + 20, x + 10, y + 20, x, y + 42)
    graphics.fillStyle(accent)
    graphics.fillRoundedRect(x - 42, y - 11, 84, 10, 5)
    this.add.text(x, y + 42, label, { color: '#334155', fontSize: '13px', fontStyle: '700' }).setOrigin(0.5)
  }

  private drawChoiceTag(x: number, y: number, label: string) {
    const tag = this.add.text(x, y, label, {
      color: '#1f3f86',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: this.isMobileCanvas ? '18px' : '15px',
      fontStyle: '700',
      backgroundColor: '#ffffff',
      padding: { x: 12, y: 7 },
    }).setOrigin(0.5)
    tag.setAlpha(0.92)
  }

  private renderProgress(scene: SprintScene) {
    const { width, height } = this.scale
    const progress = (this.session.sceneIndex + 1) / this.session.totalScenes
    const graphics = this.add.graphics()
    graphics.fillStyle(0xe2e8f0)
    graphics.fillRoundedRect(width * 0.08, height - 30, width * 0.84, 9, 999)
    graphics.fillStyle(sceneColors[scene.backgroundKey].secondary)
    graphics.fillRoundedRect(width * 0.08, height - 30, width * 0.84 * progress, 9, 999)
  }

  private resolveChoice(choiceId: string) {
    if (this.isResolving) return
    this.isResolving = true

    const resolution = this.session.choose(choiceId)
    this.emit({ type: 'choiceResolved', resolution })
    this.animateResolution(resolution)

    this.time.delayedCall(1250, () => {
      if (this.session.isLastScene) {
        this.scene.start('ResultScene')
        return
      }

      this.session.advance()
      this.renderScene()
    })
  }

  private animateResolution(resolution: SceneResolution) {
    const scene = this.session.currentScene
    const choice = scene.choices.find((candidate) => candidate.id === resolution.choiceId)
    const point = this.getCuePoint(scene.backgroundKey, choice)
    const color = resolution.correct ? 0x2f7d69 : 0xc7842f
    const label = resolution.correct ? 'Strong choice' : 'Coaching moment'
    const graphics = this.add.graphics()

    graphics.fillStyle(color, 0.18)
    graphics.fillCircle(point.x, point.y, 74)
    graphics.lineStyle(5, color, 0.95)
    graphics.strokeCircle(point.x, point.y, 54)

    const cue = this.add.text(point.x, point.y - 78, choice?.shortLabel ?? label, {
      color: '#ffffff',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: this.isMobileCanvas ? '18px' : '21px',
      fontStyle: '700',
      backgroundColor: resolution.correct ? '#2f7d69' : '#c7842f',
      padding: { x: 14, y: 8 },
    }).setOrigin(0.5)

    this.tweens.add({
      targets: [graphics, cue, this.avatar],
      alpha: { from: 1, to: 0.86 },
      scale: this.avatar ? this.avatar.scale + 0.04 : 1,
      duration: 220,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.inOut',
    })
  }

  private getCuePoint(sceneKey: SceneKey, choice?: SprintChoice) {
    const { width, height } = this.scale
    const fallback = { x: width * 0.5, y: height * 0.56 }
    const points: Record<SceneKey, Record<string, { x: number; y: number }>> = {
      lobby: {
        phone: { x: width * 0.22, y: height * 0.66 },
        greeting: { x: width * 0.62, y: height * 0.58 },
        rush: { x: width * 0.82, y: height * 0.72 },
      },
      prep: {
        'prep-stack': { x: width * 0.5, y: height * 0.53 },
        notebook: { x: width * 0.63, y: height * 0.56 },
        clutter: { x: width * 0.72, y: height * 0.51 },
      },
      meeting: {
        vague: { x: width * 0.37, y: height * 0.38 },
        'recovery-plan': { x: width * 0.5, y: height * 0.27 },
        blame: { x: width * 0.73, y: height * 0.55 },
      },
      feedback: {
        defend: { x: width * 0.33, y: height * 0.58 },
        clarify: { x: width * 0.5, y: height * 0.44 },
        quiet: { x: width * 0.29, y: height * 0.75 },
      },
      goals: {
        'broad-goal': { x: width * 0.48, y: height * 0.4 },
        'specific-goal': { x: width * 0.58, y: height * 0.47 },
        'impossible-goal': { x: width * 0.66, y: height * 0.56 },
      },
    }

    return choice ? points[sceneKey][choice.animationKey] ?? fallback : fallback
  }

  private get characterScale() {
    return this.isMobileCanvas ? 1.1 : 0.92
  }

  private get isMobileCanvas() {
    return this.scale.width < 680
  }
}

class ResultScene extends Phaser.Scene {
  constructor(
    private readonly session: FirstImpressionSprintSession,
    private readonly emit: EmitGameEvent,
  ) {
    super('ResultScene')
  }

  create() {
    const result = this.session.getResult()
    this.emit({ type: 'gameComplete', result })

    const { width, height } = this.scale
    const graphics = this.add.graphics()
    graphics.fillStyle(result.completed ? 0x2f7d69 : 0x1f3f86)
    graphics.fillRoundedRect(0, 0, width, height, 22)
    graphics.fillStyle(0xffffff, 0.12)
    graphics.fillCircle(width * 0.18, height * 0.28, 160)
    graphics.fillCircle(width * 0.84, height * 0.72, 210)
    this.add.image(width * 0.5, height * 0.36, 'employee-avatar').setScale(this.scale.width < 680 ? 0.82 : 0.96)

    this.add.text(width * 0.5, height * 0.62, result.completed ? 'Sprint Complete' : 'Sprint Finished', {
      color: '#ffffff',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: this.scale.width < 680 ? '28px' : '40px',
      fontStyle: '700',
    }).setOrigin(0.5)

    this.add.text(width * 0.5, height * 0.74, `${result.score} LearningHub Score`, {
      color: '#eaf6ff',
      fontFamily: 'Inter, Arial, sans-serif',
      fontSize: this.scale.width < 680 ? '22px' : '28px',
      fontStyle: '700',
    }).setOrigin(0.5)
  }
}

export function createFirstImpressionSprintGame(parent: HTMLElement, emit: EmitGameEvent) {
  const session = new FirstImpressionSprintSession(firstImpressionSprint)

  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: 540,
    height: 540,
    backgroundColor: '#f5f8fc',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      antialias: true,
    },
    scene: [new BootScene(), new WorkdayScene(session, emit), new ResultScene(session, emit)],
  }

  const game = new Phaser.Game(config)

  game.events.on('training:restart', () => {
    session.reset()
    emit({ type: 'gameRestarted' })
    game.scene.start('WorkdayScene')
  })

  return game
}

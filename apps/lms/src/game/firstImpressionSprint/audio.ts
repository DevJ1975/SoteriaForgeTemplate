export type SprintSoundKey = 'select' | 'positive' | 'coach' | 'complete'

const soundPatterns: Record<SprintSoundKey, Array<{ frequency: number; start: number; duration: number; gain: number }>> = {
  select: [{ frequency: 440, start: 0, duration: 0.05, gain: 0.035 }],
  positive: [
    { frequency: 523, start: 0, duration: 0.07, gain: 0.04 },
    { frequency: 659, start: 0.07, duration: 0.08, gain: 0.035 },
  ],
  coach: [
    { frequency: 330, start: 0, duration: 0.07, gain: 0.032 },
    { frequency: 294, start: 0.07, duration: 0.08, gain: 0.026 },
  ],
  complete: [
    { frequency: 523, start: 0, duration: 0.08, gain: 0.035 },
    { frequency: 659, start: 0.08, duration: 0.08, gain: 0.035 },
    { frequency: 784, start: 0.16, duration: 0.1, gain: 0.03 },
  ],
}

export class SprintAudioController {
  private context: AudioContext | null = null

  get ready() {
    return this.context?.state === 'running'
  }

  async unlock() {
    if (!this.context) {
      this.context = new AudioContext()
    }

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }

    return this.ready
  }

  async play(key: SprintSoundKey, enabled: boolean) {
    if (!enabled) return this.ready

    try {
      await this.unlock()
    } catch {
      return false
    }

    if (!this.context) return false

    const now = this.context.currentTime
    for (const tone of soundPatterns[key]) {
      const oscillator = this.context.createOscillator()
      const gain = this.context.createGain()
      const startTime = now + tone.start
      const endTime = startTime + tone.duration

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, startTime)
      gain.gain.setValueAtTime(0.0001, startTime)
      gain.gain.exponentialRampToValueAtTime(tone.gain, startTime + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime)

      oscillator.connect(gain)
      gain.connect(this.context.destination)
      oscillator.start(startTime)
      oscillator.stop(endTime + 0.02)
    }

    return this.ready
  }

  close() {
    void this.context?.close()
    this.context = null
  }
}

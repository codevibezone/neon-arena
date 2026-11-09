/**
 * Tiny synthesised sound kit — no audio assets to load or ship.
 * The context is created lazily on the first user gesture.
 */
export class AudioKit {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private muted = false

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext
    if (!Ctor) return
    this.ctx = new Ctor()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.5
    this.master.connect(this.ctx.destination)

    const length = Math.floor(this.ctx.sampleRate * 0.5)
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    this.noise = buffer
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 0.5
  }

  private burst(duration: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
    if (!this.ctx || !this.master || !this.noise || this.muted) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const env = ctx.createGain()
    env.gain.setValueAtTime(gain, now)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    src.connect(filter).connect(env).connect(this.master)
    src.start(now)
    src.stop(now + duration + 0.02)
  }

  private tone(freq: number, endFreq: number, duration: number, gain: number, type: OscillatorType = 'sine') {
    if (!this.ctx || !this.master || this.muted) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, now)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration)
    const env = ctx.createGain()
    env.gain.setValueAtTime(gain, now)
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration)
    osc.connect(env).connect(this.master)
    osc.start(now)
    osc.stop(now + duration + 0.02)
  }

  shot() {
    this.ensure()
    this.burst(0.14, 1800, 0.8, 0.55)
    this.tone(150, 46, 0.16, 0.4, 'square')
  }

  dryFire() {
    this.ensure()
    this.burst(0.05, 3200, 2, 0.18)
  }

  hit(head: boolean) {
    this.ensure()
    if (head) {
      this.tone(1180, 1420, 0.09, 0.22, 'triangle')
      this.tone(1760, 1500, 0.12, 0.12, 'sine')
    } else {
      this.tone(820, 620, 0.08, 0.16, 'triangle')
    }
  }

  hurt() {
    this.ensure()
    this.burst(0.22, 420, 0.6, 0.4, 'lowpass')
    this.tone(190, 90, 0.2, 0.18, 'sawtooth')
  }

  reload() {
    this.ensure()
    this.burst(0.06, 2400, 3, 0.16)
    window.setTimeout(() => this.burst(0.05, 1600, 3, 0.14), 260)
    window.setTimeout(() => this.burst(0.06, 2800, 3, 0.16), 720)
  }

  death() {
    this.ensure()
    this.tone(320, 60, 0.5, 0.24, 'sawtooth')
  }

  dispose() {
    void this.ctx?.close()
    this.ctx = null
    this.master = null
    this.noise = null
  }
}

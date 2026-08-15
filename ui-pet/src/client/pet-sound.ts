/**
 * Pet sound engine: tiny WebAudio synth blips — no audio assets ship. One
 * lazily created AudioContext (browser autoplay policy: created on the first
 * user gesture that reaches {@link ensureAudio}); every cue is a short
 * enveloped sine. All cues are fire-and-forget and silently no-op where the
 * Web API is unavailable.
 */

let context: AudioContext | undefined

/** Create/resume the shared AudioContext; safe to call repeatedly. */
export function ensureAudio(): void {
  try {
    if (typeof AudioContext === 'undefined') return
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
  }
  catch { /* audio is decoration; failures stay silent */ }
}

/** One enveloped sine blip. */
function tone(freq: number, duration: number, delay = 0, peak = 0.08): void {
  if (context === undefined || context.state !== 'running') return
  const start = context.currentTime + delay
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, start)
  gain.gain.setValueAtTime(0, start)
  gain.gain.linearRampToValueAtTime(peak, start + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(context.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** Turn completed: a soft bubble pop. */
export function playBlip(): void {
  tone(660, 0.16)
  tone(880, 0.14, 0.06, 0.05)
}

/** Milestone reached: a small ascending chime. */
export function playChime(): void {
  tone(523, 0.14)
  tone(659, 0.14, 0.1)
  tone(784, 0.22, 0.2)
}

/** Feeding: a playful munch pair. */
export function playMunch(): void {
  tone(300, 0.09, 0, 0.1)
  tone(240, 0.09, 0.1, 0.1)
}

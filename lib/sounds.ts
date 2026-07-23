// Tiny synthesized sound effects — no audio files, no dependencies.
// Browsers only allow audio after a user gesture, so call unlockAudio()
// from a tap/click handler (joining or answering) before anything plays.

let ctx: AudioContext | null = null;
let muted = false;

export function unlockAudio() {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") ctx.resume();
  } catch {
    // no audio support — stay silent
  }
}

export function setMuted(m: boolean) {
  muted = m;
}

export function isMuted() {
  return muted;
}

function beep(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  delay = 0
) {
  if (muted || !ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sounds = {
  /** urgent tick for the last seconds of the countdown */
  tick: () => beep(880, 0.06, "square", 0.05),
  /** answer locked in */
  lockIn: () => beep(523, 0.09, "sine", 0.1),
  /** survived the reveal — little rising arpeggio */
  survive: () => {
    beep(523, 0.12, "sine", 0.1);
    beep(659, 0.12, "sine", 0.1, 0.1);
    beep(784, 0.22, "sine", 0.1, 0.2);
  },
  /** eliminated — descending doom */
  eliminated: () => {
    beep(220, 0.25, "sawtooth", 0.08);
    beep(165, 0.4, "sawtooth", 0.08, 0.2);
  },
};

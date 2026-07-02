// Prozedurale Soundeffekte über die Web Audio API — keine Asset-Dateien nötig.
// Später leicht durch echte Aufnahmen ersetzbar (jede play*-Funktion einzeln).
//
// Der AudioContext wird erst bei der ersten Nutzer-Interaktion erzeugt/entsperrt
// (Browser-Autoplay-Regeln).

let ctx = null
let master = null
let muted = loadMuted()

function loadMuted() {
  try {
    return localStorage.getItem('ld_muted') === '1'
  } catch {
    return false
  }
}

function ensure() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Bei der ersten Interaktion den Audio-Kontext entsperren.
if (typeof window !== 'undefined') {
  const unlock = () => ensure()
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
}

export function setMuted(m) {
  muted = m
  try {
    localStorage.setItem('ld_muted', m ? '1' : '0')
  } catch {
    /* ignore */
  }
  if (master) master.gain.value = m ? 0 : 0.5
}

export function getMuted() {
  return muted
}

// --- Hilfen ---

function noiseBuffer(c, dur) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur))
  const buf = c.createBuffer(1, len, c.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
  return buf
}

// Hüllkurve: schneller Anstieg, exponentieller Abfall.
function envelope(gain, t0, attack, decay, peak) {
  gain.setValueAtTime(0.0001, t0)
  gain.linearRampToValueAtTime(peak, t0 + attack)
  gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay)
}

function tone(c, type, f0, f1, dur, peak, delay = 0) {
  const o = c.createOscillator()
  o.type = type
  const t = c.currentTime + delay
  o.frequency.setValueAtTime(f0, t)
  if (f1 != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur)
  const g = c.createGain()
  envelope(g.gain, t, 0.003, dur, peak)
  o.connect(g).connect(master)
  o.start(t)
  o.stop(t + dur + 0.05)
}

// Kurzer Rausch-Layer mit eigenem Hüll-Timing (für mehrschichtige Effekte).
function noiseAt(c, t0, dur, filterType, freq, q, peak, decay, freqEnd) {
  const src = c.createBufferSource()
  src.buffer = noiseBuffer(c, dur)
  const f = c.createBiquadFilter()
  f.type = filterType
  f.frequency.setValueAtTime(freq, t0)
  if (freqEnd != null) f.frequency.exponentialRampToValueAtTime(Math.max(40, freqEnd), t0 + decay)
  if (q != null) f.Q.value = q
  const g = c.createGain()
  envelope(g.gain, t0, 0.001, decay, peak)
  src.connect(f).connect(g).connect(master)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

// --- Effekte ---

export function playCard() {
  const c = ensure()
  if (!c || muted) return
  const t = c.currentTime
  // Karte gleitet (bandpass) + leichtes „Klick" beim Auflegen.
  noiseAt(c, t, 0.13, 'bandpass', 3200, 1.2, 0.4, 0.1)
  noiseAt(c, t + 0.04, 0.06, 'highpass', 1900, null, 0.28, 0.05)
}

export function playSlam() {
  const c = ensure()
  if (!c || muted) return
  const t = c.currentTime
  tone(c, 'sine', 175, 45, 0.18, 1.0) // wuchtiger tiefer Aufschlag
  noiseAt(c, t, 0.11, 'lowpass', 1100, null, 0.7, 0.08) // Klatschen
  noiseAt(c, t, 0.04, 'highpass', 2600, null, 0.4, 0.035) // Holz-Crack
}

export function playClick() {
  const c = ensure()
  if (!c || muted) return
  const t = c.currentTime
  tone(c, 'square', 2300, 1700, 0.025, 0.22)
  noiseAt(c, t, 0.02, 'highpass', 4000, null, 0.3, 0.018) // metallischer Anschlag
  tone(c, 'square', 1500, 1100, 0.03, 0.16, 0.05) // Zylinder rastet
}

export function playShot() {
  const c = ensure()
  if (!c || muted) return
  const t = c.currentTime
  // 1) scharfer Transient
  tone(c, 'square', 1300, 280, 0.012, 0.5)
  // 2) Hauptknall: breitbandiges Rauschen mit Tiefpass-Sweep
  noiseAt(c, t, 0.34, 'lowpass', 6500, null, 0.9, 0.28, 280)
  // 3) tiefer Body
  tone(c, 'sine', 120, 30, 0.24, 0.85)
  // 4) hochfrequenter Crack
  noiseAt(c, t, 0.05, 'highpass', 3200, null, 0.65, 0.045)
}

export function playPop() {
  const c = ensure()
  if (!c || muted) return
  const t = c.currentTime
  // sehr kurzer Burst + tonaler Snap (Ballon platzt)
  noiseAt(c, t, 0.04, 'bandpass', 1300, 1.6, 0.85, 0.03)
  tone(c, 'triangle', 950, 140, 0.045, 0.5)
}

export function playWin() {
  const c = ensure()
  if (!c || muted) return
  ;[523, 659, 784, 1047].forEach((f, i) => tone(c, 'triangle', f, f, 0.2, 0.4, i * 0.12))
}

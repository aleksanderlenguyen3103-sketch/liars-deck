// Deterministischer, seedbarer Zufallsgenerator (mulberry32).
// Der RNG-Zustand wird explizit durchgereicht (keine versteckte Mutation),
// damit der Server-Zustand reproduzierbar und Tests deterministisch sind.

export function createRng(seed) {
  return seed >>> 0
}

// Gibt [float in [0,1), neuerZustand] zurück.
export function nextFloat(state) {
  let a = (state + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296
  return [result, a >>> 0]
}

// Gibt [int in [0,n), neuerZustand] zurück.
export function nextInt(state, n) {
  const [f, next] = nextFloat(state)
  return [Math.floor(f * n), next]
}

// Fisher-Yates-Shuffle. Gibt [neuesArray, neuerZustand] zurück (Eingabe unverändert).
export function shuffle(array, state) {
  const result = array.slice()
  let rng = state
  for (let i = result.length - 1; i > 0; i--) {
    const [j, next] = nextInt(rng, i + 1)
    rng = next
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return [result, rng]
}

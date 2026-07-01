// Autoritative, reine Spiel-Logik für Liar's Deck.
//
// Alle Aktionen sind reine Funktionen: (state, ...args) -> neuerState.
// Der Eingabe-State wird nie mutiert (interne Kopie via structuredClone).
// Läuft framework-frei in Node, im Browser und im PartyKit-Worker.
//
// Phasen: 'playing' -> (accuse) -> 'revolver' -> (pullTrigger) -> 'playing' | 'gameOver'

import {
  HAND_SIZE,
  START_LIVES,
  REVOLVER_CHAMBERS,
  THEMES,
  MIN_CARDS_PER_PLAY,
  MAX_CARDS_PER_PLAY,
} from './constants.js'
import { createDeck, isValidForTheme } from './cards.js'
import { createRng, nextInt, nextFloat, shuffle } from './rng.js'

const clone = (s) => structuredClone(s)

// ---- Sitzplatz-Helfer (überspringen ausgeschiedene Spieler) ----

function firstAliveFrom(players, idx) {
  const n = players.length
  for (let k = 0; k < n; k++) {
    const i = (((idx % n) + n) % n + k) % n
    if (players[i].alive) return i
  }
  return ((idx % n) + n) % n
}

function nextAliveIndex(players, fromIdx) {
  const n = players.length
  for (let k = 1; k <= n; k++) {
    const i = (fromIdx + k) % n
    if (players[i].alive) return i
  }
  return fromIdx
}

function alivePlayers(state) {
  return state.players.filter((p) => p.alive)
}

// ---- Spiel erstellen ----

export function createGame({ players, seed = 1 }) {
  let rngState = createRng(seed)
  const ps = players.map((p) => ({
    id: p.id,
    name: p.name,
    slot: p.slot,
    isBot: !!p.isBot,
    lives: START_LIVES,
    alive: true,
    hand: [],
  }))

  // EINE gemeinsame Waffe in der Tischmitte. Trefferchance steigt mit jedem
  // Fehlschuss: 1/6, 2/6, 3/6 ... (level/6), Reset auf 1/6 nach einem Treffer.
  const revolver = { level: 1 }

  const state = {
    phase: 'lobby',
    players: ps,
    revolver,
    theme: null,
    pile: [],
    lastPlay: null, // { playerId, cards }
    turnIndex: 0,
    // pendingShot: operatorId = Gewinner (hält Waffe), targetId = Verlierer (Ballon)
    pendingShot: null,
    round: 0,
    rngState,
    winnerId: null,
    events: [],
  }

  return startRound(state, 0)
}

// ---- Runde starten / neu mischen ----

export function startRound(state, anchorIndex) {
  const s = clone(state)
  s.round += 1

  const deck = createDeck()
  const [shuffled, rng1] = shuffle(deck, s.rngState)
  s.rngState = rng1

  // An lebende Spieler austeilen.
  let idx = 0
  for (const p of s.players) {
    if (p.alive) {
      p.hand = shuffled.slice(idx, idx + HAND_SIZE)
      idx += HAND_SIZE
    } else {
      p.hand = []
    }
  }

  const [tIdx, rng2] = nextInt(s.rngState, THEMES.length)
  s.rngState = rng2
  s.theme = THEMES[tIdx]

  s.pile = []
  s.lastPlay = null
  s.pendingShot = null
  s.phase = 'playing'
  s.turnIndex = firstAliveFrom(s.players, anchorIndex)
  s.events.push({
    type: 'roundStart',
    round: s.round,
    theme: s.theme,
    turn: s.players[s.turnIndex].id,
  })
  return s
}

// ---- Wessen Aktion ist gerade dran ----

export function currentActorId(state) {
  // In der Roulette-Phase betätigt der Gewinner (operatorId) den Abzug.
  if (state.phase === 'revolver') return state.pendingShot?.operatorId ?? null
  if (state.phase === 'playing') return state.players[state.turnIndex]?.id ?? null
  return null
}

export function availableActions(state, playerId) {
  if (state.phase === 'revolver') {
    return state.pendingShot?.operatorId === playerId ? ['pullTrigger'] : []
  }
  if (state.phase !== 'playing') return []
  const p = state.players[state.turnIndex]
  if (!p || p.id !== playerId || !p.alive) return []

  const actions = []
  if (p.hand.length > 0) actions.push('play')
  if (state.lastPlay && state.lastPlay.playerId !== playerId) actions.push('accuse')
  if (p.hand.length === 0) actions.push('pass')
  return actions
}

// ---- Aktion: Karten verdeckt legen ----

export function playCards(state, playerId, cardIds) {
  const s = clone(state)
  if (s.phase !== 'playing') throw new Error('Nicht in der Spielphase.')
  const p = s.players[s.turnIndex]
  if (!p || p.id !== playerId) throw new Error('Nicht am Zug.')
  if (!p.alive) throw new Error('Spieler ist ausgeschieden.')
  if (
    !Array.isArray(cardIds) ||
    cardIds.length < MIN_CARDS_PER_PLAY ||
    cardIds.length > MAX_CARDS_PER_PLAY
  ) {
    throw new Error(`Es müssen ${MIN_CARDS_PER_PLAY}-${MAX_CARDS_PER_PLAY} Karten gelegt werden.`)
  }

  const cards = []
  for (const id of cardIds) {
    const card = p.hand.find((c) => c.id === id)
    if (!card) throw new Error(`Karte ${id} nicht in der Hand.`)
    cards.push(card)
  }

  p.hand = p.hand.filter((c) => !cardIds.includes(c.id))
  s.pile.push(...cards)
  s.lastPlay = { playerId, cards }
  s.events.push({ type: 'play', playerId, count: cards.length })
  s.turnIndex = nextAliveIndex(s.players, s.turnIndex)
  return s
}

// ---- Aktion: anschuldigen ("Liar!") ----

export function accuse(state, accuserId) {
  const s = clone(state)
  if (s.phase !== 'playing') throw new Error('Nicht in der Spielphase.')
  const accuser = s.players[s.turnIndex]
  if (!accuser || accuser.id !== accuserId) throw new Error('Nicht am Zug.')
  if (!accuser.alive) throw new Error('Spieler ist ausgeschieden.')
  if (!s.lastPlay) throw new Error('Es gibt nichts anzuschuldigen.')
  if (s.lastPlay.playerId === accuserId) throw new Error('Man kann sich nicht selbst anschuldigen.')

  // truthful = der letzte Zug war ehrlich (alle Karten passen zum Theme).
  const truthful = s.lastPlay.cards.every((c) => isValidForTheme(c, s.theme))
  const accusedId = s.lastPlay.playerId
  // Verlierer (Ziel, Ballon in Gefahr): falsche Anschuldigung -> Anschuldiger,
  // korrekte (Bluff) -> Beschuldigter. Der GEWINNER greift die Waffe (operator).
  const targetId = truthful ? accuserId : accusedId
  const operatorId = truthful ? accusedId : accuserId

  s.pendingShot = {
    operatorId,
    targetId,
    accuserId,
    accusedId,
    truthful,
    reason: truthful ? 'false_accusation' : 'caught_bluff',
    revealed: s.lastPlay.cards,
  }
  s.phase = 'revolver'
  s.events.push({ type: 'accuse', accuserId, accusedId, truthful, operatorId, targetId })
  return s
}

// ---- Aktion: abdrücken (Russisch-Roulette) ----

export function pullTrigger(state) {
  const s = clone(state)
  if (s.phase !== 'revolver') throw new Error('Kein offener Schuss.')
  const shot = s.pendingShot
  const rev = s.revolver
  // Der Verlierer (target) ist im Visier — sein Ballon platzt bei einem Treffer.
  const target = s.players.find((p) => p.id === shot.targetId)

  // Trefferchance = level/6 (1/6, 2/6, 3/6 ...). Würfeln, dann reagieren.
  const chance = rev.level / REVOLVER_CHAMBERS
  const [roll, nextRng] = nextFloat(s.rngState)
  s.rngState = nextRng
  const hit = roll < chance

  let eliminated = false
  if (hit) {
    target.lives -= 1
    s.revolver = { level: 1 } // nachladen -> zurück auf 1/6
    if (target.lives <= 0) {
      target.lives = 0
      target.alive = false
      eliminated = true
    }
  } else {
    // Fehlschuss -> Chance steigt fürs nächste Mal.
    s.revolver = { level: Math.min(REVOLVER_CHAMBERS, rev.level + 1) }
  }

  s.events.push({
    type: 'shot',
    operatorId: shot.operatorId,
    targetId: shot.targetId,
    hit,
    livesLeft: target.lives,
    eliminated,
  })

  const accuserIdx = s.players.findIndex((p) => p.id === shot.accuserId)
  s.pendingShot = null

  // Sieg-Prüfung: nur noch einer (oder keiner) übrig.
  const alive = alivePlayers(s)
  if (alive.length <= 1) {
    s.phase = 'gameOver'
    s.winnerId = alive[0]?.id ?? null
    s.events.push({ type: 'gameOver', winnerId: s.winnerId })
    return s
  }

  // Sonst neue Runde, beginnend nach dem Anschuldiger.
  return startRound(s, accuserIdx + 1)
}

// ---- Aktion: passen (nur mit leerer Hand) -> Runde endet ohne Schuss ----

export function pass(state, playerId) {
  const s = clone(state)
  if (s.phase !== 'playing') throw new Error('Nicht in der Spielphase.')
  const p = s.players[s.turnIndex]
  if (!p || p.id !== playerId) throw new Error('Nicht am Zug.')
  if (p.hand.length !== 0) throw new Error('Passen nur mit leerer Hand erlaubt.')

  s.events.push({ type: 'roundPass', playerId })
  return startRound(s, s.turnIndex + 1)
}

// ---- Gefilterte Sicht für einen Spieler (versteckt fremde Hände) ----
// Wird in Phase 2 vom Server genutzt, damit niemand fremde Karten sieht.

export function getPublicState(state, viewerId) {
  return {
    phase: state.phase,
    theme: state.theme,
    round: state.round,
    turnIndex: state.turnIndex,
    currentActorId: currentActorId(state),
    winnerId: state.winnerId,
    pileCount: state.pile.length,
    lastPlay: state.lastPlay
      ? { playerId: state.lastPlay.playerId, count: state.lastPlay.cards.length }
      : null,
    // Beim Schuss werden die aufgedeckten Karten offengelegt.
    pendingShot: state.pendingShot
      ? {
          operatorId: state.pendingShot.operatorId,
          targetId: state.pendingShot.targetId,
          accuserId: state.pendingShot.accuserId,
          accusedId: state.pendingShot.accusedId,
          truthful: state.pendingShot.truthful,
          reason: state.pendingShot.reason,
          revealed: state.pendingShot.revealed,
        }
      : null,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      isBot: p.isBot,
      lives: p.lives,
      alive: p.alive,
      handCount: p.hand.length,
      // Nur der Betrachter sieht seine eigenen Karten.
      hand: p.id === viewerId ? p.hand : undefined,
    })),
    revolver: { level: state.revolver.level, chance: state.revolver.level / REVOLVER_CHAMBERS },
    actions: viewerId ? availableActions(state, viewerId) : [],
    // Letzte Ereignisse mit stabilem, fortlaufendem Index (für Verlauf-Anzeige
    // und um den Schuss-Moment für Animationen eindeutig zu erkennen).
    recentEvents: state.events.slice(-10).map((e, i) => ({
      ...e,
      n: Math.max(0, state.events.length - 10) + i,
    })),
  }
}

export { isValidForTheme }

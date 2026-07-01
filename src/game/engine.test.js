import { describe, it, expect } from 'vitest'
import {
  createGame,
  playCards,
  accuse,
  pullTrigger,
  pass,
  availableActions,
  currentActorId,
  getPublicState,
} from './engine'
import { isValidForTheme } from './cards'
import { nextFloat } from './rng'

// Sucht einen RNG-Zustand, dessen nächster Wurf in [min,max) liegt — so lassen
// sich Treffer/Fehlschuss im Test deterministisch erzwingen.
function rngForRoll(min, max) {
  for (let s = 1; s < 300000; s++) {
    const [r] = nextFloat(s >>> 0)
    if (r >= min && r < max) return s >>> 0
  }
  throw new Error('kein passender RNG-Zustand gefunden')
}

function makeGame(n = 3, seed = 1) {
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Spieler ${i + 1}`,
    slot: i,
  }))
  return createGame({ players, seed })
}

describe('createGame / startRound', () => {
  it('teilt jedem Spieler 5 Karten aus und startet in der Spielphase', () => {
    const s = makeGame(4)
    expect(s.phase).toBe('playing')
    expect(s.round).toBe(1)
    for (const p of s.players) {
      expect(p.hand).toHaveLength(5)
      expect(p.lives).toBe(3)
      expect(p.alive).toBe(true)
    }
  })

  it('wählt ein gültiges Theme (nie Joker)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = makeGame(3, seed)
      expect(['ACE', 'KING', 'QUEEN']).toContain(s.theme)
    }
  })

  it('hat EINE gemeinsame Waffe, die bei 1/6 startet', () => {
    const s = makeGame(4)
    expect(s.revolver.level).toBe(1)
  })
})

describe('playCards', () => {
  it('entfernt Karten aus der Hand, legt sie auf den Stapel und reicht weiter', () => {
    const s = makeGame(3)
    const actor = s.players[s.turnIndex]
    const cardId = actor.hand[0].id
    const next = playCards(s, actor.id, [cardId])

    expect(next.players[next.players.findIndex((p) => p.id === actor.id)].hand).toHaveLength(4)
    expect(next.pile).toHaveLength(1)
    expect(next.lastPlay).toEqual({ playerId: actor.id, cards: [actor.hand[0]] })
    expect(next.turnIndex).not.toBe(s.turnIndex)
  })

  it('lässt die Eingabe unverändert (Reinheit)', () => {
    const s = makeGame(3)
    const actor = s.players[s.turnIndex]
    playCards(s, actor.id, [actor.hand[0].id])
    expect(s.players[s.turnIndex].hand).toHaveLength(5)
    expect(s.pile).toHaveLength(0)
  })

  it('wirft Fehler, wenn nicht am Zug', () => {
    const s = makeGame(3)
    const notActor = s.players[(s.turnIndex + 1) % 3]
    expect(() => playCards(s, notActor.id, [notActor.hand[0].id])).toThrow()
  })

  it('wirft Fehler bei zu vielen Karten', () => {
    const s = makeGame(3)
    const actor = s.players[s.turnIndex]
    const four = actor.hand.slice(0, 4).map((c) => c.id)
    expect(() => playCards(s, actor.id, four)).toThrow()
  })

  it('wirft Fehler bei Karte, die nicht in der Hand ist', () => {
    const s = makeGame(3)
    const actor = s.players[s.turnIndex]
    expect(() => playCards(s, actor.id, ['JOKER-99'])).toThrow()
  })
})

describe('availableActions', () => {
  it('erster Spieler kann nur legen (keine Anschuldigung möglich)', () => {
    const s = makeGame(3)
    const actor = s.players[s.turnIndex]
    expect(availableActions(s, actor.id)).toEqual(['play'])
  })

  it('nach einem Zug kann der Nächste legen oder anschuldigen', () => {
    const s = makeGame(3)
    const actor = s.players[s.turnIndex]
    const next = playCards(s, actor.id, [actor.hand[0].id])
    const nextActor = next.players[next.turnIndex]
    expect(availableActions(next, nextActor.id).sort()).toEqual(['accuse', 'play'])
  })
})

describe('accuse — Auflösung', () => {
  // Kontrollierter Zustand: wir setzen Theme und letzten Zug gezielt.
  function setup(theme, playedRanks) {
    const s = makeGame(3, 5)
    s.theme = theme
    // p0 hat gelegt, p1 ist dran und schuldigt an.
    s.turnIndex = 1
    s.lastPlay = {
      playerId: 'p0',
      cards: playedRanks.map((rank, i) => ({ id: `${rank}-${i}`, rank })),
    }
    return s
  }

  it('falsche Anschuldigung (Karten passten) -> Anschuldiger ist Ziel, Beschuldigter operiert', () => {
    const s = setup('KING', ['KING', 'KING'])
    const after = accuse(s, 'p1')
    expect(after.phase).toBe('revolver')
    expect(after.pendingShot.truthful).toBe(true)
    expect(after.pendingShot.targetId).toBe('p1') // Anschuldiger (Verlierer)
    expect(after.pendingShot.operatorId).toBe('p0') // Beschuldigter (Gewinner) hält die Waffe
    expect(after.pendingShot.reason).toBe('false_accusation')
  })

  it('korrekte Anschuldigung (Bluff) -> Beschuldigter ist Ziel, Anschuldiger operiert', () => {
    const s = setup('KING', ['KING', 'QUEEN'])
    const after = accuse(s, 'p1')
    expect(after.pendingShot.truthful).toBe(false)
    expect(after.pendingShot.targetId).toBe('p0') // Beschuldigter (Verlierer)
    expect(after.pendingShot.operatorId).toBe('p1') // Anschuldiger (Gewinner)
    expect(after.pendingShot.reason).toBe('caught_bluff')
  })

  it('Joker zählt als korrekt', () => {
    const s = setup('KING', ['JOKER', 'KING'])
    const after = accuse(s, 'p1')
    expect(after.pendingShot.truthful).toBe(true)
    expect(after.pendingShot.targetId).toBe('p1')
  })

  it('man kann sich nicht selbst anschuldigen / nicht ohne letzten Zug', () => {
    const s = makeGame(3)
    expect(() => accuse(s, s.players[s.turnIndex].id)).toThrow() // kein lastPlay
  })
})

describe('pullTrigger — Revolver (Chance level/6)', () => {
  // p0 ist das Ziel (Ballon in Gefahr), p1 operiert die Waffe.
  function revolverState({ level = 1, lives = 3, rngState }) {
    const s = makeGame(2, 5)
    s.phase = 'revolver'
    s.players[0].lives = lives
    s.revolver = { level }
    if (rngState != null) s.rngState = rngState
    s.pendingShot = {
      operatorId: 'p1',
      targetId: 'p0',
      accuserId: 'p1',
      accusedId: 'p0',
      truthful: false,
      reason: 'caught_bluff',
      revealed: [],
    }
    return s
  }

  it('Fehlschuss -> kein Lebensverlust, Chance steigt (level 1 -> 2)', () => {
    // Wurf 0.5 > 1/6 -> Fehlschuss
    const s = revolverState({ level: 1, rngState: rngForRoll(0.5, 0.99) })
    const after = pullTrigger(s)
    expect(after.players.find((p) => p.id === 'p0').lives).toBe(3)
    expect(after.revolver.level).toBe(2)
    expect(after.phase).toBe('playing')
  })

  it('Treffer -> ein Ballon platzt und die Chance fällt zurück auf level 1', () => {
    // level 6 -> Chance 1.0 -> sicherer Treffer
    const s = revolverState({ level: 6 })
    const after = pullTrigger(s)
    expect(after.players.find((p) => p.id === 'p0').lives).toBe(2)
    expect(after.revolver.level).toBe(1)
  })

  it('letztes Leben verloren -> Spieler scheidet aus und Spiel endet (2 Spieler)', () => {
    const s = revolverState({ level: 6, lives: 1 })
    const after = pullTrigger(s)
    expect(after.players.find((p) => p.id === 'p0').alive).toBe(false)
    expect(after.phase).toBe('gameOver')
    expect(after.winnerId).toBe('p1')
  })

  it('Chance eskaliert bei Fehlschüssen: 1/6 -> 2/6 -> 3/6', () => {
    let s = revolverState({ level: 1, rngState: rngForRoll(0.9, 0.999) })
    let after = pullTrigger(s)
    expect(after.revolver.level).toBe(2)
    after.phase = 'revolver'
    after.pendingShot = s.pendingShot
    after.rngState = rngForRoll(0.9, 0.999)
    after = pullTrigger(after)
    expect(after.revolver.level).toBe(3)
  })

  it('getPublicState zeigt die aktuelle Chance', () => {
    const s = revolverState({ level: 3 })
    const view = getPublicState(s, 'p1')
    expect(view.revolver.level).toBe(3)
    expect(view.revolver.chance).toBeCloseTo(0.5)
  })
})

describe('getPublicState', () => {
  it('zeigt eigene Hand, verbirgt fremde', () => {
    const s = makeGame(3)
    const me = s.players[0].id
    const view = getPublicState(s, me)
    const self = view.players.find((p) => p.id === me)
    const other = view.players.find((p) => p.id !== me)
    expect(self.hand).toHaveLength(5)
    expect(other.hand).toBeUndefined()
    expect(other.handCount).toBe(5)
  })
})

describe('Komplette Partie läuft bis zum Sieger durch', () => {
  function step(state) {
    const pid = currentActorId(state)
    if (state.phase === 'revolver') return pullTrigger(state)
    const actions = availableActions(state, pid)
    if (actions.includes('accuse')) return accuse(state, pid)
    if (actions.includes('play')) {
      const player = state.players[state.turnIndex]
      const valid = player.hand.find((c) => isValidForTheme(c, state.theme))
      const card = valid || player.hand[0]
      return playCards(state, pid, [card.id])
    }
    if (actions.includes('pass')) return pass(state, pid)
    throw new Error('Keine Aktion verfügbar')
  }

  it.each([2, 3, 4])('mit %i Spielern endet das Spiel mit genau einem Sieger', (n) => {
    let s = makeGame(n, 123 + n)
    let guard = 0
    while (s.phase !== 'gameOver' && guard < 100000) {
      s = step(s)
      guard += 1
    }
    expect(s.phase).toBe('gameOver')
    expect(s.winnerId).not.toBeNull()
    expect(s.players.filter((p) => p.alive)).toHaveLength(1)
    expect(s.players.find((p) => p.alive).id).toBe(s.winnerId)
  })
})

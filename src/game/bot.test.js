import { describe, it, expect } from 'vitest'
import { createGame, playCards, accuse, pullTrigger, pass, currentActorId } from './engine'
import { botDecide } from './bot'

// Deterministischer RNG für reproduzierbare Bot-Entscheidungen.
function makeRng(seed) {
  let r = seed >>> 0
  return () => {
    r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff
    return r / 0x7fffffff
  }
}

describe('Bot', () => {
  it.each([2, 3, 4])('spielt mit %i Bots eine vollständige, regelkonforme Partie', (n) => {
    const players = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `Bot ${i}`, slot: i, isBot: true }))
    let s = createGame({ players, seed: 99 + n })
    const rng = makeRng(777 + n)
    let guard = 0
    while (s.phase !== 'gameOver' && guard < 100000) {
      const actor = currentActorId(s)
      if (s.phase === 'revolver') {
        s = pullTrigger(s)
      } else {
        const d = botDecide(s, actor, rng)
        if (d.action === 'accuse') s = accuse(s, actor)
        else if (d.action === 'pass') s = pass(s, actor)
        else s = playCards(s, actor, d.cardIds)
      }
      guard += 1
    }
    expect(s.phase).toBe('gameOver')
    expect(s.players.filter((p) => p.alive)).toHaveLength(1)
  })

  it('legt nur Karten aus der eigenen Hand', () => {
    const s = createGame({ players: [{ id: 'a', name: 'A', slot: 0 }, { id: 'b', name: 'B', slot: 1 }], seed: 3 })
    const actor = currentActorId(s)
    const d = botDecide(s, actor, makeRng(1))
    if (d.action === 'play') {
      const hand = s.players.find((p) => p.id === actor).hand.map((c) => c.id)
      for (const id of d.cardIds) expect(hand).toContain(id)
    }
  })
})

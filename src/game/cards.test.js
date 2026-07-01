import { describe, it, expect } from 'vitest'
import { createDeck, isValidForTheme } from './cards'
import { createRng, shuffle, nextInt } from './rng'

describe('Deck', () => {
  it('hat genau 20 Karten in korrekter Verteilung', () => {
    const deck = createDeck()
    expect(deck).toHaveLength(20)
    const count = (rank) => deck.filter((c) => c.rank === rank).length
    expect(count('ACE')).toBe(6)
    expect(count('KING')).toBe(6)
    expect(count('QUEEN')).toBe(6)
    expect(count('JOKER')).toBe(2)
  })

  it('hat eindeutige Karten-ids', () => {
    const deck = createDeck()
    const ids = new Set(deck.map((c) => c.id))
    expect(ids.size).toBe(20)
  })
})

describe('isValidForTheme', () => {
  it('passende Karte ist gültig', () => {
    expect(isValidForTheme({ rank: 'KING' }, 'KING')).toBe(true)
  })
  it('unpassende Karte ist ungültig', () => {
    expect(isValidForTheme({ rank: 'QUEEN' }, 'KING')).toBe(false)
  })
  it('Joker ist immer gültig', () => {
    expect(isValidForTheme({ rank: 'JOKER' }, 'KING')).toBe(true)
    expect(isValidForTheme({ rank: 'JOKER' }, 'ACE')).toBe(true)
  })
})

describe('RNG', () => {
  it('ist deterministisch bei gleichem Seed', () => {
    const a = nextInt(createRng(42), 6)
    const b = nextInt(createRng(42), 6)
    expect(a[0]).toBe(b[0])
  })

  it('shuffle verändert die Eingabe nicht und behält alle Elemente', () => {
    const deck = createDeck()
    const [shuffled] = shuffle(deck, createRng(7))
    expect(shuffled).toHaveLength(20)
    expect(deck.map((c) => c.id).sort()).toEqual(shuffled.map((c) => c.id).sort())
  })
})

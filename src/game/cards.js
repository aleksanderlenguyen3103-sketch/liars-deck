import { DECK_COMPOSITION, RANKS } from './constants.js'

// Erzeugt das vollständige 20-Karten-Deck. Jede Karte hat eine stabile id.
export function createDeck() {
  const deck = []
  for (const [rank, count] of Object.entries(DECK_COMPOSITION)) {
    for (let i = 0; i < count; i++) {
      deck.push({ id: `${rank}-${i}`, rank })
    }
  }
  return deck
}

// Eine Karte passt zum Theme, wenn ihr Rang dem Theme entspricht
// ODER es ein Joker ist (Joker gilt immer als korrekt).
export function isValidForTheme(card, theme) {
  return card.rank === theme || card.rank === RANKS.JOKER
}

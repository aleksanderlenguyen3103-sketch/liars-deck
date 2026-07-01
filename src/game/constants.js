// Zentrale Spiel-Konstanten für Liar's Deck.

export const RANKS = {
  ACE: 'ACE',
  KING: 'KING',
  QUEEN: 'QUEEN',
  JOKER: 'JOKER',
}

// Mögliche Themes — Joker ist nie ein Theme.
export const THEMES = [RANKS.ACE, RANKS.KING, RANKS.QUEEN]

// 20 Karten: 6 Ace, 6 King, 6 Queen, 2 Joker.
export const DECK_COMPOSITION = {
  [RANKS.ACE]: 6,
  [RANKS.KING]: 6,
  [RANKS.QUEEN]: 6,
  [RANKS.JOKER]: 2,
}

export const HAND_SIZE = 5
export const START_LIVES = 3 // Ballons pro Spieler
export const REVOLVER_CHAMBERS = 6 // 1 Kugel in 6 Kammern -> Start 1/6
export const MAX_CARDS_PER_PLAY = 3
export const MIN_CARDS_PER_PLAY = 1
export const MAX_PLAYERS = 4

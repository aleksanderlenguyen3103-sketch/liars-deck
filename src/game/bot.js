import { isValidForTheme } from './cards.js'

// Mittelmäßig schlaue Bot-Entscheidung für die Spielphase.
// Bekommt den vollen (server-seitigen) Zustand und gibt eine Aktion zurück:
//   { action: 'play', cardIds } | { action: 'accuse' } | { action: 'pass' }
// rng() liefert Zufall in [0,1) (für Tests injizierbar).
export function botDecide(game, botId, rng = Math.random) {
  const p = game.players.find((pl) => pl.id === botId)
  if (!p) return { action: 'pass' }
  const hand = p.hand || []
  const theme = game.theme
  const lastPlay = game.lastPlay
  const canAccuse = lastPlay && lastPlay.playerId !== botId

  // Anschuldigen — wahrscheinlicher, je mehr Karten der Vorgänger behauptet hat.
  if (canAccuse) {
    const accuseChance = 0.12 + lastPlay.count * 0.12
    if (rng() < accuseChance) return { action: 'accuse' }
  }

  // Leere Hand: nur noch anschuldigen oder passen.
  if (hand.length === 0) {
    if (canAccuse && rng() < 0.4) return { action: 'accuse' }
    return { action: 'pass' }
  }

  const valid = hand.filter((c) => isValidForTheme(c, theme))
  const junk = hand.filter((c) => !isValidForTheme(c, theme))
  // Mehr unpassende Karten -> eher bluffen, um sie loszuwerden.
  const bluffChance = 0.2 + (junk.length / hand.length) * 0.35

  let cards
  if (valid.length === 0) {
    cards = [junk[0]] // erzwungener Bluff
  } else if (junk.length > 0 && rng() < bluffChance) {
    cards = [junk[0]] // freiwilliger Bluff: Junk abwerfen
  } else {
    const count = valid.length >= 2 && rng() < 0.3 ? 2 : 1
    cards = valid.slice(0, count)
  }
  return { action: 'play', cardIds: cards.map((c) => c.id) }
}

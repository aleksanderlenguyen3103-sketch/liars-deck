// Raum-Codes: kurze, gut lesbare Codes ohne mehrdeutige Zeichen (kein 0/O, 1/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4

export function generateRoomCode() {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length)
    code += ALPHABET[idx]
  }
  return code
}

// Eingabe normalisieren (Großschreibung, nur erlaubte Zeichen).
export function normalizeRoomCode(input) {
  return (input || '')
    .toUpperCase()
    .split('')
    .filter((ch) => ALPHABET.includes(ch))
    .join('')
    .slice(0, CODE_LENGTH)
}

export function isValidRoomCode(code) {
  return normalizeRoomCode(code).length === CODE_LENGTH
}

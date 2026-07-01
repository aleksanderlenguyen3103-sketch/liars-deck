import * as THREE from 'three'

// Erzeugt Spielkarten-Texturen per Canvas (kein Asset-Download). Vorderseiten
// pro Rang + eine gemeinsame Rückseite. Werden gecacht (einmal erzeugt).

const W = 256
const H = 358

const RANK_INFO = {
  ACE: { letter: 'A', symbol: '♠', color: '#15151a' },
  KING: { letter: 'K', symbol: '♚', color: '#8c1d34' },
  QUEEN: { letter: 'Q', symbol: '♛', color: '#8c1d34' },
  JOKER: { letter: 'J', symbol: '★', color: '#6d28d9' },
}

function makeCanvas() {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  return c
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function toTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  return tex
}

function drawCorner(ctx, info, x, y) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = info.color
  ctx.font = 'bold 46px Georgia, "Times New Roman", serif'
  ctx.fillText(info.letter, x, y)
  ctx.font = '34px serif'
  ctx.fillText(info.symbol, x, y + 40)
}

const faceCache = {}
export function getFaceTexture(rank) {
  if (faceCache[rank]) return faceCache[rank]
  const info = RANK_INFO[rank] || RANK_INFO.ACE
  const c = makeCanvas()
  const ctx = c.getContext('2d')

  // Kartenfläche + Rahmen
  ctx.fillStyle = '#f7f4ec'
  roundRect(ctx, 6, 6, W - 12, H - 12, 20)
  ctx.fill()
  ctx.lineWidth = 3
  ctx.strokeStyle = '#ded7c4'
  ctx.stroke()

  // Ecken (oben links, unten rechts gedreht)
  drawCorner(ctx, info, 36, 46)
  ctx.save()
  ctx.translate(W - 36, H - 46)
  ctx.rotate(Math.PI)
  drawCorner(ctx, info, 0, 0)
  ctx.restore()

  // Großes Emblem in der Mitte
  ctx.fillStyle = info.color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '170px serif'
  ctx.fillText(info.symbol, W / 2, H / 2 + 6)

  faceCache[rank] = toTexture(c)
  return faceCache[rank]
}

let feltCache = null
export function getFeltTexture() {
  if (feltCache) return feltCache
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#15402e'
  ctx.fillRect(0, 0, 256, 256)
  // feiner Filz-Sprenkel
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 256
    const y = Math.random() * 256
    const l = Math.random()
    ctx.fillStyle = l > 0.5 ? 'rgba(40,90,66,0.5)' : 'rgba(8,30,20,0.5)'
    ctx.fillRect(x, y, 1, 1)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(4, 4)
  feltCache = tex
  return feltCache
}

let backCache = null
export function getBackTexture() {
  if (backCache) return backCache
  const c = makeCanvas()
  const ctx = c.getContext('2d')

  // Dunkelroter Grund
  ctx.fillStyle = '#6e1228'
  roundRect(ctx, 6, 6, W - 12, H - 12, 20)
  ctx.fill()

  // Goldener Doppelrahmen
  ctx.strokeStyle = '#caa15a'
  ctx.lineWidth = 5
  roundRect(ctx, 20, 20, W - 40, H - 40, 14)
  ctx.stroke()
  ctx.lineWidth = 2
  roundRect(ctx, 28, 28, W - 56, H - 56, 10)
  ctx.stroke()

  // Rauten-Gitter
  ctx.save()
  roundRect(ctx, 28, 28, W - 56, H - 56, 10)
  ctx.clip()
  ctx.strokeStyle = 'rgba(202,161,90,0.35)'
  ctx.lineWidth = 2
  const step = 26
  for (let i = -H; i < W + H; i += step) {
    ctx.beginPath()
    ctx.moveTo(i, 0)
    ctx.lineTo(i + H, H)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(i, H)
    ctx.lineTo(i + H, 0)
    ctx.stroke()
  }
  ctx.restore()

  // Mittel-Emblem
  ctx.fillStyle = '#caa15a'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = 'bold 64px Georgia, serif'
  ctx.fillText('♠', W / 2, H / 2 + 4)

  backCache = toTexture(c)
  return backCache
}

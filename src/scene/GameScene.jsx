import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, RoundedBox, Text } from '@react-three/drei'
import * as THREE from 'three'
import { CharacterModel, ModelBoundary } from './Character'
import { getFaceTexture, getBackTexture, getFeltTexture } from './cardTexture'

// 3D-Szene für Liar's Deck: schwarzer Raum, runder Casino-Tisch, hängende
// Lampe, Sitzplätze mit Platzhalter-Figuren, Ballons (Leben), schwebende
// Theme-Karte. Die Spiel-Logik bleibt im Server; diese Szene ist nur Anzeige.

const SEAT_RADIUS = 3.0
const TABLE_TOP = 1.0
const TABLE_RADIUS = 1.8 // kleinerer Tisch -> Karten landen gut erreichbar in der Mitte
// Lokal gebündelte Schrift, damit <Text> nicht extern lädt (sonst hängt der
// Suspense und die ganze Szene rendert nicht).
const FONT = '/fonts/game.woff'

// Ego-Perspektive: Die Kamera sitzt fest auf Augenhöhe am eigenen Platz (vorne)
// und dreht nur den Blick. Der eigene Platz ist displayIndex 0.
const EYE = [0, 1.5, SEAT_RADIUS - 0.5]

// Sitzwinkel: der eigene Spieler sitzt vorne, die anderen verteilt um den Tisch.
function seatAngle(displayIndex, total) {
  return Math.PI / 2 + (displayIndex * (2 * Math.PI)) / total
}
function seatPosition(displayIndex, total, radius = SEAT_RADIUS) {
  const a = seatAngle(displayIndex, total)
  return [radius * Math.cos(a), 0, radius * Math.sin(a)]
}

// Sitzordnung relativ zum eigenen Platz: Richtung (links/rechts/vorne) ergibt
// sich aus der x-Koordinate (Kamera blickt nach -z, rechts = +x).
export function seatLayout(players, selfId) {
  const total = players.length
  const selfIdx = players.findIndex((p) => p.id === selfId)
  const base = selfIdx >= 0 ? selfIdx : 0
  return players.map((p, i) => {
    const displayIndex = (i - base + total) % total
    const [x, , z] = seatPosition(displayIndex, total)
    const isSelf = p.id === selfId
    let dir = 'vorne'
    if (!isSelf) dir = x > 0.5 ? 'rechts' : x < -0.5 ? 'links' : 'vorne'
    return { id: p.id, name: p.name, displayIndex, isSelf, dir, headPos: [x, 1.2, z] }
  })
}

// Blickpunkt zur aktuellen Ansicht auflösen (für die eigene Kamera).
// view = 'hand' | 'lives' | 'center' | <spielerId>
function resolveLookTarget(view, layout) {
  if (view === 'hand') return [0, TABLE_TOP, SEAT_RADIUS - 1.3] // runter zur eigenen Hand
  if (view === 'lives') return [0, 2.7, SEAT_RADIUS + 1.4] // umdrehen, hoch zu den eigenen Ballons
  if (view && view !== 'center') {
    const seat = layout.find((s) => s.id === view)
    if (seat) return seat.headPos // Blick zu einem bestimmten Mitspieler
  }
  return [0, 1.15, 0] // Standard: Tischmitte
}

// Weltpunkt, zu dem ein Avatar mit gegebenem Blickziel schaut (für den
// Blick-Sync, in Koordinaten DIESES Betrachters). seat = Layout-Eintrag.
function gazeWorldPoint(seat, target, layout) {
  const x = seat.headPos[0]
  const z = seat.headPos[2]
  if (target === 'hand') return [x * 0.65, TABLE_TOP + 0.15, z * 0.65] // runter zur eigenen Hand
  if (target === 'lives') return [x * 1.4, 2.5, z * 1.4] // umdrehen zu den eigenen Ballons
  if (target && target !== 'center') {
    const t = layout.find((s) => s.id === target)
    if (t) return t.headPos // zu einem bestimmten Mitspieler
  }
  return [0, 1.15, 0] // Tischmitte
}

// ---- Kamera: fester Ego-Standpunkt, weiches Drehen des Blicks ----

function CameraRig({ target }) {
  const camera = useThree((s) => s.camera)
  const lookAt = useRef(new THREE.Vector3(0, 1.15, 0))

  useFrame((_, delta) => {
    const k = 1 - Math.pow(0.0015, delta) // rahmenratenunabhängiges Dämpfen
    camera.position.lerp(new THREE.Vector3(...EYE), k)
    lookAt.current.lerp(new THREE.Vector3(...target), k)
    camera.lookAt(lookAt.current)
  })
  return null
}

// ---- Bausteine ----

function Room() {
  return (
    <>
      {/* Boden */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#0c0c10" roughness={1} />
      </mesh>
    </>
  )
}

function Lamp() {
  return (
    <group position={[0, 5.2, 0]}>
      {/* Kabel */}
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 1.8, 6]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Lampenschirm — GESCHLOSSENER Kegel (kein offener Rand-Ring) */}
      <mesh position={[0, 0, 0]}>
        <coneGeometry args={[0.42, 0.42, 24]} />
        <meshStandardMaterial color="#1a1a1f" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Glühbirne */}
      <mesh position={[0, -0.15, 0]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color="#fff6d8" emissive="#ffcf66" emissiveIntensity={2.2} />
      </mesh>
      {/* Punktlicht direkt unter der Birne (Hauptlicht über dem Tisch) */}
      <pointLight position={[0, -0.2, 0]} intensity={120} distance={22} decay={1.4} color="#ffe6a8" castShadow shadow-bias={-0.0005} />
    </group>
  )
}

function Table() {
  const felt = getFeltTexture()
  return (
    <group>
      {/* Filz-Oberfläche (Oberkante bei TABLE_TOP) */}
      <mesh position={[0, TABLE_TOP - 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.04, 72]} />
        <meshStandardMaterial map={felt} color="#2a6347" roughness={0.95} />
      </mesh>
      {/* Holz-Zarge (Tischkörper) unter dem Filz — bündig mit dem Filzrand,
          KEIN überstehender Ring. */}
      <mesh position={[0, TABLE_TOP - 0.16, 0]}>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS - 0.06, 0.24, 72]} />
        <meshStandardMaterial color="#43301f" roughness={0.6} metalness={0.05} />
      </mesh>
      {/* Mittelsäule */}
      <mesh position={[0, (TABLE_TOP - 0.26) / 2 + 0.06, 0]}>
        <cylinderGeometry args={[0.16, 0.24, TABLE_TOP - 0.3, 24]} />
        <meshStandardMaterial color="#2a1a0e" roughness={0.6} />
      </mesh>
      {/* Breiter Fuß */}
      <mesh position={[0, 0.045, 0]}>
        <cylinderGeometry args={[0.66, 0.78, 0.09, 32]} />
        <meshStandardMaterial color="#20140a" roughness={0.7} />
      </mesh>
    </group>
  )
}

// Kürzester Weg zwischen zwei Winkeln (für weiches Drehen ohne Sprung).
function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a))
  return a + d * t
}

function Balloons({ lives, alive, color, position }) {
  // Drei Ballons fest hinter dem Sitz (zeigen die Leben — drehen NICHT mit dem
  // Blick mit, damit man sie immer ablesen kann).
  if (!alive) return null
  return (
    <group position={position}>
      {[-0.28, 0, 0.28].map((bx, i) => {
        const lost = i >= lives
        return (
          <group key={i} position={[bx, i === 1 ? 0.12 : 0, 0]}>
            <mesh>
              <sphereGeometry args={[0.16, 16, 16]} />
              <meshStandardMaterial color={lost ? '#333' : color} roughness={0.3} transparent opacity={lost ? 0.12 : 1} />
            </mesh>
            {!lost && (
              <mesh position={[0, -0.28, 0]}>
                <cylinderGeometry args={[0.004, 0.004, 0.4, 4]} />
                <meshStandardMaterial color="#888" />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

// Einfache Platzhalterfigur — wird genutzt, solange das echte Modell lädt oder
// falls es nicht geladen werden kann.
function PlaceholderBody({ color, isShooter }) {
  return (
    <group>
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.32, 0.5, 6, 12]} />
        <meshStandardMaterial color={isShooter ? '#7a1f1f' : color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.26, 16, 16]} />
        <meshStandardMaterial color="#d9b38c" roughness={0.6} />
      </mesh>
    </group>
  )
}

// Figur: echtes Charaktermodell (mit Animationsclips für idle/zeigen/zielen),
// das sich per Körperdrehung zum Blick-/Aktionsziel ausrichtet (Blick-Sync).
function Figure({ color, isShooter, gazePoint, poseTarget, pose, seatX, seatZ, bend = 0 }) {
  const bodyRef = useRef()
  const cur = useRef({ yaw: Math.atan2(-seatX, -seatZ), lean: 0 })

  useFrame((_, delta) => {
    const active = pose !== 'idle' && poseTarget
    const aim = active ? poseTarget : gazePoint
    const dx = aim[0] - seatX
    const dz = aim[2] - seatZ
    const yaw = Math.atan2(dx, dz) // Körper richtet sich zum Blickziel aus
    const k = 1 - Math.pow(0.0025, delta)
    cur.current.yaw = lerpAngle(cur.current.yaw, yaw, k)
    // Vorneigung (deutlich): beim Blick auf die eigene Hand beugt sich die Figur
    // sichtbar zu ihren Karten; der Körper zeigt dabei bereits dorthin (yaw).
    cur.current.lean += (bend - cur.current.lean) * k
    if (bodyRef.current) {
      // YXZ-Reihenfolge: erst yaw (um Welt-Y drehen), dann lean um die LOKALE
      // X-Achse des Körpers — so neigt der Kopf immer zu den eigenen Karten,
      // egal wo der Spieler am Tisch sitzt.
      bodyRef.current.rotation.order = 'YXZ'
      bodyRef.current.rotation.y = cur.current.yaw
      bodyRef.current.rotation.x = cur.current.lean
    }
  })

  const fallback = <PlaceholderBody color={color} isShooter={isShooter} />

  return (
    <group ref={bodyRef}>
      <ModelBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <CharacterModel pose={pose} />
        </Suspense>
      </ModelBoundary>
    </group>
  )
}

function Seat({ player, displayIndex, total, isSelf, isCurrent, isShooter, gazePoint, pose, poseTarget, selectedIndices, onToggleCard, bend }) {
  const [x, , z] = seatPosition(displayIndex, total)
  const color = SEAT_COLORS[player.slot % SEAT_COLORS.length]
  // Ballons fest hinter dem Sitz (von der Tischmitte weg).
  const ax = x / SEAT_RADIUS
  const az = z / SEAT_RADIUS
  const balloonPos = [ax * 0.45, 2.0, az * 0.45]

  return (
    <group position={[x, 0, z]}>
      {/* Eigene Figur nicht rendern — Kamera sitzt im Kopf des eigenen Avatars */}
      {!isSelf && <Figure color={color} isShooter={isShooter} gazePoint={gazePoint} pose={pose} poseTarget={poseTarget} seatX={x} seatZ={z} bend={bend} />}
      <Balloons lives={player.lives} alive={player.alive} color={color} position={balloonPos} />
      {player.alive && (
        <HeldHand
          seatX={x}
          seatZ={z}
          cards={player.hand}
          count={player.handCount}
          isSelf={isSelf}
          selectedIndices={selectedIndices}
          onToggle={onToggleCard}
        />
      )}

      {/* Namensschild über dem Kopf, immer zur Kamera gedreht */}
      <Billboard position={[0, 1.85, 0]}>
        <Text font={FONT} fontSize={0.18} color={isCurrent ? '#fbbf24' : '#e8e6e1'} anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor="#000">
          {player.name}
          {isSelf ? '  (du)' : ''}
        </Text>
        {isCurrent && player.alive && (
          <Text font={FONT} position={[0, 0.22, 0]} fontSize={0.13} color="#fbbf24" anchorX="center">
            am Zug
          </Text>
        )}
      </Billboard>

      {/* Sitz-Hocker */}
      <mesh position={[0, 0.15, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.3, 16]} />
        <meshStandardMaterial color="#1a1a1f" />
      </mesh>
    </group>
  )
}

const SEAT_COLORS = ['#c0563b', '#3b7dc0', '#3bc079', '#c0a93b']

// Karte mit echten Spielkarten-Texturen (Canvas): Vorderseite (Rang-Emblem) auf
// +z wenn faceUp, sonst die gemeinsame Rückseite. So sieht der Besitzer die
// Vorderseite, alle anderen die Rückseite.
const CARD_W = 0.62
const CARD_H = 0.88
function Card3D({ position = [0, 0, 0], rotation = [0, 0, 0], rank, faceUp = true }) {
  const back = getBackTexture()
  const face = faceUp && rank ? getFaceTexture(rank) : null
  return (
    <group position={position} rotation={rotation}>
      {/* Kartenkante (dünn, heller Rand) */}
      <RoundedBox args={[CARD_W, CARD_H, 0.018]} radius={0.03} smoothness={2}>
        <meshStandardMaterial color="#efe9da" roughness={0.6} />
      </RoundedBox>
      {/* Rückseite (-z) */}
      <mesh position={[0, 0, -0.0105]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial map={back} roughness={0.55} />
      </mesh>
      {/* Vorderseite (+z) */}
      {face && (
        <mesh position={[0, 0, 0.0105]}>
          <planeGeometry args={[CARD_W, CARD_H]} />
          <meshStandardMaterial map={face} roughness={0.5} />
        </mesh>
      )}
    </group>
  )
}

function ThemeCard({ theme }) {
  const ref = useRef()
  useFrame((state) => {
    if (!ref.current) return
    const t = state.clock.elapsedTime
    ref.current.position.y = TABLE_TOP + 1.4 + Math.sin(t * 1.2) * 0.08
    ref.current.rotation.y = Math.sin(t * 0.6) * 0.4
  })
  if (!theme) return null
  return (
    <group ref={ref} position={[0, TABLE_TOP + 1.4, 0]} scale={0.62}>
      <Card3D rank={theme} faceUp />
      <pointLight position={[0, 0, 0.6]} intensity={1.6} distance={2.4} color="#ffe6a8" />
    </group>
  )
}

// Eine flach auf dem Tisch liegende, verdeckte Karte.
function FlatCard({ position = [0, 0, 0], rotZ = 0, scale = 0.32, back }) {
  return (
    <group position={position} rotation={[-Math.PI / 2, 0, rotZ]} scale={scale}>
      <mesh>
        <boxGeometry args={[CARD_W, CARD_H, 0.01]} />
        <meshStandardMaterial color="#efe9da" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial map={back} roughness={0.55} />
      </mesh>
    </group>
  )
}

// Karten-Ablage in der Mitte: die ZULETZT gelegten Karten liegen mit Abstand
// nebeneinander in einer Reihe (zum Prüfen), die früheren als Stapel daneben.
function PlayedCards({ lastPlayCount = 0, pileCount = 0 }) {
  const back = getBackTexture()
  const rowN = Math.min(lastPlayCount, 3)
  const stackN = Math.min(Math.max(pileCount - rowN, 0), 14)
  return (
    <group position={[0, TABLE_TOP + 0.012, 0]}>
      {/* aktuelle Karten: zentrierte Reihe nebeneinander, mit Abstand */}
      <group position={[0, 0, 0]}>
        {Array.from({ length: rowN }).map((_, i) => (
          <FlatCard key={i} position={[(i - (rowN - 1) / 2) * 0.3, 0, 0]} back={back} />
        ))}
      </group>
      {/* frühere Karten: kleiner Stapel seitlich daneben */}
      <group position={[-0.9, 0, 0.05]}>
        {Array.from({ length: stackN }).map((_, i) => (
          <FlatCard key={i} position={[(i % 2) * 0.012 - 0.006, 0.005 * i, 0]} rotZ={i * 0.35} back={back} />
        ))}
      </group>
    </group>
  )
}

// Gehaltener Karten-Fächer vor jedem Spieler. Die Vorderseiten sind zum
// Besitzer geneigt (er sieht seine Ränge), die Rückseiten zeigen zum Tisch —
// die anderen Spieler sehen also die Kartenrückseiten.
function HeldHand({ seatX, seatZ, cards, count, isSelf, selectedIndices = [], onToggle }) {
  const n = cards ? cards.length : count
  if (!n) return null
  const r = Math.hypot(seatX, seatZ) || 1
  const awayX = seatX / r
  const awayZ = seatZ / r
  // Karten-Fächer weiter vom Kopf weg halten: dist=1.0 für alle Spieler, damit
  // der Kopf beim 20°-Vorneifen die Karten nicht überlappt.
  const dist = 1.0
  const pos = [-awayX * dist, 1.18, -awayZ * dist]
  const yaw = Math.atan2(awayX, awayZ) // +z (Vorderseite) zeigt zum Besitzer
  const tilt = isSelf ? -0.75 : -0.8
  const scale = isSelf ? 0.3 : 0.3

  return (
    <group position={pos} rotation={[0, yaw, 0]}>
      <group rotation={[tilt, 0, 0]} scale={scale}>
        {Array.from({ length: n }).map((_, i) => {
          const center = (n - 1) / 2
          const spread = (i - center) * 0.5
          const arc = (i - center) * 0.13
          const lifted = selectedIndices.includes(i)
          const drop = Math.abs(i - center) * -0.06 + (lifted ? 0.5 : 0) // hochgezogen
          const card = cards ? cards[i] : null
          return (
            <group
              key={card ? card.id : i}
              position={[spread, drop, i * 0.003]}
              rotation={[0, 0, -arc]}
              onPointerDown={
                onToggle
                  ? (e) => {
                      e.stopPropagation()
                      onToggle(i)
                    }
                  : undefined
              }
            >
              <Card3D rank={card ? card.rank : null} faceUp={!!card} />
            </group>
          )
        })}
      </group>
    </group>
  )
}

// Kurzes Mündungsfeuer am Lauf (+z), nur bei einem echten Schuss.
function MuzzleFlash() {
  return (
    <group position={[0, 0.01, 0.44]}>
      <mesh>
        <sphereGeometry args={[0.13, 8, 8]} />
        <meshBasicMaterial color="#ffd24a" transparent opacity={0.95} />
      </mesh>
      <mesh position={[0, 0, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.11, 0.34, 8]} />
        <meshBasicMaterial color="#ff8a1e" transparent opacity={0.9} />
      </mesh>
      <pointLight color="#ffb14a" intensity={8} distance={4} />
    </group>
  )
}

// Die gemeinsame Waffe: ruht in der Mitte; bei einem offenen Schuss richtet sie
// sich aufs Ziel. Schießt der lokale Spieler selbst, erscheint sie in
// Ego-Perspektive vor der Kamera; sonst vor dem Körper des Operators.
function Revolver({ shot, firing, seatPosOf, selfId }) {
  const ref = useRef()
  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    const active = shot || firing
    // Ruhezustand: seitlich liegend NEBEN dem Stapel.
    let target = [0.62, TABLE_TOP + 0.04, 0.2]
    let rot = [Math.PI / 2, 0.5, 0]
    let scale = 1
    if (active) {
      const op = seatPosOf(active.operatorId)
      const tg = seatPosOf(active.targetId)
      if (op && tg) {
        if (active.operatorId === selfId) {
          // Ego-Perspektive: vor der Kamera, leicht rechts/unten, auf das Ziel.
          const dx = tg[0] - EYE[0]
          const dz = tg[2] - EYE[2]
          const d = Math.hypot(dx, dz) || 1
          const nx = dx / d
          const nz = dz / d
          const fwd = firing && firing.hit ? 0.5 : 0.62
          target = [EYE[0] + nx * fwd + nz * 0.26, EYE[1] - 0.26, EYE[2] + nz * fwd - nx * 0.26]
          rot = [0, Math.atan2(nx, nz), 0]
        } else {
          // Dritte Person: RECHTS vom Schützen, aufrecht aufs Ziel gerichtet.
          const dx = tg[0] - op[0]
          const dz = tg[2] - op[2]
          const d = Math.hypot(dx, dz) || 1
          const nx = dx / d
          const nz = dz / d
          const rx = nz // Rechts-Vektor des Schützen
          const rz = -nx
          const fwd = firing && firing.hit ? 0.36 : 0.5
          target = [op[0] + nx * fwd + rx * 0.3, 1.2, op[2] + nz * fwd + rz * 0.3]
          rot = [0, Math.atan2(nx, nz), 0]
          if (active.targetId === selfId) scale = 1.7 // aus Opfersicht größer/bedrohlicher
        }
      }
    }
    const k = 1 - Math.pow(0.002, delta)
    g.position.lerp(new THREE.Vector3(...target), k)
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, rot[0], k)
    g.rotation.y = lerpAngle(g.rotation.y, rot[1], k)
    g.rotation.z = THREE.MathUtils.lerp(g.rotation.z, rot[2], k)
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, scale, k))
  })

  // Roter Glow (Outline-Effekt) während des Roulettes — für alle sichtbar.
  const active = !!(shot || firing)
  const glow = active ? '#ff2a2a' : '#000000'
  const glowI = active ? 0.55 : 0

  return (
    <group ref={ref} position={[0, TABLE_TOP + 0.06, 0]}>
      {/* Lauf (entlang +z) */}
      <mesh position={[0, 0.01, 0.22]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.034, 0.034, 0.38, 18]} />
        <meshStandardMaterial color="#23272e" metalness={0.92} roughness={0.28} emissive={glow} emissiveIntensity={glowI} />
      </mesh>
      {/* Visierschiene oben */}
      <mesh position={[0, 0.05, 0.22]}>
        <boxGeometry args={[0.028, 0.022, 0.34]} />
        <meshStandardMaterial color="#1b1f25" metalness={0.85} roughness={0.34} emissive={glow} emissiveIntensity={glowI} />
      </mesh>
      {/* Rahmen */}
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.072, 0.12, 0.2]} />
        <meshStandardMaterial color="#2a2f37" metalness={0.88} roughness={0.3} emissive={glow} emissiveIntensity={glowI} />
      </mesh>
      {/* Trommel (6 Kammern) */}
      <mesh position={[0, 0, -0.02]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.076, 0.076, 0.14, 6]} />
        <meshStandardMaterial color="#363c45" metalness={0.82} roughness={0.3} emissive={glow} emissiveIntensity={glowI} />
      </mesh>
      {/* Hammer hinten */}
      <mesh position={[0, 0.075, -0.14]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[0.024, 0.06, 0.03]} />
        <meshStandardMaterial color="#1b1f25" metalness={0.85} roughness={0.35} />
      </mesh>
      {/* Abzugbügel */}
      <mesh position={[0, -0.1, -0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.05, 0.011, 10, 18, Math.PI]} />
        <meshStandardMaterial color="#2a2f37" metalness={0.8} roughness={0.36} />
      </mesh>
      {/* Abzug */}
      <mesh position={[0, -0.07, -0.06]}>
        <boxGeometry args={[0.014, 0.04, 0.012]} />
        <meshStandardMaterial color="#15181d" metalness={0.7} roughness={0.42} />
      </mesh>
      {/* Griff (Holz) */}
      <mesh position={[0, -0.17, -0.17]} rotation={[0.42, 0, 0]}>
        <boxGeometry args={[0.058, 0.23, 0.085]} />
        <meshStandardMaterial color="#5b3a22" roughness={0.68} metalness={0.04} />
      </mesh>
      {active && <pointLight color="#ff2020" intensity={3} distance={2.2} />}
      {firing && firing.hit && <MuzzleFlash />}
    </group>
  )
}

// Eine Karte fliegt beim Austeilen vom Mittelstapel zu einem Sitz.
function DealCard({ to, delay }) {
  const ref = useRef()
  const t = useRef(-delay)
  const dur = 1.35 // dreimal so lange wie zuvor
  const back = getBackTexture()
  useFrame((_, dt) => {
    if (!ref.current) return
    t.current += dt
    const p = Math.max(0, Math.min(1, t.current / dur))
    const e = 1 - Math.pow(1 - p, 2)
    ref.current.visible = t.current >= 0 && p < 1
    ref.current.position.set(to[0] * e, TABLE_TOP + 0.1 + Math.sin(e * Math.PI) * 0.45, to[2] * e)
    ref.current.rotation.set(-Math.PI / 2, 0, e * 5)
  })
  return (
    <group ref={ref} visible={false} scale={0.3}>
      <mesh>
        <boxGeometry args={[CARD_W, CARD_H, 0.01]} />
        <meshStandardMaterial color="#efe9da" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial map={back} roughness={0.55} />
      </mesh>
    </group>
  )
}

// Austeil-Animation: Karten fliegen abwechselnd vom Mittelstapel zu den Sitzen
// (wie von einem unsichtbaren Dealer).
function DealAnimation({ layout }) {
  const cards = []
  let i = 0
  for (let round = 0; round < 2; round++) {
    for (const s of layout) {
      cards.push({ to: [s.headPos[0] * 0.68, 0, s.headPos[2] * 0.68], delay: i * 0.39 })
      i++
    }
  }
  return (
    <group>
      {cards.map((c, idx) => (
        <DealCard key={idx} to={c.to} delay={c.delay} />
      ))}
    </group>
  )
}

// Verdeckte Karte fliegt vom Sitz des Spielers in die Tischmitte.
function FlyingCard({ from }) {
  const ref = useRef()
  const t = useRef(0)
  useFrame((_, delta) => {
    if (!ref.current) return
    t.current = Math.min(1, t.current + delta / 0.55)
    const e = 1 - Math.pow(1 - t.current, 2)
    const sx = from[0] * 0.8
    const sz = from[2] * 0.8
    ref.current.position.set(sx * (1 - e), TABLE_TOP + 0.15 + Math.sin(e * Math.PI) * 0.5, sz * (1 - e))
    ref.current.rotation.set(-Math.PI / 2 + (1 - e) * 0.6, 0, e * 3)
  })
  return (
    <mesh ref={ref} position={[from[0] * 0.8, TABLE_TOP + 0.15, from[2] * 0.8]}>
      <boxGeometry args={[0.6, 0.88, 0.02]} />
      <meshStandardMaterial color="#7a1230" />
    </mesh>
  )
}

// ---- Hauptkomponente ----

export default function GameScene({ game, selfId, view, gaze = {}, selected = [], onToggleCard, selection = {} }) {
  const players = game.players
  const total = players.length
  const shotForCam = game.pendingShot

  const layout = useMemo(() => seatLayout(players, selfId), [players, selfId])
  const byId = (id) => layout.find((s) => s.id === id)
  const seatPosOf = (id) => byId(id)?.headPos

  // Kamera-Blickziel. 'roulette' = Punkt zwischen Schütze und Ziel (Zuschauer).
  const lookTarget = useMemo(() => {
    if (view === 'roulette' && shotForCam) {
      const op = layout.find((s) => s.id === shotForCam.operatorId)?.headPos
      const tg = layout.find((s) => s.id === shotForCam.targetId)?.headPos
      if (op && tg) return [(op[0] + tg[0]) / 2, 1.35, (op[2] + tg[2]) / 2]
    }
    return resolveLookTarget(view, layout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, layout, shotForCam?.operatorId, shotForCam?.targetId])

  // Blickziel jedes Spielers: man selbst folgt der eigenen Ansicht sofort,
  // die anderen dem vom Server synchronisierten Blick (Standard: Tischmitte).
  const gazeTargetFor = (player) => (player.id === selfId ? view : gaze[player.id] || 'center')
  const gazePointFor = (player) => gazeWorldPoint(byId(player.id), gazeTargetFor(player), layout)
  // Deutliche Vorneigung zum eigenen Kartenfächer beim Blick auf die Hand;
  // leicht zurück beim Blick hoch zu den Ballons.
  const bendFor = (player) => {
    const t = gazeTargetFor(player)
    if (t === 'hand') return 0.35 // ~20° nach vorne zum Kartenfächer
    if (t === 'lives') return -0.22
    return 0
  }

  // Aktions-Pose: der Operator zielt aufs Ziel, ein (separater) Anschuldiger
  // zeigt auf den Beschuldigten.
  const shot = game.pendingShot
  const poseFor = (player) => {
    if (!shot) return { pose: 'idle', poseTarget: null }
    if (player.id === shot.operatorId) return { pose: 'aim', poseTarget: byId(shot.targetId)?.headPos }
    if (player.id === shot.accuserId && shot.accuserId !== shot.operatorId) {
      return { pose: 'point', poseTarget: byId(shot.accusedId)?.headPos }
    }
    return { pose: 'idle', poseTarget: null }
  }

  // Transiente Animationen: Mündungsfeuer beim Schuss, fliegende Karte beim
  // Legen, Austeil-Animation beim Rundenstart.
  const [firing, setFiring] = useState(null)
  const [fly, setFly] = useState(null)
  const [dealKey, setDealKey] = useState(0)
  const seen = useRef({ shot: -1, play: -1, round: -1 })
  useEffect(() => {
    for (const e of game.recentEvents || []) {
      if (e.type === 'shot' && e.n > seen.current.shot) {
        seen.current.shot = e.n
        const ev = e
        setFiring(ev)
        setTimeout(() => setFiring((f) => (f === ev ? null : f)), 650)
      }
      if (e.type === 'play' && e.n > seen.current.play) {
        seen.current.play = e.n
        const fn = e.n
        setFly({ from: e.playerId, n: fn })
        // Nach der Animation wieder entfernen (sonst bleibt die Karte liegen).
        setTimeout(() => setFly((f) => (f && f.n === fn ? null : f)), 700)
      }
      if (e.type === 'roundStart' && e.n > seen.current.round) {
        seen.current.round = e.n
        setDealKey(e.n) // Austeil-Animation neu starten
      }
    }
  }, [game.recentEvents])

  const flyFrom = fly ? seatPosOf(fly.from) : null

  // WebGL-Kontext-Wiederherstellung: Hintergrund-Tabs (z.B. beim Spielen mit
  // mehreren Tabs auf einem Rechner) verlieren ihren GPU-Kontext -> schwarz.
  // Wir bauen das Canvas neu auf, sobald der Tab wieder sichtbar ist.
  const [canvasKey, setCanvasKey] = useState(0)
  const [lost, setLost] = useState(false)
  const lostRef = useRef(false)

  useEffect(() => {
    const rebuildIfNeeded = () => {
      if (document.visibilityState === 'visible' && lostRef.current) {
        lostRef.current = false
        setLost(false)
        setCanvasKey((k) => k + 1)
      }
    }
    document.addEventListener('visibilitychange', rebuildIfNeeded)
    window.addEventListener('focus', rebuildIfNeeded)
    return () => {
      document.removeEventListener('visibilitychange', rebuildIfNeeded)
      window.removeEventListener('focus', rebuildIfNeeded)
    }
  }, [])

  return (
    <>
    <Canvas
      key={canvasKey}
      camera={{ position: EYE, fov: 77 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]} // Pixelratio begrenzen -> weniger GPU-Last, seltener Kontextverlust
      onCreated={({ gl }) => {
        const canvas = gl.domElement
        // Ohne preventDefault bleibt der Kontext dauerhaft verloren.
        canvas.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          lostRef.current = true
          setLost(true)
        })
        // Stellt der Browser den Kontext wieder her (und der Tab ist sichtbar),
        // bauen wir das Canvas frisch auf.
        canvas.addEventListener('webglcontextrestored', () => {
          if (document.visibilityState === 'visible') {
            lostRef.current = false
            setLost(false)
            setCanvasKey((k) => k + 1)
          }
        })
      }}
      className="absolute inset-0"
    >
      <color attach="background" args={['#050507']} />
      <fog attach="fog" args={['#050507', 13, 28]} />
      {/* Wenig Grundlicht -> die Tischlampe dominiert (Casino-Stimmung). */}
      <ambientLight intensity={0.28} />
      <hemisphereLight args={['#ffe9c2', '#0c0c12', 0.4]} />
      <directionalLight position={[2, 6, 8]} intensity={0.45} color="#fff0d0" />

      <CameraRig target={lookTarget} />
      <Room />
      <Lamp />
      <Table />
      <PlayedCards lastPlayCount={game.lastPlay?.count ?? 0} pileCount={game.pileCount} />
      <ThemeCard theme={game.theme} />
      <Revolver shot={shot} firing={firing} seatPosOf={seatPosOf} selfId={selfId} />
      {flyFrom && <FlyingCard key={fly.n} from={flyFrom} />}
      {dealKey > 0 && <DealAnimation key={dealKey} layout={layout} />}

      {players.map((player) => {
        const { pose, poseTarget } = poseFor(player)
        const isSelf = player.id === selfId
        return (
          <Seat
            key={player.id}
            player={player}
            displayIndex={byId(player.id).displayIndex}
            total={total}
            isSelf={isSelf}
            isCurrent={player.id === game.currentActorId && game.phase !== 'gameOver'}
            isShooter={shot?.targetId === player.id}
            gazePoint={gazePointFor(player)}
            pose={pose}
            poseTarget={poseTarget}
            bend={bendFor(player)}
            selectedIndices={isSelf ? selected : selection[player.id] || []}
            onToggleCard={isSelf ? onToggleCard : undefined}
          />
        )
      })}
    </Canvas>
    {lost && (
      <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-center text-sm text-neutral-300">
        <div>
          3D pausiert (Tab im Hintergrund) —
          <br />
          klicke ins Fenster, um die Ansicht wiederherzustellen.
        </div>
      </div>
    )}
    </>
  )
}

import { Component, Suspense, useEffect, useRef, useState } from 'react'
import { usePartyRoom } from './net/usePartyRoom'
import { generateRoomCode, normalizeRoomCode, isValidRoomCode } from './lib/roomCode'
import GameScene, { seatLayout } from './scene/GameScene'
import * as sfx from './audio/sfx'

// Fängt Render-Fehler ab, damit der Bildschirm nicht weiß wird, und zeigt eine
// Wiederherstellungs-Option statt eines Absturzes.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('Liar’s Deck Fehler:', error, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-full flex-col items-center justify-center gap-4 bg-[#0a0a0c] p-6 text-center">
          <p className="text-xl font-semibold text-amber-300">Etwas ist schiefgelaufen.</p>
          <p className="max-w-md text-sm text-neutral-400">{String(this.state.error?.message || this.state.error)}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-amber-500 px-6 py-2.5 font-bold text-black hover:bg-amber-400"
          >
            Neu laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Raum aus der URL lesen (teilbarer Link: ?raum=CODE).
function roomFromUrl() {
  const p = new URLSearchParams(window.location.search).get('raum')
  return p && isValidRoomCode(p) ? normalizeRoomCode(p) : null
}

export default function App() {
  const [roomId, setRoomId] = useState(roomFromUrl)

  // URL mit dem aktuellen Raum synchron halten.
  useEffect(() => {
    const url = roomId
      ? `${window.location.pathname}?raum=${roomId}`
      : window.location.pathname
    window.history.replaceState(null, '', url)
  }, [roomId])

  return (
    <ErrorBoundary>
      {roomId ? <Room roomId={roomId} onLeave={() => setRoomId(null)} /> : <MainMenu onEnter={setRoomId} />}
    </ErrorBoundary>
  )
}

// ---------------- Hauptmenü ----------------

function MainMenu({ onEnter }) {
  const [joinCode, setJoinCode] = useState('')
  const createRoom = () => onEnter(generateRoomCode())
  const joinRoom = () => isValidRoomCode(joinCode) && onEnter(normalizeRoomCode(joinCode))

  return (
    <Shell>
      <div className="w-full max-w-md text-center">
        <h1 className="text-5xl font-bold tracking-tight text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.25)]">
          Liar&apos;s Deck
        </h1>
        <p className="mt-2 text-neutral-400">Bluffen. Anschuldigen. Überleben.</p>

        <div className="mt-10 space-y-6 rounded-2xl border border-amber-900/40 bg-black/40 p-6 shadow-2xl backdrop-blur">
          <button
            onClick={createRoom}
            className="w-full rounded-xl bg-amber-500 py-3 text-lg font-semibold text-black transition hover:bg-amber-400 active:scale-[0.99]"
          >
            Raum erstellen
          </button>

          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <div className="h-px flex-1 bg-neutral-700" /> ODER
            <div className="h-px flex-1 bg-neutral-700" />
          </div>

          <div className="space-y-3">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(normalizeRoomCode(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
              placeholder="CODE"
              maxLength={4}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 py-3 text-center text-2xl font-mono uppercase tracking-[0.5em] text-amber-200 outline-none focus:border-amber-500"
            />
            <button
              onClick={joinRoom}
              disabled={!isValidRoomCode(joinCode)}
              className="w-full rounded-xl border border-amber-700/60 py-3 font-semibold text-amber-200 transition enabled:hover:bg-amber-900/30 disabled:opacity-40"
            >
              Raum beitreten
            </button>
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ---------------- Raum (Lobby oder Spiel) ----------------

function Room({ roomId, onLeave }) {
  const room = usePartyRoom(roomId)
  const { connected, error, lobby, game, kicked } = room

  useEffect(() => {
    if (kicked) {
      const t = setTimeout(onLeave, 2500)
      return () => clearTimeout(t)
    }
  }, [kicked, onLeave])

  if (kicked) {
    return (
      <Shell>
        <p className="text-xl font-semibold text-red-400">Du wurdest aus dem Raum entfernt.</p>
      </Shell>
    )
  }

  // Im Spiel: Vollbild-3D-Szene mit HUD-Overlay.
  if (game) return <GameScreen room={room} roomId={roomId} onLeave={onLeave} connected={connected} error={error} />

  // Sonst: Lobby in der zentrierten Hülle.
  return (
    <Shell align="start">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between">
          <button
            onClick={onLeave}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            ← Verlassen
          </button>
          <div className="flex items-center gap-3">
            <span className="font-mono text-lg tracking-[0.3em] text-amber-300">{roomId}</span>
            <span className="flex items-center gap-2 text-sm text-neutral-400">
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
              {connected ? 'Verbunden' : 'Verbinde…'}
            </span>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-800 bg-red-950/50 p-3 text-center text-red-300">
            {error}
          </div>
        )}

        {lobby && <Lobby room={room} roomId={roomId} />}
        {!lobby && <p className="mt-20 text-center text-neutral-500">Lade Raum…</p>}
      </div>
    </Shell>
  )
}

// ---------------- Lobby ----------------

function Lobby({ room, roomId }) {
  const { selfId, lobby, setName, startGame, addBot, removeBot, kick } = room
  const botCount = lobby.players.filter((p) => p.isBot).length
  const hasFreeSlot = lobby.players.length < lobby.maxPlayers
  const [nameDraft, setNameDraft] = useState('')
  const isHost = selfId === lobby.hostId

  const saveName = () => {
    if (nameDraft.trim()) {
      setName(nameDraft.trim())
      setNameDraft('')
    }
  }

  return (
    <div>
      <div className="mt-8 text-center">
        <p className="text-sm uppercase tracking-widest text-neutral-500">Raum-Code</p>
        <p className="mt-1 text-6xl font-mono font-bold tracking-[0.3em] text-amber-300">{roomId}</p>
        <CopyLinkButton roomId={roomId} />
      </div>

      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-200">Spieler am Tisch</h2>
          <span className="text-sm text-neutral-500">
            {lobby.players.length}/{lobby.maxPlayers}
          </span>
        </div>
        <ul className="space-y-2">
          {lobby.players.map((p) => (
            <li
              key={p.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                p.id === selfId ? 'border-amber-600/60 bg-amber-950/30' : 'border-neutral-800 bg-neutral-900/40'
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-400">
                  {p.slot + 1}
                </span>
                <span className="font-medium text-neutral-100">{p.name}</span>
                {p.id === selfId && <span className="text-xs text-amber-400">(du)</span>}
              </span>
              <span className="flex items-center gap-2">
                {p.isBot ? (
                  <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-xs font-semibold text-sky-300">Bot</span>
                ) : (
                  p.id === lobby.hostId && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-300">Host</span>
                  )
                )}
                {isHost && !p.isBot && p.id !== selfId && (
                  <button
                    onClick={() => kick(p.id)}
                    className="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 transition"
                  >
                    Entfernen
                  </button>
                )}
              </span>
            </li>
          ))}
          {Array.from({ length: lobby.maxPlayers - lobby.players.length }).map((_, i) => (
            <li key={`empty-${i}`} className="rounded-xl border border-dashed border-neutral-800 px-4 py-3 text-sm text-neutral-600">
              Freier Platz…
            </li>
          ))}
        </ul>

        {isHost && (
          <div className="mt-3 flex justify-center gap-2">
            <button
              onClick={addBot}
              disabled={!hasFreeSlot}
              className="rounded-lg border border-sky-700/60 px-4 py-1.5 text-sm font-medium text-sky-200 transition enabled:hover:bg-sky-900/30 disabled:opacity-40"
            >
              🤖 Bot hinzufügen
            </button>
            <button
              onClick={removeBot}
              disabled={botCount === 0}
              className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm font-medium text-neutral-300 transition enabled:hover:bg-neutral-800 disabled:opacity-40"
            >
              Bot entfernen
            </button>
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-2">
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && saveName()}
          placeholder="Deinen Namen ändern…"
          maxLength={20}
          className="flex-1 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-neutral-100 outline-none focus:border-amber-500"
        />
        <button onClick={saveName} className="rounded-xl bg-neutral-800 px-4 py-2.5 font-medium text-neutral-200 hover:bg-neutral-700">
          Speichern
        </button>
      </div>

      <div className="mt-8 text-center">
        {isHost ? (
          <button
            onClick={startGame}
            disabled={!lobby.canStart}
            className="rounded-xl bg-amber-500 px-10 py-3 text-lg font-bold text-black transition hover:bg-amber-400 disabled:opacity-40"
          >
            Spiel starten
          </button>
        ) : (
          <p className="text-neutral-500">Warte, bis der Host das Spiel startet…</p>
        )}
        {isHost && !lobby.canStart && <p className="mt-2 text-sm text-neutral-500">Mindestens 2 Spieler nötig.</p>}
      </div>
    </div>
  )
}

function CopyLinkButton({ roomId }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const link = `${window.location.origin}${window.location.pathname}?raum=${roomId}`
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // Fallback: nichts tun, Link steht ohnehin in der Adresszeile.
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={copy}
      className="mt-3 rounded-lg border border-amber-700/60 px-4 py-1.5 text-sm font-medium text-amber-200 transition hover:bg-amber-900/30"
    >
      {copied ? '✓ Link kopiert!' : '🔗 Einladungs-Link kopieren'}
    </button>
  )
}

// ---------------- Spiel ----------------

const RANK_LABEL = { ACE: 'A', KING: 'K', QUEEN: 'Q', JOKER: '★' }
const THEME_LABEL = { ACE: 'Ass', KING: 'König', QUEEN: 'Dame' }

function Balloons({ lives, alive }) {
  if (!alive) return <span title="ausgeschieden" className="text-xl">💀</span>
  return (
    <span className="tracking-tight">
      {Array.from({ length: 3 }).map((_, i) => (
        <span key={i} className={i < lives ? '' : 'opacity-20 grayscale'}>🎈</span>
      ))}
    </span>
  )
}

function Card({ rank, selected, onClick, disabled }) {
  const isJoker = rank === 'JOKER'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex h-24 w-16 flex-col items-center justify-center rounded-lg border-2 text-2xl font-bold shadow-lg transition ${
        selected ? '-translate-y-3 border-amber-400 bg-amber-100 text-black ring-2 ring-amber-400' : 'border-neutral-600 bg-neutral-100 text-black'
      } ${isJoker ? 'text-purple-700' : ''} ${disabled ? 'cursor-default opacity-90' : 'hover:-translate-y-1'}`}
    >
      <span>{RANK_LABEL[rank]}</span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
        {isJoker ? 'Joker' : rank}
      </span>
    </button>
  )
}

// Aufgedeckte Karte beim Roulette: grün = passte zum Theme, rot = Bluff.
function RevealCard({ rank, theme }) {
  const ok = rank === theme || rank === 'JOKER'
  return (
    <span
      className={`inline-flex h-12 w-9 flex-col items-center justify-center rounded border-2 text-sm font-bold ${
        ok ? 'border-green-500 bg-green-500/10 text-green-300' : 'border-red-500 bg-red-500/10 text-red-300'
      }`}
    >
      {RANK_LABEL[rank]}
    </span>
  )
}

function formatEvent(ev, nameOf) {
  switch (ev.type) {
    case 'roundStart':
      return { text: `Runde ${ev.round} — Theme: ${THEME_LABEL[ev.theme]}`, kind: 'muted' }
    case 'play':
      return { text: `${nameOf(ev.playerId)} legt ${ev.count} Karte(n) verdeckt`, kind: 'normal' }
    case 'accuse':
      return {
        text: `${nameOf(ev.accuserId)} ruft „Liar!" gegen ${nameOf(ev.accusedId)} — ${ev.truthful ? 'die Karten passten!' : 'Bluff aufgedeckt!'}`,
        kind: 'accuse',
      }
    case 'shot':
      return {
        text: `${nameOf(ev.operatorId)} drückt ab auf ${nameOf(ev.targetId)} — ${ev.hit ? 'TREFFER 💥' : 'Klick … leer'}${ev.eliminated ? ' · ausgeschieden ☠️' : ''}`,
        kind: ev.hit ? 'hit' : 'safe',
      }
    case 'roundPass':
      return { text: `${nameOf(ev.playerId)} passt`, kind: 'muted' }
    case 'gameOver':
      return { text: `${nameOf(ev.winnerId)} gewinnt das Spiel! 🏆`, kind: 'win' }
    default:
      return { text: '', kind: 'muted' }
  }
}

const EVENT_COLOR = {
  muted: 'text-neutral-500',
  normal: 'text-neutral-300',
  accuse: 'text-amber-300',
  hit: 'text-red-400 font-semibold',
  safe: 'text-green-400',
  win: 'text-amber-300 font-semibold',
}

const DIR_LABEL = { links: '⬅️', rechts: '➡️', vorne: '⬆️' }

function GameScreen({ room, roomId, onLeave, connected, error }) {
  const { selfId, game, gaze, selection, play, accuse, pullTrigger, pass, restart, sendGaze, sendSelection } = room
  const [selected, setSelected] = useState([]) // Indizes der hochgezogenen Karten
  const [view, setView] = useState('center')
  const [muted, setMuted] = useState(sfx.getMuted())

  const toggleMute = () => {
    const next = !muted
    sfx.setMuted(next)
    setMuted(next)
  }

  // Eigene Blickrichtung an die anderen Spieler senden (Blick-Sync).
  useEffect(() => {
    sendGaze(view)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  // Kamera-Buttons: eigene Hand, Blick zu jedem Mitspieler, eigene Ballons.
  const layout = seatLayout(game.players, selfId)
  const opponents = layout.filter((s) => !s.isSelf)
  const cameraButtons = [
    { key: 'hand', label: '✋ Hand' },
    ...opponents.map((o) => ({ key: o.id, label: `${DIR_LABEL[o.dir]} ${o.name}` })),
    { key: 'lives', label: '🎈 Meine Ballons' },
  ]

  const me = game.players.find((p) => p.id === selfId)
  const myHand = me?.hand ?? []
  const actions = game.actions ?? []
  const nameOf = (id) => game.players.find((p) => p.id === id)?.name ?? '—'
  const isMyTurn = game.currentActorId === selfId
  const shot = game.pendingShot

  // Auswahl bei Runden-/Phasenwechsel zurücksetzen.
  useEffect(() => {
    setSelected([])
  }, [game.round, game.phase])

  // Auswahl an die anderen synchronisieren (sie sehen die hochgezogenen Karten).
  useEffect(() => {
    sendSelection(selected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // Roulette-Kamera: bin ich Ziel -> Schütze, bin ich Schütze -> Ziel, sonst als
  // Zuschauer zwischen die beiden. Nach dem Roulette zurück zur Tischmitte.
  const prevShotRef = useRef(false)
  useEffect(() => {
    const has = !!shot
    if (has && !prevShotRef.current) {
      if (shot.targetId === selfId) setView(shot.operatorId)
      else if (shot.operatorId === selfId) setView(shot.targetId)
      else setView('roulette')
    } else if (!has && prevShotRef.current) {
      setView('center')
    }
    prevShotRef.current = has
  }, [shot]) // eslint-disable-line react-hooks/exhaustive-deps

  // Soundeffekte zu neuen Ereignissen. Beim ersten Durchlauf werden bestehende
  // (historische) Ereignisse übersprungen, damit es beim Beitreten nicht knallt.
  const seenSound = useRef(null)
  useEffect(() => {
    const evs = game.recentEvents || []
    const maxN = evs.length ? Math.max(...evs.map((e) => e.n)) : -1
    if (seenSound.current === null) {
      seenSound.current = maxN
      return
    }
    for (const e of evs) {
      if (e.n <= seenSound.current) continue
      switch (e.type) {
        case 'play':
          sfx.playCard()
          break
        case 'accuse':
          sfx.playSlam()
          break
        case 'shot':
          if (e.hit) {
            sfx.playShot()
            setTimeout(() => sfx.playPop(), 220)
          } else {
            sfx.playClick()
          }
          break
        case 'gameOver':
          sfx.playWin()
          break
        default:
          break
      }
    }
    seenSound.current = Math.max(seenSound.current, maxN)
  }, [game.recentEvents])

  // Klares Schuss-Feedback (Treffer/leer) als Banner oben.
  const [shotMsg, setShotMsg] = useState(null)
  const seenShotMsg = useRef(null)
  useEffect(() => {
    const evs = game.recentEvents || []
    const maxN = evs.length ? Math.max(...evs.map((e) => e.n)) : -1
    if (seenShotMsg.current === null) {
      seenShotMsg.current = maxN
      return
    }
    for (const e of evs) {
      if (e.n <= seenShotMsg.current || e.type !== 'shot') continue
      const en = e.n
      setShotMsg({ hit: e.hit, eliminated: e.eliminated, targetId: e.targetId, n: en })
      setTimeout(() => setShotMsg((m) => (m && m.n === en ? null : m)), 2800)
    }
    seenShotMsg.current = Math.max(seenShotMsg.current, maxN)
  }, [game.recentEvents])

  // Karte per Index an-/abwählen (max. 3). Nur an meinem Zug sinnvoll.
  const toggleCard = (i) => {
    if (!actions.includes('play')) return
    setSelected((sel) => (sel.includes(i) ? sel.filter((x) => x !== i) : sel.length < 3 ? [...sel, i].sort((a, b) => a - b) : sel))
  }

  const playSelected = () => {
    if (selected.length < 1 || selected.length > 3) return
    const ids = selected.map((i) => myHand[i]?.id).filter(Boolean)
    if (ids.length) {
      play(ids)
      setSelected([])
    }
  }

  const canPullTrigger = actions.includes('pullTrigger')

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050507]">
      <Suspense fallback={<div className="flex h-full items-center justify-center text-neutral-500">Lade Tisch…</div>}>
        <GameScene
          game={game}
          selfId={selfId}
          view={view}
          gaze={gaze}
          selected={selected}
          onToggleCard={toggleCard}
          selection={selection}
        />
      </Suspense>

      {/* HUD-Overlay */}
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {/* Kopfzeile */}
        <div className="flex items-start justify-between p-4">
          <button
            onClick={onLeave}
            className="pointer-events-auto rounded-lg border border-neutral-700 bg-black/50 px-3 py-1.5 text-sm text-neutral-200 backdrop-blur hover:bg-neutral-800"
          >
            ← Verlassen
          </button>

          <div className="max-w-[60vw] rounded-xl border border-neutral-800 bg-black/50 px-5 py-2 text-center backdrop-blur">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500">Theme · Runde {game.round}</p>
            <p className="text-xl font-bold text-amber-300">{game.theme ? THEME_LABEL[game.theme] : '—'}</p>
            {game.phase !== 'gameOver' && (
              <p className="mt-0.5 text-[11px] text-neutral-400">
                Reihenfolge:{' '}
                {game.players
                  .filter((p) => p.alive)
                  .map((p, i, arr) => (
                    <span key={p.id}>
                      <span className={p.id === game.currentActorId ? 'font-semibold text-amber-300' : 'text-neutral-300'}>{p.name}</span>
                      {i < arr.length - 1 ? ' → ' : ''}
                    </span>
                  ))}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              title={muted ? 'Ton an' : 'Ton aus'}
              className="pointer-events-auto rounded-lg border border-neutral-800 bg-black/50 px-2.5 py-1.5 text-sm backdrop-blur hover:bg-neutral-800"
            >
              {muted ? '🔇' : '🔊'}
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-black/50 px-3 py-1.5 text-sm backdrop-blur">
              <span className="font-mono tracking-[0.2em] text-amber-300">{roomId}</span>
              <span className={`h-2.5 w-2.5 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-auto mt-2 rounded-lg border border-red-800 bg-red-950/70 px-4 py-2 text-center text-sm text-red-300 backdrop-blur">
            {error}
          </div>
        )}

        {/* Roulette-Status oben mittig (statt eines Fensters) */}
        {shot && !shotMsg && (
          <div className="mx-auto mt-3 rounded-xl border border-red-700/60 bg-black/70 px-6 py-2.5 text-center backdrop-blur">
            <p className="text-base font-semibold text-red-200">
              🔫 {nameOf(shot.operatorId)} zielt auf {nameOf(shot.targetId)}
            </p>
            <p className="text-xs text-neutral-300">
              {shot.truthful
                ? `${nameOf(shot.accuserId)} lag falsch — die Karten passten.`
                : `${nameOf(shot.accusedId)} hat geblufft — erwischt!`}
            </p>
            <p className="mt-1 text-sm font-semibold text-amber-300">
              Trefferchance: {game.revolver?.level ?? 1}/6
            </p>
          </div>
        )}

        {shotMsg && (
          <div
            className={`mx-auto mt-3 rounded-xl border px-6 py-3 text-center text-lg font-bold backdrop-blur ${
              shotMsg.hit
                ? 'border-red-600 bg-red-950/80 text-red-200'
                : 'border-green-600 bg-green-950/70 text-green-200'
            }`}
          >
            {shotMsg.hit
              ? `💥 TREFFER! ${nameOf(shotMsg.targetId)} verliert einen Ballon${shotMsg.eliminated ? ' — ausgeschieden ☠️' : ''}`
              : `😮‍💨 Klick … leere Kammer — ${nameOf(shotMsg.targetId)} überlebt!`}
          </div>
        )}

        {/* Mitte: nur noch Game Over (Roulette läuft in 3D + Text/Button) */}
        <div className="flex flex-1 items-center justify-center p-4">
          {game.phase === 'gameOver' && (
            <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-amber-600 bg-black/80 p-8 text-center shadow-2xl backdrop-blur">
              <p className="text-4xl">🏆</p>
              <p className="mt-2 text-2xl font-bold text-amber-300">{nameOf(game.winnerId)} gewinnt!</p>
              <p className="mt-1 text-sm text-neutral-400">Last man standing.</p>
              {me && (
                <button onClick={restart} className="mt-5 rounded-xl bg-amber-500 px-8 py-2.5 font-bold text-black hover:bg-amber-400">
                  Zurück zur Lobby
                </button>
              )}
            </div>
          )}
        </div>

        {/* Fußzeile: Kamera-Umschalter + Hand + Aktionen */}
        <div className="space-y-3 p-4">
          {/* Kamera-Bahnen */}
          <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
            {cameraButtons.map((b) => (
              <button
                key={b.key}
                onClick={() => setView(b.key)}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium backdrop-blur transition ${
                  view === b.key
                    ? 'border-amber-500 bg-amber-500/20 text-amber-200'
                    : 'border-neutral-700 bg-black/50 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Du bist dran / Warten */}
          {game.phase === 'playing' && (
            isMyTurn ? (
              <p className="text-center text-sm font-semibold text-amber-300">
                ▶ Du bist am Zug{actions.includes('play') ? ' — tippe deine Karten an' : ''}
              </p>
            ) : (
              <p className="text-center text-sm text-neutral-500">Warte auf {nameOf(game.currentActorId)}…</p>
            )
          )}

          {/* Aktions-Buttons unten mittig */}
          {me && me.alive && game.phase !== 'gameOver' && (
            <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
              {canPullTrigger && (
                <button
                  onClick={pullTrigger}
                  className="rounded-xl bg-red-600 px-10 py-3 text-lg font-bold text-white shadow-lg transition hover:bg-red-500 active:scale-95"
                >
                  😬 Abdrücken auf {nameOf(shot.targetId)} ({game.revolver?.level ?? 1}/6)
                </button>
              )}
              {actions.includes('play') && (
                <button
                  onClick={playSelected}
                  disabled={selected.length < 1 || selected.length > 3}
                  className="rounded-xl bg-amber-500 px-8 py-2.5 font-bold text-black transition hover:bg-amber-400 disabled:opacity-40"
                >
                  {selected.length || 0} Karte(n) legen
                </button>
              )}
              {actions.includes('accuse') && (
                <button onClick={accuse} className="rounded-xl bg-red-600 px-6 py-2.5 font-bold text-white transition hover:bg-red-500 active:scale-95">
                  Liar! 🗯️
                </button>
              )}
              {actions.includes('pass') && (
                <button onClick={pass} className="rounded-xl border border-neutral-600 px-6 py-2.5 font-medium text-neutral-200 hover:bg-neutral-800">
                  Passen
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Spielverlauf (unten links) */}
      <div className="pointer-events-auto absolute bottom-4 left-4 hidden w-72 lg:block">
        <EventFeed events={game.recentEvents} nameOf={nameOf} />
      </div>
    </div>
  )
}

function EventFeed({ events, nameOf }) {
  const boxRef = useRef(null)
  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight
  }, [events])

  if (!events?.length) return null
  return (
    <div className="mt-6">
      <p className="mb-1 text-xs uppercase tracking-widest text-neutral-600">Spielverlauf</p>
      <div ref={boxRef} className="max-h-32 space-y-1 overflow-y-auto rounded-xl border border-neutral-800 bg-black/30 p-3 text-sm">
        {events.map((ev, i) => {
          const { text, kind } = formatEvent(ev, nameOf)
          if (!text) return null
          return <p key={i} className={EVENT_COLOR[kind]}>{text}</p>
        })}
      </div>
    </div>
  )
}

// ---------------- Layout-Hülle ----------------

function Shell({ children, align = 'center' }) {
  return (
    <div className={`min-h-full bg-gradient-to-b from-[#11131a] to-[#070608] p-6 ${align === 'center' ? 'flex items-center justify-center' : ''}`}>
      {children}
    </div>
  )
}

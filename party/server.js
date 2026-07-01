// Autoritativer PartyKit-Server für Liar's Deck.
// Ein Durable Object pro Raum. Der Server hält den echten Spielzustand
// (Engine aus src/game) und ist die einzige Wahrheit — Clients schicken nur
// Aktionen und bekommen eine GEFILTERTE Sicht zurück (fremde Hände verdeckt).
// Das verhindert Cheating, weil geheime Karten nie an andere Clients gehen.

import {
  createGame,
  playCards,
  accuse,
  pullTrigger,
  pass,
  getPublicState,
  currentActorId,
} from '../src/game/engine.js'
import { MAX_PLAYERS } from '../src/game/constants.js'
import { botDecide } from '../src/game/bot.js'

export default class LiarsDeckRoom {
  constructor(room) {
    this.room = room
    // Lobby-Roster: id -> { id, name, slot, isHost, isBot }
    this.players = new Map()
    // Laufendes Spiel (Engine-Zustand) oder null, solange in der Lobby.
    this.game = null
    // Blickrichtung pro Spieler (für den Blick-Sync): id -> target
    // ('center' | 'hand' | 'lives' | <spielerId>). Kein Einfluss auf die Logik.
    this.gaze = {}
    // Aktuell angeklickte (hochgezogene) Karten-Indizes pro Spieler — nur für
    // die Anzeige (andere sehen, welche Karten hochgezogen sind). Indizes, nicht
    // Karten-ids, damit keine geheimen Karten verraten werden.
    this.selection = {}
    this.botCounter = 0
    // Spieler die während eines laufenden Spiels getrennt wurden — ihr Zug wird
    // automatisch übernommen (wie ein Bot), bis sie wieder verbinden.
    this.disconnected = new Set()
  }

  // --- Sitzplatz-Verwaltung (Lobby) ---

  nextFreeSlot() {
    const taken = new Set([...this.players.values()].map((p) => p.slot))
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!taken.has(i)) return i
    }
    return null
  }

  roster() {
    return [...this.players.values()].sort((a, b) => a.slot - b.slot)
  }

  hostId() {
    return this.roster().find((p) => p.isHost)?.id ?? null
  }

  // --- Senden ---

  sendError(conn, message) {
    conn.send(JSON.stringify({ type: 'error', message }))
  }

  // Schickt JEDEM Verbundenen den passenden Zustand:
  // - im Spiel: seine gefilterte Sicht (eigene Hand sichtbar)
  // - in der Lobby: das Roster
  broadcastState() {
    // Beim Roulette schauen Schütze und Ziel sich automatisch an (gilt auch für
    // Bots, die keinen eigenen Client haben).
    if (this.game && this.game.phase === 'revolver' && this.game.pendingShot) {
      const { operatorId, targetId } = this.game.pendingShot
      this.gaze[operatorId] = targetId
      this.gaze[targetId] = operatorId
    }
    for (const conn of this.room.getConnections()) {
      conn.send(this.stateMessageFor(conn.id))
    }
  }

  stateMessageFor(connId) {
    if (this.game) {
      return JSON.stringify({
        type: 'gameState',
        selfId: connId,
        game: getPublicState(this.game, connId),
        gaze: this.gaze,
        selection: this.selection,
      })
    }
    return JSON.stringify({
      type: 'lobby',
      selfId: connId,
      players: this.roster(),
      hostId: this.hostId(),
      maxPlayers: MAX_PLAYERS,
      canStart: this.players.size >= 2,
    })
  }

  // --- Verbindungs-Lebenszyklus ---

  onConnect(conn) {
    // Läuft schon ein Spiel?
    if (this.game) {
      // Reconnect eines Spielers der während des Spiels getrennt wurde.
      if (this.disconnected.has(conn.id)) {
        this.disconnected.delete(conn.id)
      }
      const spectator = !this.game.players.some((p) => p.id === conn.id)
      conn.send(JSON.stringify({ type: 'welcome', selfId: conn.id, spectator }))
      conn.send(this.stateMessageFor(conn.id))
      return
    }

    const slot = this.nextFreeSlot()
    if (slot === null) {
      this.sendError(conn, 'Raum ist voll.')
      conn.close()
      return
    }

    const isHost = this.players.size === 0
    this.players.set(conn.id, { id: conn.id, name: `Spieler ${slot + 1}`, slot, isHost })
    conn.send(JSON.stringify({ type: 'welcome', selfId: conn.id, spectator: false }))
    this.broadcastState()
  }

  async onMessage(message, sender) {
    let data
    try {
      data = JSON.parse(message)
    } catch {
      return
    }

    switch (data.type) {
      case 'setName':
        return this.handleSetName(sender, data)
      case 'startGame':
        return await this.handleStartGame(sender)
      case 'action':
        return await this.handleAction(sender, data)
      case 'gaze':
        return this.handleGaze(sender, data)
      case 'selection':
        return this.handleSelection(sender, data)
      case 'addBot':
        return this.handleAddBot(sender)
      case 'removeBot':
        return this.handleRemoveBot(sender)
      case 'restart':
        return this.handleRestart(sender)
      default:
        break
    }
  }

  async onClose(conn) {
    delete this.gaze[conn.id]
    delete this.selection[conn.id]

    const wasHost = this.players.get(conn.id)?.isHost

    if (this.game) {
      // Noch verbundene menschliche Spieler ermitteln (conn ist bereits aus
      // conns entfernt worden, taucht also hier nicht mehr auf).
      const connectedIds = new Set([...this.room.getConnections()].map((c) => c.id))
      const remainingHumans = [...this.players.values()].filter(
        (p) => !p.isBot && p.id !== conn.id && connectedIds.has(p.id)
      )

      if (remainingHumans.length === 0) {
        // Letzter Mensch hat den Raum verlassen -> alles zurücksetzen.
        this.game = null
        this.players.clear()
        this.disconnected.clear()
        this.gaze = {}
        this.selection = {}
        this.broadcastState()
      } else {
        // Spieler als "getrennt" markieren — sein Zug wird automatisch
        // übernommen (wie ein Bot), bis er wieder verbindet.
        this.disconnected.add(conn.id)
        if (wasHost) {
          this.players.get(conn.id).isHost = false
          remainingHumans.sort((a, b) => a.slot - b.slot)[0].isHost = true
        }
        this.broadcastState()
        // Falls der getrennte Spieler gerade am Zug war, sofort weiterführen.
        await this.runBots()
      }
      return
    }

    this.players.delete(conn.id)
    const humans = [...this.players.values()].filter((p) => !p.isBot)
    if (humans.length === 0) {
      // Keine menschlichen Spieler mehr -> auch die Bots entfernen.
      this.players.clear()
    } else if (wasHost) {
      // Host an den ersten menschlichen Spieler weitergeben (nie an einen Bot).
      humans.sort((a, b) => a.slot - b.slot)[0].isHost = true
    }
    this.broadcastState()
  }

  // --- Nachrichten-Handler ---

  handleSetName(sender, data) {
    const player = this.players.get(sender.id)
    if (!player) return
    const name = String(data.name || '').trim().slice(0, 20)
    if (name) {
      player.name = name
      this.broadcastState()
    }
  }

  async handleStartGame(sender) {
    if (this.game) return
    if (sender.id !== this.hostId()) {
      return this.sendError(sender, 'Nur der Host kann das Spiel starten.')
    }
    const seated = this.roster()
    if (seated.length < 2) {
      return this.sendError(sender, 'Mindestens 2 Spieler nötig.')
    }
    const players = seated.map((p) => ({ id: p.id, name: p.name, slot: p.slot, isBot: !!p.isBot }))
    this.game = createGame({ players, seed: (Date.now() & 0xffffffff) >>> 0 })
    this.gaze = {}
    this.selection = {}
    this.broadcastState()
    await this.runBots() // falls ein Bot anfängt
  }

  // --- Bots ---

  handleAddBot(sender) {
    if (this.game) return
    if (sender.id !== this.hostId()) {
      return this.sendError(sender, 'Nur der Host kann Bots hinzufügen.')
    }
    const slot = this.nextFreeSlot()
    if (slot === null) return this.sendError(sender, 'Kein freier Platz für einen Bot.')
    this.botCounter += 1
    const id = `bot-${this.botCounter}-${slot}`
    this.players.set(id, { id, name: `🤖 Bot ${this.botCounter}`, slot, isHost: false, isBot: true })
    this.broadcastState()
  }

  handleRemoveBot(sender) {
    if (this.game) return
    if (sender.id !== this.hostId()) {
      return this.sendError(sender, 'Nur der Host kann Bots entfernen.')
    }
    const bots = [...this.players.values()].filter((p) => p.isBot).sort((a, b) => b.slot - a.slot)
    if (bots.length === 0) return
    this.players.delete(bots[0].id) // den zuletzt hinzugefügten Bot entfernen
    this.broadcastState()
  }

  // Spielt anstehende Bot-Züge ab, bis ein Mensch am Zug ist oder das Spiel
  // endet — jeweils mit einer Nachdenkpause. Die Pause läuft per AWAIT (in der
  // await-Kette von onMessage), damit der Timer im Worker zuverlässig feuert.
  // Reentrancy-Schutz, falls mehrere Aktionen gleichzeitig eintreffen.
  async runBots() {
    if (this.botsRunning) return
    this.botsRunning = true
    try {
      let guard = 0
      while (this.game && this.game.phase !== 'gameOver' && guard < 300) {
        guard += 1
        const actorId = currentActorId(this.game)
        const actor = this.game.players.find((p) => p.id === actorId)
        if (!actor) break

        const isBot = actor.isBot
        const isDisconnected = this.disconnected.has(actorId)
        // Nur Bots und getrennte Spieler automatisch steuern.
        if (!isBot && !isDisconnected) break

        // Nachdenkpause: Bots ~3 s, getrennte Spieler kurz (0,8 s).
        const thinkMs = this.game.phase === 'revolver'
          ? (isBot ? 2400 : 600)
          : (isBot ? 2600 + Math.floor(Math.random() * 900) : 800)
        await new Promise((r) => setTimeout(r, thinkMs))
        if (!this.game || currentActorId(this.game) !== actorId) continue

        try {
          if (this.game.phase === 'revolver') {
            this.game = pullTrigger(this.game)
          } else {
            const d = botDecide(this.game, actorId)
            if (d.action === 'accuse') this.game = accuse(this.game, actorId)
            else if (d.action === 'pass') this.game = pass(this.game, actorId)
            else this.game = playCards(this.game, actorId, d.cardIds)
          }
        } catch {
          break
        }
        this.broadcastState()
      }
    } finally {
      this.botsRunning = false
    }
  }

  async handleAction(sender, data) {
    if (!this.game) return this.sendError(sender, 'Es läuft kein Spiel.')
    try {
      switch (data.action) {
        case 'play':
          this.game = playCards(this.game, sender.id, data.cardIds)
          break
        case 'accuse':
          this.game = accuse(this.game, sender.id)
          break
        case 'pullTrigger':
          if (this.game.pendingShot?.operatorId !== sender.id) {
            return this.sendError(sender, 'Du bist nicht am Abzug.')
          }
          this.game = pullTrigger(this.game)
          break
        case 'pass':
          this.game = pass(this.game, sender.id)
          break
        default:
          return this.sendError(sender, 'Unbekannte Aktion.')
      }
      delete this.selection[sender.id] // Auswahl nach dem Zug zurücksetzen
      this.broadcastState()
      await this.runBots() // anschließend ggf. Bots ziehen lassen
    } catch (e) {
      this.sendError(sender, e.message || 'Ungültiger Zug.')
    }
  }

  handleGaze(sender, data) {
    if (!this.game) return
    const t = data.target
    // Nur gültige Ziele akzeptieren: feste Ansichten oder eine echte Spieler-id.
    const valid = t === 'center' || t === 'hand' || t === 'lives' || this.game.players.some((p) => p.id === t)
    if (!valid) return
    if (this.gaze[sender.id] === t) return
    this.gaze[sender.id] = t
    this.broadcastState()
  }

  handleSelection(sender, data) {
    if (!this.game) return
    // Nur gültige Indizes 0..4, maximal 3.
    const idx = Array.isArray(data.indices)
      ? [...new Set(data.indices.filter((i) => Number.isInteger(i) && i >= 0 && i < 5))].slice(0, 3)
      : []
    this.selection[sender.id] = idx
    this.broadcastState()
  }

  handleRestart(sender) {
    if (!this.game || this.game.phase !== 'gameOver') return
    if (sender.id !== this.hostId()) {
      return this.sendError(sender, 'Nur der Host kann neu starten.')
    }
    this.game = null
    this.disconnected.clear()
    this.broadcastState()
  }
}

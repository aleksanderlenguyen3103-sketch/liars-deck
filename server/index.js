// Liar's Deck – Standard-Node.js-WebSocket-Server (Railway/Render-kompatibel).
// Ersetzt den PartyKit-Durable-Object mit demselben Raumlogik-Code.
// URL-Format: wss://HOST/party/ROOMID  (identisch zu PartyKit, kein Client-Umbau nötig)

import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import LiarsDeckRoom from '../party/server.js'

const PORT = process.env.PORT || 1999

// roomId -> LiarsDeckRoom
const rooms = new Map()
// roomId -> Map<connId, wrappedConn>
const conns = new Map()

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    // Raum-API: gibt der Room-Klasse Zugriff auf aktive Verbindungen.
    const api = {
      getConnections: () => (conns.get(roomId) || new Map()).values(),
    }
    rooms.set(roomId, new LiarsDeckRoom(api))
  }
  return rooms.get(roomId)
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end("Liar's Deck server OK")
})

const wss = new WebSocketServer({ server: httpServer })

wss.on('connection', (ws, req) => {
  // Pfad: /party/ROOMID[?_pk=CLIENTID&...]
  const url = new URL(req.url, 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean)
  // parts[0] = 'party', parts[1] = roomId
  const roomId = parts[1]
  if (!roomId) { ws.close(); return }

  // partysocket sendet ?_pk=ID für stabile Reconnect-Identität → als connId nutzen.
  const connId = url.searchParams.get('_pk') || crypto.randomUUID()

  const conn = {
    id: connId,
    send: (msg) => { if (ws.readyState === ws.OPEN) ws.send(msg) },
    close: () => ws.close(),
  }

  if (!conns.has(roomId)) conns.set(roomId, new Map())
  conns.get(roomId).set(connId, conn)

  const room = getRoom(roomId)
  room.onConnect(conn)

  ws.on('message', async (raw) => {
    await room.onMessage(raw.toString(), conn)
  })

  ws.on('close', () => {
    conns.get(roomId)?.delete(connId)
    room.onClose(conn)
    if (!conns.get(roomId)?.size) {
      conns.delete(roomId)
      rooms.delete(roomId)
    }
  })

  ws.on('error', (err) => console.error(`[${roomId}/${connId}]`, err.message))
})

httpServer.listen(PORT, () => {
  console.log(`Liar's Deck server läuft auf Port ${PORT}`)
})

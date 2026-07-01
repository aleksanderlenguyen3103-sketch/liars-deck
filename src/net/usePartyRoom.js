import { useEffect, useRef, useState } from 'react'
import PartySocket from 'partysocket'
import { PARTYKIT_HOST } from './partyConfig'

// Verbindet sich mit einem Raum (per Code) und hält den live gesyncten Zustand.
// Unterscheidet zwischen Lobby (vor Spielstart) und laufendem Spiel.
export function usePartyRoom(roomId) {
  const [connected, setConnected] = useState(false)
  const [selfId, setSelfId] = useState(null)
  const [spectator, setSpectator] = useState(false)
  const [lobby, setLobby] = useState(null) // { players, hostId, maxPlayers, canStart }
  const [game, setGame] = useState(null) // gefilterte Spielsicht (getPublicState)
  const [gaze, setGaze] = useState({}) // Blickrichtung pro Spieler (Blick-Sync)
  const [selection, setSelection] = useState({}) // hochgezogene Karten pro Spieler
  const [error, setError] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    if (!roomId) return

    setError(null)
    const socket = new PartySocket({ host: PARTYKIT_HOST, room: roomId })
    socketRef.current = socket

    socket.addEventListener('open', () => setConnected(true))
    socket.addEventListener('close', () => setConnected(false))

    socket.addEventListener('message', (event) => {
      let data
      try {
        data = JSON.parse(event.data)
      } catch {
        return
      }
      switch (data.type) {
        case 'welcome':
          setSelfId(data.selfId)
          setSpectator(!!data.spectator)
          break
        case 'lobby':
          setGame(null)
          setLobby(data)
          break
        case 'gameState':
          setLobby(null)
          setGame(data.game)
          setGaze(data.gaze || {})
          setSelection(data.selection || {})
          break
        case 'error':
          setError(data.message)
          // Fehler nach kurzer Zeit ausblenden.
          setTimeout(() => setError(null), 3000)
          break
        default:
          break
      }
    })

    return () => {
      socket.close()
      socketRef.current = null
      setConnected(false)
      setSelfId(null)
      setLobby(null)
      setGame(null)
      setGaze({})
      setSelection({})
    }
  }, [roomId])

  const send = (obj) => {
    const socket = socketRef.current
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(obj))
    }
  }

  return {
    connected,
    selfId,
    spectator,
    lobby,
    game,
    gaze,
    selection,
    error,
    setName: (name) => send({ type: 'setName', name }),
    sendGaze: (target) => send({ type: 'gaze', target }),
    sendSelection: (indices) => send({ type: 'selection', indices }),
    startGame: () => send({ type: 'startGame' }),
    addBot: () => send({ type: 'addBot' }),
    removeBot: () => send({ type: 'removeBot' }),
    restart: () => send({ type: 'restart' }),
    play: (cardIds) => send({ type: 'action', action: 'play', cardIds }),
    accuse: () => send({ type: 'action', action: 'accuse' }),
    pullTrigger: () => send({ type: 'action', action: 'pullTrigger' }),
    pass: () => send({ type: 'action', action: 'pass' }),
  }
}

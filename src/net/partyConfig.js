// Host des PartyKit-Servers.
// - Dev: lokaler `partykit dev`-Server (Standard-Port 1999).
// - Prod: über VITE_PARTYKIT_HOST gesetzt (z.B. liars-deck.<user>.partykit.dev).
export const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'

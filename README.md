# Liar's Deck

Web-3D-Multiplayer-Bluffspiel (Klon des Kartenmodus aus *Liar's Bar*). Browser-basiert, Online-Multiplayer per Raum-Code, kostenlos gehostet.

## Tech-Stack

- **Frontend:** React + Vite + React Three Fiber (`@react-three/fiber`, `@react-three/drei`), Zustand, Tailwind CSS v4
- **Multiplayer:** PartyKit (autoritativer Server, ein Durable Object pro Raum)
- **Client-Netzwerk:** PartySocket (WebSocket)

## Entwicklung

Es laufen **zwei** Server parallel:

```bash
# Terminal 1 — Multiplayer-Server (Port 1999)
npx partykit dev

# Terminal 2 — Frontend (Port 5175)
npm run dev
```

Dann im Browser http://localhost:5175 öffnen. Mehrere Tabs/Browser zum Testen des Multiplayers.

Der Frontend-Client verbindet sich standardmäßig mit `localhost:1999`. In Produktion über `VITE_PARTYKIT_HOST` den deployten PartyKit-Host setzen.

## Projektstruktur

- `party/server.js` — autoritativer Raum-Server (Spiel-Logik zieht hier in Phase 1/2 ein)
- `src/net/` — PartySocket-Client-Hook + Host-Config
- `src/lib/` — geteilte Helfer (z.B. Raum-Codes)
- `src/App.jsx` — Hauptmenü + Raum-Ansicht

## Status

- **Phase 0 ✅** — Setup + „Hello Room": Raum-Codes, Beitritt, Live-Spieler-Sync zwischen mehreren Clients
- **Phase 1 ✅** — headless Spiel-Logik (`src/game/`): Deck, Regeln, „Liar!"-Auflösung, Revolver-Eskalation, Sieg. 29 Unit-Tests (`npm test`)
- **Phase 2 ✅** — autoritativer Server (`party/server.js`) mit voller Engine + gefilterten Sichten; Lobby→Spielstart; funktionale 2D-Spiel-UI (Karten legen, Liar!, Roulette). End-to-End über mehrere Clients verifiziert
- **Phase 3 ✅** — 2D-UI-Feinschliff: „Du bist am Zug"-Banner, farbiger Spielverlauf, Roulette mit aufgedeckten Karten (grün=passt/rot=Bluff), Ballons; teilbarer Link (`?raum=CODE`) + Kopier-Button
- **Phase 4 ✅** — 3D-Szene (`src/scene/GameScene.jsx`): schwarzer Raum, runder Casino-Tisch, hängende Lampe, Sitzplätze mit Platzhalterfiguren, Ballons als Leben, schwebende Theme-Karte. **First-Person-Kamera** am eigenen Platz mit geführten Blick-Bahnen: ✋ Hand (runter), Blick zu jedem Mitspieler (⬅️/➡️/⬆️ + Name), 🎈 Meine Ballons (umdrehen, hoch). Auto-Fokus auf den Schützen beim Roulette. **Blick-Sync:** jeder Client sendet seine Blickrichtung an den Server, die Avatare drehen Körper+Kopf sichtbar dorthin (man sieht, wen jemand anschaut bzw. ob er sich zu seinen Ballons umdreht); Ballons bleiben fest am Platz. 2D-Steuerung als HUD-Overlay. Build grün; Szene mountet; Blick-Sync-Protokoll end-to-end verifiziert. **Hinweis:** 3D braucht echtes WebGL — im headless-Preview nicht darstellbar, im normalen Browser sichtbar. Schrift lokal gebündelt (`public/fonts/`).
- **Phase 5 (läuft) ✅ Animationen** — Karten fliegen beim Legen in die (kleinere) Tischmitte; Anschuldigen: Arm zeigt auf den Beschuldigten (Geste-Sync); **Roulette neu modelliert**: EINE gemeinsame Waffe in der Mitte, der GEWINNER der Anschuldigung greift sie und zielt auf den Verlierer (dessen Ballon platzt) — Schuss mit Mündungsfeuer (gelb/Feuer) + Rückstoß nur bei Treffer. Engine: 29 Tests grün, Volldurchlauf über die Leitung verifiziert. **Echte geriggte Charaktermodelle** (`public/models/character.glb`, geladen via `src/scene/Character.jsx`) mit Animationsclips (Idle/Wave=zeigen/Punch=zielen); Figur dreht sich zum Blick-/Aktionsziel. Robuster Fallback auf Kapsel-Platzhalter, falls das Modell nicht lädt. Modell später per Datei-Austausch ersetzbar (Größe via `SCALE`/`Y_OFFSET` in Character.jsx). Sounds + finaler Grafik-Feinschliff folgen.
- **Phase 6 (läuft) ✅ Sounds** — prozedurale Soundeffekte via Web Audio API (`src/audio/sfx.js`, keine Asset-Dateien): Karte legen, Hand-Schlag (Anschuldigen), leere Patrone (Klick), Schuss, Ballon-Platzen, Sieg. An die Spielereignisse (`recentEvents`) gekoppelt; beim Beitreten werden historische Ereignisse übersprungen. Stummschalt-Button im HUD (🔊/🔇, in localStorage gespeichert). End-to-End verifiziert (13 Runden ohne Fehler). Später durch echte Aufnahmen ersetzbar. **In-Game-Bots ✅:** Host kann in der Lobby Bots zuschalten/entfernen (🤖 Bot hinzufügen). Server steuert sie (mittelmäßig schlaue KI in `src/game/bot.js`: legt valide Karten, blufft um Junk loszuwerden, schuldigt nach Wahrscheinlichkeit an). Bot-Züge laufen SYNCHRON (setTimeout im Worker unzuverlässig). 33 Tests grün; Bot-Zug über die Leitung verifiziert.
- (siehe Fahrplan für die weiteren Phasen)

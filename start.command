#!/bin/bash
cd "$(dirname "$0")"
echo "🎮 Liar's Deck wird gestartet..."
echo "   Frontend: http://localhost:5175"
echo "   PartyKit:  http://localhost:1999"
echo ""
echo "Zum Beenden: Ctrl+C"
echo "-----------------------------------"
npm run dev:all

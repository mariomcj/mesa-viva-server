#!/bin/bash
# Mesa Viva — Inicia o servidor local
# Uso: ./start.sh [porta]

PORTA="${1:-3062}"
export PORT="$PORTA"
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-sk-or-v1-SUAS_CHAVE_AQUI}"

cd "$(dirname "$0")"

echo "🎲 Mesa Viva — Servidor"
echo "========================"
echo "Porta: $PORTA"
echo "API: ${OPENROUTER_API_KEY:0:20}..."
echo ""
echo "📱 No app Android (emulador): http://10.0.2.2:$PORTA"
echo "📱 No app Android (USB/WiFi): http://$(hostname -I 2>/dev/null | awk '{print $1}'):$PORTA"
echo ""

node server.js
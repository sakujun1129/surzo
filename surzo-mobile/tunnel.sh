#!/bin/bash
pkill -f "expo start" 2>/dev/null
sleep 1
cd "$(dirname "$0")"
npx expo start --tunnel

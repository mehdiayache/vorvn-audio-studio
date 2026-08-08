#!/bin/zsh
# VORVN Audio Studio — stop whatever is running, start it again, open it.
#
# Double-click this file in Finder. That is the whole procedure.
# It is safe to run when nothing is running: it just starts it.

cd "$(dirname "$0")"
PORT=7860

echo "VORVN Audio Studio"
echo "────────────"

# Whoever is holding the port is the old copy. Ask it to stop, then insist.
holder=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$holder" ]; then
  echo "· stopping the copy that is already running (pid $holder)"
  kill $holder 2>/dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do
    lsof -ti:$PORT >/dev/null 2>&1 || break
    sleep 0.3
  done
  lsof -ti:$PORT >/dev/null 2>&1 && kill -9 $(lsof -ti:$PORT) 2>/dev/null
else
  echo "· nothing was running"
fi

# The database lives in Docker. Started only if it isn't already up.
if command -v docker >/dev/null 2>&1; then
  docker compose up -d >/dev/null 2>&1 && echo "· database ready"
fi

echo "· starting"
.venv/bin/python -m audio_studio > out/server.log 2>&1 &

# Wait for it to actually answer before opening the browser, so you never
# land on a "can't connect" page.
for i in $(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:$PORT/api/v1/system/health"; then
    echo "· running at http://127.0.0.1:$PORT/audio-studio/"
    open "http://127.0.0.1:$PORT/audio-studio/"
    echo
    echo "You can close this window. Audio Studio keeps running."
    exit 0
  fi
  sleep 0.25
done

# It didn't come up. Show why, rather than leaving a silent failure.
echo
echo "It did not start. Here is what it said:"
echo "────────────────────────────────────────"
tail -20 out/server.log
echo "────────────────────────────────────────"
echo "Full log: out/server.log"
exit 1

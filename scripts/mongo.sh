#!/usr/bin/env bash
#
# Manage the project-local MongoDB instance (self-contained, no system install).
#
# Binaries, data, logs, and the PID file all live under .mongodb/ (gitignored),
# so this database is fully isolated to this repo. Usage:
#
#   scripts/mongo.sh start    # start mongod in the background
#   scripts/mongo.sh stop     # stop the running mongod
#   scripts/mongo.sh status   # report whether mongod is running
#   scripts/mongo.sh restart  # stop then start
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_HOME="$ROOT_DIR/.mongodb"
MONGOD="$MONGO_HOME/server/bin/mongod"
DATA_DIR="$MONGO_HOME/data"
LOG_FILE="$MONGO_HOME/mongod.log"
PID_FILE="$MONGO_HOME/mongod.pid"
PORT="${MONGO_PORT:-27017}"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

case "${1:-}" in
  start)
    if is_running; then
      echo "MongoDB already running (pid $(cat "$PID_FILE")) on port $PORT"
      exit 0
    fi
    if [[ ! -x "$MONGOD" ]]; then
      echo "mongod binary not found at $MONGOD" >&2
      echo "Run the download step in README (Local MongoDB) first." >&2
      exit 1
    fi
    mkdir -p "$DATA_DIR"
    echo "Starting MongoDB on port $PORT ..."
    "$MONGOD" \
      --dbpath "$DATA_DIR" \
      --port "$PORT" \
      --bind_ip 127.0.0.1 \
      --logpath "$LOG_FILE" \
      --pidfilepath "$PID_FILE" \
      --fork >/dev/null
    echo "MongoDB started (pid $(cat "$PID_FILE")). Log: $LOG_FILE"
    ;;

  stop)
    if ! is_running; then
      echo "MongoDB is not running."
      rm -f "$PID_FILE"
      exit 0
    fi
    pid="$(cat "$PID_FILE")"
    echo "Stopping MongoDB (pid $pid) ..."
    kill "$pid"
    for _ in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    rm -f "$PID_FILE"
    echo "MongoDB stopped."
    ;;

  status)
    if is_running; then
      echo "MongoDB is running (pid $(cat "$PID_FILE")) on port $PORT"
    else
      echo "MongoDB is not running."
      exit 1
    fi
    ;;

  restart)
    "$0" stop
    "$0" start
    ;;

  *)
    echo "Usage: $0 {start|stop|status|restart}" >&2
    exit 1
    ;;
esac

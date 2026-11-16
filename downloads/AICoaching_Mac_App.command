#!/bin/bash
# AICoaching - macOS Desktop Application Launcher
APP_URL="http://localhost:8090"
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

if [ -f "$DIR/server.py" ]; then
    if ! lsof -i :8090 >/dev/null 2>&1; then
        python3 "$DIR/server.py" >/dev/null 2>&1 &
        sleep 2
    fi
fi

if [ -d "/Applications/Google Chrome.app" ]; then
    open -n -a "Google Chrome" --args --app="$APP_URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -n -a "Microsoft Edge" --args --app="$APP_URL"
else
    open "$APP_URL"
fi

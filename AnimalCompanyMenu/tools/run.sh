#!/usr/bin/env bash
# Linux/macOS helper.  ./tools/run.sh            -> PC game
#                     ./tools/run.sh quest [pkg] -> USB headset running frida-server
cd "$(dirname "$0")/.."
command -v frida >/dev/null || { echo "frida not found: pip install frida-tools"; exit 1; }
if [ "$1" = "quest" ]; then
  frida -U -l dist/_agent.js -n "${2:-Animal Company}"
else
  frida -l dist/_agent.js AnimalCompany.exe
fi

#!/usr/bin/env bash
# Builds and runs the simulation-core unit tests with the system C++ compiler (no Unreal needed).
set -euo pipefail
cd "$(dirname "$0")/.."
CXX="${CXX:-c++}"
OUT="${TMPDIR:-/tmp}/apex_sim_tests"
"$CXX" -std=c++20 -O2 -Wall -Wextra -Wpedantic -Wshadow -Werror \
  -I Source/ApexAnglers/Public Tests/SimTests.cpp -o "$OUT"
"$OUT"

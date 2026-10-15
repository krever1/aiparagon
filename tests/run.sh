#!/usr/bin/env bash
# Runs the browser test suites (see tests/README.md).
#   bash tests/run.sh                                  every suite
#   bash tests/run.sh dashboard advisory               some of them: dashboard, advisory, voice
#   bash tests/run.sh dashboard --against origin/main  also compare every page's text with the file at that git ref
cd "$(dirname "$0")/.." || exit 2
export NODE_PATH="${NODE_PATH:-$(npm root -g 2>/dev/null)}"

ref=""
suites=""
while [ $# -gt 0 ]; do
  case "$1" in
    --against) ref="$2"; shift 2 ;;
    *) suites="$suites $1"; shift ;;
  esac
done
[ -z "$suites" ] && suites="dashboard advisory voice"

status=0
for s in $suites; do
  case "$s" in
    dashboard) file=new-aiparagon-dashboard.html ;;
    advisory) file=mhwp-dashboard.html ;;
    voice) file=voice-agent-client.html ;;
    *) echo "unknown suite: $s (use dashboard, advisory or voice)"; exit 2 ;;
  esac
  base=""
  if [ -n "$ref" ]; then
    base="${TMPDIR:-/tmp}/baseline-$s.html"
    git show "$ref:$file" > "$base" || { echo "could not read $file at $ref"; exit 2; }
  fi
  for t in tests/"$s"-*.test.js; do
    echo "== $t"
    if [ -n "$base" ]; then node "$t" "$base" || status=1; else node "$t" || status=1; fi
  done
done

[ $status -eq 0 ] && echo "== all suites passed" || echo "== some suites failed"
exit $status

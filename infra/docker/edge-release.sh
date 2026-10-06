#!/usr/bin/env bash
# Image-only edge updates. Compose/runtime.env changes require operator review.
set -euo pipefail
umask 077
if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo 'Usage: edge-release.sh STATE_DIR deploy IMAGE | rollback | recover' >&2
  exit 2
fi
state=$(realpath -m -- "$1")
action=$2
compose_file=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/compose.yaml
mkdir -p -- "$state"
exec 9>"$state/lock"
flock -n 9 || { echo 'Another release operation is running.' >&2; exit 1; }
[[ -e "$state/runtime.env" ]] || touch "$state/runtime.env"
project=${MIMIX_EDGE_PROJECT:-mimix-edge}
wait_timeout=${MIMIX_WAIT_TIMEOUT:-90}
[[ $wait_timeout =~ ^[1-9][0-9]*$ ]] || exit 2
compose() {
  docker compose -p "$project" -f "$compose_file" --env-file "$state/runtime.env" --profile edge "$@"
}
write_state() {
  # Explicit propagation matters when restore runs in the EXIT trap's OR-list:
  # Bash disables errexit inside that entire function call.
  printf '%s\n' "$2" >"$state/$1.tmp" || return 1
  sync -- "$state/$1.tmp" || return 1
  mv -- "$state/$1.tmp" "$state/$1" || return 1
  sync -- "$state" || return 1
}
clear_pending() {
  rm -- "$state/pending" || return 1
  sync -- "$state" || return 1
}
# Ask Compose to resolve runtime.env and shell precedence; never source secrets
# as shell code. Only the active edge service's normalized platform is retained.
platform=$(compose config --format yaml | sed -n 's/^    platform: //p')
case "$platform" in linux/amd64|linux/arm64) ;; *) echo 'Select exactly one supported edge platform.' >&2; exit 2 ;; esac
image_id() {
  local id
  id=$(docker image inspect --platform "$platform" --format '{{if .RepoDigests}}{{index .RepoDigests 0}}{{else}}{{.Id}}{{end}}' -- "$1") || return 1
  [[ $id =~ ^(sha256:|[^[:space:]]+@sha256:)[a-f0-9]{64}$ ]] || return 1
  printf '%s\n' "$id"
}
apply() {
  export MIMIX_RUNTIME_IMAGE=$1
  compose up -d --no-deps --pull never --wait --wait-timeout "$wait_timeout" edge-gateway
}
restore() {
  local previous
  previous=$(cat "$state/pending") || return 1
  if [[ $previous == none ]]; then
    compose stop edge-gateway && compose rm -f edge-gateway || return 1
    rm -f -- "$state/current" || return 1
  else
    image_id "$previous" >/dev/null || return 1
    apply "$previous" || return 1
    write_state current "$previous" || return 1
  fi
  clear_pending || return 1
  echo 'Previous edge state restored.'
}
if [[ $action == recover ]]; then
  [[ $# == 2 && -f "$state/pending" ]] || { echo 'No interrupted release to recover.' >&2; exit 1; }
  restore
  exit
fi
[[ ! -f "$state/pending" ]] || { echo 'Interrupted release: run recover first.' >&2; exit 1; }
case "$action" in
  deploy) [[ $# == 3 ]] || exit 2; candidate=$(image_id "$3") ;;
  rollback) [[ $# == 2 && -f "$state/previous" ]] || { echo 'No previous release.' >&2; exit 1; }; candidate=$(image_id "$(cat "$state/previous")") ;;
  *) exit 2 ;;
esac
previous=none
if [[ -f "$state/current" ]]; then previous=$(image_id "$(cat "$state/current")"); fi
# Do not adopt an unmanaged project: it has no known-good release to restore.
if [[ $previous == none && -n $(compose ps -a -q edge-gateway) ]]; then
  echo 'Existing unmanaged gateway: choose a dedicated project or migrate it manually.' >&2
  exit 1
fi
if [[ -n $(compose --profile simulator ps -a -q robot-simulator) ]]; then
  echo 'Remove the recording simulator before updating its shared gateway namespace.' >&2
  exit 1
fi
write_state pending "$previous"
trap 'exit 130' INT TERM
trap 'status=$?; if [[ -f "$state/pending" ]]; then restore || echo "Recovery failed; keep images/state and run recover." >&2; fi; exit "$status"' EXIT
apply "$candidate"
if [[ $previous != none && $previous != "$candidate" ]]; then write_state previous "$previous"; fi
write_state current "$candidate"
clear_pending
echo "Edge release healthy: $candidate"

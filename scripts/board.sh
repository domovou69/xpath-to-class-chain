#!/usr/bin/env bash
# Set the cost fields of an issue on the project board.
# Usage: scripts/board.sh <issue> [--window TEXT] [--model opus|sonnet|haiku]
#        [--effort low|medium|high|xhigh] [--est-pct N] [--actual-pct N]
#        [--est-min N] [--actual-min N]
set -euo pipefail

OWNER=@me
PROJECT=1
REPO=domovou69/xpath-to-class-chain

issue=${1:?issue number}; shift

project_id=$(gh project view "$PROJECT" --owner "$OWNER" --format json -q .id)
fields=$(gh project field-list "$PROJECT" --owner "$OWNER" --format json)
item=$(gh project item-list "$PROJECT" --owner "$OWNER" --limit 500 --format json \
  | jq -r --argjson n "$issue" '.items[] | select(.content.number == $n) | .id')
[ -n "$item" ] || { echo "issue #$issue is not on the board" >&2; exit 1; }

set_field() { # name kind value
  local id opt
  id=$(jq -r --arg f "$1" '.fields[] | select(.name == $f) | .id' <<<"$fields")
  case $2 in
    text) gh project item-edit --id "$item" --project-id "$project_id" --field-id "$id" --text "$3" >/dev/null ;;
    number) gh project item-edit --id "$item" --project-id "$project_id" --field-id "$id" --number "$3" >/dev/null ;;
    select)
      opt=$(jq -r --arg f "$1" --arg v "$3" '.fields[] | select(.name == $f) | .options[] | select(.name == $v) | .id' <<<"$fields")
      [ -n "$opt" ] || { echo "no option '$3' in $1" >&2; exit 1; }
      gh project item-edit --id "$item" --project-id "$project_id" --field-id "$id" --single-select-option-id "$opt" >/dev/null ;;
  esac
}

while [ $# -gt 0 ]; do
  case $1 in
    --window) set_field Window text "$2" ;;
    --model) set_field Model select "$2" ;;
    --effort) set_field Effort select "$2" ;;
    --est-pct) set_field "Est %" number "$2" ;;
    --actual-pct) set_field "Actual %" number "$2" ;;
    --est-min) set_field "Est min" number "$2" ;;
    --actual-min) set_field "Actual min" number "$2" ;;
    *) echo "unknown flag $1" >&2; exit 1 ;;
  esac
  shift 2
done
echo "#$issue updated"

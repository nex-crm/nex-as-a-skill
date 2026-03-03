#!/usr/bin/env bash
# Nex file scanner — discovers project files and ingests changed ones
# Uses manifest-based change detection via ~/.nex/file-scan-manifest.json
# ENV: NEX_API_KEY (required)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANIFEST_FILE="$HOME/.nex/file-scan-manifest.json"
MAX_FILE_SIZE=102400  # 100KB
DEFAULT_EXTENSIONS=".md,.txt,.csv,.json,.yaml,.yml"
DEFAULT_IGNORE="node_modules,.git,dist,build,.next,__pycache__,vendor,.venv,.claude,coverage,.turbo,.cache"
DEFAULT_MAX_FILES=5
DEFAULT_MAX_DEPTH=2

# Counters
SCANNED=0
INGESTED=0
SKIPPED=0
ERRORS=0

# --- Parse arguments ---
DIR="."
MAX_FILES="$DEFAULT_MAX_FILES"
MAX_DEPTH="$DEFAULT_MAX_DEPTH"
EXTENSIONS="$DEFAULT_EXTENSIONS"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --max-files) MAX_FILES="$2"; shift 2 ;;
    --max-depth) MAX_DEPTH="$2"; shift 2 ;;
    --extensions) EXTENSIONS="$2"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# Resolve to absolute path
DIR="$(cd "$DIR" && pwd)"

# --- Ensure manifest directory exists ---
mkdir -p "$HOME/.nex"
if [[ ! -f "$MANIFEST_FILE" ]]; then
  echo '{"version":1,"files":{}}' > "$MANIFEST_FILE"
fi

# --- Build find command for extensions ---
# Convert ".md,.txt" to -name "*.md" -o -name "*.txt"
IFS=',' read -ra EXT_ARRAY <<< "$EXTENSIONS"
FIND_NAMES=""
for ext in "${EXT_ARRAY[@]}"; do
  ext="$(echo "$ext" | xargs)"  # trim whitespace
  if [[ -n "$FIND_NAMES" ]]; then
    FIND_NAMES="$FIND_NAMES -o"
  fi
  FIND_NAMES="$FIND_NAMES -name \"*${ext}\""
done

# --- Build find ignore patterns ---
IFS=',' read -ra IGNORE_ARRAY <<< "$DEFAULT_IGNORE"
FIND_PRUNE=""
for ign in "${IGNORE_ARRAY[@]}"; do
  ign="$(echo "$ign" | xargs)"
  FIND_PRUNE="$FIND_PRUNE -name \"$ign\" -prune -o"
done

# --- Find files ---
# Use eval to handle the dynamically built command
FILES=$(eval "find \"$DIR\" -maxdepth $MAX_DEPTH $FIND_PRUNE -type f \\( $FIND_NAMES \\) -print" 2>/dev/null || true)

if [[ -z "$FILES" ]]; then
  echo '{"scanned":0,"ingested":0,"skipped":0,"errors":0}'
  exit 0
fi

# --- Check each file against manifest ---
while IFS= read -r filepath; do
  SCANNED=$((SCANNED + 1))

  # Get file stats
  if [[ "$(uname)" == "Darwin" ]]; then
    FILE_SIZE=$(stat -f%z "$filepath" 2>/dev/null || echo 0)
    FILE_MTIME=$(stat -f%m "$filepath" 2>/dev/null || echo 0)
  else
    FILE_SIZE=$(stat -c%s "$filepath" 2>/dev/null || echo 0)
    FILE_MTIME=$(stat -c%Y "$filepath" 2>/dev/null || echo 0)
  fi

  # Check manifest for existing entry
  MANIFEST_MTIME=$(jq -r --arg p "$filepath" '.files[$p].mtime // 0' "$MANIFEST_FILE" 2>/dev/null || echo 0)
  MANIFEST_SIZE=$(jq -r --arg p "$filepath" '.files[$p].size // 0' "$MANIFEST_FILE" 2>/dev/null || echo 0)

  # Skip if unchanged
  if [[ "$FILE_MTIME" == "$MANIFEST_MTIME" && "$FILE_SIZE" == "$MANIFEST_SIZE" ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Stop if we've hit max files
  if [[ $INGESTED -ge $MAX_FILES ]]; then
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  # Read file content (truncate if too large)
  CONTENT=$(head -c "$MAX_FILE_SIZE" "$filepath" 2>/dev/null || true)
  if [[ ${#CONTENT} -ge $MAX_FILE_SIZE ]]; then
    CONTENT="$CONTENT
[...truncated]"
  fi

  # Get relative path for context tag
  REL_PATH="${filepath#$DIR/}"
  CONTEXT="file-scan:$REL_PATH"

  # Ingest via API
  JSON_BODY=$(jq -n --arg content "$CONTENT" --arg context "$CONTEXT" '{content: $content, context: $context}')
  if printf '%s' "$JSON_BODY" | bash "$SCRIPT_DIR/nex-api.sh" POST /v1/context/text >/dev/null 2>&1; then
    INGESTED=$((INGESTED + 1))

    # Update manifest
    TMP=$(mktemp)
    jq --arg p "$filepath" --argjson mt "$FILE_MTIME" --argjson sz "$FILE_SIZE" --arg ctx "$CONTEXT" --argjson now "$(date +%s)000" \
      '.files[$p] = {mtime: $mt, size: $sz, ingestedAt: $now, context: $ctx}' \
      "$MANIFEST_FILE" > "$TMP" && mv "$TMP" "$MANIFEST_FILE"
  else
    ERRORS=$((ERRORS + 1))
    echo "Failed to ingest: $REL_PATH" >&2
  fi
done <<< "$FILES"

# --- Output summary ---
echo "{\"scanned\":$SCANNED,\"ingested\":$INGESTED,\"skipped\":$SKIPPED,\"errors\":$ERRORS}"

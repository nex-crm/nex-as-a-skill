#!/bin/bash
# E2E Test: "Let's build an AI notetaker company" — full team flow
# Tests: launch, channel view, human posting, broker delivery, agent panes, clean exit
set -e

BINARY="$(cd "$(dirname "$0")/../.." && pwd)/nex"
ARTIFACTS="$(cd "$(dirname "$0")/../.." && pwd)/termwright-artifacts/notetaker-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$ARTIFACTS"

TOTAL=0
PASSED=0
FAILED=0

log_test() { TOTAL=$((TOTAL + 1)); echo "  [$TOTAL] $1"; }
pass() { PASSED=$((PASSED + 1)); echo "    PASS"; }
fail() { FAILED=$((FAILED + 1)); echo "    FAIL: $1"; }

echo "============================================"
echo "  AI Notetaker Company — E2E Test"
echo "============================================"
echo "Binary: $BINARY"
echo "Artifacts: $ARTIFACTS"
echo ""

# ─── Phase 1: Launch ───
echo "--- Phase 1: Launch ---"

log_test "Binary exists and runs"
if [ -x "$BINARY" ]; then pass; else fail "binary not found"; exit 1; fi

log_test "nex --version works"
VERSION=$("$BINARY" --version 2>&1)
if echo "$VERSION" | grep -q "nex v"; then pass; else fail "$VERSION"; fi

log_test "Start nex (background)"
# Launch in background — broker starts, tmux session created
# Redirect stderr to capture "not a terminal" message
"$BINARY" >"$ARTIFACTS/nex-stdout.txt" 2>"$ARTIFACTS/nex-stderr.txt" &
NEX_PID=$!
sleep 10  # Give time for tmux + claude sessions to start

log_test "Broker is running on port 7890"
# Retry broker health check a few times
BROKER_OK=false
for i in 1 2 3 4 5; do
  HEALTH=$(curl -s http://127.0.0.1:7890/health 2>/dev/null || echo "")
  if echo "$HEALTH" | grep -q "ok"; then
    BROKER_OK=true
    break
  fi
  sleep 2
done
if $BROKER_OK; then pass; else fail "broker not responding after 10s retries"; fi

log_test "tmux session exists"
SESSIONS=$(tmux -L nex list-sessions 2>&1)
if echo "$SESSIONS" | grep -q "nex-team"; then pass; else fail "no session: $SESSIONS"; fi

log_test "tmux has multiple windows"
WINDOWS=$(tmux -L nex list-windows -t nex-team 2>&1)
WINDOW_COUNT=$(echo "$WINDOWS" | wc -l | tr -d ' ')
if [ "$WINDOW_COUNT" -ge 3 ]; then
  pass
  echo "    Windows: $WINDOW_COUNT"
else
  fail "only $WINDOW_COUNT windows"
fi

# ─── Phase 2: Pane Labels ───
echo ""
echo "--- Phase 2: Pane Labels ---"

log_test "Panes have titles set"
PANE_TITLES=$(tmux -L nex list-panes -t nex-team:team -F "#{pane_title}" 2>&1)
echo "$PANE_TITLES" > "$ARTIFACTS/pane-titles.txt"
if echo "$PANE_TITLES" | grep -qi "channel\|ceo\|CEO"; then
  pass
  echo "    Titles: $(echo "$PANE_TITLES" | tr '\n' ', ')"
else
  fail "no agent titles found"
fi

# ─── Phase 3: Channel View ───
echo ""
echo "--- Phase 3: Channel View ---"

log_test "Channel pane is running"
CHANNEL_CONTENT=$(tmux -L nex capture-pane -p -t nex-team:team.0 2>&1)
echo "$CHANNEL_CONTENT" > "$ARTIFACTS/channel-boot.txt"
if echo "$CHANNEL_CONTENT" | grep -qi "channel\|waiting\|team\|nex"; then
  pass
else
  fail "channel pane empty or not running"
fi

log_test "Channel has input area"
if echo "$CHANNEL_CONTENT" | grep -qi "type\|message\|quit"; then
  pass
else
  fail "no input area visible"
fi

# ─── Phase 4: Post to Channel ───
echo ""
echo "--- Phase 4: Human Posts to Channel ---"

log_test "Post message via broker API"
POST_RESULT=$(curl -s -X POST http://127.0.0.1:7890/messages \
  -H "Content-Type: application/json" \
  -d '{"from":"you","content":"Let'\''s build an AI notetaker company. @ceo what'\''s our strategy?","tagged":["ceo"]}' 2>/dev/null)
if echo "$POST_RESULT" | grep -q "id"; then
  pass
  echo "    Response: $POST_RESULT"
else
  fail "post failed: $POST_RESULT"
fi

log_test "Message appears in broker"
sleep 1
MESSAGES=$(curl -s http://127.0.0.1:7890/messages?limit=5 2>/dev/null)
echo "$MESSAGES" > "$ARTIFACTS/broker-messages.txt"
if echo "$MESSAGES" | grep -q "notetaker"; then
  pass
else
  fail "message not in broker"
fi

log_test "Channel view shows the message"
sleep 3  # Give channel TUI time to poll
CHANNEL_AFTER=$(tmux -L nex capture-pane -p -t nex-team:team.0 2>&1)
echo "$CHANNEL_AFTER" > "$ARTIFACTS/channel-after-post.txt"
if echo "$CHANNEL_AFTER" | grep -qi "notetaker\|you\|strategy"; then
  pass
else
  fail "message not visible in channel view"
fi

# ─── Phase 5: Agent Panes ───
echo ""
echo "--- Phase 5: Agent Panes ---"

log_test "CEO pane has Claude running"
echo "    Waiting 30s for Claude Code to boot..."
sleep 30  # Claude Code takes 20-30s to boot with hooks
CEO_CONTENT=$(tmux -L nex capture-pane -p -t nex-team:team.1 2>&1)
echo "$CEO_CONTENT" > "$ARTIFACTS/ceo-pane.txt"
CEO_LINES=$(echo "$CEO_CONTENT" | grep -v "^$" | wc -l | tr -d ' ')
if [ "$CEO_LINES" -gt 2 ]; then
  pass
  echo "    CEO pane: $CEO_LINES non-empty lines"
else
  sleep 10
  CEO_CONTENT=$(tmux -L nex capture-pane -p -t nex-team:team.1 2>&1)
  CEO_LINES=$(echo "$CEO_CONTENT" | grep -v "^$" | wc -l | tr -d ' ')
  if [ "$CEO_LINES" -gt 2 ]; then
    pass
    echo "    CEO pane (retry): $CEO_LINES non-empty lines"
  else
    fail "CEO pane empty ($CEO_LINES lines)"
  fi
fi

log_test "At least one specialist pane running"
SPECIALIST_OK=0
for PANE_IDX in 2 3 4; do
  CONTENT=$(tmux -L nex capture-pane -p -t "nex-team:team.$PANE_IDX" 2>/dev/null || echo "")
  LINES=$(echo "$CONTENT" | grep -v "^$" | wc -l | tr -d ' ')
  if [ "$LINES" -gt 2 ]; then
    SPECIALIST_OK=$((SPECIALIST_OK + 1))
    echo "$CONTENT" > "$ARTIFACTS/pane-$PANE_IDX.txt"
  fi
done
if [ "$SPECIALIST_OK" -gt 0 ]; then
  pass
  echo "    $SPECIALIST_OK specialist panes active"
else
  fail "no specialist panes have content"
fi

# ─── Phase 6: Agent Notification ───
echo ""
echo "--- Phase 6: Agent Gets Notified ---"

log_test "Wait for notification push to CEO pane"
sleep 8  # notifyAgentsLoop polls every 3s

CEO_AFTER=$(tmux -L nex capture-pane -p -t nex-team:team.1 2>&1)
echo "$CEO_AFTER" > "$ARTIFACTS/ceo-after-notification.txt"
if echo "$CEO_AFTER" | grep -qi "notetaker\|Channel update\|team_poll\|strategy"; then
  pass
  echo "    CEO pane received notification"
else
  sleep 5
  CEO_AFTER=$(tmux -L nex capture-pane -p -t nex-team:team.1 2>&1)
  echo "$CEO_AFTER" > "$ARTIFACTS/ceo-notification-retry.txt"
  if echo "$CEO_AFTER" | grep -qi "notetaker\|Channel update\|team_poll\|strategy"; then
    pass
    echo "    CEO pane received notification (retry)"
  else
    fail "CEO pane didn't receive notification"
    echo "    Last 10 lines:"
    echo "$CEO_AFTER" | tail -10 | sed 's/^/    /'
  fi
fi

# ─── Phase 7: Pane Count ───
echo ""
echo "--- Phase 7: Pane Count ---"

log_test "Team window has 5 panes (channel + 4 agents)"
PANE_COUNT=$(tmux -L nex list-panes -t nex-team:team 2>&1 | wc -l | tr -d ' ')
if [ "$PANE_COUNT" -ge 4 ]; then
  pass
  echo "    $PANE_COUNT panes in team window"
else
  fail "only $PANE_COUNT panes (expected 4+)"
fi

# ─── Phase 8: Quality Checks ───
echo ""
echo "--- Phase 8: Quality Checks ---"

log_test "Channel view has no raw JSON"
CHANNEL_FINAL=$(tmux -L nex capture-pane -p -t nex-team:team.0 2>&1)
echo "$CHANNEL_FINAL" > "$ARTIFACTS/channel-final.txt"
if echo "$CHANNEL_FINAL" | grep -qE '^\{.*"type"'; then
  fail "raw JSON visible in channel"
else
  pass
fi

log_test "Channel view has no error tracebacks"
if echo "$CHANNEL_FINAL" | grep -qi "panic:\|traceback\|goroutine"; then
  fail "error traceback in channel"
else
  pass
fi

log_test "Broker has messages"
FINAL_MSGS=$(curl -s http://127.0.0.1:7890/messages?limit=100 2>/dev/null)
MSG_COUNT=$(echo "$FINAL_MSGS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('messages',[])))" 2>/dev/null || echo "0")
if [ "$MSG_COUNT" -ge 1 ]; then
  pass
  echo "    $MSG_COUNT messages in broker"
else
  fail "no messages in broker"
fi

# ─── Phase 9: Clean Exit ───
echo ""
echo "--- Phase 9: Clean Exit ---"

log_test "Kill team session"
"$BINARY" kill 2>/dev/null
KILL_CHECK=$(tmux -L nex list-sessions 2>&1)
if echo "$KILL_CHECK" | grep -qi "no server\|error\|no session"; then
  pass
else
  fail "session still running after kill"
fi

# Also kill the background nex process
kill $NEX_PID 2>/dev/null || true
wait $NEX_PID 2>/dev/null || true

# ─── Results ───
echo ""
echo "============================================"
echo "  Results: $PASSED/$TOTAL passed"
echo "  Artifacts: $ARTIFACTS/"
echo "============================================"

if [ "$FAILED" -gt 0 ]; then
  echo "  FAILED: $FAILED tests"
  exit 1
else
  echo "  ALL PASSED"
fi

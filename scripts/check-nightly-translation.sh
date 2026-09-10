#!/usr/bin/env bash
#
# Did last night's translation run open its own PR?
#
# Since #258 the scheduled `Daily Incremental Translation` workflow opens its
# own pull request with TRANSLATION_BOT_PAT. This checks that it did, and says
# what to do when it did not.
#
# The author check is the point. "A PR exists" is not evidence the automation
# worked — before #258 a human opened it by hand, which looks identical from
# the outside. Only a PR authored by the bot proves the workflow did it.
#
# Usage: scripts/check-nightly-translation.sh
# Requires: gh, authenticated with read access to the repo.

set -uo pipefail

R="${REPO:-QwenLM/qwen-code-docs}"
BOT="${BOT_LOGIN:-qwen-code-review-bot}"

# Not simply the newest run. A run that finds a translation PR still open
# skips its model work and produces no branch, and reporting on that one made
# the script announce "opened by a human" for a batch it had never looked at.
# Walk back to the newest run that actually produced a batch.
id=""
skipped=0
while read -r candidate; do
  [ -n "$candidate" ] || continue
  if gh api "repos/$R/branches/automation/daily-translation-$candidate" -q .name >/dev/null 2>&1 ||
     [ -n "$(gh pr list --repo "$R" --state all --head "automation/daily-translation-$candidate" \
       --limit 1 --json number --jq '.[0].number // empty')" ]; then
    id="$candidate"
    break
  fi
  skipped=$((skipped + 1))
done < <(gh run list --repo "$R" --workflow "Daily Incremental Translation" \
  --limit 6 --json databaseId --jq '.[].databaseId')

if [ -z "$id" ]; then
  echo "run : none of the last 6 runs produced a batch — all skipped, or all quiet"
  exit 0
fi
[ "$skipped" -eq 0 ] || echo "note: skipped $skipped later run(s) that produced no batch (paused on an open PR)"

read -r st cc < <(gh api "repos/$R/actions/runs/$id" --jq '"\(.status) \(.conclusion // "-")"')
branch="automation/daily-translation-$id"
echo "run : $id  $st/$cc   https://github.com/$R/actions/runs/$id"

read -r num state author url < <(gh pr list --repo "$R" --state all --head "$branch" \
  --limit 1 --json number,state,author,url \
  --jq '.[0] | "\(.number) \(.state) \(.author.login) \(.url)"' 2>/dev/null)

if [ -n "${num:-}" ] && [ "$author" = "$BOT" ]; then
  echo "PR  : #$num $state by $author  <-- OK, the run opened it itself"
  echo "      $url"
elif [ -n "${num:-}" ]; then
  echo "PR  : #$num $state by $author  <-- opened by a human, not the workflow"
elif gh api "repos/$R/branches/$branch" -q .name >/dev/null 2>&1; then
  # The branch is pushed before the PR is opened, so translation work is never
  # lost this way — but the run failed and needs a look.
  echo "PR  : NONE, but branch $branch exists  <-- gh pr create failed; read the log:"
  echo "      gh run view $id --repo $R --log | grep -i -A5 'Publish translation PR'"
else
  echo "PR  : none, no branch  <-- quiet night, or the run paused on a pending PR"
fi

# A run skips its model work entirely while any translation PR is unmerged, so
# an unreviewed PR costs a night of translation. Between 09-02 and 09-06, five
# consecutive nights were skipped this way.
open=$(gh pr list --repo "$R" --state open --limit 30 --json headRefName \
  --jq '[.[] | select(.headRefName | startswith("automation/"))] | length')
echo "open: $open translation PR(s) — runs stay paused while any is open"

# The pipeline only advances this once a batch merges, so it doubles as a
# "how long has the gate been shut" reading. The workflow itself warns past 3d.
ts=$(gh api "repos/$R/contents/website/last-sync.json" --jq .content 2>/dev/null \
  | base64 -d | grep -o '"timestamp": *"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -n "$ts" ]; then
  age=$(( ( $(date -u +%s) - $(date -u -d "$ts" +%s) ) / 86400 ))
  echo "base: last-sync ${ts%T*} (${age}d old)$( [ "$age" -gt 3 ] && echo '  <-- stale, backlog growing' )"
fi

exit 0

#!/usr/bin/env bash
set -euo pipefail

# Creates the branch rulesets that act as the real security boundary.
# Requires a token with repository administration permission.
#   GITHUB_TOKEN=... ./scripts/setup-repo.sh HayashiUme GitLocalize

OWNER="${1:-${GITHUB_REPOSITORY%%/*}}"
REPO="${2:-${GITHUB_REPOSITORY##*/}}"
TOKEN="${GITHUB_TOKEN:?set GITHUB_TOKEN to a token with repository administration}"

api() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -H "User-Agent: GitLocalize-Setup" \
      -d "$body" "https://api.github.com$path"
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      -H "User-Agent: GitLocalize-Setup" \
      "https://api.github.com$path"
  fi
}

main_ruleset() {
  cat <<'JSON'
{
  "name": "main-protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [
    { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" }
  ],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request", "parameters": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews_on_push": true,
      "require_code_owner_review": true,
      "require_last_push_approval": false,
      "required_review_thread_resolution": false,
      "allowed_merge_methods": ["merge", "squash"]
    } }
  ]
}
JSON
}

i18n_ruleset() {
  cat <<'JSON'
{
  "name": "i18n-workspace",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/i18n"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
}

echo "Applying rulesets to $OWNER/$REPO"
echo "-- main"
api POST "/repos/$OWNER/$REPO/rulesets" "$(main_ruleset)" | head -c 400
echo
echo "-- i18n"
api POST "/repos/$OWNER/$REPO/rulesets" "$(i18n_ruleset)" | head -c 400
echo
echo "-- pages"
# The workflow token holds pages:write but cannot create the site, so do it once from here.
api POST "/repos/$OWNER/$REPO/pages" '{"build_type":"workflow"}' | head -c 300
echo
echo "Done. Add the automation account as a bypass actor if it ever needs to push to main."

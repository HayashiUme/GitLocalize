#!/usr/bin/env bash
set -euo pipefail

# Creates the branch rulesets that act as the real security boundary, enables Pages,
# and allows the translation branch to deploy to the github-pages environment.
# Requires a token with repository administration permission.
#   GITHUB_TOKEN=... ./scripts/setup-repo.sh HayashiUme GitLocalize

OWNER="${1:-${GITHUB_REPOSITORY%%/*}}"
REPO="${2:-${GITHUB_REPOSITORY##*/}}"
TRANSLATION_BRANCH="${TRANSLATION_BRANCH:-i18n}"
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
  cat <<JSON
{
  "name": "i18n-workspace",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/$TRANSLATION_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" }
  ]
}
JSON
}

# Rulesets are unique by name; skipping existing ones makes the whole script re-runnable.
apply_ruleset() {
  local name="$1" body="$2"
  if echo "$existing_rulesets" | grep -q "\"name\":\"$name\""; then
    echo "   ruleset $name already exists, skipping"
  else
    api POST "/repos/$OWNER/$REPO/rulesets" "$body" | head -c 400
    echo
  fi
}

echo "Applying rulesets to $OWNER/$REPO"
existing_rulesets="$(api GET "/repos/$OWNER/$REPO/rulesets?per_page=100" || true)"
echo "-- actions workflow permissions"
# Without this the workflow token may not open the i18n -> main pull request.
api PUT "/repos/$OWNER/$REPO/actions/permissions/workflow" \
  '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":true}' | head -c 200
echo
echo "-- main"
apply_ruleset main-protection "$(main_ruleset)"
echo "-- $TRANSLATION_BRANCH"
apply_ruleset i18n-workspace "$(i18n_ruleset)"
echo "-- pages"
# The workflow token holds pages:write but cannot create the site, so do it once from here.
api POST "/repos/$OWNER/$REPO/pages" '{"build_type":"workflow"}' | head -c 300
echo
echo "-- github-pages environment"
# Without this the deployment is rejected: the environment only trusts the default branch.
api PUT "/repos/$OWNER/$REPO/environments/github-pages" \
  '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}' | head -c 200
echo
api POST "/repos/$OWNER/$REPO/environments/github-pages/deployment-branch-policies" \
  "{\"name\":\"$TRANSLATION_BRANCH\",\"type\":\"branch\"}" | head -c 300
echo
echo "Done. Add the automation account as a bypass actor if it ever needs to push to main."

if [ "${MARK_TEMPLATE:-false}" = "true" ]; then
  echo "-- marking the repository as a template"
  api PATCH "/repos/$OWNER/$REPO" '{"is_template":true}' | head -c 200
  echo
fi

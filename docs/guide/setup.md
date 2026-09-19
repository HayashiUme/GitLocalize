# Setup

## 1. Branches

`main` and `i18n` both exist in this repository. To create the workspace branch in another project:

```bash
git checkout -b i18n
git push -u origin i18n
```

## 2. Project configuration

`.github/i18n.yml` describes where strings live and which languages exist:

```yaml
source:
  language: en
  directory: locales

languages:
  - zh-CN
  - zh-TW
  - ja

files:
  - "locales/*.yml"
  - "locales/*.json"

branch:
  translation: i18n
  main: main

pullRequest:
  title: "i18n: update translations"
```

When `languages` is omitted, languages are inferred from file names such as `app.zh-CN.yml`.

## 3. Repository settings

| Setting | Value |
| --- | --- |
| Default branch | `main` |
| Merge commits | Allowed (the sync workflow relies on merges) |
| Squash merges | Allowed |
| Delete branch on merge | Off for `i18n` |
| Actions → Allow GitHub Actions to create and approve pull requests | On |
| Pages → Source | GitHub Actions |

The Actions setting is required, not cosmetic: without it the workflow token cannot open the `i18n → main` pull request and `translation-pr.yml` fails with "GitHub Actions is not permitted to create or approve pull requests". `scripts/setup-repo.sh` switches it on through the API.

## 4. Rulesets

Attach the rulesets before inviting translators. `main` at minimum needs:

- Block force pushes
- Block branch deletion
- Require a pull request before merging
- Require review from code owners

`i18n` needs force push and deletion blocked, and nothing else — a pull request requirement there would stop translators from committing at all.

Both rulesets come from `scripts/setup-repo.sh`, which needs a token with repository administration.

Note that a ruleset applies to the repository owner too. The script therefore records the owner as a bypass actor, so a single maintainer can still merge and push while everybody else is held to the pull request rule. Remove the bypass actor once more than one maintainer exists.

## 5. Secrets

| Secret | Purpose |
| --- | --- |
| `I18N_BOT_TOKEN` | Optional. A fine-grained PAT with `Contents: read and write` and `Pull requests: read and write`, used so automation pushes start follow-up workflows. Without it the workflows still work, but the follow-up step is dispatched explicitly. |

The default `GITHUB_TOKEN` needs no setup.

## 6. Pages

Two things need administration rights and cannot be done by the workflow token:

1. **Create the Pages site.** The workflow token holds `pages: write`, which publishes, but creating the site needs administration.
2. **Allow the translation branch to deploy.** The `github-pages` environment trusts only the default branch until you say otherwise, and a deployment from `i18n` is rejected before any step runs.

`scripts/setup-repo.sh` does both along with the rulesets. Equivalently, through the API:

```bash
curl -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/pages -d '{"build_type":"workflow"}'

curl -X PUT -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/environments/github-pages \
  -d '{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}'

curl -X POST -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies \
  -d '{"name":"i18n","type":"branch"}'
```

After that, `deploy-pages.yml` builds the VuePress site from `docs/` on every push to `i18n` and publishes it.

The published URL is `https://<owner>.github.io/<repository>/`.

## 7. Local development

```bash
npm install
npm run dev      # http://localhost:8080
npm test         # parser, flatten and QA unit tests
npm run build    # static output in docs/.vuepress/dist
```

Open `http://localhost:4173/?mock=1` to exercise the editor against the in-memory GitHub stand-in.

## 8. Token scopes

Each translator brings their own credential. The walkthrough lives in [Getting a token](/guide/token.md); the short version is a fine-grained personal access token limited to this one repository:

```text
Contents:      Read and write
Pull requests: Read and write   (optional, for the editor to show the PR link)
```

Do not grant administration, secrets, actions or workflow permissions to translators, and do not hand out the GitHub CLI's own `gho_…` token — it is account-wide.

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

Search for a file, paste a snippet into the commit message and save — several settings are one commit away:

| Setting | Value |
| --- | --- |
| Default branch | `main` |
| Merge commits | Allowed (the sync workflow relies on merges) |
| Squash merges | Allowed |
| Delete branch on merge | Off for `i18n` |
| Pages source | GitHub Actions |

## 4. Rulesets

Attach the rulesets before inviting translators. `main` at minimum needs:

- Block force pushes
- Block branch deletion
- Require a pull request before merging
- Require review from code owners

`i18n` needs force push and deletion blocked, and nothing else — a pull request requirement there would stop translators from committing at all.

Both rulesets are created by the bootstrap script in `scripts/setup-repo.sh` when a token with repository administration is available.

## 5. Secrets

| Secret | Purpose |
| --- | --- |
| `I18N_BOT_TOKEN` | Optional. A fine-grained PAT with `Contents: read and write` and `Pull requests: read and write`, used so automation pushes start follow-up workflows. Without it the workflows still work, but the follow-up step is dispatched explicitly. |

The default `GITHUB_TOKEN` needs no setup.

## 6. Pages

Enable Pages once with a token that has repository administration, because the workflow token holds `pages: write` but cannot create the site itself:

```bash
curl -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/<owner>/<repo>/pages \
  -d '{"build_type":"workflow"}'
```

`scripts/setup-repo.sh` does this along with the rulesets. After that, `deploy-pages.yml` builds the VuePress site from `docs/` on every push to `i18n` and publishes it.

The published URL is `https://<owner>.github.io/<repository>/`.

## 7. Local development

```bash
npm install
npm run dev      # http://localhost:8080
npm test         # parser, flatten and QA unit tests
npm run build    # static output in docs/.vuepress/dist
```

Open `http://localhost:8080/editor.html?mock=1` to exercise the editor against the in-memory GitHub stand-in.

## 8. Token scopes

A fine-grained personal access token scoped to the single repository is enough:

```text
Contents:      Read and write
Pull requests: Read and write   (optional, for the editor to show the PR link)
```

Do not grant administration, secrets, actions or workflow permissions to translators.

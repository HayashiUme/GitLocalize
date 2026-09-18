# Architecture

## Branch model

```text
main   protected, reviewed, the source of truth
  │
  │ pull request (created by a workflow)
  │
i18n   shared translation workspace, GitHub Pages source
```

- `main` holds source code and the accepted translations. Direct pushes are blocked by a ruleset; changes arrive through pull requests.
- `i18n` is the working branch. Translators commit here directly, and Pages is built from it.

## Data flow

```text
Browser (VuePress page)
  │  api.github.com, token held in memory
  ├─ GET  /user                                     identity
  ├─ GET  /repos/{owner}/{repo}                     permission + default branch
  ├─ GET  /contents/.github/i18n.yml                project configuration
  ├─ GET  /contents/locales/*                       source and target strings
  ├─ POST /git/blobs → /git/trees → /git/commits    one commit, many files
  └─ PATCH /git/refs/heads/i18n                     fast-forward only

GitHub Actions
  ├─ translation-pr.yml    i18n push  → ensure pull request i18n → main
  ├─ sync-main-to-i18n.yml main push  → merge main into i18n
  └─ deploy-pages.yml      i18n push  → build VuePress → deploy Pages
```

## Module map

| Path | Responsibility |
| --- | --- |
| `src/types.ts` | Shared data model: user, repository, entry, change, config |
| `src/parser/` | `flatten` / `setPath` plus the YAML and JSON parsers behind one interface |
| `src/qa/` | Placeholder and HTML tag comparison, empty translation detection |
| `src/github/` | API client, error taxonomy, auth, permissions, contents, git data, pull requests, mock transport |
| `src/state/editorStore.ts` | Single reactive store that orchestrates loading, editing and committing |
| `src/components/` | Vue 3 components for the editor |
| `docs/` | VuePress site, published to GitHub Pages |

## Why the Git database API

`PUT /contents/{path}` writes one file per request, which would produce three commits for a three-file edit. The editor instead reads the branch head, creates blobs, builds one tree on top of the current tree, creates one commit with the translator as author, and fast-forwards the ref. A single save is a single commit, and the commit author is the translator — the bot never rewrites history.

## Concurrency

Two translators can open the same file at the same base commit. The editor therefore:

1. records the branch head SHA when the file is loaded,
2. re-reads the ref immediately before creating the commit and before updating the ref,
3. refuses to commit when the SHA no longer matches.

The ref update uses `force: false`, so GitHub itself rejects a non-fast-forward write. The failure surfaces as a 409 with a reload prompt instead of a silent overwrite.

## Idempotency

`commitFiles` compares the tree it just built with the base tree. When they are identical, no commit is created and the caller is told the result was unchanged. Workflows follow the same rule: `translation-pr.yml` looks for an existing open `i18n → main` pull request and only opens one when none exists, and `sync-main-to-i18n.yml` exits without pushing when the branches already agree.

## GitHub constraints worth knowing

These are properties of the platform, not bugs in this project:

1. **Events created with the default `GITHUB_TOKEN` do not start new workflow runs.** A push performed by `sync-main-to-i18n.yml` therefore will not trigger `translation-pr.yml` or `deploy-pages.yml`. Supply a `I18N_BOT_TOKEN` secret (a fine-grained PAT with `Contents: read and write` and `Pull requests: read and write`) to restore the chain; the workflows fall back to `GITHUB_TOKEN` and then explicitly dispatch the follow-up workflow.
2. **Rulesets can block automation.** If `i18n` ever requires pull requests, the bot must be added as a bypass actor, otherwise it cannot push. The ruleset created by this project blocks force pushes and deletion only.
3. **`Repository` role permissions are not per-branch.** GitHub cannot express "this user may push `i18n` but not `main`" without rulesets. The front end hides the submit button for read-only users, but that is user experience, not a security boundary.
4. **The Contents API caps files at 1 MB.** Locale files that large need the blob API for reads as well; the editor currently reads through the Contents API.
5. **A repository must be public for GitHub Pages on a free plan.** A private repository needs a paid plan for Pages.
6. **CORS.** `api.github.com` serves CORS headers, so the browser can call it directly. The device flow endpoints on `github.com` are intended for public clients; if a browser blocks them, the personal access token path always works.
7. **`GITHUB_TOKEN` cannot create a Pages site.** It carries `pages: write`, which is enough to publish, but creating the site needs repository administration. Run `scripts/setup-repo.sh` once, or create the site through the API, before the deployment workflow can succeed. A failing `actions/configure-pages` step with "Resource not accessible by integration" means exactly this.

## Extending the parser layer

Adding a format means implementing two methods and registering the parser:

```ts
interface TranslationParser {
  parse(content: string): RawDocument
  serialize(document: RawDocument, originalContent?: string): string
}
```

JSON5, TOML, PO, XLIFF, RESX and Markdown all fit this interface without touching the editor.

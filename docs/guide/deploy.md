# Deploy GitLocalize for your own repository

GitLocalize is designed to be copied. Everything it needs lives inside the repository itself, so
turning it into your own translation workspace takes one copy and one script.

## 1. Copy the repository

Open the repository on GitHub and press **Use this template**. You get a fresh repository with the
editor, the workflows, the branch layout and the locale files — no forks, no history to clean up.

If you prefer the command line, any plain clone works too; the rest of this guide does not care
where the copy came from.

## 2. Point the scripts at your repository

Everything is driven by environment variables, so the same files serve any owner and repo name:

| Variable | Default | Used for |
| --- | --- | --- |
| `GITLOCALIZE_OWNER` | `HayashiUme` | site config, og URLs |
| `GITLOCALIZE_REPO` | `GitLocalize` | Pages base path |
| `GITLOCALIZE_BRANCH` | `i18n` | translation branch |
| `GITLOCALIZE_SITE_URL` | derived | custom domains |

## 3. Run the setup script

With `gh` signed in against your own account:

```bash
export GITLOCALIZE_OWNER=your-name
export GITLOCALIZE_REPO=your-repo
bash scripts/setup-repo.sh
```

The script wires up, in order: the `i18n` branch, the branch rulesets that protect `main`, the
`github-pages` environment restricted to `i18n`, and the Actions permissions the three workflows
need. Re-running it is safe; each step checks before it changes.

## 4. What runs automatically afterwards

- A push to `main` is merged into `i18n` by `sync-main-to-i18n.yml`.
- A push to `i18n` opens or refreshes one pull request back to `main`
  (`translation-pr.yml`), and rebuilds the Pages site (`deploy-pages.yml`).
- Translators only ever need the editor at `https://<owner>.github.io/<repo>/Editor/`
  and a fine-grained token with `Contents: Read and write`.

## 5. Ship the mobile app (optional)

The Android shell is built by CI, so nobody installing your copy needs an Android SDK:

```bash
git tag v0.1.0
git push origin v0.1.0
```

`build-apk.yml` runs on the tag, produces `GitLocalize-debug.apk` and attaches it to a GitHub
release. `workflow_dispatch` on the same workflow produces a test build without a release.

## 6. Customising the experience

- Interface strings live in `locales/app.*.yml` and `locales/errors.*.json`; add a language by
  copying the `en` files with the right suffix and adding the language to `.github/i18n.yml`.
- Per-repository settings live in `.github/i18n.yml` (source language, directory, file globs,
  branch names, pull request title).
- The size warning for mobile clones triggers past 50 MB of repository payload; the limit lives in
  `app/store.ts` as `SIZE_WARNING_KB`.

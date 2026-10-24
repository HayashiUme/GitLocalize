# Deploy GitLocalize in your own repository

GitLocalize turns an ordinary GitHub repository into a translation workspace. Nothing is hosted:
the editor is a static app on GitHub Pages, translations are commits on a translation branch, and
Actions open the pull request for review.

## Before you start

- A repository whose translation files translators should edit.
- Source-language files in it, for example `locales/app.en.yml`.
- Write access, and `gh` signed in (`gh auth login`) if you want the CLI to enable Pages and
  branch protection.

## 1. Install the CLI

The wizard is a single Rust binary. Pick whichever line fits:

```bash
# nothing installed yet: the launcher fetches the binary once
node .gitlocalize/scripts/deploy.mjs

# or download a release build directly (Windows / macOS / Linux, x64 and arm64)
https://github.com/HayashiUme/GitLocalize/releases/latest

# or build it yourself
cargo install --git https://github.com/HayashiUme/GitLocalize --path cli
```

## 2. Run the wizard

```bash
gitlocalize init
```

Seven steps, `Tab` / `←` `→` to move, `↑` `↓` between fields, `Enter` to edit, `Ctrl+S` to write:

| Step | What you answer | Default |
| --- | --- | --- |
| 1 Repository | `owner/repo`, base branch, translation branch | inferred from the remote; `main` / `i18n` |
| 2 Files | file mask with one language placeholder, source file, source language, directory | `locales/app.*.yml` |
| 3 Languages | target languages (add with `a`, delete with `d`) | inferred from the files on disk |
| 4 Flow | commit message, PR title, whether to open a pull request | `i18n(%language%): …` |
| 5 Hosting | Pages mode (`branch` / `artifact` / `none`), pages branch | `branch` / `editor` |
| 6 Review | the files and the final URL | — |
| 7 Execute | writes the files, prints the next git commands | — |

`%language%` (and `{language}`) is replaced with the language codes touched by a push.

Non-interactive equivalents exist for every field:

```bash
gitlocalize init acme/site --filemask 'locales/app.*.yml' --yes
gitlocalize init --config .gitlocalize/config.json --yes
gitlocalize init --print-config          # print and exit
gitlocalize doctor                       # check config, workflows and branches
gitlocalize publish-editor               # refresh the editor build on the pages branch
```

## 3. What gets written

Exactly three files land in your repository:

```
.gitlocalize/config.json
.github/workflows/gitlocalize-pr.yml       translation branch → pull request
.github/workflows/gitlocalize-editor.yml   upstream editor build → pages branch
```

The editor build itself is never committed to the base branch: it lives on the pages branch
(`editor` by default), which is also the Pages source. Re-running `publish-editor` or waiting for
the weekly cron refreshes it.

## 4. The editor URL

| Pages mode | Editor URL | Where the build goes |
| --- | --- | --- |
| `branch` (default) | `https://<owner>.github.io/<repo>/` | the `editor` branch, served as-is |
| `artifact` | `https://<owner>.github.io/<repo>/Editor/` | Pages artifact, leaves the site root free |
| `none` | — | you publish it yourself |

GitLocalize itself uses `artifact` because its Pages site also carries this documentation, so the
editor sits at `/Editor/`. A repository wired by the CLI defaults to `branch` and serves the editor
from its site root — that asymmetry is intentional, not a bug.

## 5. Translate

Translators open the URL above, sign in with a fine-grained token that has `Contents: Read and
write` ([getting a token](/guide/token.md)), translate, and commit. Commits land on the translation
branch; the PR workflow exports only the configured file mask onto `translation-export` and opens
one pull request against the base branch.

## Limits

- The editor binary is downloaded from this repository's `editor` branch; your repository gets no
  front-end toolchain.
- The workflows move locale files only. They do not run schema or placeholder checks.
- Custom domains cannot be inferred from the host name; the editor then asks for `owner/repo` once.
- Pages `branch` mode needs the pages branch to exist before you enable Pages — run
  `gitlocalize publish-editor` first.

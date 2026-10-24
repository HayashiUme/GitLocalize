# Deploy GitLocalize in your own repository

GitLocalize turns an ordinary GitHub repository into a translation workspace. Nothing needs hosting:
the editor is a static app on GitHub Pages, translations are commits on a translation branch, and
Actions open the pull request for review.

`deploy.mjs` wires an existing repository in one interactive run. It does not copy a template and
does not touch your application code.

## Before you start

- A GitHub repository whose translation files translators should edit.
- Source-language files in that repository, for example `locales/app.en.yml`.
- Write access to the repository, and `gh` signed in (`gh auth login`) if you want the script to
  enable Pages and branch protection for you.

## 1. Get the script

Copy it from this repository:

```bash
mkdir -p .gitlocalize/scripts
curl -fsSL https://raw.githubusercontent.com/HayashiUme/GitLocalize/main/.gitlocalize/scripts/deploy.mjs \
  -o .gitlocalize/scripts/deploy.mjs
```

A `git clone` of this repository and a manual copy work just as well.

## 2. Run it

```bash
node .gitlocalize/scripts/deploy.mjs
```

Answers, in order:

| Question | What it means | Default |
| --- | --- | --- |
| Main branch | where reviewed translations land | `main` |
| Translation branch | where translators commit | `i18n` |
| Language files | for each group: the source file and a translation pattern containing `{language}`, then `code = display name` lines | `locales/app.en.yml` → `locales/app.{language}.yml` |
| Source language | language code of the source files | `en` |
| PR title / body, commit message | templates; `{language}` becomes the languages touched by the push | sensible defaults |
| Deploy the editor to Pages | publish the editor on this repository's Pages | yes |
| Branch protection | create rulesets for both branches | no |

Everything is validated before anything is written: branch names are checked, and a translation
pattern without `{language}` is rejected. Answers are stored in `.gitlocalize/config.json`, in the
same shape as a Weblate component or a Crowdin file mapping.

## 3. What it creates

```
.gitlocalize/config.json          the answers
.gitlocalize/editor/              the editor build, downloaded from the upstream Pages
.github/i18n.yml                  language inventory
.github/workflows/gitlocalize.yml the only workflow added
```

`gitlocalize.yml` runs two jobs, gated by branch:

- push to the translation branch — open or refresh the pull request against the main branch, with
  `{language}` replaced by the languages whose files changed in that push;
- push to the main branch, or a manual run — publish `.gitlocalize/editor` to Pages under `/Editor/`,
  with a redirect from the site root.

With branch protection accepted, two rulesets are created: the main branch requires a pull request,
the translation branch forbids deletion and force pushes.

## 4. Translate

If Pages was enabled the editor is served at:

```
https://<owner>.github.io/<repository>/Editor/
```

Translators sign in with a fine-grained token that has `Contents: Read and write`
([getting a token](/guide/token.md)). Each save and commit lands on the translation branch, and the
workflow opens the pull request for a maintainer to merge.

## Limits worth knowing

- The editor binary is downloaded from the upstream Pages; this repository gets no front-end build
  chain and no `node_modules`.
- The workflow only moves locale files. It does not run schema checks or tests on translations.
- On a custom domain the editor cannot infer the repository from the host name; the sign-in form
  then asks for `owner/repo` once.
- Updating the editor means re-running the script: it overwrites `.gitlocalize/editor/`.

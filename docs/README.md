---
home: true
title: GitLocalize
heroText: GitLocalize
tagline: A translation platform with no server, no database and no backend. GitHub is the backend.
actions:
  - text: Open the editor
    link: /editor.md
    type: primary
  - text: How it works
    link: /guide/architecture.md
    type: secondary
features:
  - title: Git is the database
    details: Translations live in the repository. The translation workspace is the i18n branch, reviewed through pull requests.
  - title: GitHub API is the application API
    details: The browser talks to api.github.com directly. Your token never leaves the tab.
  - title: Actions are the workers
    details: Sync, pull request automation and Pages deployment run as GitHub Actions workflows.
footer: MIT Licensed
---

## What this is

GitLocalize turns a GitHub repository into a translation platform. Translators open a static site hosted on GitHub Pages, edit translations in a table-based editor, and commit the result to the `i18n` branch. Automation then opens a pull request against `main` for review.

Nothing is deployed except a static site. There is no VPS, no Express server, no database, no OAuth broker.

## The loop

```text
Translator → editor on GitHub Pages → commit to i18n
          → GitHub Actions → pull request i18n → main
          → maintainer review → merge main
          → sync main → i18n → Pages rebuild
```

## Try it without a token

The editor ships with an in-memory GitHub stand-in so the interface can be exercised offline: open [`/editor.html?mock=1`](/editor.html?mock=1) and choose **Continue with mock data**.

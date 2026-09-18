---
sidebar: false
---

# Translation Editor

<ClientOnly>
  <TranslationEditor />
</ClientOnly>

## Notes

- `?mock=1` in the URL switches the editor to an in-memory GitHub stand-in, which is useful for interface work without a token.
- The personal access token is held in memory by default. The optional checkbox keeps it in `sessionStorage` for the current tab only; it is never written to `localStorage`, the repository, or a URL.
- Placeholder and HTML tag checks run on every keystroke. Warnings are advisory — the repository ruleset and pull request review remain the real gate.
- If the branch head moved while you were editing, the commit is rejected rather than overwriting someone else's work.

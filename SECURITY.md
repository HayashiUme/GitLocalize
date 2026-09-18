# Security Policy

## Reporting a vulnerability

Open a private security advisory in this repository, or contact the maintainer listed in `CODEOWNERS`. Please do not include live access tokens in a report; revoke the token first and describe the scopes it carried.

## Scope

The interesting surface is small on purpose: a static site, a browser-held token and a handful of workflows.

| Area | Expectation |
| --- | --- |
| Access tokens | Held in memory, optionally in `sessionStorage` for the tab. Never in `localStorage`, commits, URLs, logs or error messages. |
| Repository writes | Only to `i18n` from the editor, only with the user's own token. |
| `main` | Reachable only through a reviewed pull request. |
| Workflows | Run with the least permission they need; the automation token must not hold administration, secrets or workflow scopes. |
| Translation content | Rendered as text, never evaluated. YAML and JSON are parsed with `yaml` and `JSON.parse`. |

## Out of scope

- Users editing JavaScript in their own browser and bypassing UI-level checks. The rulesets and pull request review are the boundary, not the interface.
- Anything that requires a server. This project has none by design; a proposal that adds one should be redesigned around the GitHub API and Actions.

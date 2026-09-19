# Security

## The boundary is GitHub, not the front end

The editor disables the submit button for read-only users. That is a convenience. Anyone can edit JavaScript in a browser, so the front end is never the control that matters. The controls that matter are:

```text
GitHub repository permission
  + main branch ruleset (pull request required)
  + i18n branch ruleset (no force push, no deletion)
  + CODEOWNERS for review routing
  + pull request review before merge
```

## Token handling

The token is:

- held in a module-scoped variable,
- optionally mirrored into `sessionStorage` when the user asks for it,
- sent only to `api.github.com`,
- never written to `localStorage`,
- never written into a commit, an Actions log, a URL, an analytics call or an error message,
- never placed in the repository, because there is nowhere in this project that would accept it.

`localStorage` holds translation drafts only. Draft records contain edited strings, the base commit SHA and a timestamp.

## Permission model

| Role | Repository permission | Can do |
| --- | --- | --- |
| Translator | Write | Commit to `i18n`, open pull requests, nothing on `main` |
| Maintainer | Maintain | Review and merge into `main`, manage rulesets |
| Bot | Write + pull requests | Read the repository, write `i18n`, create and update pull requests |

The bot must not hold administration, secrets or workflow permissions. It never authors translation commits; commits carry the translator as `author` so history stays attributable.

## Error handling

| Status | Meaning | Editor behaviour |
| --- | --- | --- |
| 401 | Token invalid or expired | Sign out, ask to sign in again |
| 403 | Missing permission or rate limited | Message distinguishes the two |
| 404 | Repository or file not found, or not visible | Report and stop |
| 409 | Ref moved, or ref update rejected | Refuse to commit, offer reload |
| 422 | Payload rejected | Report the raw detail |

## Reporting

Open an issue in the repository. Do not include tokens or logs that contain them.

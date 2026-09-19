# Getting a token

The editor talks to `api.github.com` with **your own** credential. Nothing is proxied through a server, because there is no server. So the first thing a translator needs is a credential of their own.

## Two ways in

| | Fine-grained personal access token | Device flow |
| --- | --- | --- |
| Setup needed | None, works immediately | An OAuth App that you own |
| How it works | Paste a string | Enter a short code in the browser |
| Scope | Exactly the permissions you tick | Whatever the OAuth App requests |
| Expiry | You choose | Indefinite until revoked |
| Best for | Most projects, first run | Projects that do not want to teach people about scopes |

Both end up as a token in the browser. The rest of this page is about obtaining it.

## First: do not use the GitHub CLI token

If you already have `gh` installed, `gh auth token` prints a working credential — but it is **not** a personal access token. The `gho_…` prefix means it is the OAuth token that `gh auth login` was issued for the CLI itself. It is account-wide, it is shared by every repository you touch with `gh`, and revoking it signs the CLI out everywhere.

Scope discipline is one of the few real defences this architecture has. Make a dedicated token instead — it takes a minute.

## Fine-grained personal access token

1. Open <https://github.com/settings/personal-access-tokens/new>. (For a repository owned by an organisation, use the organisation's own settings page so the token is issued against that organisation.)
2. **Token name**: something recognisable, for example `GitLocalize translator`.
3. **Expiration**: 90 days is a reasonable default. Shorter is better; you will be told to sign in again when it lapses.
4. **Resource owner**: yourself, or the organisation that owns the repository.
5. **Repository access** → *Only select repositories* → pick the translation repository. Do not choose *All repositories*.
6. **Repository permissions** — leave every row on *No access* unless it is listed here:

   | Permission | Setting | Why |
   | --- | --- | --- |
   | Contents | Read and write | Required. Reading the source files, writing the translation commit. |
   | Pull requests | Read and write | Optional. Only used to show the link to the `i18n → main` pull request in the editor. |

   Do **not** grant Administration, Actions, Secrets, Workflows or Deployments. A translator never needs them, and granting them turns a leaked token into a repository takeover.
7. **Generate token** and copy the `github_pat_…` value. GitHub shows it exactly once.
8. Paste it into the editor's *Personal access token* field.

A classic token with the `repo` scope also works, but it unlocks every repository the account can reach. Prefer fine-grained.

## Device flow (optional)

Device flow gives translators a nicer first run: no scopes to understand, just a code to type. It needs an OAuth App owned by whoever runs the project, and it does **not** need the app's client secret — so nothing secret ever has to live in this repository.

1. Open <https://github.com/settings/applications/new>.
2. **Application name**: `GitLocalize`.
3. **Homepage URL**: your Pages URL, e.g. `https://<owner>.github.io/<repository>/`.
4. **Authorization callback URL**: the same Pages URL. Device flow does not use it, but the form requires a value.
5. Create the app, then open it again and tick **Enable Device Flow**.
6. Copy the **Client ID** (`Ov23li…`). Ignore the client secret.
7. Hand the client ID to the editor, either way works:

   ```yaml
   # .github/i18n.yml
   editor:
     deviceFlowClientId: "Ov23li..."
   ```

   ```bash
   # or at build time
   GITLOCALIZE_CLIENT_ID=Ov23li... npm run build
   ```

8. The *Use GitHub device flow* button now appears on the sign-in panel. The visitor clicks it, reads a short code, and approves in the browser tab that opens.

Two things to know:

- The code currently asks GitHub for the `public_repo` scope, which is enough for a public repository. A private repository needs the scope changed to `repo` in `src/components/GitHubLogin.vue`.
- The token exchange endpoint on `github.com` is meant for public clients, but a browser extension, a strict content policy or an aggressive privacy setting can still interfere. That is why the token field stays: it always works.

Never put the OAuth App's client *secret* in this project. A static site cannot keep a secret, and the device flow does not require one.

## Where the token lives afterwards

| Location | What goes there |
| --- | --- |
| Memory | Default. Gone when the tab is closed or reloaded. |
| `sessionStorage` | Only if *Keep the token in this tab only* is ticked. Survives reloads in that tab, gone when the tab closes. Key: `gitlocalize.session.token`. |
| `localStorage` | Translation drafts only. Never a token. |

The token is sent to `api.github.com` and nowhere else. It is never written into the repository, a commit, a URL, an Actions log, an error message or an analytics call.

## Expiry and rotation

- **401 Unauthorized** means the credential is gone or wrong. Sign out, issue a new one, paste it in.
- **403 with "rate limit exceeded"** is not an expiry — the token is fine, GitHub just wants you to wait. Signing in is what lifts the 60-requests-per-hour anonymous ceiling.
- Revoke a fine-grained token at <https://github.com/settings/personal-access-tokens>.
- Revoke a device flow token at <https://github.com/settings/applications>.
- No button in the editor asks you for a password. If something does, it is not this application.

See [Security](/guide/security.md) for what each status code means to the editor, and [Setup](/guide/setup.md) for the settings that only a maintainer changes.

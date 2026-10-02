# Sparkles dashboard

A React + Vite control panel backed by an Express server. It signs administrators in with Discord OAuth2 and lets them configure the same per-guild settings used by the bot.

## Included

- Discord OAuth2 Authorization Code flow with PKCE and one-time state validation
- encrypted, server-side sessions with secure HTTP-only cookies
- CSRF and origin checks on every state-changing request
- server-side `Manage Server` authorization for every guild request
- bot-membership, role hierarchy, channel, message, and role validation through Discord
- moderation logs, server rules, suggestions, giveaways, tickets, and welcome/goodbye flows
- complete automod controls for links, new accounts, bots, raids, blocked words, and warning thresholds
- economy rewards, currency, box price, robbery chance, music volume, AI, and per-module availability
- automatic roles, verification roles, and live channel/category/manageable-role selectors
- reaction-role creation and removal, including adding the bot reaction to the Discord message
- custom-command creation, editing, listing, and removal
- atomic JSON updates that preserve unrelated bot data
- responsive React interface with all displayed copy routed through `src/i18n`

## Development setup

Requirements: Node.js 20.11 or newer, a Discord application, and the Sparkles bot installed in at least one test server.

1. Install the dashboard dependencies:

   ```powershell
   cd dashboard
   npm install
   ```

2. Create the local environment file:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Fill in `.env`. Generate a unique session secret instead of reusing a bot or OAuth secret. One PowerShell option is:

   ```powershell
   $bytes = New-Object byte[] 64
   [Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
   [Convert]::ToBase64String($bytes)
   ```

4. In Discord Developer Portal, add this exact OAuth2 redirect URL:

   ```text
   http://localhost:3001/auth/discord/callback
   ```

5. Start both the API and Vite development server:

   ```powershell
   npm run dev
   ```

6. Open `http://localhost:5173`.

Vite proxies `/api`, `/auth`, and `/health` to Express, so no permissive CORS configuration is needed.

## Production

Build the frontend and start Express:

```powershell
npm run build
$env:NODE_ENV = 'production'
npm start
```

In production, set both dashboard URLs to the public HTTPS origin. Express serves the compiled `dist/` application. Terminate TLS at a trusted reverse proxy, set `TRUST_PROXY=1` only for that topology, and do not expose the Express port directly.

The process account needs read/write permission for `BOT_STORE_PATH` and `SESSION_STORE_PATH`. Keep the session file and `.env` out of source control and backups that are not encrypted.

## Discord permissions

The dashboard never trusts a guild ID supplied by the browser. It re-fetches the signed-in user's guilds and requires server ownership, Administrator, or Manage Server. It also verifies that the bot is a guild member before reading or writing settings.

For automatic, verification, and reaction roles, the bot needs Manage Roles and its highest role must be above the selected role. Adding a reaction role also requires View Channel, Read Message History, and Add Reactions in the selected channel. Logging, suggestions, giveaways, lifecycle messages, and tickets require the corresponding Discord channel permissions.

Set `DISCORD_BOT_PERMISSIONS` to the permission integer you deliberately chose in Developer Portal. The dashboard uses it only when generating a server-specific install link.

## Shared data safety

Dashboard writes use a same-directory temporary file, atomic rename, strict file permissions, a serialized write queue, and a short-lived lock file. Each mutation reads the latest file immediately before applying its narrow, allow-listed change; unrelated guild data, warnings, tags, economy balances, and suggestions are preserved.

Every process that writes `data/store.json` should participate in the same lock/reload strategy. A bot process that holds an old in-memory copy and later writes it wholesale can overwrite newer dashboard changes. The Sparkles bot store must therefore reload external changes before a write (or use the dashboard lock protocol) when the two processes run together.

## API overview

| Method   | Route                                 | Purpose                                                      |
| -------- | ------------------------------------- | ------------------------------------------------------------ |
| `GET`    | `/api/session`                        | Return the signed-in user and CSRF token                     |
| `GET`    | `/api/guilds`                         | Return servers the user can manage and installation status   |
| `GET`    | `/api/guilds/:guildId/settings`       | Return sanitized settings plus selectable channels and roles |
| `PATCH`  | `/api/guilds/:guildId/settings`       | Update allow-listed guild settings                           |
| `POST`   | `/api/guilds/:guildId/reaction-roles` | Validate and create a reaction-role mapping                  |
| `DELETE` | `/api/guilds/:guildId/reaction-roles` | Remove a reaction-role mapping                               |
| `POST`   | `/api/logout`                         | Revoke the OAuth token and destroy the session               |

Errors return stable codes and a request reference. Discord tokens, bot tokens, client secrets, raw Discord error payloads, and internal paths are never returned to the browser.

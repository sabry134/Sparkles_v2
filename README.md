# Sparkles

Sparkles is a production-oriented Discord.js moderation and community bot with a React dashboard. Its 143-command catalog covers moderation, automod, roles, server building, suggestions, economy, profiles, events, tournaments, music, fun, utilities, and administration.

Discord limits applications to 100 top-level chat-input commands. Frequently used commands such as `/ban`, `/help`, `/anti-link`, `/suggest`, and `/setup` remain easy to reach, while the rest use short groups including `/moderation`, `/automod`, `/roles`, `/server`, `/economy`, `/music`, `/events`, `/tools`, and `/premium-tools`. Every catalog entry has an explicit switch case, a typed option schema, and a real handler; generic `action/text/amount/user/role/channel/id` bundles are not used.

## Highlights

- Global slash commands for every server where the bot is installed
- Interactive Components V2 command center with short routes, exact inputs, categories, pagination, and invoker locking
- Components V2 responses throughout the bot, including media galleries, errors, moderation actions, polls, logs, and lifecycle messages
- Ban, kick, soft-ban, timeout, warnings, message clearing, role management, channel locking, logs, and audit-safe relays
- Anti-link, blocked-word, anti-alt, anti-bot, anti-raid, blacklist, whitelist, and warning-threshold enforcement
- Automatic roles, reaction roles, verification, tickets, tags, rules, polls, announcements, and reviewed suggestions
- Persistent wallets, banks, rewards, profiles, boxes, purchases, robbery, levels, and tournaments
- Recoverable giveaways that select winners after restarts
- Voice playback, queues, search, skipping, volume, and now-playing support
- Weather, dictionary, lyrics, translation, website-health, and practical utility commands
- Configurable operational values in `config/bot.json`
- Secured React/Vite and Express dashboard with live channel, category, and manageable-role selectors
- Dashboard controls for moderation, rules, full automod, roles, verification, reaction roles, community flows, economy, music, modules, and custom commands

## Bot setup

Requirements: Node.js 20.11 or newer and a Discord application.

```powershell
npm install
Copy-Item .env.example .env
```

Fill in `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `MONGODB_URI`, and optionally `MONGODB_DB_NAME` in the root `.env`. Both the bot and dashboard use that same MongoDB database. Then enable these privileged intents in Discord Developer Portal → Bot:

- Server Members Intent
- Message Content Intent

Start the bot:

```powershell
npm start
```

Commands are registered globally. Discord may take time to propagate a changed global command definition.

MongoDB collections and indexes are created automatically on startup. The database uses `guilds`, `warnings`, `moderation_cases`, `dashboard_audit`, `counters`, and `metadata` collections.

If you still have an old `data/store.json`, migrate it once after configuring MongoDB:

```powershell
npm run migrate:mongodb
```

Use `npm run migrate:mongodb -- --replace` only when you intentionally want the migrated JSON data to replace the current Sparkles MongoDB collections.


Examples of the simplified grouped routes are `/music join`, `/music play query:...`, `/music now`, `/roles list`, `/server module`, and `/tools weather`. Discord displays only the fields relevant to the selected command.

## Dashboard setup

```powershell
cd dashboard
npm install
Copy-Item .env.example .env
npm run dev
```

Add `http://localhost:3001/auth/discord/callback` as an OAuth2 redirect in Discord Developer Portal. The frontend runs at `http://localhost:5173` and proxies API and authentication requests to Express.

For production:

```powershell
npm run dashboard:build
$env:NODE_ENV = 'production'
npm run dashboard:start
```

See [dashboard/README.md](./dashboard/README.md) for reverse-proxy, OAuth, session-secret, permission, and deployment details.

Dashboard security includes:

- OAuth2 Authorization Code with PKCE and one-time state
- encrypted server-side sessions with HttpOnly/SameSite cookies
- origin and CSRF validation on mutations
- server-side Manage Server checks on every guild request
- bot-membership, channel, role, and hierarchy validation
- allow-listed field-level MongoDB updates with revision-based bot/dashboard synchronization

## Project structure

```text
server.js                    Global registration, events, and explicit dispatcher
src/modules/                 Feature handlers
src/modules/help.js          Interactive Components V2 help
src/modules/extended.js      Explicit grouped-command handlers
src/command-routes.js        Short routes and exact typed option schemas
src/ui/components.js         Components V2 response system
src/errors.js                Centralized interaction errors
src/store.js                 MongoDB-backed bot state/cache synchronization
src/mongodb.js               Shared MongoDB connection, indexes, revisions, and helpers
config/bot.json              Editable economy and automod defaults
locales/en.json              Bot translations
dashboard/                   React and Express dashboard
tests/                       Parity, Components V2, and security tests
```

## Validation

```powershell
npm run format
npm run verify
```

Tests enforce unique Discord-compatible command names and routes, one help category and precise option schema per command, one explicit non-stacked handler per command, no legacy embed responses, correct Components V2 flags, dashboard validation/persistence, and private-network blocking for `/web-status`.

Never commit `.env`, dashboard session data, provider keys, Discord tokens, or OAuth secrets. Keep the bot's highest role above every role it needs to manage.

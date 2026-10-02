# Sparkles MongoDB schema

MongoDB replaces the legacy `data/store.json` persistence layer. Both the Discord bot and the dashboard must use the same `MONGODB_URI` and `MONGODB_DB_NAME`.

MongoDB calls these **collections** rather than tables.

## Environment

Configure the repository root `.env`:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR_CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=sparkles
```

The dashboard loads the root `.env` before `dashboard/.env`, so the connection string normally exists in one place only.

## Collections

### `guilds`

One document per Discord guild.

Primary key:

```text
_id = Discord guild ID
```

The document contains the guild configuration and runtime state already used by Sparkles, including automod, modules, role configuration, reaction roles, economy accounts, suggestions, giveaways, tags, autoresponders, starboard configuration, command permissions, and related per-guild settings.

Sparkles applies field-level `$set` and `$unset` updates so a dashboard write does not replace unrelated bot state.

### `warnings`

One document per guild/member warning history.

Fields:

```text
guildId
userId
entries[]
```

Unique index:

```text
{ guildId: 1, userId: 1 }
```

### `moderation_cases`

One document per moderation case.

Fields include:

```text
guildId
id
at
action
actorId
actorTag
targetId
targetTag
reason
duration
source
evidence
```

Indexes:

```text
unique { guildId: 1, id: -1 }
{ guildId: 1, targetId: 1, id: -1 }
```

Sparkles retains up to 2,000 cases per guild.

### `dashboard_audit`

One document per dashboard configuration change.

Fields:

```text
guildId
id
at
actorId
actorTag
changes[]
```

Index:

```text
unique { guildId: 1, id: -1 }
```

Sparkles retains up to 2,000 dashboard audit entries per guild.

### `counters`

Internal atomic counters used for sequential dashboard audit IDs.

Primary keys use names such as:

```text
dashboardAudit:<guildId>
```

### `metadata`

Internal synchronization state.

The `state` document contains a monotonically increasing `revision`. The dashboard bumps the revision after mutations. The bot compares that revision before events/interactions and merges external database changes into its in-memory state before writing.

## Index creation

Required indexes are created automatically when the bot or dashboard connects.

No manual Mongo shell setup is required.

## Migrating the old JSON store

After configuring MongoDB and running `npm install`:

```powershell
npm run migrate:mongodb
```

This imports the default `data/store.json`.

To use another source file:

```powershell
npm run migrate:mongodb -- C:\path\to\store.json
```

To clear the Sparkles data collections before importing:

```powershell
npm run migrate:mongodb -- --replace
```

The old JSON file is not used by the bot or dashboard after migration.

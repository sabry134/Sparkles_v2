import os from 'node:os';
import path from 'node:path';

process.env.DISCORD_DRY_RUN = 'true';
process.env.DISCORD_TOKEN = 'command-validation-token';
process.env.DISCORD_CLIENT_ID = '123456789012345678';
process.env.STORE_PATH = path.join(os.tmpdir(), 'sparkles-command-validation.json');

const { registeredCommands } = await import('../server.js');
if (registeredCommands.length > 100) {
  throw new Error(
    `Discord registration exceeds 100 commands: ${registeredCommands.length}`,
  );
}

const names = registeredCommands.map(({ name }) => name);
if (new Set(names).size !== names.length) {
  throw new Error('Duplicate top-level command registration names');
}

console.log(`Validated ${registeredCommands.length} top-level command registrations.`);

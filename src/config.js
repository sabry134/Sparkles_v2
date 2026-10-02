import { readFile } from 'node:fs/promises';
import path from 'node:path';

const configPath = path.resolve(process.env.BOT_CONFIG_PATH ?? 'config/bot.json');
const parsed = JSON.parse(await readFile(configPath, 'utf8'));

function requirePositiveNumber(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new TypeError(`Invalid positive number in bot config: ${name}`);
  }
  return value;
}

for (const [name, reward] of Object.entries(parsed.economy?.rewards ?? {})) {
  requirePositiveNumber(reward.amount, `economy.rewards.${name}.amount`);
  requirePositiveNumber(reward.cooldownMs, `economy.rewards.${name}.cooldownMs`);
}

requirePositiveNumber(parsed.automod?.noticeDeleteMs, 'automod.noticeDeleteMs');
requirePositiveNumber(parsed.economy?.boxPrice, 'economy.boxPrice');
requirePositiveNumber(parsed.music?.maximumVolume, 'music.maximumVolume');

export const botConfig = Object.freeze(parsed);

import { readFileSync } from 'node:fs';
import path from 'node:path';
const file = process.env.PLATFORM_CONFIG_PATH ? path.resolve(process.env.PLATFORM_CONFIG_PATH) : new URL('../../config/platform.json', import.meta.url);
export const platformConfig = Object.freeze(JSON.parse(readFileSync(file, 'utf8')));
for (const [key, value] of Object.entries(platformConfig)) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) throw new TypeError(`Invalid platform configuration: ${key}`);
}

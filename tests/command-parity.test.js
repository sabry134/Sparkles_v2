import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { catalog } from '../src/catalog.js';
import { DEFAULT_HELP_CATEGORIES } from '../src/modules/help.js';
import { TOP_LEVEL_COMMANDS } from '../src/top-level-commands.js';
import {
  CATEGORY_SLASH_NAMES,
  GROUPED_COMMAND_OPTIONS,
  slashRoute,
} from '../src/command-routes.js';

test('catalog command names are unique and Discord-compatible', () => {
  const names = catalog.map(({ name }) => name);
  assert.equal(new Set(names).size, names.length);

  for (const command of catalog) {
    assert.match(command.name, /^[a-z0-9-]{1,32}$/);
    assert.ok(command.description.length >= 1 && command.description.length <= 100);
  }
});

test('every catalog command has exactly one help category', () => {
  const categoryCounts = new Map();
  for (const category of DEFAULT_HELP_CATEGORIES) {
    for (const command of category.commands) {
      categoryCounts.set(command, (categoryCounts.get(command) ?? 0) + 1);
    }
  }

  for (const { name } of catalog) {
    assert.equal(categoryCounts.get(name), 1, `${name} must have one help category`);
  }
});

test('registration groups stay inside Discord limits', () => {
  const catalogNames = new Set(catalog.map(({ name }) => name));
  for (const name of TOP_LEVEL_COMMANDS) {
    assert.ok(catalogNames.has(name), `Unknown top-level command: ${name}`);
  }

  assert.ok(TOP_LEVEL_COMMANDS.size + DEFAULT_HELP_CATEGORIES.length <= 100);
  for (const category of DEFAULT_HELP_CATEGORIES) {
    const groupedCount = category.commands.filter(
      (name) => !TOP_LEVEL_COMMANDS.has(name),
    ).length;
    assert.ok(groupedCount <= 25, `${category.id} has too many subcommands`);
  }
});

test('every grouped command has a precise schema and unique route', () => {
  const routes = new Set();
  for (const category of DEFAULT_HELP_CATEGORIES) {
    assert.ok(CATEGORY_SLASH_NAMES[category.id], `Missing route for ${category.id}`);
    for (const name of category.commands.filter(
      (command) => !TOP_LEVEL_COMMANDS.has(command),
    )) {
      assert.ok(
        Array.isArray(GROUPED_COMMAND_OPTIONS[name]),
        `Missing schema for ${name}`,
      );
      const route = slashRoute(name, category.id, false);
      assert.equal(routes.has(route), false, `Duplicate route: ${route}`);
      routes.add(route);
      const optionNames = GROUPED_COMMAND_OPTIONS[name].map((option) => option.name);
      assert.equal(
        new Set(optionNames).size,
        optionNames.length,
        `${name} options repeat`,
      );
      assert.ok(optionNames.length <= 25, `${name} has too many options`);
    }
  }
});

test('every command has an explicit, non-stacked switch case', async () => {
  const source = [
    await readFile(new URL('../server.js', import.meta.url), 'utf8'),
    await readFile(new URL('../src/modules/extended.js', import.meta.url), 'utf8'),
  ].join('\n');
  const cases = new Set([...source.matchAll(/case '([^']+)'/g)].map((match) => match[1]));

  for (const { name } of catalog) {
    assert.ok(cases.has(name), `Missing handler case for ${name}`);
  }

  assert.doesNotMatch(source, /case '[^']+':\s*\n\s*case '/);
  assert.doesNotMatch(source, /notConfigured/);
});

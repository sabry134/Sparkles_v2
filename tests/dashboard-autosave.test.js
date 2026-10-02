import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const styles = await readFile(
  new URL('../dashboard/src/styles.css', import.meta.url),
  'utf8',
);
const copy = await readFile(
  new URL('../dashboard/src/i18n/en.js', import.meta.url),
  'utf8',
);

test('dashboard settings autosave without a manual save button', () => {
  assert.match(app, /const autosaveSettings = useCallback/u);
  assert.match(app, /window\.setTimeout\([\s\S]*650/u);
  assert.match(app, /showSuccess\(t\('status\.saved'\)\)/u);
  assert.doesNotMatch(app, /onClick=\{saveSettings\}/u);
  assert.doesNotMatch(copy, /'common\.save':/u);
});

test('autosave preserves newer edits while a request is running', () => {
  assert.match(app, /activeGuildId\.current !== guildId/u);
  assert.match(app, /failedSaveSignature\.current/u);
  assert.match(
    app,
    /JSON\.stringify\(editableSettings\(current\)\) === signature/u,
  );
});

test('saved snackbar dismisses itself with a shrinking progress bar', () => {
  assert.match(app, /window\.setTimeout\(onDismiss, duration\)/u);
  assert.match(app, /className="toast-progress"/u);
  assert.match(styles, /@keyframes toast-progress/u);
  assert.match(styles, /animation: toast-progress var\(--toast-duration\)/u);
  assert.match(copy, /'status\.saved': 'Saved'/u);
});

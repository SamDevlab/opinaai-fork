import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const tabletSource = await readFile(new URL('../src/tablet.js', import.meta.url), 'utf8');
const tabletCssSource = await readFile(new URL('../src/tablet.css', import.meta.url), 'utf8');

test('tablet keeps emoji and stars behind the same confirmation contract', () => {
  assert.match(tabletSource, /\['emoji', 'stars'\]\.includes\(questions\[0\]\?\.type\)/);
  assert.match(tabletSource, /data-rating-confirm/);
  assert.match(tabletSource, /data-rating-value/);
  assert.match(tabletSource, /rating-confirm-button/);
  assert.match(tabletSource, /get\('type'\) === 'emoji'/);
});

test('emoji selection uses rounded styling and a lightweight animation', () => {
  assert.match(tabletCssSource, /appearance:none/);
  assert.match(tabletCssSource, /emoji-pop/);
  assert.match(tabletCssSource, /\.emoji-grid label:has\(input:checked\) \{ border-color:#c9daf2/);
  assert.match(tabletCssSource, /\.emoji-grid label \{[^}]*border-radius:24px/);
});

test('native tablet has the QR-like two-finger admin exit flow', async () => {
  const runtimeSource = await readFile(new URL('../android/app/src/main/java/br/com/grupotec/opinaai/OpinaRuntimePlugin.java', import.meta.url), 'utf8');
  assert.match(tabletSource, /event\.touches\.length < 2/);
  assert.match(tabletSource, /setTimeout\(\(\) => \{/);
  assert.match(tabletSource, /exitKiosk/);
  assert.match(tabletSource, /reenterKiosk/);
  assert.match(runtimeSource, /configureAdminPin/);
  assert.match(runtimeSource, /admin_pin_invalid/);
  assert.match(runtimeSource, /runOnUiThread/);
});

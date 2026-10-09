import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const tabletSource = await readFile(new URL('../src/tablet.js', import.meta.url), 'utf8');

test('tablet keeps emoji and stars behind the same confirmation contract', () => {
  assert.match(tabletSource, /\['emoji', 'stars'\]\.includes\(questions\[0\]\?\.type\)/);
  assert.match(tabletSource, /data-rating-confirm/);
  assert.match(tabletSource, /data-rating-value/);
  assert.match(tabletSource, /rating-confirm-button/);
  assert.match(tabletSource, /get\('type'\) === 'emoji'/);
});

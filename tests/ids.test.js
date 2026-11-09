import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createId } from '../js/utils/ids.js';

test('createId gera string no formato UUID', () => {
  const id = createId();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('createId gera valores diferentes a cada chamada', () => {
  const ids = new Set(Array.from({ length: 50 }, () => createId()));
  assert.equal(ids.size, 50);
});

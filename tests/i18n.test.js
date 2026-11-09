import { test } from 'node:test';
import assert from 'node:assert/strict';
import ptBR from '../js/locales/pt-BR.js';
import enUS from '../js/locales/en-US.js';

test('pt-BR e en-US possuem exatamente o mesmo conjunto de chaves', () => {
  const ptKeys = Object.keys(ptBR).sort();
  const enKeys = Object.keys(enUS).sort();
  assert.deepEqual(enKeys, ptKeys);
});

test('nenhuma tradução fica vazia', () => {
  for (const [locale, dictionary] of [['pt-BR', ptBR], ['en-US', enUS]]) {
    for (const [key, value] of Object.entries(dictionary)) {
      assert.ok(typeof value === 'string' && value.trim().length > 0, `${locale}.${key} está vazio`);
    }
  }
});

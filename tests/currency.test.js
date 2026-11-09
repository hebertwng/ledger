import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCurrencyInputToCents, centsToDisplay } from '../js/utils/currency.js';

test('parseCurrencyInputToCents converte formato brasileiro (1.234,56)', () => {
  assert.equal(parseCurrencyInputToCents('1.234,56'), 123456);
});

test('parseCurrencyInputToCents converte formato americano (1234.56)', () => {
  assert.equal(parseCurrencyInputToCents('1234.56'), 123456);
});

test('parseCurrencyInputToCents trata valores negativos', () => {
  assert.equal(parseCurrencyInputToCents('-50,00'), -5000);
});

test('parseCurrencyInputToCents trata entrada vazia como zero', () => {
  assert.equal(parseCurrencyInputToCents(''), 0);
});

test('parseCurrencyInputToCents trata valor inteiro sem decimais', () => {
  assert.equal(parseCurrencyInputToCents('200'), 20000);
});

test('centsToDisplay formata em BRL para pt-BR', () => {
  assert.ok(centsToDisplay(123456, 'pt-BR').includes('1.234,56'));
});

test('centsToDisplay formata em USD para en-US', () => {
  assert.ok(centsToDisplay(123456, 'en-US').includes('1,234.56'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv } from '../js/utils/csv.js';

test('buildCsv monta cabeçalho e linhas separados por vírgula', () => {
  const csv = buildCsv(['Nome', 'Valor'], [['Mercado', '100'], ['Luz', '50']]);
  assert.equal(csv, 'Nome,Valor\r\nMercado,100\r\nLuz,50');
});

test('buildCsv coloca entre aspas valores com vírgula, aspas ou quebra de linha', () => {
  const csv = buildCsv(['Descrição'], [['Compra, com vírgula'], ['Com "aspas"'], ['Com\nquebra']]);
  assert.equal(csv, 'Descrição\r\n"Compra, com vírgula"\r\n"Com ""aspas"""\r\n"Com\nquebra"');
});

test('buildCsv trata valores nulos/indefinidos como texto vazio', () => {
  const csv = buildCsv(['A'], [[null], [undefined]]);
  assert.equal(csv, 'A\r\n\r\n');
});

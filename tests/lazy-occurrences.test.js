import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMissingOccurrences, unmaterializedInstallmentCents, endOfMonth, addDays } from '../js/utils/recurrence.js';

const installmentSeries = {
  id: 's1',
  kind: 'installment',
  startDate: '2026-11-10',
  endDate: null,
  installmentAmountsCents: [-333, -333, -334],
  template: { amountCents: -333 },
};

const recurringSeries = {
  id: 's2',
  kind: 'recurring',
  frequency: 'monthly',
  startDate: '2026-11-05',
  endDate: null,
  paused: false,
  template: { amountCents: -5000 },
};

test('endOfMonth devolve o último dia do mês', () => {
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(endOfMonth('2026-12-01'), '2026-12-31');
});

test('addDays soma e subtrai dias corridos', () => {
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('parcelamento: só gera as parcelas até o fim do mês visualizado', () => {
  const planned = planMissingOccurrences(installmentSeries, [], '2026-11-30');
  assert.deepEqual(planned, [{ date: '2026-11-10', installmentNumber: 1, amountCents: -333 }]);
});

test('parcelamento: ao avançar o mês, gera apenas a parcela que falta', () => {
  const existing = [{ installmentNumber: 1, date: '2026-11-10' }];
  const planned = planMissingOccurrences(installmentSeries, existing, '2026-12-31');
  assert.deepEqual(planned, [{ date: '2026-12-10', installmentNumber: 2, amountCents: -333 }]);
});

test('parcelamento: nunca passa do total de parcelas e ajusta o centavo na última', () => {
  const planned = planMissingOccurrences(installmentSeries, [], '2030-01-01');
  assert.equal(planned.length, 3);
  assert.equal(planned[2].amountCents, -334);
});

test('parcelamento: parcela excluída (soft delete) não é recriada', () => {
  const existing = [
    { installmentNumber: 1, date: '2026-11-10' },
    { installmentNumber: 2, date: '2026-12-10', deletedAt: '2026-11-11T00:00:00Z' },
  ];
  const planned = planMissingOccurrences(installmentSeries, existing, '2026-12-31');
  assert.deepEqual(planned, []);
});

test('parcelamento encerrado (endDate) não gera parcelas posteriores', () => {
  const planned = planMissingOccurrences({ ...installmentSeries, endDate: '2026-12-09' }, [{ installmentNumber: 1 }], '2027-12-31');
  assert.deepEqual(planned, []);
});

test('recorrência mensal: só gera o mês visualizado, sem horizonte de 12 meses', () => {
  const planned = planMissingOccurrences(recurringSeries, [], '2026-11-30');
  assert.deepEqual(planned.map((item) => item.date), ['2026-11-05']);
});

test('recorrência: pular meses gera os meses intermediários que faltam', () => {
  const planned = planMissingOccurrences(recurringSeries, [{ date: '2026-11-05' }], '2027-02-28');
  assert.deepEqual(planned.map((item) => item.date), ['2026-12-05', '2027-01-05', '2027-02-05']);
});

test('recorrência semanal e anual respeitam a frequência', () => {
  const weekly = planMissingOccurrences({ ...recurringSeries, frequency: 'weekly' }, [], '2026-11-30');
  assert.deepEqual(weekly.map((item) => item.date), ['2026-11-05', '2026-11-12', '2026-11-19', '2026-11-26']);
  const annual = planMissingOccurrences({ ...recurringSeries, frequency: 'annual' }, [], '2028-12-31');
  assert.deepEqual(annual.map((item) => item.date), ['2026-11-05', '2027-11-05', '2028-11-05']);
});

test('recorrência pausada não gera nada', () => {
  assert.deepEqual(planMissingOccurrences({ ...recurringSeries, paused: true }, [], '2027-12-31'), []);
});

test('recorrência retomada pula o período em que ficou pausada', () => {
  const series = { ...recurringSeries, resumeFrom: '2027-02-20' };
  const planned = planMissingOccurrences(series, [{ date: '2026-11-05' }], '2027-03-31');
  assert.deepEqual(planned.map((item) => item.date), ['2027-03-05']);
});

test('recorrência com data final para na data final', () => {
  const planned = planMissingOccurrences({ ...recurringSeries, endDate: '2027-01-10' }, [], '2027-12-31');
  assert.deepEqual(planned.map((item) => item.date), ['2026-11-05', '2026-12-05', '2027-01-05']);
});

test('parcelas de cartão ainda não geradas continuam comprometendo o limite', () => {
  assert.equal(unmaterializedInstallmentCents(installmentSeries, [{ installmentNumber: 1 }]), 667);
  assert.equal(unmaterializedInstallmentCents(recurringSeries, []), 0);
});

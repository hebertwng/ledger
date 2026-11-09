import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveInvoiceReferenceMonth,
  computeClosingDate,
  computeDueDate,
  resolveInvoiceStatus,
  calculateInvoiceTotalCents,
  calculateCardUsageCents,
} from '../js/services/invoiceRepository.js';

test('resolveInvoiceReferenceMonth: compra antes do fechamento entra na fatura do mesmo mês ("closes_on_day")', () => {
  assert.equal(resolveInvoiceReferenceMonth('2026-01-05', 10, 'closes_on_day'), '2026-01');
});

test('resolveInvoiceReferenceMonth: compra no dia do fechamento entra na fatura atual quando a regra é "closes_on_day"', () => {
  assert.equal(resolveInvoiceReferenceMonth('2026-01-10', 10, 'closes_on_day'), '2026-01');
});

test('resolveInvoiceReferenceMonth: compra após o fechamento entra na próxima fatura', () => {
  assert.equal(resolveInvoiceReferenceMonth('2026-01-11', 10, 'closes_on_day'), '2026-02');
});

test('resolveInvoiceReferenceMonth: compra no dia do fechamento já entra na próxima fatura quando a regra é "closes_before_day"', () => {
  assert.equal(resolveInvoiceReferenceMonth('2026-01-10', 10, 'closes_before_day'), '2026-02');
});

test('resolveInvoiceReferenceMonth: vira o ano corretamente', () => {
  assert.equal(resolveInvoiceReferenceMonth('2026-12-15', 10, 'closes_on_day'), '2027-01');
});

test('computeClosingDate monta a data de fechamento do mês de referência', () => {
  assert.equal(computeClosingDate('2026-02', 28), '2026-02-28');
});

test('computeClosingDate ajusta para o último dia quando o mês é mais curto', () => {
  assert.equal(computeClosingDate('2026-02', 31), '2026-02-28');
});

test('computeDueDate cai no mesmo mês quando o vencimento é depois do fechamento', () => {
  assert.equal(computeDueDate('2026-01', 10, 17), '2026-01-17');
});

test('computeDueDate cai no mês seguinte quando o vencimento é antes do fechamento no calendário', () => {
  assert.equal(computeDueDate('2026-01', 28, 5), '2026-02-05');
});

test('resolveInvoiceStatus retorna "paid" quando há paidAt', () => {
  assert.equal(resolveInvoiceStatus({ paidAt: '2026-01-20T00:00:00.000Z', closingDate: '2026-01-10' }, '2026-01-25'), 'paid');
});

test('resolveInvoiceStatus retorna "open" antes do fechamento', () => {
  assert.equal(resolveInvoiceStatus({ paidAt: null, closingDate: '2026-01-10' }, '2026-01-05'), 'open');
});

test('resolveInvoiceStatus retorna "closed" após o fechamento sem pagamento', () => {
  assert.equal(resolveInvoiceStatus({ paidAt: null, closingDate: '2026-01-10' }, '2026-01-15'), 'closed');
});

test('calculateInvoiceTotalCents soma as compras (negativas) como total positivo', () => {
  const transactions = [
    { invoiceId: 'inv-1', amountCents: -5000, deletedAt: null, status: 'pending' },
    { invoiceId: 'inv-1', amountCents: -3000, deletedAt: null, status: 'pending' },
    { invoiceId: 'inv-2', amountCents: -9999, deletedAt: null, status: 'pending' },
  ];
  assert.equal(calculateInvoiceTotalCents('inv-1', transactions), 8000);
});

test('calculateInvoiceTotalCents ignora lançamentos excluídos ou cancelados', () => {
  const transactions = [
    { invoiceId: 'inv-1', amountCents: -5000, deletedAt: '2026-01-01T00:00:00.000Z', status: 'pending' },
    { invoiceId: 'inv-1', amountCents: -3000, deletedAt: null, status: 'cancelled' },
  ];
  assert.equal(calculateInvoiceTotalCents('inv-1', transactions), 0);
});

test('calculateCardUsageCents soma apenas faturas não pagas', () => {
  const invoices = [
    { status: 'open', totalCents: 1000 },
    { status: 'closed', totalCents: 2000 },
    { status: 'paid', totalCents: 5000 },
  ];
  assert.equal(calculateCardUsageCents(invoices), 3000);
});

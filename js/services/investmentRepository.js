import { getAllByIndex, putRecord, getRecord } from '../core/database.js';
import { getCurrentUser } from '../core/auth.js';
import { createId } from '../utils/ids.js';
import { nowISOTimestamp, todayISODate } from '../utils/dates.js';
import { summarizeInvestment, sortEntries } from './investmentAnalytics.js';

// Investimentos e suas movimentações (aporte, resgate, atualização do valor). Coleções próprias,
// sem nenhum vínculo com lançamentos ou contas: não entram nas somas do mês.

function stamp(record, user) {
  const now = nowISOTimestamp();
  return { ...record, createdAt: now, updatedAt: now, createdBy: user.uid, updatedBy: user.uid, deletedAt: null, version: 1 };
}

export async function listInvestmentEntries(spaceId) {
  return (await getAllByIndex('investmentEntries', 'bySpace', spaceId)).filter((entry) => !entry.deletedAt);
}

// Investimentos com as movimentações e o resumo (valor atual, aplicado, rendimento) até hoje.
export async function listInvestments(spaceId) {
  const [investments, entries] = await Promise.all([getAllByIndex('investments', 'bySpace', spaceId), listInvestmentEntries(spaceId)]);
  const today = todayISODate();
  return investments
    .filter((investment) => !investment.deletedAt)
    .map((investment) => {
      const own = sortEntries(entries.filter((entry) => entry.investmentId === investment.id));
      return { ...investment, entries: own, summary: summarizeInvestment(own, today) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function createInvestment(spaceId, input) {
  const user = getCurrentUser();
  const investment = stamp(
    {
      id: createId(),
      spaceId,
      name: input.name.trim(),
      type: input.type,
      institution: input.institution || null,
      startDate: input.startDate,
      archived: false,
    },
    user
  );
  await putRecord('investments', investment);
  if (input.initialAmountCents > 0) {
    await addInvestmentEntry(spaceId, investment.id, { kind: 'contribution', date: input.startDate, amountCents: input.initialAmountCents, note: '' });
  }
  return investment;
}

export async function updateInvestment(investmentId, changes) {
  const user = getCurrentUser();
  const investment = await getRecord('investments', investmentId);
  if (!investment) throw new Error('Investimento não encontrado.');
  const updated = { ...investment, ...changes, updatedAt: nowISOTimestamp(), updatedBy: user.uid, version: investment.version + 1 };
  await putRecord('investments', updated);
  return updated;
}

export function setInvestmentArchived(investmentId, archived) {
  return updateInvestment(investmentId, { archived });
}

export async function deleteInvestment(investmentId) {
  return updateInvestment(investmentId, { deletedAt: nowISOTimestamp() });
}

export async function addInvestmentEntry(spaceId, investmentId, input) {
  const user = getCurrentUser();
  const entry = stamp(
    {
      id: createId(),
      spaceId,
      investmentId,
      kind: input.kind,
      date: input.date,
      amountCents: Math.abs(Math.trunc(input.amountCents)) || 0,
      note: (input.note || '').trim(),
    },
    user
  );
  await putRecord('investmentEntries', entry);
  return entry;
}

export async function deleteInvestmentEntry(entryId) {
  const user = getCurrentUser();
  const entry = await getRecord('investmentEntries', entryId);
  if (!entry) throw new Error('Movimentação não encontrada.');
  const now = nowISOTimestamp();
  await putRecord('investmentEntries', { ...entry, deletedAt: now, updatedAt: now, updatedBy: user.uid, version: entry.version + 1 });
}

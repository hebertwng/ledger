// Personagem animado do LEDGER.
//
// O desenho e as 16 animações vêm de js/vendor/personagem.js (gerador do projeto Personagens,
// exposto como window.Personagem). Este módulo leva os conceitos da animação para o sistema:
//
//   • Nível (1 Crítico … 5 Excelente) = saúde financeira real do mês corrente
//     (services/financialHealth.js). Quando o nível sobe, o personagem "sobe de nível" e troca
//     de roupa; quando cai, avisa.
//   • Cada evento do sistema dispara a animação correspondente (lançar despesa → aprovando, valor
//     alto → mãos na cabeça, limite estourado → bolsos vazios, receita → dinheiro entrando,
//     transferência para poupança → cofrinho, pagar → comemora, erro → coça a cabeça…).
//   • Ao abrir: acena; se há conta vencendo hoje ou atrasada, olha o relógio.
//   • Parado, os olhos seguem o cursor; sem interação por um tempo, fica no celular.
//
// O personagem vive num "palco" dentro do menu lateral, no espaço livre abaixo dos itens; um
// clique nele abre o painel de saúde financeira ao lado do menu. (mountMascotStage ainda permite
// montar outro palco numa tela, mas hoje nenhuma tela usa.)
import { t, getLocale } from './i18n.js';
import { getActiveSpace, spaceDisplayName, updateOwnerName } from './bootstrap.js';
import { listAccounts, calculateConsolidatedBalanceCents } from '../services/accountRepository.js';
import { listTransactions } from '../services/transactionRepository.js';
import { listBudgets, calculateBudgetProgress } from '../services/budgetRepository.js';
import { listCategories } from '../services/categoryRepository.js';
import { listInvoices } from '../services/invoiceRepository.js';
import { computeFinancialHealth } from '../services/financialHealth.js';
import { todayISODate, monthRange } from '../utils/dates.js';
import { addMonths } from '../utils/recurrence.js';
import { onDataChange } from './database.js';
import { centsToDisplay } from '../utils/currency.js';
import { escapeHtml } from '../utils/html.js';
import { iconSvg } from '../utils/icons.js';
import { prefersReducedMotion } from '../utils/motion.js';
import { showNotice } from '../utils/notify.js';

const SETTINGS_KEY = 'ledger.mascot';
const LEVEL_KEY_PREFIX = 'ledger.mascot.level.';
const GREETED_KEY = 'ledger.mascot.greeted';
const AFTER_RELOAD_KEY = 'ledger.mascot.afterReload';
const IDLE_TIMEOUT_MS = 90_000;
// gender null = ainda não escolhido: no primeiro acesso, Ledi se apresenta e a pessoa escolhe o visual.
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, gender: null, highValueCents: 100000 });
export const MASCOT_NAME = 'Ledi';

const P = typeof window !== 'undefined' ? window.Personagem : null;

let settings = { ...DEFAULT_SETTINGS, ...readJSON(localStore(), SETTINGS_KEY, {}) };
let level = 3;
let health = null;
let healthSpaceId = null;
let pendingLevelChange = null;
let dockStage = null;
let dockElement = null;
const heroStages = new Set();
const listeners = new Set();
let idleTimer = null;
let initialized = false;

/* ------------------------------------------------------------------ */
/* Armazenamento                                                       */
/* ------------------------------------------------------------------ */
function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function sessionStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readJSON(store, key, fallback) {
  try {
    const value = store?.getItem(key);
    return value == null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeJSON(store, key, value) {
  try {
    store?.setItem(key, JSON.stringify(value));
  } catch {
    // Sem armazenamento: vale só nesta sessão.
  }
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */
export function isMascotAvailable() {
  return Boolean(P);
}

export function isMascotEnabled() {
  return Boolean(P) && settings.enabled && Boolean(settings.gender);
}

export function getMascotSettings() {
  return { ...settings };
}

export function updateMascotSettings(patch) {
  const before = settings;
  settings = { ...settings, ...patch };
  writeJSON(localStore(), SETTINGS_KEY, settings);
  if (before.gender !== settings.gender || before.enabled !== settings.enabled) rerenderAll();
  syncDock();
  notify();
}

export function onMascotChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    try {
      listener({ level, health, settings: { ...settings } });
    } catch {
      // Um ouvinte com erro não deve derrubar o personagem.
    }
  }
}

export function getMascotLevel() {
  return level;
}

export function getFinancialHealth() {
  return health;
}

export function levelName(value = level) {
  return t(`mascot.level.${value}`);
}

/* ------------------------------------------------------------------ */
/* CSS e definições do gerador (uma vez por página)                    */
/* ------------------------------------------------------------------ */
// O CSS do gerador usa classes genéricas (.head, .arm, .dot…). Para não vazar para o resto do app,
// todo seletor é prefixado com ".lm" — o invólucro de cada personagem.
function scopeCss(css, scope) {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let output = '';
  let index = 0;
  while (index < source.length) {
    const open = source.indexOf('{', index);
    if (open === -1) break;
    const head = source.slice(index, open).trim();
    let depth = 1;
    let cursor = open + 1;
    while (depth > 0 && cursor < source.length) {
      if (source[cursor] === '{') depth += 1;
      else if (source[cursor] === '}') depth -= 1;
      cursor += 1;
    }
    const body = source.slice(open + 1, cursor - 1);
    if (head.startsWith('@keyframes')) output += `${head}{${body}}\n`;
    else if (head.startsWith('@media')) output += `${head}{${scopeCss(body, scope)}}\n`;
    else if (head) output += `${head.split(',').map((selector) => `${scope} ${selector.trim()}`).join(', ')}{${body}}\n`;
    index = cursor;
  }
  return output;
}

function injectAssets() {
  if (!P || document.getElementById('mascot-assets-style')) return;
  const style = document.createElement('style');
  style.id = 'mascot-assets-style';
  style.textContent = scopeCss(P.CSS, '.lm');
  document.head.appendChild(style);
  document.body.insertAdjacentHTML(
    'afterbegin',
    `<svg id="mascot-assets-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${P.DEFS}</defs></svg>`
  );
}

/* ------------------------------------------------------------------ */
/* Marcação                                                            */
/* ------------------------------------------------------------------ */
function svgFor(state, { levelValue = level, gender = settings.gender || 'm' } = {}) {
  if (!P) return '';
  // Rótulo de acessibilidade com o nome do estado, sem o número do nível.
  const markup = P.svg(gender, levelValue, state).replace(/, nível \d \([^)]*\)/, `, ${escapeHtml(levelName(levelValue))}`);
  if (state !== 'levelup') return markup;
  // O selo da animação "subiu de nível" mostra o nome do estado (ex.: CONFORTÁVEL) em vez do
  // número do nível; o selo fica mais largo para caber o nome.
  const next = Math.min(levelValue + 1, 5);
  const badge = escapeHtml(levelName(next).toLocaleUpperCase(getLocale()));
  return markup
    .replace('<rect x="60" y="8" width="80" height="20" rx="10"', '<rect x="40" y="8" width="120" height="20" rx="10"')
    .replace(/>NÍVEL (?:MÁX|\d)</, `>${badge}<`);
}

// Personagem estático para incorporar numa tela (ex.: estado vazio). Ainda é animado pelo CSS.
export function mascotInlineHtml(state = 'idle', { size = 96, className = '' } = {}) {
  if (!isMascotEnabled()) return '';
  return `<span class="lm lm-inline ${className}" style="--lm-size:${size}px" aria-hidden="true">${svgFor(state)}</span>`;
}

// Só o rosto (recorte do mesmo desenho) — usado no avatar do menu e no botão do companheiro.
export function mascotFaceHtml({ levelValue = level } = {}) {
  if (!isMascotEnabled()) return '';
  return `<span class="lm lm-face" aria-hidden="true">${svgFor('idle', { levelValue }).replace('viewBox="0 0 200 240"', 'viewBox="48 46 104 104"')}</span>`;
}

/* ------------------------------------------------------------------ */
/* Palco: um personagem com balão de fala                              */
/* ------------------------------------------------------------------ */
class Stage {
  constructor(root, { variant = 'dock' } = {}) {
    this.root = root;
    this.variant = variant;
    this.state = 'idle';
    this.timer = null;
    root.classList.add('lm', 'lm-stage', `lm-stage--${variant}`);
    root.innerHTML = '<div class="lm-stage__art"></div>';
    this.art = root.querySelector('.lm-stage__art');
    // O balão fica fora do palco, preso ao <body>: sai sempre para a direita do menu (nunca cobre
    // Ledi nem os itens do menu) e aparece por cima até de janelas abertas.
    this.bubble = document.createElement('div');
    this.bubble.className = 'lm-bubble';
    this.bubble.setAttribute('role', 'status');
    this.bubble.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.bubble);
    // Clicar no balão dispensa a fala.
    this.bubble.addEventListener('click', () => this.hideBubble());
    this.render('idle');
  }

  hideBubble() {
    this.bubble.classList.remove('is-visible');
  }

  // Ancora o balão logo à direita da imagem de Ledi, na altura do rosto (com o menu expandido ele
  // começa ainda dentro do menu, colado no personagem, e avança sobre o conteúdo).
  positionBubble() {
    if (!this.bubble.classList.contains('is-visible')) return;
    const art = this.art.getBoundingClientRect();
    if (!art.width) return;
    const left = art.right + 12;
    const faceOnly = art.width <= 64;
    const anchorY = faceOnly ? art.top + art.height / 2 : art.top + art.height * 0.32;
    const height = this.bubble.offsetHeight;
    const top = Math.max(8, Math.min(window.innerHeight - height - 8, anchorY - height / 2));
    this.bubble.style.left = `${Math.round(left)}px`;
    this.bubble.style.top = `${Math.round(top)}px`;
    // A seta continua apontando para Ledi mesmo quando o balão encosta na borda da tela.
    this.bubble.style.setProperty('--lm-arrow-y', `${Math.round(Math.max(14, Math.min(height - 14, anchorY - top)))}px`);
  }

  get connected() {
    return this.root.isConnected;
  }

  render(state, levelValue = level) {
    this.art.innerHTML = svgFor(state, { levelValue });
    this.svg = this.art.querySelector('svg');
  }

  // state: animação · ms: duração (depois volta a "parado") · message/tone: balão · after: ao terminar
  set(state, { ms = 0, message = '', tone = '', after = null } = {}) {
    clearTimeout(this.timer);
    // "Subiu de nível" monta dois personagens (atual e próximo), então precisa redesenhar.
    if (state === 'levelup' || this.state === 'levelup') this.render(state);
    this.svg?.setAttribute('class', `st-${state}`);
    this.state = state;
    this.bubble.textContent = message;
    this.bubble.className = message ? `lm-bubble is-visible ${tone ? `lm-bubble--${tone}` : ''}` : 'lm-bubble';
    this.bubble.hidden = !this.connected || (this.root.closest('[hidden]') !== null);
    this.positionBubble();
    if (ms) {
      this.timer = setTimeout(() => {
        if (after) after();
        else {
          this.set('idle');
          onStageIdle();
        }
      }, ms);
    }
  }
}

function activeStage() {
  for (const stage of [...heroStages].reverse()) {
    if (stage.connected) return stage;
    heroStages.delete(stage);
  }
  return dockStage;
}

function allStages() {
  return [dockStage, ...heroStages].filter((stage) => stage && stage.connected);
}

function rerenderAll() {
  for (const stage of allStages()) {
    stage.render(stage.state === 'levelup' ? 'idle' : stage.state);
    stage.set(stage.state === 'levelup' ? 'idle' : stage.state);
  }
  refreshFaces();
}

// Monta um palco numa tela. Enquanto ele estiver no documento, as reações acontecem nele.
export function mountMascotStage(element, { variant = 'hero' } = {}) {
  if (!isMascotEnabled() || !element) return null;
  const stage = new Stage(element, { variant });
  heroStages.add(stage);
  attachStageInteractions(stage);
  syncDock();
  return stage;
}

/* ------------------------------------------------------------------ */
/* Reações                                                             */
/* ------------------------------------------------------------------ */
const DURATIONS = {
  look: 4000, wave: 2600, ok: 1800, think: 2200, income: 2800, save: 3200, celebrate: 2600,
  levelup: 3000, panic: 3200, late: 3800, overbudget: 3800, error: 3200, bye: 3600, empty: 3000,
};

// Tempo de leitura: a fala fica pelo menos o tempo da animação e cresce com o tamanho do texto.
function readingTime(message, base) {
  return Math.min(10_000, Math.max(base, 1200 + (message || '').length * 55));
}

function play(state, message, tone, { ms = DURATIONS[state] || 2500, after = null, confetti = false } = {}) {
  if (!isMascotEnabled()) return;
  const stage = activeStage();
  if (!stage) return;
  stage.set(state, { ms: ms ? readingTime(message, ms) : 0, message, tone, after });
  if (confetti) burstConfetti();
}

export function mascotSay(state, message, tone = '') {
  play(state, message, tone);
}

/**
 * Mensagem da aplicação dita por Ledi. kind: 'error' (coça a cabeça), 'warning' (olha o relógio),
 * 'info' (pensando), 'success' (aprovando). Devolve false se Ledi estiver desligado — aí quem
 * chamou mostra a mensagem do jeito antigo.
 */
const MESSAGE_STYLES = {
  error: ['error', 'alert'],
  warning: ['late', 'warn'],
  info: ['think', ''],
  success: ['ok', 'money'],
};

export function mascotMessage(message, kind = 'info', anchor = null) {
  if (!message) return false;
  if (!isMascotEnabled()) {
    // Ledi desligada: aviso no padrão do app (topo do formulário, ou topo da tela), com a cor do
    // tipo — verde (confirmação), amarelo/laranja (alerta), vermelho (erro).
    showNotice(message, kind, { anchor, closeLabel: t('notice.close') });
    return true;
  }
  const [state, tone] = MESSAGE_STYLES[kind] || MESSAGE_STYLES.info;
  play(state, message, tone, { ms: 3200 });
  return true;
}

// Ledi desligada: os eventos do sistema viram avisos neutros (sem a "personalidade" de Ledi).
async function noticeForEvent(event, payload) {
  switch (event) {
    case 'expenseCreated': {
      const overBudget = await findOverBudgetCategory(payload.categoryId, payload.date).catch(() => null);
      if (overBudget) return showNotice(t('notice.expenseOverBudget', { category: overBudget }), 'warning', { closeLabel: t('notice.close') });
      return showNotice(t('notice.expenseSaved'), 'success', { closeLabel: t('notice.close') });
    }
    case 'incomeCreated':
      return showNotice(t('notice.incomeSaved'), 'success', { closeLabel: t('notice.close') });
    case 'transactionPaid':
      return showNotice(t('notice.paid'), 'success', { closeLabel: t('notice.close') });
    case 'transactionReceived':
      return showNotice(t('notice.received'), 'success', { closeLabel: t('notice.close') });
    case 'transactionUnpaid':
      return showNotice(t('notice.unpaid'), 'info', { closeLabel: t('notice.close') });
    case 'invoicePaid':
      return showNotice(t('notice.invoicePaid'), 'success', { closeLabel: t('notice.close') });
    case 'transferCreated':
      return showNotice(t('notice.transferSaved'), 'success', { closeLabel: t('notice.close') });
    case 'backupDone':
      return showNotice(t('notice.backupDone'), 'success', { closeLabel: t('notice.close') });
    case 'investmentCreated':
      return showNotice(t('notice.investmentCreated'), 'success', { closeLabel: t('notice.close') });
    case 'investmentContribution':
      return showNotice(t('notice.investmentContribution'), 'success', { closeLabel: t('notice.close') });
    case 'investmentWithdrawal':
      return showNotice(t('notice.investmentWithdrawal'), 'success', { closeLabel: t('notice.close') });
    case 'investmentValuation':
      return showNotice(t('notice.investmentUpdated'), payload.gainCents < 0 ? 'warning' : 'success', { closeLabel: t('notice.close') });
    case 'error':
      return showNotice(payload.message ? t('settings.failed', { message: payload.message }) : t('notice.error'), 'error', { closeLabel: t('notice.close') });
    default:
      return null;
  }
}

// Ao fim de cada animação: aplica a mudança de nível que estiver esperando.
function onStageIdle() {
  if (!pendingLevelChange) return;
  const { from, to } = pendingLevelChange;
  pendingLevelChange = null;
  if (to > from) {
    play('levelup', to === 5 && from === 4 ? t('mascot.say.levelMax') : t('mascot.say.levelUp', { level: to, name: levelName(to) }), 'party', {
      confetti: true,
      after: () => {
        applyLevel(to);
        play('celebrate', t('mascot.say.newLook'), 'party', { ms: 1600 });
      },
    });
  } else {
    applyLevel(to);
    play(to <= 2 ? 'overbudget' : 'think', t('mascot.say.levelDown', { level: to, name: levelName(to) }), 'warn', { ms: 3600 });
  }
}

function applyLevel(value) {
  level = value;
  for (const stage of allStages()) stage.render('idle', value);
  refreshFaces();
  notify();
}

function rate(value) {
  return new Intl.NumberFormat(getLocale(), { style: 'percent', maximumFractionDigits: 0 }).format(value);
}

/**
 * Evento do sistema → animação. Os eventos que mudam dados reavaliam a saúde financeira depois;
 * se o nível mudar, a troca acontece assim que a reação terminar.
 */
export async function mascotReact(event, payload = {}) {
  if (!isMascotEnabled()) {
    await noticeForEvent(event, payload);
    return;
  }
  try {
    switch (event) {
      case 'expenseCreated': {
        const overBudget = await findOverBudgetCategory(payload.categoryId, payload.date);
        if (overBudget) play('overbudget', t('mascot.say.overBudget', { category: overBudget }), 'alert');
        else if (payload.amountCents >= settings.highValueCents && settings.highValueCents > 0) {
          play('panic', t('mascot.say.highValue', { amount: centsToDisplay(payload.amountCents, getLocale()) }), 'alert');
        } else play('ok', t('mascot.say.expense'));
        break;
      }
      case 'incomeCreated':
        play('income', t('mascot.say.income'), 'money');
        break;
      case 'transactionPaid': {
        const remaining = await pendingExpensesInMonth(payload.date);
        if (remaining === 0) play('celebrate', t('mascot.say.allPaid'), 'party', { confetti: true, ms: 3200 });
        else play('celebrate', t('mascot.say.paid'), 'party', { confetti: true });
        break;
      }
      case 'transactionReceived':
        play('income', t('mascot.say.received'), 'money');
        break;
      case 'transactionUnpaid':
        play('think', t('mascot.say.unpaid'), '', { ms: 1800 });
        break;
      case 'invoicePaid':
        play('celebrate', t('mascot.say.invoicePaid'), 'party', { confetti: true });
        break;
      case 'transferCreated':
        if (payload.toAccountType === 'savings' || payload.toAccountType === 'investment') play('save', t('mascot.say.saved'), 'money');
        else play('ok', t('mascot.say.transfer'));
        break;
      case 'backupDone':
        play('save', t('mascot.say.backup'), 'money');
        break;
      // Investimentos ficam à parte: Ledi reage, mas a saúde financeira não muda por eles.
      case 'investmentCreated':
      case 'investmentContribution':
        play('save', t(event === 'investmentCreated' ? 'mascot.say.investmentCreated' : 'mascot.say.investmentContribution'), 'money');
        return;
      case 'investmentWithdrawal':
        play('ok', t('mascot.say.investmentWithdrawal'));
        return;
      case 'investmentValuation': {
        const amount = centsToDisplay(Math.abs(payload.gainCents || 0), getLocale());
        if (payload.gainCents > 0) play('income', t('mascot.say.investmentGain', { amount }), 'money');
        else if (payload.gainCents < 0) play('think', t('mascot.say.investmentLoss', { amount }), 'warn');
        else play('ok', t('mascot.say.investmentUpdated'));
        return;
      }
      case 'working':
        play('think', t('mascot.say.thinking'), '', { ms: payload.ms || 2200 });
        return;
      case 'error':
        play('error', payload.message ? t('mascot.say.errorWith', { message: payload.message }) : t('mascot.say.error'), 'alert');
        return;
      default:
        return;
    }
  } catch (error) {
    console.warn('Personagem: falha ao reagir a', event, error);
  }
  await refreshFinancialHealth().catch(() => {});
}

// Para ações que recarregam a página (restaurar cópia, apagar dados): reage depois do recarregamento.
export function mascotReactAfterReload(event) {
  writeJSON(sessionStore(), AFTER_RELOAD_KEY, event);
}

/* ------------------------------------------------------------------ */
/* Dados                                                               */
/* ------------------------------------------------------------------ */
async function loadMonthData(spaceId, yearMonth) {
  const [accounts, transactions, budgets, categories, invoices] = await Promise.all([
    listAccounts(spaceId),
    listTransactions(spaceId),
    listBudgets(spaceId),
    listCategories(spaceId),
    listInvoices(spaceId),
  ]);
  const { startDate, endDate } = monthRange(yearMonth);
  const monthTransactions = transactions.filter(
    (transaction) => transaction.date >= startDate && transaction.date <= endDate && transaction.status !== 'cancelled'
  );
  return { accounts, transactions, monthTransactions, budgets, categories, invoices };
}

function budgetRows(budgets, categories, monthTransactions) {
  return budgets.map((budget) => {
    const ids = new Set([budget.categoryId, ...categories.filter((category) => category.parentId === budget.categoryId).map((category) => category.id)]);
    const spent = monthTransactions
      .filter((transaction) => transaction.kind === 'expense' && ids.has(transaction.categoryId))
      .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
    return { budget, ids, progress: calculateBudgetProgress(budget.limitCents, spent) };
  });
}

function budgetsOverLimit(budgets, categories, monthTransactions) {
  return budgetRows(budgets, categories, monthTransactions).filter((row) => row.progress.isOverLimit);
}

// Despesa média mensal dos últimos 3 meses (inclui o atual), só entre os meses que tiveram despesa.
function averageMonthlyExpense(transactions, referenceMonth) {
  const months = [0, 1, 2].map((back) => addMonths(`${referenceMonth}-01`, -back).slice(0, 7));
  const totals = months.map((month) =>
    transactions
      .filter((transaction) => transaction.kind === 'expense' && transaction.status !== 'cancelled' && transaction.date.slice(0, 7) === month)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0)
  );
  const withExpense = totals.filter((total) => total > 0);
  return withExpense.length ? Math.round(withExpense.reduce((sum, total) => sum + total, 0) / withExpense.length) : 0;
}

// Contas da conta corrente com vencimento passado/hoje ainda pendentes (compras no cartão ficam de
// fora: o que vence é a fatura, contada à parte).
function dueSummary(transactions, invoices) {
  const today = todayISODate();
  const pending = transactions.filter((transaction) => transaction.kind === 'expense' && transaction.status === 'pending' && !transaction.creditCardId);
  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid' && invoice.totalCents > 0);
  return {
    overdue: pending.filter((transaction) => transaction.date < today).length + openInvoices.filter((invoice) => invoice.dueDate < today).length,
    dueToday: pending.filter((transaction) => transaction.date === today).length + openInvoices.filter((invoice) => invoice.dueDate === today).length,
  };
}

async function findOverBudgetCategory(categoryId, date) {
  if (!categoryId || !date) return null;
  const space = await getActiveSpace();
  if (!space) return null;
  const { budgets, categories, monthTransactions } = await loadMonthData(space.id, date.slice(0, 7));
  const over = budgetsOverLimit(budgets, categories, monthTransactions).find((row) => row.ids.has(categoryId));
  if (!over) return null;
  return categories.find((category) => category.id === over.budget.categoryId)?.name || '';
}

async function pendingExpensesInMonth(date) {
  const space = await getActiveSpace();
  if (!space || !date) return null;
  const { monthTransactions } = await loadMonthData(space.id, date.slice(0, 7));
  return monthTransactions.filter((transaction) => transaction.kind === 'expense' && transaction.status === 'pending' && !transaction.creditCardId).length;
}

/**
 * Recalcula a saúde financeira do mês corrente. Na primeira vez (ou ao trocar de espaço) só
 * aplica o nível; depois, uma mudança de nível fica esperando a animação atual terminar.
 * Chamadas simultâneas são enfileiradas (cada uma lê os dados já gravados pela anterior).
 */
let refreshChain = Promise.resolve();
export function refreshFinancialHealth() {
  const run = refreshChain.then(computeAndApplyHealth, computeAndApplyHealth);
  refreshChain = run.catch(() => null);
  return run;
}

async function computeAndApplyHealth() {
  if (!P) return null;
  const space = await getActiveSpace();
  if (!space) return null;
  const currentMonth = todayISODate().slice(0, 7);
  const { accounts, transactions, monthTransactions, budgets, categories, invoices } = await loadMonthData(space.id, currentMonth);
  const activeAccounts = accounts.filter((account) => !account.archived);
  const sum = (kind) => monthTransactions.filter((transaction) => transaction.kind === kind).reduce((total, transaction) => total + Math.abs(transaction.amountCents), 0);
  const due = dueSummary(transactions, invoices);
  const rows = budgetRows(budgets, categories, monthTransactions);

  const result = computeFinancialHealth({
    incomeCents: sum('income'),
    expenseCents: sum('expense'),
    projectedBalanceCents: calculateConsolidatedBalanceCents(activeAccounts.map((account) => account.balanceCents)),
    avgMonthlyExpenseCents: averageMonthlyExpense(transactions, currentMonth),
    overdueCount: due.overdue,
    budgetsTotal: rows.length,
    budgetsNear: rows.filter((row) => row.progress.isNearLimit).length,
    budgetsOver: rows.filter((row) => row.progress.isOverLimit).length,
  });
  health = { ...result, dueToday: due.dueToday, overdue: due.overdue };

  const levelKey = LEVEL_KEY_PREFIX + space.id;
  const storedLevel = readJSON(localStore(), levelKey, null);
  writeJSON(localStore(), levelKey, result.level);

  if (healthSpaceId !== space.id || storedLevel === null) {
    healthSpaceId = space.id;
    pendingLevelChange = null;
    if (level !== result.level) applyLevel(result.level);
  } else if (result.level !== level || pendingLevelChange) {
    const from = pendingLevelChange ? pendingLevelChange.from : level;
    pendingLevelChange = from === result.level ? null : { from, to: result.level };
    if (activeStage()?.state === 'idle' || activeStage()?.state === 'bored') onStageIdle();
  }
  notify();
  refreshOpenCard();
  return health;
}

function formatParams(params = {}) {
  const locale = getLocale();
  const formatted = { ...params };
  if (params.rate != null) formatted.rate = rate(params.rate);
  if (params.months != null) formatted.months = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(params.months);
  return formatted;
}

export function healthReasonText(reason) {
  return t(`mascot.reason.${reason.key}`, formatParams(reason.params));
}

/* ------------------------------------------------------------------ */
/* Palco no menu lateral                                               */
/* ------------------------------------------------------------------ */
// Ledi vive só no menu lateral (#sidebar-mascot, em index.html), ocupando o espaço livre abaixo
// dos itens. Com o menu recolhido (ou em telas estreitas) mostra só o rosto, ainda animado.
function buildDock() {
  dockElement = document.getElementById('sidebar-mascot');
  if (!dockElement) return;
  dockElement.innerHTML = `
    <div class="sidebar__mascot-stage" id="mascot-dock-stage"></div>
    <div class="mascot-card" id="mascot-card" role="dialog" aria-labelledby="mascot-card-title" hidden></div>
  `;
  dockStage = new Stage(dockElement.querySelector('#mascot-dock-stage'), { variant: 'sidebar' });
  attachStageInteractions(dockStage);

  dockStage.root.addEventListener('click', () => toggleCard());
  dockStage.root.setAttribute('role', 'button');
  dockStage.root.tabIndex = 0;
  dockStage.root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCard();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') toggleCard(false);
  });
  document.addEventListener('mousedown', (event) => {
    if (dockElement && !dockElement.contains(event.target)) toggleCard(false);
  });
}

function toggleCard(force) {
  const card = dockElement?.querySelector('#mascot-card');
  if (!card) return;
  const open = force ?? card.hidden;
  if (open) {
    card.innerHTML = healthCardHtml({ withControls: true });
    bindCardControls(card);
  }
  card.hidden = !open;
  dockElement.classList.toggle('is-card-open', open);
  if (open && activeStage() === dockStage && dockStage.state === 'idle') play('look', '', '', { ms: 2200 });
}

// Painel de saúde financeira: nível, pontuação e os quatro fatores com quanto cada um soma.
export function healthCardHtml({ withControls = false } = {}) {
  const current = health || { level, score: null, factors: [], alerts: [], tip: 'surplus' };
  const levelLabel = t('mascot.levelLabel', { level: current.level, name: escapeHtml(levelName(current.level)) });
  const meter = [1, 2, 3, 4, 5]
    .map((step) => `<span class="lm-meter__step ${step <= current.level ? 'is-on' : ''} lm-meter__step--${step}" title="${escapeHtml(levelName(step))}"></span>`)
    .join('');
  const alerts = current.alerts
    .map((alert) => `<li class="lm-reason lm-reason--bad">${iconSvg('alert', { size: 14 })}<span>${escapeHtml(healthReasonText(alert))}</span></li>`)
    .join('');
  const factors = current.factors
    .map(
      (factor) => `
        <li class="lm-factor lm-factor--${factor.tone}">
          <div class="lm-factor__head">
            <strong>${t(`mascot.factor.${factor.factor}`)}</strong>
            <span class="lm-factor__points">${factor.points}/${factor.max}</span>
          </div>
          <div class="lm-factor__bar"><i style="width:${Math.round((factor.points / factor.max) * 100)}%"></i></div>
          <small>${escapeHtml(healthReasonText(factor))}</small>
        </li>`
    )
    .join('');
  return `
    <div class="lm-health">
      <div class="lm-health__head">
        <small>${t('mascot.title')} · ${t('mascot.thisMonth')}</small>
        <div class="lm-health__title">
          <strong id="mascot-card-title" class="lm-level lm-level--${current.level}">${levelLabel}</strong>
          ${current.score != null ? `<span class="lm-score" title="${t('mascot.scoreHint')}">${t('mascot.score', { score: current.score })}</span>` : ''}
        </div>
      </div>
      <div class="lm-meter" role="img" aria-label="${levelLabel}">${meter}</div>
      ${alerts ? `<ul class="lm-reasons">${alerts}</ul>` : ''}
      <ul class="lm-factors">${factors}</ul>
      <p class="lm-tip">${iconSvg('sparkles', { size: 14 })}<span>${t(`mascot.tip.${current.tip}`)}</span></p>
      ${
        withControls
          ? `<div class="lm-health__controls">
              <div class="lm-segment" role="radiogroup" aria-label="${t('settings.mascot.gender')}">
                ${['m', 'f'].map((gender) => `<button type="button" role="radio" aria-checked="${settings.gender === gender}" class="${settings.gender === gender ? 'is-on' : ''}" data-mascot-gender="${gender}">${t(`mascot.gender.${gender}`)}</button>`).join('')}
              </div>
              <a href="#/settings" class="lm-link">${t('mascot.card.settings')}</a>
            </div>`
          : ''
      }
    </div>
  `;
}

// Com o painel aberto, ele acompanha cada recálculo.
function refreshOpenCard() {
  const card = dockElement?.querySelector('#mascot-card');
  if (!card || card.hidden) return;
  card.innerHTML = healthCardHtml({ withControls: true });
  bindCardControls(card);
}

function bindCardControls(root) {
  for (const button of root.querySelectorAll('[data-mascot-gender]')) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      updateMascotSettings({ gender: button.dataset.mascotGender });
      root.innerHTML = healthCardHtml({ withControls: true });
      bindCardControls(root);
      play('wave', t('mascot.say.hello'));
    });
  }
  root.querySelector('.lm-link')?.addEventListener('click', () => toggleCard(false));
}

function syncDock() {
  if (!dockElement) return;
  dockElement.hidden = !isMascotEnabled();
  document.getElementById('app-nav')?.classList.toggle('has-mascot', isMascotEnabled());
  dockStage.root.title = t('mascot.open');
  dockStage.root.setAttribute('aria-label', t('mascot.open'));
}

const faceTargets = new Set();
// Coloca o rosto do personagem num elemento (ex.: avatar do menu). Devolve false se desligado.
export function renderMascotFace(element) {
  if (!element) return false;
  if (!isMascotEnabled()) {
    faceTargets.delete(element);
    element.classList.remove('has-mascot');
    return false;
  }
  faceTargets.add(element);
  element.innerHTML = mascotFaceHtml();
  element.classList.add('has-mascot');
  element.title = t('mascot.levelLabel', { level, name: levelName() });
  return true;
}

function refreshFaces() {
  for (const element of faceTargets) {
    if (!element.isConnected || !isMascotEnabled()) {
      faceTargets.delete(element);
      continue;
    }
    element.innerHTML = mascotFaceHtml();
    element.title = t('mascot.levelLabel', { level, name: levelName() });
  }
  if (dockElement) syncDock();
}

/* ------------------------------------------------------------------ */
/* Interações: olhar, ociosidade, confete                              */
/* ------------------------------------------------------------------ */
function attachStageInteractions(stage) {
  stage.root.addEventListener('mouseenter', () => {
    if (stage.state === 'idle' && stage === activeStage()) play('wave', '', '', { ms: 1800 });
  });
}

function followCursor(event) {
  const stage = activeStage();
  if (!stage?.svg || stage.state !== 'idle') return;
  const box = stage.svg.getBoundingClientRect();
  if (!box.width) return;
  const centerX = box.left + box.width / 2;
  const centerY = box.top + box.height * 0.42;
  const dx = event.clientX - centerX;
  const dy = event.clientY - centerY;
  const distance = Math.hypot(dx, dy) || 1;
  const reach = Math.min(1, distance / 240);
  stage.root.style.setProperty('--px', `${((dx / distance) * 2.2 * reach).toFixed(2)}px`);
  stage.root.style.setProperty('--py', `${((dy / distance) * 2 * reach).toFixed(2)}px`);
}

function resetIdle() {
  clearTimeout(idleTimer);
  const stage = activeStage();
  if (stage?.state === 'bored') stage.set('idle');
  idleTimer = setTimeout(() => {
    const current = activeStage();
    if (isMascotEnabled() && current?.state === 'idle') current.set('bored', { message: t('mascot.say.bored') });
  }, IDLE_TIMEOUT_MS);
}

function burstConfetti() {
  if (prefersReducedMotion()) return;
  const layer = document.createElement('div');
  layer.className = 'lm-confetti-layer';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#F1C40F', '#2ECC71', '#3498DB', '#E74C3C', '#9B59B6', '#2d5bff', '#7c4dff'];
  for (let index = 0; index < 70; index += 1) {
    const piece = document.createElement('i');
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[index % colors.length];
    piece.style.setProperty('--dx', `${Math.random() * 160 - 80}px`);
    piece.style.setProperty('--rot', `${Math.random() * 900 - 450}deg`);
    piece.style.setProperty('--t', `${1.6 + Math.random() * 1.4}s`);
    piece.style.animationDelay = `${Math.random() * 0.4}s`;
    layer.appendChild(piece);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 3600);
}

function greetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return 'mascot.say.greeting.morning';
  if (hour < 18) return 'mascot.say.greeting.afternoon';
  return 'mascot.say.greeting.evening';
}

function welcome() {
  if (!settings.gender && settings.enabled) {
    openGenderChooser();
    return;
  }
  const afterReload = readJSON(sessionStore(), AFTER_RELOAD_KEY, null);
  if (afterReload) {
    try {
      sessionStore()?.removeItem(AFTER_RELOAD_KEY);
    } catch {
      // Ignora.
    }
    if (!isMascotEnabled()) showNotice(t(afterReload === 'dataRestored' ? 'notice.restored' : 'notice.cleared'), 'success', { closeLabel: t('notice.close') });
    else if (afterReload === 'dataRestored') play('celebrate', t('mascot.say.restored'), 'party', { confetti: true });
    else if (afterReload === 'dataDeleted') play('empty', t('mascot.say.cleared'), '', { ms: 3600 });
    return;
  }
  if (sessionStore()?.getItem(GREETED_KEY) === '1') return;
  try {
    sessionStore()?.setItem(GREETED_KEY, '1');
  } catch {
    // Ignora.
  }
  const warnDue = () => {
    if (health?.dueToday > 0) play('late', t('mascot.say.dueToday', { count: health.dueToday }), 'warn');
    else if (health?.overdue > 0) play('late', t('mascot.say.overdue', { count: health.overdue }), 'warn');
    else {
      activeStage()?.set('idle');
      onStageIdle();
    }
  };
  // Com nome informado em Configurações, Ledi cumprimenta pelo nome.
  getActiveSpace()
    .then((space) => spaceDisplayName(space))
    .catch(() => '')
    .then((name) => play('wave', name ? t(greetingKey().replace('.greeting.', '.greetingName.'), { name }) : t(greetingKey()), '', { after: warnDue }));
}

/* ------------------------------------------------------------------ */
/* Mensagens da aplicação → fala de Ledi                               */
/* ------------------------------------------------------------------ */
// Sem precisar mexer em cada tela: observa o documento e, quando aparece
//   • um erro de formulário (.form-error visível) → Ledi coça a cabeça e fala o erro;
//   • um aviso da tela (.form-note só com texto, fora de janelas) → Ledi olha o relógio e avisa;
// o texto em linha é escondido (.is-spoken) para a mensagem existir só como fala de Ledi.
// alert() também vira fala. Com Ledi desligada, nada muda: as mensagens aparecem como antes.
function isTextOnlyNote(element) {
  return !element.querySelector('input, select, textarea, button, a, label');
}

function speakElement(element, kind) {
  const text = element.textContent.trim();
  if (!text) return;
  // Ledi desligada: avisos fixos da tela (ex.: "cadastre uma conta antes") continuam no lugar,
  // só que no estilo de alerta (amarelo/laranja); erros de formulário viram aviso no topo dele.
  if (!isMascotEnabled() && kind === 'warning') {
    element.classList.remove('is-spoken');
    element.classList.add('app-notice-style', 'app-notice-style--warning');
    return;
  }
  element.classList.remove('app-notice-style', 'app-notice-style--warning');
  if (mascotMessage(text, kind, element)) element.classList.add('is-spoken');
}

function watchAppMessages() {
  const pending = new Map();
  let scheduled = false;
  const queue = (element, kind) => {
    pending.set(element, kind);
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      for (const [item, itemKind] of pending) {
        if (item.isConnected && !item.hidden) speakElement(item, itemKind);
      }
      pending.clear();
    });
  };
  const inspect = (node) => {
    if (!(node instanceof Element)) return;
    const candidates = [node, ...node.querySelectorAll('.form-error, .form-note')];
    for (const element of candidates) {
      if (element.matches('.form-error')) queue(element, 'error');
      else if (element.matches('.form-note') && !element.closest('.modal') && isTextOnlyNote(element)) queue(element, 'warning');
    }
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target.matches?.('.form-error')) queue(record.target, 'error');
        continue;
      }
      const host = record.target instanceof Element ? record.target : record.target.parentElement;
      const errorHost = host?.closest('.form-error');
      if (errorHost) queue(errorHost, 'error');
      for (const node of record.addedNodes) inspect(node);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });

  const nativeAlert = window.alert.bind(window);
  window.alert = (message) => {
    if (!mascotMessage(String(message ?? ''), 'info')) nativeAlert(message);
  };
}

/* ------------------------------------------------------------------ */
/* Primeiro acesso: Ledi se apresenta e a pessoa escolhe o visual      */
/* ------------------------------------------------------------------ */
export function openGenderChooser() {
  if (!P || document.getElementById('mascot-chooser')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay lm-chooser';
  overlay.id = 'mascot-chooser';
  overlay.innerHTML = `
    <div class="modal modal--md lm-chooser__box" role="dialog" aria-modal="true" aria-labelledby="mascot-chooser-title">
      <div class="modal__body">
        <h2 class="lm-chooser__title" id="mascot-chooser-title">${t('mascot.chooser.title', { name: MASCOT_NAME })}</h2>
        <p class="lm-chooser__text">${t('mascot.chooser.text', { name: MASCOT_NAME })}</p>
        <div class="lm-chooser__name">
          <button type="button" class="lm-chooser__name-link" data-chooser-name-link>${t('mascot.chooser.nameLink')}</button>
          <div class="lm-chooser__name-field" data-chooser-name-field hidden>
            <label for="mascot-chooser-name">${t('mascot.chooser.nameLabel')}</label>
            <input id="mascot-chooser-name" type="text" maxlength="60" autocomplete="given-name" placeholder="${t('settings.profile.namePlaceholder')}" />
          </div>
        </div>
        <div class="lm-chooser__options" role="group" aria-label="${t('settings.mascot.gender')}">
          ${['m', 'f']
            .map(
              (gender) => `
            <button type="button" class="lm-chooser__option" data-choose-gender="${gender}">
              <span class="lm lm-chooser__art">${P.svg(gender, 3, 'wave')}</span>
              <strong>${MASCOT_NAME}</strong>
              <small>${t(`mascot.gender.${gender}`)}</small>
            </button>`
            )
            .join('')}
        </div>
        <p class="lm-chooser__note">${t('mascot.chooser.note')}</p>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-choose-gender]')?.focus();

  // "Quer me dizer como prefere ser chamado(a)?" → abre o campo de nome ali mesmo (opcional).
  const nameInput = overlay.querySelector('#mascot-chooser-name');
  overlay.querySelector('[data-chooser-name-link]').addEventListener('click', (event) => {
    event.currentTarget.hidden = true;
    overlay.querySelector('[data-chooser-name-field]').hidden = false;
    nameInput.focus();
  });
  nameInput.addEventListener('keydown', (event) => {
    // Enter leva à escolha do visual (o nome é salvo junto com ela).
    if (event.key === 'Enter') {
      event.preventDefault();
      overlay.querySelector('[data-choose-gender]')?.focus();
    }
  });

  for (const button of overlay.querySelectorAll('[data-choose-gender]')) {
    button.addEventListener('click', async () => {
      const userName = nameInput.value.trim();
      if (userName) await updateOwnerName(userName).catch(() => null);
      updateMascotSettings({ gender: button.dataset.chooseGender, enabled: true });
      try {
        sessionStore()?.setItem(GREETED_KEY, '1');
      } catch {
        // Ignora.
      }
      overlay.classList.add('is-closing');
      // Redesenha a tela atual (a Visão geral passa a mostrar o cartão de Ledi) antes de acenar.
      window.dispatchEvent(new HashChangeEvent('hashchange'));
      setTimeout(() => {
        overlay.remove();
        play('wave', userName ? t('mascot.say.introWithName', { user: userName, name: MASCOT_NAME }) : t('mascot.say.intro', { name: MASCOT_NAME }), '', {
          ms: 3400,
          after: () => play('look', t('mascot.say.clickMe'), '', { ms: 3600 }),
        });
      }, 450);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */
export async function initMascot() {
  if (!P || initialized) return;
  initialized = true;
  injectAssets();
  buildDock();
  syncDock();

  let frame = 0;
  document.addEventListener('pointermove', (event) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      followCursor(event);
    });
  });
  for (const type of ['pointerdown', 'keydown', 'wheel', 'pointermove']) document.addEventListener(type, resetIdle, { passive: true });
  resetIdle();

  // Ao trocar de tela, um palco da tela anterior saiu do documento: o companheiro reaparece.
  window.addEventListener('hashchange', () => syncDock());
  // Erro não tratado em qualquer ação → o personagem coça a cabeça.
  window.addEventListener('unhandledrejection', () => mascotReact('error'));

  watchAppMessages();
  // O balão acompanha Ledi quando a janela muda de tamanho ou o menu é recolhido/expandido.
  const reposition = () => activeStage()?.positionBubble();
  window.addEventListener('resize', reposition);
  new MutationObserver(() => {
    reposition();
    setTimeout(reposition, 320); // depois da transição de largura do menu
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // Qualquer gravação que mexa em saldo, previsto, limites ou faturas → recalcula a saúde
  // financeira (agrupando gravações em sequência, como as parcelas de uma série).
  const HEALTH_STORES = new Set(['transactions', 'transactionSeries', 'accounts', 'budgets', 'invoices', 'transfers', 'categories', 'creditCards']);
  let dataTimer = null;
  onDataChange((storeNames) => {
    if (!storeNames.some((name) => HEALTH_STORES.has(name))) return;
    clearTimeout(dataTimer);
    dataTimer = setTimeout(() => refreshFinancialHealth().catch(() => {}), 350);
  });

  await refreshFinancialHealth().catch((error) => console.warn('Personagem: saúde financeira indisponível', error));
  setTimeout(welcome, 700);
}

export function refreshMascotTexts() {
  if (dockElement) syncDock();
  refreshFaces();
}

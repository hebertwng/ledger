import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listAccounts } from '../../services/accountRepository.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listCreditCards } from '../../services/creditCardRepository.js';
import { listTransactions, filterTransactions, ensureOccurrencesThrough } from '../../services/transactionRepository.js';
import { groupByCategory, groupByAccount, groupByCard, topExpenses, buildMonthlySeries } from '../../services/analyticsRepository.js';
import { centsToDisplay } from '../../utils/currency.js';
import { todayISODate, monthRange, formatDateDisplay, formatReferenceMonth } from '../../utils/dates.js';
import { addMonths } from '../../utils/recurrence.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { categoryIconHtml, institutionIconHtml, colorFromText } from '../../utils/ui.js';
import { downloadCsv } from '../../utils/csv.js';
import { mascotMessage } from '../../core/mascot.js';
import { renderInvestmentsReport } from '../investments/index.js';

// Expandido a partir de um clique no gráfico: rola a listagem até a categoria aberta.
let scrollToExpanded = false;

// Relatórios em abas, todos sobre o mês escolhido no topo (e, quando faz sentido, os 12 meses
// até ele). Filtro de origem (conta ou cartão) vale para todas as abas.
const TABS = ['categories', 'cashflow', 'sources', 'history', 'investments'];
let state = { tab: 'categories', month: todayISODate().slice(0, 7), kind: 'expense', chart: 'donut', origin: '', includePending: true, expanded: null };
const charts = {};

function monthTitle(yearMonth, locale) {
  const [year, month] = yearMonth.split('-').map(Number);
  const name = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long' }).format(new Date(Date.UTC(year, month - 1, 1)));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChart(id, config) {
  charts[id]?.destroy();
  delete charts[id];
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  const text = cssVar('--color-text-soft');
  const grid = cssVar('--color-border-soft');
  window.Chart.defaults.color = text;
  window.Chart.defaults.font.family = cssVar('--font-family') || 'Inter, sans-serif';
  const scales = config.options?.scales;
  if (scales) {
    for (const axis of Object.values(scales)) {
      axis.grid = { color: grid, ...(axis.grid || {}) };
      axis.border = { display: false };
    }
  }
  charts[id] = new window.Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, ...config.options } });
}

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const { startDate, endDate } = monthRange(state.month);
  if (activeSpace) await ensureOccurrencesThrough(activeSpace.id, endDate);
  const [accounts, categories, cards, transactions] = activeSpace
    ? await Promise.all([listAccounts(activeSpace.id), listCategories(activeSpace.id), listCreditCards(activeSpace.id), listTransactions(activeSpace.id)])
    : [[], [], [], []];

  const locale = getLocale();
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  const [originType, originId] = state.origin ? state.origin.split(':') : [];
  const originFilters = { accountId: originType === 'account' ? originId : undefined, creditCardId: originType === 'card' ? originId : undefined };
  const active = transactions.filter((transaction) => transaction.status !== 'cancelled' && (state.includePending || transaction.status !== 'pending'));
  const scoped = filterTransactions(active, originFilters);
  const periodTransactions = filterTransactions(scoped, { startDate, endDate });
  const context = { container, locale, categories, categoriesById, accountsById, cardsById, accounts, cards, scoped, periodTransactions };

  container.innerHTML = `
    <section class="view rp">
      <div class="rp-toolbar">
        <h1>${t('modules.reports.title')}</h1>
        <div class="month-nav" role="group" aria-label="${t('transactions.monthNav.label')}">
          <button type="button" class="icon-button" id="rp-prev" title="${t('transactions.monthNav.previous')}">${iconSvg('chevronLeft')}</button>
          <button type="button" class="month-nav__label" id="rp-today" title="${t('transactions.monthNav.today')}">${monthTitle(state.month, locale)}</button>
          <button type="button" class="icon-button" id="rp-next" title="${t('transactions.monthNav.next')}">${iconSvg('chevronRight')}</button>
        </div>
        <div class="rp-toolbar__end">
          <label class="filter-chip">
            <span class="visually-hidden">${t('transactions.filters.origin')}</span>
            <select id="rp-origin" class="${state.origin ? 'is-set' : ''}">
              <option value="">${t('reports.allSources')}</option>
              <optgroup label="${t('nav.accounts')}">${accounts.map((account) => `<option value="account:${account.id}" ${state.origin === `account:${account.id}` ? 'selected' : ''}>${escapeHtml(account.name)}</option>`).join('')}</optgroup>
              ${cards.length ? `<optgroup label="${t('nav.creditCards')}">${cards.map((card) => `<option value="card:${card.id}" ${state.origin === `card:${card.id}` ? 'selected' : ''}>${escapeHtml(card.name)}</option>`).join('')}</optgroup>` : ''}
            </select>
          </label>
          <label class="switch" title="${t('reports.includePendingHint')}"><input type="checkbox" id="rp-pending" ${state.includePending ? 'checked' : ''} /><span class="switch__track"></span>${t('reports.includePending')}</label>
          <button type="button" class="icon-button icon-button--outline" id="rp-print" title="${t('reports.print')}" aria-label="${t('reports.print')}">${iconSvg('invoices', { size: 18 })}</button>
        </div>
      </div>

      <div class="tabs rp-tabs" role="tablist">
        ${TABS.map((tab) => `<button type="button" class="tabs__tab ${state.tab === tab ? 'is-active' : ''}" data-tab="${tab}" role="tab" aria-selected="${state.tab === tab}">${t(`reports.tab.${tab}`)}</button>`).join('')}
      </div>

      <div id="rp-body"></div>
    </section>
  `;

  const shift = (delta) => {
    state.month = addMonths(`${state.month}-01`, delta).slice(0, 7);
    state.expanded = null;
    render(container);
  };
  container.querySelector('#rp-prev').addEventListener('click', () => shift(-1));
  container.querySelector('#rp-next').addEventListener('click', () => shift(1));
  container.querySelector('#rp-today').addEventListener('click', () => {
    state.month = todayISODate().slice(0, 7);
    render(container);
  });
  container.querySelector('#rp-origin').addEventListener('change', (event) => {
    state.origin = event.target.value;
    render(container);
  });
  container.querySelector('#rp-pending').addEventListener('change', (event) => {
    state.includePending = event.target.checked;
    render(container);
  });
  container.querySelector('#rp-print').addEventListener('click', () => window.print());
  for (const tab of container.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      state.tab = tab.dataset.tab;
      render(container);
    });
  }

  const body = container.querySelector('#rp-body');
  if (state.tab === 'categories') renderCategoriesTab(body, context);
  else if (state.tab === 'cashflow') renderCashflowTab(body, context);
  else if (state.tab === 'sources') renderSourcesTab(body, context);
  // Investimentos: evolução por período (à parte do mês escolhido no topo e dos lançamentos).
  else if (state.tab === 'investments') renderInvestmentsReport(body);
  else renderHistoryTab(body, context);
}

// ---------- Categorias ----------
function renderCategoriesTab(body, context) {
  const { periodTransactions, categoriesById, locale } = context;
  const buckets = groupByCategory(periodTransactions, categoriesById, state.kind, { rollup: true });
  const total = buckets.reduce((sum, bucket) => sum + bucket.totalCents, 0);
  const colorOf = (bucket) => categoriesById.get(bucket.categoryId)?.color || colorFromText(bucket.name || '');

  body.innerHTML = `
    <div class="rp-subbar">
      <div class="segmented" style="max-width:280px">
        <button type="button" class="segmented__option ${state.kind === 'expense' ? 'is-active' : ''}" data-kind="expense">${t('categories.tab.expense')}</button>
        <button type="button" class="segmented__option ${state.kind === 'income' ? 'is-active' : ''}" data-kind="income">${t('categories.tab.income')}</button>
      </div>
      <div class="rp-subbar__end">
        <button type="button" class="icon-button icon-button--outline ${state.chart === 'donut' ? 'is-active' : ''}" data-chart="donut" title="${t('reports.chart.donut')}">${iconSvg('budgets', { size: 18 })}</button>
        <button type="button" class="icon-button icon-button--outline ${state.chart === 'bars' ? 'is-active' : ''}" data-chart="bars" title="${t('reports.chart.bars')}">${iconSvg('reports', { size: 18 })}</button>
        <button type="button" class="link-button" id="rp-csv">${iconSvg('arrowDown', { size: 14 })} CSV</button>
      </div>
    </div>
    ${
      buckets.length === 0
        ? `<div class="empty-state"><span class="empty-state__icon">${iconSvg('reports', { size: 22 })}</span><p>${t('reports.noData')}</p></div>`
        : `
          <div class="rp-split">
            <div class="rp-chart ${state.chart === 'bars' ? 'rp-chart--bars' : ''}">
              <canvas id="rp-categories-chart"></canvas>
              ${state.chart === 'donut' ? `<div class="rp-chart__center"><small>${t(state.kind === 'expense' ? 'reports.totalExpense' : 'reports.totalIncome')}</small><strong>${centsToDisplay(total, locale)}</strong></div>` : ''}
            </div>
            <ul class="rp-rank">
              ${buckets
                .map((bucket) => {
                  const category = bucket.categoryId ? categoriesById.get(bucket.categoryId) : null;
                  const share = total > 0 ? bucket.totalCents / total : 0;
                  const children = state.expanded === (bucket.categoryId || 'none') ? subcategoryRows(context, bucket) : '';
                  return `
                    <li>
                      <button type="button" class="rp-rank__row" data-expand="${bucket.categoryId || 'none'}" aria-expanded="${Boolean(children)}">
                        ${categoryIconHtml(category || { name: bucket.name || '?' }, { size: 34 })}
                        <span class="rp-rank__main">
                          <span class="rp-rank__title">${escapeHtml(bucket.name || t('transactions.form.categoryNone'))}</span>
                          <span class="rp-rank__bar"><span style="width:${Math.max(2, Math.round(share * 100))}%;background:${escapeHtml(colorOf(bucket))}"></span></span>
                        </span>
                        <span class="rp-rank__value">${centsToDisplay(bucket.totalCents, locale)}<small>${(share * 100).toFixed(1).replace('.', locale === 'pt-BR' ? ',' : '.')}%</small></span>
                        ${iconSvg(children ? 'chevronUp' : 'chevronDown', { size: 16 })}
                      </button>
                      ${children}
                    </li>`;
                })
                .join('')}
            </ul>
          </div>
        `
    }
  `;

  for (const button of body.querySelectorAll('[data-kind]')) {
    button.addEventListener('click', () => {
      state.kind = button.dataset.kind;
      state.expanded = null;
      render(context.container);
    });
  }
  for (const button of body.querySelectorAll('[data-chart]')) {
    button.addEventListener('click', () => {
      state.chart = button.dataset.chart;
      render(context.container);
    });
  }
  for (const button of body.querySelectorAll('[data-expand]')) {
    button.addEventListener('click', () => {
      state.expanded = state.expanded === button.dataset.expand ? null : button.dataset.expand;
      render(context.container);
    });
  }
  body.querySelector('#rp-csv').addEventListener('click', () => {
    const detailed = groupByCategory(context.periodTransactions, categoriesById, state.kind, { rollup: false });
    downloadCsv(`${state.kind === 'expense' ? 'despesas' : 'receitas'}-por-categoria-${state.month}.csv`, [t('reports.column.category'), t('reports.column.total')], detailed.map((bucket) => [bucket.name || t('transactions.form.categoryNone'), (bucket.totalCents / 100).toFixed(2)]));
  });

  // Depois de expandir pelo gráfico, traz a linha aberta para a vista.
  if (scrollToExpanded && state.expanded) {
    body.querySelector(`[data-expand="${CSS.escape(state.expanded)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  scrollToExpanded = false;

  if (!buckets.length) return;
  const labels = buckets.map((bucket) => bucket.name || t('transactions.form.categoryNone'));
  const values = buckets.map((bucket) => bucket.totalCents / 100);
  const colors = buckets.map(colorOf);
  const money = (value) => centsToDisplay(Math.round(value * 100), locale);

  // Clique numa fatia/barra: se a categoria tem subcategorias com valores, expande (ou recolhe)
  // a listagem delas ao lado; sem subcategorias, Ledi avisa.
  const hasSubcategories = (bucket) =>
    Boolean(bucket.categoryId) &&
    context.periodTransactions.some((transaction) => transaction.kind === state.kind && categoriesById.get(transaction.categoryId)?.parentId === bucket.categoryId);
  const interaction = {
    onClick: (_event, elements) => {
      const bucket = elements?.length ? buckets[elements[0].index] : null;
      if (!bucket) return;
      if (!hasSubcategories(bucket)) {
        mascotMessage(t('reports.noSubcategories', { category: bucket.name || t('transactions.form.categoryNone') }), 'info');
        return;
      }
      const key = bucket.categoryId;
      state.expanded = state.expanded === key ? null : key;
      scrollToExpanded = true;
      render(context.container);
    },
    onHover: (event, elements) => {
      const target = event.native?.target;
      if (target) target.style.cursor = elements?.length ? 'pointer' : 'default';
    },
  };
  // A fatia da categoria expandida fica destacada (afastada do centro).
  const offsets = buckets.map((bucket) => ((bucket.categoryId || 'none') === state.expanded ? 14 : 0));

  if (state.chart === 'donut') {
    drawChart('rp-categories-chart', {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: cssVar('--color-surface'), offset: offsets, hoverOffset: 8 }] },
      options: { ...interaction, layout: { padding: 12 }, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => ` ${item.label}: ${money(item.raw)}` } } } },
    });
  } else {
    drawChart('rp-categories-chart', {
      type: 'bar',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 8, maxBarThickness: 26 }] },
      options: {
        ...interaction,
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => ` ${money(item.raw)}` } } },
        scales: { x: { ticks: { callback: (value) => money(value) } }, y: { grid: { display: false } } },
      },
    });
  }
}

function subcategoryRows(context, bucket) {
  const { periodTransactions, categoriesById, locale } = context;
  const detailed = groupByCategory(periodTransactions, categoriesById, state.kind, { rollup: false }).filter((item) => {
    if (!bucket.categoryId) return !item.categoryId;
    const category = item.categoryId ? categoriesById.get(item.categoryId) : null;
    return item.categoryId === bucket.categoryId || category?.parentId === bucket.categoryId;
  });
  return `
    <ul class="rp-rank__children">
      ${detailed
        .map((item) => {
          const category = item.categoryId ? categoriesById.get(item.categoryId) : null;
          const label = item.categoryId === bucket.categoryId ? t('reports.directInCategory') : category?.name || item.name || t('transactions.form.categoryNone');
          return `<li><span>${escapeHtml(label)}</span><span>${centsToDisplay(item.totalCents, locale)}</span></li>`;
        })
        .join('')}
    </ul>
  `;
}

// ---------- Entradas × Saídas ----------
function renderCashflowTab(body, context) {
  const { scoped, locale } = context;
  const { endDate } = monthRange(state.month);
  const series = buildMonthlySeries(scoped, { monthsCount: 12, referenceDate: endDate });
  let accumulated = 0;
  const accumulatedSeries = series.map((entry) => (accumulated += entry.resultCents));
  const current = series[series.length - 1];
  const income12 = series.reduce((sum, entry) => sum + entry.incomeCents, 0);
  const expense12 = series.reduce((sum, entry) => sum + entry.expenseCents, 0);

  body.innerHTML = `
    <div class="rp-kpis">
      <div class="rp-kpi"><small>${t('reports.kpi.income', { month: formatReferenceMonth(state.month, locale) })}</small><strong class="amount--income">${centsToDisplay(current.incomeCents, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('reports.kpi.expense', { month: formatReferenceMonth(state.month, locale) })}</small><strong class="amount--expense">${centsToDisplay(current.expenseCents, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('reports.kpi.result')}</small><strong class="${current.resultCents < 0 ? 'amount--expense' : 'amount--income'}">${centsToDisplay(current.resultCents, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('reports.kpi.result12')}</small><strong class="${income12 - expense12 < 0 ? 'amount--expense' : 'amount--income'}">${centsToDisplay(income12 - expense12, locale)}</strong></div>
    </div>
    <div class="rp-chart rp-chart--wide"><canvas id="rp-cashflow-chart"></canvas></div>
    <table class="data-table rp-table">
      <thead><tr><th>${t('reports.column.month')}</th><th>${t('reports.column.income')}</th><th>${t('reports.column.expense')}</th><th>${t('reports.column.result')}</th><th>${t('reports.column.accumulated')}</th></tr></thead>
      <tbody>
        ${series
          .map(
            (entry, index) => `
              <tr class="${entry.month === state.month ? 'is-current' : ''}">
                <td>${formatReferenceMonth(entry.month, locale)}</td>
                <td class="table__value amount--income">${centsToDisplay(entry.incomeCents, locale)}</td>
                <td class="table__value amount--expense">${centsToDisplay(entry.expenseCents, locale)}</td>
                <td class="table__value ${entry.resultCents < 0 ? 'amount--expense' : ''}">${centsToDisplay(entry.resultCents, locale)}</td>
                <td class="table__value ${accumulatedSeries[index] < 0 ? 'amount--expense' : ''}">${centsToDisplay(accumulatedSeries[index], locale)}</td>
              </tr>`
          )
          .reverse()
          .join('')}
      </tbody>
    </table>
  `;

  const money = (value) => centsToDisplay(Math.round(value * 100), locale);
  drawChart('rp-cashflow-chart', {
    data: {
      labels: series.map((entry) => formatReferenceMonth(entry.month, locale)),
      datasets: [
        { type: 'bar', label: t('reports.column.income'), data: series.map((entry) => entry.incomeCents / 100), backgroundColor: cssVar('--color-success'), borderRadius: 6, maxBarThickness: 22 },
        { type: 'bar', label: t('reports.column.expense'), data: series.map((entry) => entry.expenseCents / 100), backgroundColor: cssVar('--color-danger'), borderRadius: 6, maxBarThickness: 22 },
        { type: 'line', label: t('reports.column.accumulated'), data: accumulatedSeries.map((value) => value / 100), borderColor: cssVar('--color-text'), backgroundColor: cssVar('--color-text'), tension: 0.3, pointRadius: 3 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}: ${money(item.raw)}` } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: (value) => money(value) } } },
    },
  });
}

// ---------- Contas e cartões ----------
function renderSourcesTab(body, context) {
  const { periodTransactions, accountsById, cardsById, locale } = context;
  const byAccount = groupByAccount(periodTransactions, accountsById);
  const byCard = groupByCard(periodTransactions, cardsById);
  const block = (title, buckets, lookup, fallbackIcon) => {
    const max = Math.max(1, ...buckets.map((bucket) => bucket.totalCents));
    return `
      <article class="rp-block">
        <h2>${title}</h2>
        ${
          buckets.length === 0
            ? `<p class="empty-state__note">${t('reports.noData')}</p>`
            : `<ul class="rp-rank">${buckets
                .map((bucket) => {
                  const item = lookup.get(bucket.accountId || bucket.creditCardId || bucket.id) || { name: bucket.name };
                  return `
                    <li><div class="rp-rank__row">
                      ${institutionIconHtml(item, { fallbackIcon, size: 34 })}
                      <span class="rp-rank__main">
                        <span class="rp-rank__title">${escapeHtml(bucket.name || '-')}</span>
                        <span class="rp-rank__bar"><span style="width:${Math.max(2, Math.round((bucket.totalCents / max) * 100))}%;background:var(--color-danger)"></span></span>
                      </span>
                      <span class="rp-rank__value">${centsToDisplay(bucket.totalCents, locale)}</span>
                    </div></li>`;
                })
                .join('')}</ul>`
        }
      </article>
    `;
  };
  body.innerHTML = `
    <div class="rp-two">
      ${block(t('reports.section.byAccount'), byAccount, accountsById, 'accounts')}
      ${block(t('reports.section.byCard'), byCard, cardsById, 'creditCards')}
    </div>
  `;
}

// ---------- Movimentações ----------
function renderHistoryTab(body, context) {
  const { periodTransactions, categoriesById, accountsById, cardsById, locale } = context;
  const top = topExpenses(periodTransactions, 5);
  const sourceName = (transaction) => (transaction.accountId ? accountsById.get(transaction.accountId)?.name : cardsById.get(transaction.creditCardId)?.name) || '-';
  const categoryName = (transaction) => {
    const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
    const parent = category?.parentId ? categoriesById.get(category.parentId) : null;
    return category ? (parent ? `${parent.name} › ${category.name}` : category.name) : t('transactions.form.categoryNone');
  };
  const sorted = [...periodTransactions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  body.innerHTML = `
    ${
      top.length
        ? `<p class="section-title" style="margin-top:8px">${t('reports.section.topExpenses')}</p>
           <div class="rp-top">${top
             .map((transaction) => {
               const category = transaction.categoryId ? categoriesById.get(transaction.categoryId) : null;
               const parent = category?.parentId ? categoriesById.get(category.parentId) : null;
               return `<div class="rp-top__item">${categoryIconHtml(category, { parent, size: 32 })}<span><strong>${centsToDisplay(Math.abs(transaction.amountCents), locale)}</strong><small>${escapeHtml(transaction.description || '')}</small></span></div>`;
             })
             .join('')}</div>`
        : ''
    }
    <div class="rp-subbar" style="margin-top:20px">
      <p class="section-title" style="margin:0">${t('reports.section.history')} (${sorted.length})</p>
      <button type="button" class="link-button" id="rp-history-csv" ${sorted.length ? '' : 'disabled'}>${iconSvg('arrowDown', { size: 14 })} ${t('reports.exportCsv')}</button>
    </div>
    ${
      sorted.length === 0
        ? `<div class="empty-state"><p>${t('reports.noData')}</p></div>`
        : `<table class="data-table rp-table">
            <thead><tr><th>${t('transactions.column.date')}</th><th>${t('transactions.column.description')}</th><th>${t('reports.column.category')}</th><th>${t('transactions.column.account')}</th><th style="text-align:right">${t('transactions.column.amount')}</th></tr></thead>
            <tbody>${sorted
              .map(
                (transaction) => `
                  <tr>
                    <td>${formatDateDisplay(transaction.date, locale)}</td>
                    <td>${escapeHtml(transaction.description || '')}</td>
                    <td>${escapeHtml(categoryName(transaction))}</td>
                    <td>${escapeHtml(sourceName(transaction))}</td>
                    <td class="table__value ${transaction.amountCents < 0 ? 'amount--expense' : 'amount--income'}" style="text-align:right">${centsToDisplay(transaction.amountCents, locale)}</td>
                  </tr>`
              )
              .join('')}</tbody>
          </table>`
    }
  `;

  body.querySelector('#rp-history-csv')?.addEventListener('click', () => {
    downloadCsv(
      `movimentacoes-${state.month}.csv`,
      [t('transactions.column.date'), t('transactions.column.description'), t('reports.column.category'), t('transactions.column.account'), t('transactions.column.amount')],
      sorted.map((transaction) => [transaction.date, transaction.description || '', categoryName(transaction), sourceName(transaction), (transaction.amountCents / 100).toFixed(2)])
    );
  });
}

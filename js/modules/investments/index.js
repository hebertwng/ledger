import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import {
  listInvestments,
  createInvestment,
  updateInvestment,
  setInvestmentArchived,
  deleteInvestment,
  addInvestmentEntry,
  deleteInvestmentEntry,
} from '../../services/investmentRepository.js';
import {
  INVESTMENT_TYPES,
  valueAt,
  buildInvestmentSeries,
  summarizeSeries,
  shiftMonth,
  firstEntryMonth,
} from '../../services/investmentAnalytics.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate, formatDateDisplay, formatReferenceMonth } from '../../utils/dates.js';
import { isRequired, isValidISODate } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';
import { iconSvg } from '../../utils/icons.js';
import { institutionIconHtml, institutionPickerHtml, institutionLabel, openModal, colorFromText, confirmDialog } from '../../utils/ui.js';
import { downloadCsv } from '../../utils/csv.js';
import { mascotReact } from '../../core/mascot.js';

// Investimentos: dinheiro à parte (aplicado em alguma instituição), que NÃO entra nas receitas e
// despesas do mês, nos saldos das contas nem na saúde financeira de Ledi. Duas abas:
//   • Carteira  — valor atual, total aplicado e rendimento de cada investimento; aporte, resgate e
//                 atualização do valor (o saldo que a instituição informa);
//   • Evolução  — gráficos e tabela mês a mês, por período (6/12/24 meses, tudo ou de/até) e por
//                 investimento. A mesma evolução aparece como aba em Relatórios.
const TYPE_ICONS = {
  fixedIncome: 'bank',
  treasury: 'briefcase',
  savings: 'piggy',
  stocks: 'trendingUp',
  funds: 'coins',
  realEstateFunds: 'home',
  pension: 'umbrella',
  crypto: 'zap',
  other: 'wallet',
};
const PERIODS = ['6m', '12m', '24m', 'all', 'custom'];

let state = { tab: 'portfolio', period: '12m', from: '', to: '', filter: '' };
let modalState = null;
const charts = {};

/* ------------------------------------------------------------------ */
/* Utilitários                                                         */
/* ------------------------------------------------------------------ */
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function drawChart(id, config) {
  charts[id]?.destroy();
  delete charts[id];
  const canvas = document.getElementById(id);
  if (!canvas || !window.Chart) return;
  window.Chart.defaults.color = cssVar('--color-text-soft');
  window.Chart.defaults.font.family = cssVar('--font-family') || 'Manrope, sans-serif';
  const scales = config.options?.scales;
  if (scales) {
    for (const axis of Object.values(scales)) {
      axis.grid = { color: cssVar('--color-border-soft'), ...(axis.grid || {}) };
      axis.border = { display: false };
    }
  }
  charts[id] = new window.Chart(canvas, { ...config, options: { responsive: true, maintainAspectRatio: false, ...config.options } });
}

function percent(value, locale) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' }).format(value);
}

function signedMoney(cents, locale) {
  const text = centsToDisplay(Math.abs(cents), locale);
  return cents > 0 ? `+${text}` : cents < 0 ? `−${text}` : text;
}

function gainClass(cents) {
  return cents > 0 ? 'amount--income' : cents < 0 ? 'amount--expense' : '';
}

function investmentIconHtml(investment, size = 40) {
  if (investment.institution) return institutionIconHtml(investment, { size });
  const color = investment.color || colorFromText(investment.name);
  return `<span class="entity-icon" style="--entity-size:${size}px;background:${escapeHtml(color)}">${iconSvg(TYPE_ICONS[investment.type] || 'wallet', { size: Math.round(size * 0.5) })}</span>`;
}

function subtitle(investment) {
  const parts = [t(`investments.type.${investment.type}`)];
  if (investment.institution) parts.push(institutionLabel(investment.institution));
  return parts.map(escapeHtml).join(' · ');
}

async function loadContext(container) {
  const activeSpace = await getActiveSpace();
  const investments = activeSpace ? await listInvestments(activeSpace.id) : [];
  return { container, activeSpace, investments, locale: getLocale() };
}

/* ------------------------------------------------------------------ */
/* Tela                                                                */
/* ------------------------------------------------------------------ */
export async function render(container) {
  const context = await loadContext(container);

  container.innerHTML = `
    <section class="view inv">
      <div class="view__header">
        <h1>${t('modules.investments.title')}</h1>
        <button type="button" id="inv-new" class="button button--soft">${iconSvg('plusCircle', { size: 18 })} ${t('investments.newButton')}</button>
      </div>
      <p class="inv-note">${iconSvg('info', { size: 16 })}<span>${t('investments.separateNote')}</span></p>
      <div class="tabs inv-tabs" role="tablist">
        ${['portfolio', 'evolution'].map((tab) => `<button type="button" class="tabs__tab ${state.tab === tab ? 'is-active' : ''}" data-inv-tab="${tab}" role="tab" aria-selected="${state.tab === tab}">${t(`investments.tab.${tab}`)}</button>`).join('')}
      </div>
      <div id="inv-body"></div>
      <div id="inv-modal-slot"></div>
    </section>
  `;

  container.querySelector('#inv-new').addEventListener('click', () => {
    modalState = { type: 'investment', mode: 'create' };
    renderModal(context);
  });
  for (const button of container.querySelectorAll('[data-inv-tab]')) {
    button.addEventListener('click', () => {
      state.tab = button.dataset.invTab;
      render(container);
    });
  }

  const body = container.querySelector('#inv-body');
  if (state.tab === 'portfolio') renderPortfolio(body, context);
  else renderEvolution(body, context);

  if (modalState) renderModal(context);
}

// Usado pela aba "Investimentos" de Relatórios.
export async function renderInvestmentsReport(body) {
  const context = await loadContext(body.closest('#app-main') || body);
  renderEvolution(body, context, { embedded: true });
}

/* ------------------------------------------------------------------ */
/* Carteira                                                            */
/* ------------------------------------------------------------------ */
function renderPortfolio(body, context) {
  const { investments, locale } = context;
  const active = investments.filter((investment) => !investment.archived);
  const archived = investments.filter((investment) => investment.archived);

  if (!investments.length) {
    body.innerHTML = `
      <div class="empty-state inv-empty">
        <span class="empty-state__icon">${iconSvg('trendingUp', { size: 22 })}</span>
        <p>${t('investments.emptyState')}</p>
        <button type="button" class="button button--primary" data-inv-create>${iconSvg('plusCircle', { size: 16 })} ${t('investments.newButton')}</button>
      </div>`;
    body.querySelector('[data-inv-create]').addEventListener('click', () => {
      modalState = { type: 'investment', mode: 'create' };
      renderModal(context);
    });
    return;
  }

  const total = active.reduce(
    (sum, investment) => ({
      value: sum.value + investment.summary.valueCents,
      invested: sum.invested + investment.summary.investedCents,
    }),
    { value: 0, invested: 0 }
  );
  const gain = total.value - total.invested;
  const currentMonth = todayISODate().slice(0, 7);
  const monthGain = buildInvestmentSeries(active.map((investment) => investment.entries), { startMonth: currentMonth, endMonth: currentMonth })[0];

  body.innerHTML = `
    <div class="rp-kpis">
      <div class="rp-kpi"><small>${t('investments.kpi.value')}</small><strong>${centsToDisplay(total.value, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('investments.kpi.invested')}</small><strong>${centsToDisplay(total.invested, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('investments.kpi.gain')}</small><strong class="${gainClass(gain)}">${signedMoney(gain, locale)}</strong><small class="${gainClass(gain)}">${percent(total.invested > 0 ? gain / total.invested : null, locale)}</small></div>
      <div class="rp-kpi"><small>${t('investments.kpi.monthGain', { month: formatReferenceMonth(currentMonth, locale) })}</small><strong class="${gainClass(monthGain.gainCents)}">${signedMoney(monthGain.gainCents, locale)}</strong><small class="${gainClass(monthGain.gainCents)}">${percent(monthGain.gainRate, locale)}</small></div>
    </div>
    <div class="inv-grid">
      <div>
        ${active.length ? `<ul class="entity-list">${active.map((investment) => rowHtml(investment, locale)).join('')}</ul>` : `<p class="empty-state__note">${t('investments.noActive')}</p>`}
        ${archived.length ? `<p class="section-title">${iconSvg('folder', { size: 16 })} ${t('investments.archivedTitle')}</p><ul class="entity-list">${archived.map((investment) => rowHtml(investment, locale)).join('')}</ul>` : ''}
      </div>
      ${
        active.some((investment) => investment.summary.valueCents > 0)
          ? `<article class="rp-block inv-alloc">
              <h2>${t('investments.allocation')}</h2>
              <div class="inv-alloc__chart"><canvas id="inv-alloc-chart"></canvas></div>
              <ul class="inv-legend">${active
                .filter((investment) => investment.summary.valueCents > 0)
                .map((investment) => `<li><i style="background:${escapeHtml(investment.color || colorFromText(investment.name))}"></i><span>${escapeHtml(investment.name)}</span><strong>${percent(investment.summary.valueCents / total.value, locale).replace('+', '')}</strong></li>`)
                .join('')}</ul>
            </article>`
          : ''
      }
    </div>
  `;

  bindRows(body, context);

  const withValue = active.filter((investment) => investment.summary.valueCents > 0);
  if (withValue.length) {
    drawChart('inv-alloc-chart', {
      type: 'doughnut',
      data: {
        labels: withValue.map((investment) => investment.name),
        datasets: [{ data: withValue.map((investment) => investment.summary.valueCents / 100), backgroundColor: withValue.map((investment) => investment.color || colorFromText(investment.name)), borderWidth: 2, borderColor: cssVar('--color-surface') }],
      },
      options: { cutout: '68%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (item) => ` ${item.label}: ${centsToDisplay(Math.round(item.raw * 100), locale)}` } } } },
    });
  }
}

function rowHtml(investment, locale) {
  const { valueCents, investedCents, gainCents, gainRate } = investment.summary;
  return `
    <li class="entity-row entity-row--clickable inv-row ${investment.archived ? 'is-archived' : ''}" data-inv-open="${investment.id}" tabindex="0">
      ${investmentIconHtml(investment)}
      <span class="entity-row__main">
        <span class="entity-row__title">${escapeHtml(investment.name)}</span>
        <span class="entity-row__subtitle">${subtitle(investment)}</span>
      </span>
      <span class="entity-row__value">
        ${centsToDisplay(valueCents, locale)}
        <small>${t('investments.investedShort')}: ${centsToDisplay(investedCents, locale)} · <span class="${gainClass(gainCents)}">${signedMoney(gainCents, locale)} (${percent(gainRate, locale)})</span></small>
      </span>
      ${
        investment.archived
          ? ''
          : `<span class="entity-row__actions inv-row__actions">
              <button type="button" class="icon-button icon-button--outline" data-inv-entry="contribution" data-inv-id="${investment.id}" title="${t('investments.entry.contribution')}" aria-label="${t('investments.entry.contribution')}">${iconSvg('plus', { size: 16 })}</button>
              <button type="button" class="icon-button icon-button--outline" data-inv-entry="withdrawal" data-inv-id="${investment.id}" title="${t('investments.entry.withdrawal')}" aria-label="${t('investments.entry.withdrawal')}">${iconSvg('refund', { size: 16 })}</button>
              <button type="button" class="icon-button icon-button--outline" data-inv-entry="valuation" data-inv-id="${investment.id}" title="${t('investments.entry.valuation')}" aria-label="${t('investments.entry.valuation')}">${iconSvg('trendingUp', { size: 16 })}</button>
            </span>`
      }
    </li>`;
}

function bindRows(body, context) {
  for (const row of body.querySelectorAll('[data-inv-open]')) {
    const open = (event) => {
      if (event.target.closest('button')) return;
      modalState = { type: 'details', investmentId: row.dataset.invOpen };
      renderModal(context);
    };
    row.addEventListener('click', open);
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') open(event);
    });
  }
  for (const button of body.querySelectorAll('[data-inv-entry]')) {
    button.addEventListener('click', () => {
      modalState = { type: 'entry', kind: button.dataset.invEntry, investmentId: button.dataset.invId };
      renderModal(context);
    });
  }
}

/* ------------------------------------------------------------------ */
/* Evolução (também usada em Relatórios)                               */
/* ------------------------------------------------------------------ */
function periodRange(groups) {
  const currentMonth = todayISODate().slice(0, 7);
  if (state.period === 'custom' && state.from && state.to) {
    return state.from <= state.to ? { startMonth: state.from, endMonth: state.to } : { startMonth: state.to, endMonth: state.from };
  }
  const months = { '6m': 6, '12m': 12, '24m': 24 }[state.period];
  if (months) return { startMonth: shiftMonth(currentMonth, -(months - 1)), endMonth: currentMonth };
  const first = firstEntryMonth(groups.flat()) || currentMonth;
  return { startMonth: first < currentMonth ? first : currentMonth, endMonth: currentMonth };
}

function renderEvolution(body, context, { embedded = false } = {}) {
  const { investments, locale } = context;
  if (!investments.length) {
    body.innerHTML = `<div class="empty-state"><span class="empty-state__icon">${iconSvg('trendingUp', { size: 22 })}</span><p>${t('investments.emptyState')}</p></div>`;
    return;
  }
  if (state.filter && !investments.some((investment) => investment.id === state.filter)) state.filter = '';
  const selected = state.filter ? investments.filter((investment) => investment.id === state.filter) : investments.filter((investment) => !investment.archived || investment.entries.length);
  const groups = selected.map((investment) => investment.entries);
  const range = periodRange(groups);
  if (state.period === 'custom' && (!state.from || !state.to)) {
    state.from = range.startMonth;
    state.to = range.endMonth;
  }
  const series = buildInvestmentSeries(groups, range);
  const totals = summarizeSeries(series);

  body.innerHTML = `
    <div class="inv-controls">
      <div class="segmented inv-periods" role="group" aria-label="${t('investments.period.label')}">
        ${PERIODS.map((period) => `<button type="button" class="segmented__option ${state.period === period ? 'is-active' : ''}" data-inv-period="${period}">${t(`investments.period.${period}`)}</button>`).join('')}
      </div>
      ${
        state.period === 'custom'
          ? `<div class="inv-range">
              <label class="form-field"><span class="visually-hidden">${t('investments.period.from')}</span><input type="month" id="inv-from" value="${escapeHtml(state.from)}" aria-label="${t('investments.period.from')}" /></label>
              <span>${t('investments.period.to')}</span>
              <label class="form-field"><span class="visually-hidden">${t('investments.period.to')}</span><input type="month" id="inv-to" value="${escapeHtml(state.to)}" aria-label="${t('investments.period.to')}" /></label>
            </div>`
          : ''
      }
      <label class="filter-chip inv-filter">
        <span class="visually-hidden">${t('investments.filter')}</span>
        <select id="inv-filter" aria-label="${t('investments.filter')}" class="${state.filter ? 'is-set' : ''}">
          <option value="">${t('investments.filterAll')}</option>
          ${investments.map((investment) => `<option value="${investment.id}" ${state.filter === investment.id ? 'selected' : ''}>${escapeHtml(investment.name)}${investment.archived ? ` (${t('common.archived')})` : ''}</option>`).join('')}
        </select>
      </label>
      <button type="button" class="link-button" id="inv-csv">${iconSvg('arrowDown', { size: 14 })} CSV</button>
    </div>

    <div class="rp-kpis">
      <div class="rp-kpi"><small>${t('investments.kpi.startValue', { month: formatReferenceMonth(range.startMonth, locale) })}</small><strong>${centsToDisplay(totals.startValueCents, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('investments.kpi.endValue', { month: formatReferenceMonth(range.endMonth, locale) })}</small><strong>${centsToDisplay(totals.endValueCents, locale)}</strong></div>
      <div class="rp-kpi"><small>${t('investments.kpi.netFlow')}</small><strong>${signedMoney(totals.contributionsCents - totals.withdrawalsCents, locale)}</strong><small>${t('investments.kpi.flowsDetail', { in: centsToDisplay(totals.contributionsCents, locale), out: centsToDisplay(totals.withdrawalsCents, locale) })}</small></div>
      <div class="rp-kpi"><small>${t('investments.kpi.periodGain')}</small><strong class="${gainClass(totals.gainCents)}">${signedMoney(totals.gainCents, locale)}</strong><small class="${gainClass(totals.gainCents)}">${percent(totals.gainRate, locale)}</small></div>
    </div>

    <div class="inv-charts">
      <article class="rp-block"><h2>${t('investments.chart.evolution')}</h2><div class="rp-chart rp-chart--wide"><canvas id="inv-evolution-chart"></canvas></div></article>
      <article class="rp-block"><h2>${t('investments.chart.monthlyGain')}</h2><div class="rp-chart rp-chart--wide"><canvas id="inv-gain-chart"></canvas></div></article>
    </div>

    <table class="data-table rp-table">
      <thead><tr>
        <th>${t('reports.column.month')}</th>
        <th>${t('investments.column.contributions')}</th>
        <th>${t('investments.column.withdrawals')}</th>
        <th>${t('investments.column.invested')}</th>
        <th>${t('investments.column.value')}</th>
        <th>${t('investments.column.gain')}</th>
        <th>${t('investments.column.gainRate')}</th>
      </tr></thead>
      <tbody>
        ${series
          .map(
            (item) => `
              <tr>
                <td>${formatReferenceMonth(item.month, locale)}</td>
                <td class="table__value">${centsToDisplay(item.contributionsCents, locale)}</td>
                <td class="table__value">${centsToDisplay(item.withdrawalsCents, locale)}</td>
                <td class="table__value">${centsToDisplay(item.investedCents, locale)}</td>
                <td class="table__value"><strong>${centsToDisplay(item.valueCents, locale)}</strong></td>
                <td class="table__value ${gainClass(item.gainCents)}">${signedMoney(item.gainCents, locale)}</td>
                <td class="table__value ${gainClass(item.gainCents)}">${percent(item.gainRate, locale)}</td>
              </tr>`
          )
          .reverse()
          .join('')}
      </tbody>
    </table>
  `;

  const rerender = () => (embedded ? renderInvestmentsReport(body) : render(context.container));
  for (const button of body.querySelectorAll('[data-inv-period]')) {
    button.addEventListener('click', () => {
      state.period = button.dataset.invPeriod;
      rerender();
    });
  }
  body.querySelector('#inv-from')?.addEventListener('change', (event) => {
    state.from = event.target.value;
    rerender();
  });
  body.querySelector('#inv-to')?.addEventListener('change', (event) => {
    state.to = event.target.value;
    rerender();
  });
  body.querySelector('#inv-filter').addEventListener('change', (event) => {
    state.filter = event.target.value;
    rerender();
  });
  body.querySelector('#inv-csv').addEventListener('click', () => {
    downloadCsv(
      `investimentos-${range.startMonth}-a-${range.endMonth}.csv`,
      [t('reports.column.month'), t('investments.column.contributions'), t('investments.column.withdrawals'), t('investments.column.invested'), t('investments.column.value'), t('investments.column.gain'), t('investments.column.gainRate')],
      series.map((item) => [
        item.month,
        (item.contributionsCents / 100).toFixed(2),
        (item.withdrawalsCents / 100).toFixed(2),
        (item.investedCents / 100).toFixed(2),
        (item.valueCents / 100).toFixed(2),
        (item.gainCents / 100).toFixed(2),
        item.gainRate === null ? '' : (item.gainRate * 100).toFixed(2),
      ])
    );
  });

  const labels = series.map((item) => formatReferenceMonth(item.month, locale));
  const money = (value) => centsToDisplay(Math.round(value * 100), locale);
  const primary = cssVar('--color-primary');
  drawChart('inv-evolution-chart', {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: t('investments.column.value'), data: series.map((item) => item.valueCents / 100), borderColor: primary, backgroundColor: `${primary}22`, fill: true, tension: 0.3, pointRadius: 3 },
        { label: t('investments.column.invested'), data: series.map((item) => item.investedCents / 100), borderColor: cssVar('--color-text-muted'), borderDash: [6, 4], tension: 0.3, pointRadius: 0 },
      ],
    },
    options: {
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}: ${money(item.raw)}` } } },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: (value) => money(value) } } },
    },
  });
  drawChart('inv-gain-chart', {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: t('investments.column.gain'),
          data: series.map((item) => item.gainCents / 100),
          backgroundColor: series.map((item) => (item.gainCents < 0 ? cssVar('--color-danger') : cssVar('--color-success'))),
          borderRadius: 6,
          maxBarThickness: 26,
        },
      ],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (item) => ` ${money(item.raw)} (${percent(series[item.dataIndex].gainRate, locale)})` } },
      },
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: (value) => money(value) } } },
    },
  });
}

/* ------------------------------------------------------------------ */
/* Janelas                                                             */
/* ------------------------------------------------------------------ */
function renderModal(context) {
  if (!modalState) return;
  if (modalState.type === 'investment') return renderInvestmentForm(context);
  if (modalState.type === 'entry') return renderEntryForm(context);
  return renderDetails(context);
}

function closeModal(context) {
  modalState = null;
  render(context.container);
}

function findInvestment(context, id) {
  return context.investments.find((investment) => investment.id === id);
}

function renderDetails(context) {
  const investment = findInvestment(context, modalState.investmentId);
  if (!investment) return closeModal(context);
  const { locale } = context;
  const slot = context.container.querySelector('#inv-modal-slot');
  const { valueCents, investedCents, gainCents, gainRate } = investment.summary;
  const entries = investment.entries.slice().reverse();

  const modal = openModal(slot, {
    title: escapeHtml(investment.name),
    size: 'lg',
    onClose: () => closeModal(context),
    body: `
      <div class="modal__body inv-details">
        <div class="inv-details__head">
          ${investmentIconHtml(investment, 44)}
          <span class="entity-row__main"><span class="entity-row__title">${escapeHtml(investment.name)}</span><span class="entity-row__subtitle">${subtitle(investment)}</span></span>
        </div>
        <div class="rp-kpis inv-details__kpis">
          <div class="rp-kpi"><small>${t('investments.kpi.value')}</small><strong>${centsToDisplay(valueCents, locale)}</strong></div>
          <div class="rp-kpi"><small>${t('investments.kpi.invested')}</small><strong>${centsToDisplay(investedCents, locale)}</strong></div>
          <div class="rp-kpi"><small>${t('investments.kpi.gain')}</small><strong class="${gainClass(gainCents)}">${signedMoney(gainCents, locale)}</strong><small class="${gainClass(gainCents)}">${percent(gainRate, locale)}</small></div>
        </div>
        ${
          investment.archived
            ? ''
            : `<div class="inv-details__actions">
                <button type="button" class="button button--primary" data-entry-kind="contribution">${iconSvg('plus', { size: 16 })} ${t('investments.entry.contribution')}</button>
                <button type="button" class="button" data-entry-kind="withdrawal">${iconSvg('refund', { size: 16 })} ${t('investments.entry.withdrawal')}</button>
                <button type="button" class="button" data-entry-kind="valuation">${iconSvg('trendingUp', { size: 16 })} ${t('investments.entry.valuation')}</button>
              </div>`
        }
        <p class="section-title">${iconSvg('transactions', { size: 16 })} ${t('investments.history')}</p>
        ${
          entries.length
            ? `<ul class="inv-history">${entries
                .map(
                  (entry) => `
                  <li class="inv-history__item inv-history__item--${entry.kind}">
                    <span class="inv-history__kind">${t(`investments.kind.${entry.kind}`)}</span>
                    <span class="inv-history__date">${formatDateDisplay(entry.date, locale)}${entry.note ? ` · ${escapeHtml(entry.note)}` : ''}</span>
                    <strong class="inv-history__value">${entry.kind === 'withdrawal' ? '−' : entry.kind === 'contribution' ? '+' : '='} ${centsToDisplay(entry.amountCents, locale)}</strong>
                    <button type="button" class="icon-button" data-entry-delete="${entry.id}" title="${t('common.delete')}" aria-label="${t('common.delete')}">${iconSvg('trash', { size: 15 })}</button>
                  </li>`
                )
                .join('')}</ul>`
            : `<p class="empty-state__note">${t('investments.noHistory')}</p>`
        }
        <div class="form-actions inv-details__footer">
          <button type="button" class="link-button link-button--muted" data-inv-delete>${iconSvg('trash', { size: 14 })} ${t('common.delete')}</button>
          <button type="button" class="link-button link-button--muted" data-inv-archive>${iconSvg(investment.archived ? 'unarchive' : 'archive', { size: 14 })} ${investment.archived ? t('common.unarchive') : t('common.archive')}</button>
          <button type="button" class="button" data-inv-edit>${iconSvg('pencil', { size: 16 })} ${t('common.edit')}</button>
        </div>
      </div>
    `,
  });

  for (const button of modal.querySelectorAll('[data-entry-kind]')) {
    button.addEventListener('click', () => {
      modalState = { type: 'entry', kind: button.dataset.entryKind, investmentId: investment.id, back: 'details' };
      renderModal(context);
    });
  }
  for (const button of modal.querySelectorAll('[data-entry-delete]')) {
    button.addEventListener('click', async () => {
      if (!(await confirmDialog(t('investments.confirmDeleteEntry')))) return;
      await deleteInvestmentEntry(button.dataset.entryDelete);
      render(context.container);
    });
  }
  modal.querySelector('[data-inv-edit]').addEventListener('click', () => {
    modalState = { type: 'investment', mode: 'edit', investmentId: investment.id };
    renderModal(context);
  });
  modal.querySelector('[data-inv-archive]').addEventListener('click', async () => {
    await setInvestmentArchived(investment.id, !investment.archived);
    modalState = null;
    render(context.container);
  });
  modal.querySelector('[data-inv-delete]').addEventListener('click', async () => {
    if (!(await confirmDialog(t('investments.confirmDelete', { name: investment.name })))) return;
    await deleteInvestment(investment.id);
    modalState = null;
    render(context.container);
  });
}

function renderInvestmentForm(context) {
  const isEdit = modalState.mode === 'edit';
  const investment = isEdit ? findInvestment(context, modalState.investmentId) : null;
  const slot = context.container.querySelector('#inv-modal-slot');
  const back = () => {
    modalState = isEdit ? { type: 'details', investmentId: investment.id } : null;
    if (modalState) renderModal(context);
    else render(context.container);
  };

  const modal = openModal(slot, {
    title: isEdit ? t('investments.form.titleEdit') : t('investments.form.titleCreate'),
    size: 'lg',
    onClose: () => closeModal(context),
    body: `
      <form id="investment-form" class="modal__body" novalidate>
        <div class="form-row">
          <div class="form-field">
            <label for="investment-name">${t('investments.form.name')}</label>
            <input id="investment-name" name="name" type="text" autocomplete="off" placeholder="${escapeHtml(t('investments.form.namePlaceholder'))}" value="${isEdit ? escapeHtml(investment.name) : ''}" />
          </div>
          <div class="form-field">
            <label for="investment-type">${t('investments.form.type')}</label>
            <select id="investment-type" name="type">
              ${INVESTMENT_TYPES.map((type) => `<option value="${type}" ${isEdit && investment.type === type ? 'selected' : ''}>${t(`investments.type.${type}`)}</option>`).join('')}
            </select>
          </div>
        </div>
        ${
          isEdit
            ? ''
            : `<div class="form-row">
                <div class="form-field">
                  <label for="investment-initial">${t('investments.form.initialAmount')}</label>
                  <div class="input-prefix"><span>${getLocale() === 'pt-BR' ? 'R$' : '$'}</span><input id="investment-initial" name="initialAmount" type="text" inputmode="numeric" data-money placeholder="0,00" /></div>
                </div>
                <div class="form-field">
                  <label for="investment-start">${t('investments.form.startDate')}</label>
                  <input id="investment-start" name="startDate" type="date" value="${todayISODate()}" />
                </div>
              </div>`
        }
        <div class="form-field">
          <span class="form-field__label">${t('investments.form.institution')}</span>
          ${institutionPickerHtml('institution', isEdit ? investment.institution : null, t('accounts.form.institutionNone'))}
        </div>
        <p class="form-error" id="investment-form-error" hidden></p>
        <div class="form-actions">
          <button type="button" id="investment-form-cancel" class="button">${t('common.cancel')}</button>
          <button type="submit" class="button button--primary">${t('common.save')}</button>
        </div>
      </form>
    `,
  });

  modal.querySelector('#investment-form-cancel').addEventListener('click', back);
  modal.querySelector('#investment-name').focus();
  modal.querySelector('#investment-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = modal.querySelector('#investment-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };
    const name = String(formData.get('name') || '').trim();
    const type = String(formData.get('type'));
    const institution = String(formData.get('institution') || '') || null;
    if (!isRequired(name)) return showError(t('investments.validation.nameRequired'));

    try {
      if (isEdit) {
        await updateInvestment(investment.id, { name, type, institution });
        modalState = { type: 'details', investmentId: investment.id };
      } else {
        const initialAmountCents = parseCurrencyInputToCents(String(formData.get('initialAmount') || '0'));
        const startDate = String(formData.get('startDate'));
        if (!isValidISODate(startDate)) return showError(t('investments.validation.dateInvalid'));
        if (initialAmountCents < 0) return showError(t('investments.validation.amountInvalid'));
        await createInvestment(context.activeSpace.id, { name, type, institution, initialAmountCents, startDate });
        modalState = null;
        mascotReact('investmentCreated');
      }
    } catch (error) {
      showError(t('settings.failed', { message: error.message }));
      return;
    }
    render(context.container);
  });
}

function renderEntryForm(context) {
  const investment = findInvestment(context, modalState.investmentId);
  if (!investment) return closeModal(context);
  const { kind } = modalState;
  const slot = context.container.querySelector('#inv-modal-slot');
  const currentValue = investment.summary.valueCents;
  const back = () => {
    modalState = modalState.back === 'details' ? { type: 'details', investmentId: investment.id } : null;
    if (modalState) renderModal(context);
    else render(context.container);
  };

  const modal = openModal(slot, {
    title: `${t(`investments.entry.${kind}`)} · ${escapeHtml(investment.name)}`,
    size: 'md',
    onClose: () => closeModal(context),
    body: `
      <form id="investment-entry-form" class="modal__body" novalidate>
        <p class="form-hint">${t(`investments.entryHint.${kind}`, { value: centsToDisplay(currentValue, context.locale) })}</p>
        <div class="form-row">
          <div class="form-field">
            <label for="entry-amount">${t(kind === 'valuation' ? 'investments.form.currentValue' : 'investments.form.amount')}</label>
            <div class="input-prefix"><span>${getLocale() === 'pt-BR' ? 'R$' : '$'}</span><input id="entry-amount" name="amount" type="text" inputmode="numeric" data-money placeholder="0,00" /></div>
          </div>
          <div class="form-field">
            <label for="entry-date">${t('investments.form.date')}</label>
            <input id="entry-date" name="date" type="date" value="${todayISODate()}" />
          </div>
        </div>
        <div class="form-field">
          <label for="entry-note">${t('investments.form.note')}</label>
          <input id="entry-note" name="note" type="text" autocomplete="off" maxlength="120" placeholder="${escapeHtml(t('investments.form.notePlaceholder'))}" />
        </div>
        <p class="form-error" id="entry-form-error" hidden></p>
        <div class="form-actions">
          <button type="button" id="entry-form-cancel" class="button">${t('common.cancel')}</button>
          <button type="submit" class="button button--primary">${t('common.save')}</button>
        </div>
      </form>
    `,
  });

  modal.querySelector('#entry-form-cancel').addEventListener('click', back);
  modal.querySelector('#entry-amount').focus();
  modal.querySelector('#investment-entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = modal.querySelector('#entry-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };
    const amountCents = parseCurrencyInputToCents(String(formData.get('amount') || '0'));
    const date = String(formData.get('date'));
    const note = String(formData.get('note') || '');
    if (!isValidISODate(date)) return showError(t('investments.validation.dateInvalid'));
    if (kind !== 'valuation' && amountCents <= 0) return showError(t('investments.validation.amountRequired'));
    if (amountCents < 0) return showError(t('investments.validation.amountInvalid'));
    const valueOnDate = valueAt(investment.entries, date);
    if (kind === 'withdrawal' && amountCents > valueOnDate) {
      return showError(t('investments.validation.withdrawalTooHigh', { value: centsToDisplay(valueOnDate, context.locale) }));
    }

    try {
      await addInvestmentEntry(context.activeSpace.id, investment.id, { kind, date, amountCents, note });
    } catch (error) {
      showError(t('settings.failed', { message: error.message }));
      return;
    }
    // Ledi: aporte → cofrinho; resgate → aprova; atualização → comemora se rendeu, pensa se caiu.
    const eventName = { contribution: 'investmentContribution', withdrawal: 'investmentWithdrawal', valuation: 'investmentValuation' }[kind];
    mascotReact(eventName, { gainCents: kind === 'valuation' ? amountCents - valueOnDate : 0 });
    modalState = modalState.back === 'details' ? { type: 'details', investmentId: investment.id } : null;
    render(context.container);
  });
}

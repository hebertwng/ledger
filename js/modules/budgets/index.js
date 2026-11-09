import { t, getLocale } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import { listCategories } from '../../services/categoryRepository.js';
import { listTransactions, filterTransactions } from '../../services/transactionRepository.js';
import { listBudgets, createBudget, updateBudget, deleteBudget, calculateBudgetProgress } from '../../services/budgetRepository.js';
import { centsToDisplay, parseCurrencyInputToCents } from '../../utils/currency.js';
import { todayISODate, monthRange } from '../../utils/dates.js';
import { isRequired } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';

let formState = null;
let periodState = todayISODate().slice(0, 7);

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const [categories, budgets, transactions] = activeSpace
    ? await Promise.all([listCategories(activeSpace.id), listBudgets(activeSpace.id), listTransactions(activeSpace.id)])
    : [[], [], []];

  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const expenseCategories = categories.filter((category) => category.kind === 'expense');
  const { startDate, endDate } = monthRange(periodState);
  const periodTransactions = filterTransactions(transactions, { startDate, endDate, kind: 'expense' });
  const locale = getLocale();

  const rows = budgets.map((budget) => {
    const spentCents = periodTransactions
      .filter((transaction) => transaction.categoryId === budget.categoryId)
      .reduce((sum, transaction) => sum + Math.abs(transaction.amountCents), 0);
    return { budget, category: categoriesById.get(budget.categoryId), progress: calculateBudgetProgress(budget.limitCents, spentCents) };
  });

  const availableCategories = expenseCategories.filter(
    (category) => !budgets.some((budget) => budget.categoryId === category.id && (!formState || formState.budget?.categoryId !== category.id))
  );

  const context = { container, activeSpace, categories: expenseCategories, availableCategories, budgets };

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.budgets.title')}</h1>
        <div class="form-field">
          <label for="budgets-period">${t('budgets.period')}</label>
          <input id="budgets-period" type="month" value="${periodState}" />
        </div>
      </div>
      <div class="view__header">
        <span></span>
        <button type="button" id="budgets-new-button" class="button button--primary" ${availableCategories.length === 0 ? 'disabled' : ''}>${t('budgets.newButton')}</button>
      </div>
      <div id="budgets-form-slot"></div>
      ${rows.length === 0 ? `<div class="empty-state"><p>${t('budgets.emptyState')}</p></div>` : renderTable(rows, locale)}
    </section>
  `;

  container.querySelector('#budgets-period').addEventListener('change', (event) => {
    periodState = event.target.value;
    render(container);
  });

  const newButton = container.querySelector('#budgets-new-button');
  if (availableCategories.length) {
    newButton.addEventListener('click', () => {
      formState = { mode: 'create' };
      renderForm(context);
    });
  }

  for (const button of container.querySelectorAll('[data-edit-id]')) {
    button.addEventListener('click', () => {
      formState = { mode: 'edit', budget: budgets.find((budget) => budget.id === button.dataset.editId) };
      renderForm(context);
    });
  }

  for (const button of container.querySelectorAll('[data-delete-id]')) {
    button.addEventListener('click', async () => {
      if (!window.confirm(t('budgets.deleteConfirm'))) return;
      await deleteBudget(button.dataset.deleteId);
      render(container);
    });
  }

  if (formState) renderForm(context);
}

function statusBadge(progress) {
  if (progress.isOverLimit) return `<span class="badge badge--danger">${t('budgets.status.over')}</span>`;
  if (progress.isNearLimit) return `<span class="badge badge--warning">${t('budgets.status.near')}</span>`;
  return `<span class="badge badge--success">${t('budgets.status.ok')}</span>`;
}

function progressBarFillClass(progress) {
  if (progress.isOverLimit) return 'progress-bar__fill--danger';
  if (progress.isNearLimit) return 'progress-bar__fill--warning';
  return 'progress-bar__fill--ok';
}

function renderTable(rows, locale) {
  const items = rows
    .map(({ budget, category, progress }) => {
      const widthPercent = Math.min(100, Math.max(0, progress.percentage * 100));
      return `
        <article class="card budget-card">
          <div class="budget-card__header">
            <h2>${category ? escapeHtml(category.name) : '-'}</h2>
            ${statusBadge(progress)}
          </div>
          <div class="progress-bar">
            <div class="progress-bar__fill ${progressBarFillClass(progress)}" style="width: ${widthPercent}%"></div>
          </div>
          <div class="budget-card__figures">
            <span>${t('budgets.column.spent')}: <strong>${centsToDisplay(progress.spentCents, locale)}</strong></span>
            <span>${t('budgets.column.limit')}: <strong>${centsToDisplay(progress.limitCents, locale)}</strong></span>
            <span>${t('budgets.column.remaining')}: <strong>${centsToDisplay(progress.remainingCents, locale)}</strong></span>
          </div>
          <div class="form-actions">
            <button type="button" class="link-button" data-edit-id="${budget.id}">${t('common.edit')}</button>
            <button type="button" class="link-button" data-delete-id="${budget.id}">${t('common.delete')}</button>
          </div>
        </article>
      `;
    })
    .join('');

  return `<div class="cards-grid">${items}</div>`;
}

function renderForm(context) {
  const slot = context.container.querySelector('#budgets-form-slot');
  const isEdit = formState.mode === 'edit';
  const budget = formState.budget;
  const categoryOptions = isEdit ? context.categories : context.availableCategories;

  slot.innerHTML = `
    <form id="budget-form" class="form-card">
      <h2>${isEdit ? t('budgets.form.titleEdit') : t('budgets.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="budget-category">${t('budgets.form.category')}</label>
        <select id="budget-category" name="categoryId" ${isEdit ? 'disabled' : ''}>
          ${categoryOptions.map((category) => `<option value="${category.id}" ${isEdit && budget.categoryId === category.id ? 'selected' : ''}>${escapeHtml(category.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="budget-limit">${t('budgets.form.limit')}</label>
        <input id="budget-limit" name="limit" type="text" inputmode="decimal" value="${isEdit ? (budget.limitCents / 100).toFixed(2) : ''}" />
      </div>
      <p class="form-error" id="budget-form-error" hidden></p>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('common.save')}</button>
        <button type="button" id="budget-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  slot.querySelector('#budget-form-cancel').addEventListener('click', () => {
    formState = null;
    render(context.container);
  });

  slot.querySelector('#budget-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = slot.querySelector('#budget-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };

    const categoryId = isEdit ? budget.categoryId : String(formData.get('categoryId') || '');
    const limitCents = parseCurrencyInputToCents(String(formData.get('limit') || '0'));

    if (!isEdit && !isRequired(categoryId)) return showError(t('budgets.validation.categoryRequired'));
    if (limitCents <= 0) return showError(t('budgets.validation.limitInvalid'));

    if (isEdit) {
      await updateBudget(budget.id, { limitCents });
    } else {
      await createBudget(context.activeSpace.id, { categoryId, limitCents });
    }

    formState = null;
    render(context.container);
  });
}

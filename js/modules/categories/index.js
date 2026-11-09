import { t } from '../../core/i18n.js';
import { getActiveSpace } from '../../core/bootstrap.js';
import {
  listCategories,
  buildCategoryTree,
  createCategory,
  updateCategory,
  setCategoryArchived,
  deleteCategory,
  reclassifyAndDeleteCategory,
} from '../../services/categoryRepository.js';
import { isRequired } from '../../utils/validation.js';
import { escapeHtml } from '../../utils/html.js';

let formState = null;
let deleteBlockedState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const categories = activeSpace ? await listCategories(activeSpace.id) : [];
  const tree = buildCategoryTree(categories);

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.categories.title')}</h1>
        <button type="button" id="categories-new-button" class="button button--primary">${t('categories.newButton')}</button>
      </div>
      <div id="categories-form-slot"></div>
      <div id="categories-delete-slot"></div>
      ${categories.length === 0 ? `<div class="empty-state"><p>${t('categories.emptyState')}</p></div>` : renderTree(tree)}
    </section>
  `;

  container.querySelector('#categories-new-button').addEventListener('click', () => {
    formState = { mode: 'create' };
    renderForm(container, activeSpace, categories);
  });

  for (const button of container.querySelectorAll('[data-edit-id]')) {
    button.addEventListener('click', () => {
      formState = { mode: 'edit', category: categories.find((category) => category.id === button.dataset.editId) };
      renderForm(container, activeSpace, categories);
    });
  }

  for (const button of container.querySelectorAll('[data-archive-id]')) {
    button.addEventListener('click', async () => {
      const category = categories.find((item) => item.id === button.dataset.archiveId);
      await setCategoryArchived(category.id, !category.archived);
      render(container);
    });
  }

  for (const button of container.querySelectorAll('[data-delete-id]')) {
    button.addEventListener('click', async () => {
      if (!window.confirm(t('categories.deleteConfirm'))) return;
      const category = categories.find((item) => item.id === button.dataset.deleteId);
      const result = await deleteCategory(activeSpace.id, category.id);
      if (result.allowed) {
        render(container);
        return;
      }
      deleteBlockedState = { category, reason: result.reason };
      renderDeleteBlocked(container, activeSpace, categories);
    });
  }

  if (formState) renderForm(container, activeSpace, categories);
  if (deleteBlockedState) renderDeleteBlocked(container, activeSpace, categories);
}

function renderTree(tree) {
  const sections = tree
    .map(
      (parent) => `
        <article class="category-group">
          <header class="category-group__header">
            <strong>${escapeHtml(parent.name)}</strong>
            <span class="badge badge--muted">${t(`categories.kind.${parent.kind}`)}</span>
            ${parent.archived ? `<span class="badge badge--muted">${t('common.archivedBadge')}</span>` : ''}
            <span class="category-group__actions">
              <button type="button" class="link-button" data-edit-id="${parent.id}">${t('common.edit')}</button>
              <button type="button" class="link-button" data-archive-id="${parent.id}">${parent.archived ? t('common.unarchive') : t('common.archive')}</button>
              <button type="button" class="link-button" data-delete-id="${parent.id}">${t('common.delete')}</button>
            </span>
          </header>
          ${
            parent.children.length
              ? `<ul class="category-group__children">${parent.children
                  .map(
                    (child) => `
                      <li>
                        ${escapeHtml(child.name)}
                        ${child.archived ? ` <span class="badge badge--muted">${t('common.archivedBadge')}</span>` : ''}
                        <button type="button" class="link-button" data-edit-id="${child.id}">${t('common.edit')}</button>
                        <button type="button" class="link-button" data-archive-id="${child.id}">${child.archived ? t('common.unarchive') : t('common.archive')}</button>
                        <button type="button" class="link-button" data-delete-id="${child.id}">${t('common.delete')}</button>
                      </li>
                    `
                  )
                  .join('')}</ul>`
              : ''
          }
        </article>
      `
    )
    .join('');

  return `<div class="category-groups">${sections}</div>`;
}

function renderForm(container, activeSpace, categories) {
  const slot = container.querySelector('#categories-form-slot');
  const isEdit = formState.mode === 'edit';
  const category = formState.category;
  const parentOptions = categories.filter((item) => !item.parentId && (!isEdit || item.id !== category.id));

  slot.innerHTML = `
    <form id="category-form" class="form-card">
      <h2>${isEdit ? t('categories.form.titleEdit') : t('categories.form.titleCreate')}</h2>
      <div class="form-field">
        <label for="category-name">${t('categories.form.name')}</label>
        <input id="category-name" name="name" type="text" value="${isEdit ? escapeHtml(category.name) : ''}" />
      </div>
      <div class="form-field">
        <label for="category-kind">${t('categories.form.kind')}</label>
        <select id="category-kind" name="kind">
          <option value="expense" ${isEdit && category.kind === 'expense' ? 'selected' : ''}>${t('categories.kind.expense')}</option>
          <option value="income" ${isEdit && category.kind === 'income' ? 'selected' : ''}>${t('categories.kind.income')}</option>
        </select>
      </div>
      <div class="form-field">
        <label for="category-parent">${t('categories.form.parent')}</label>
        <select id="category-parent" name="parentId">
          <option value="">${t('categories.form.parentNone')}</option>
          ${parentOptions
            .map((parent) => `<option value="${parent.id}" ${isEdit && category.parentId === parent.id ? 'selected' : ''}>${escapeHtml(parent.name)}</option>`)
            .join('')}
        </select>
      </div>
      <p class="form-error" id="category-form-error" hidden></p>
      <div class="form-actions">
        <button type="submit" class="button button--primary">${t('common.save')}</button>
        <button type="button" id="category-form-cancel" class="button">${t('common.cancel')}</button>
      </div>
    </form>
  `;

  slot.querySelector('#category-form-cancel').addEventListener('click', () => {
    formState = null;
    render(container);
  });

  slot.querySelector('#category-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(event.target);
    const errorElement = slot.querySelector('#category-form-error');
    const name = String(formData.get('name') || '').trim();
    const kind = String(formData.get('kind'));
    const parentId = String(formData.get('parentId') || '') || null;

    if (!isRequired(name)) {
      errorElement.textContent = t('categories.validation.nameRequired');
      errorElement.hidden = false;
      return;
    }

    if (isEdit) {
      await updateCategory(category.id, { name, kind, parentId });
    } else {
      await createCategory(activeSpace.id, { name, kind, parentId });
    }

    formState = null;
    render(container);
  });
}

function renderDeleteBlocked(container, activeSpace, categories) {
  const slot = container.querySelector('#categories-delete-slot');
  const { category, reason } = deleteBlockedState;

  if (reason === 'hasChildren') {
    slot.innerHTML = `
      <div class="form-note">
        <p>${t('categories.deleteBlockedChildren')}</p>
        <div class="form-actions">
          <button type="button" class="button" id="category-delete-dismiss">${t('common.cancel')}</button>
        </div>
      </div>
    `;
    slot.querySelector('#category-delete-dismiss').addEventListener('click', () => {
      deleteBlockedState = null;
      render(container);
    });
    return;
  }

  const targets = categories.filter((item) => item.id !== category.id && item.kind === category.kind && !item.parentId);

  slot.innerHTML = `
    <div class="form-note">
      <p>${t('categories.deleteBlockedTransactions')}</p>
      <div class="form-field">
        <label for="category-reclassify-target">${t('categories.form.parent')}</label>
        <select id="category-reclassify-target">
          ${targets.map((target) => `<option value="${target.id}">${escapeHtml(target.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-actions">
        <button type="button" class="button button--primary" id="category-reclassify-confirm">${t('common.delete')}</button>
        <button type="button" class="button" id="category-archive-instead">${t('common.archive')}</button>
        <button type="button" class="button" id="category-delete-dismiss">${t('common.cancel')}</button>
      </div>
    </div>
  `;

  slot.querySelector('#category-delete-dismiss').addEventListener('click', () => {
    deleteBlockedState = null;
    render(container);
  });

  slot.querySelector('#category-archive-instead').addEventListener('click', async () => {
    await setCategoryArchived(category.id, true);
    deleteBlockedState = null;
    render(container);
  });

  const confirmButton = slot.querySelector('#category-reclassify-confirm');
  if (confirmButton && targets.length) {
    confirmButton.addEventListener('click', async () => {
      const targetId = slot.querySelector('#category-reclassify-target').value;
      await reclassifyAndDeleteCategory(activeSpace.id, category.id, targetId);
      deleteBlockedState = null;
      render(container);
    });
  } else if (confirmButton) {
    confirmButton.disabled = true;
  }
}

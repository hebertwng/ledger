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
import { iconSvg } from '../../utils/icons.js';
import { categoryIconHtml, iconPickerHtml, colorPickerHtml, openModal, CATEGORY_COLORS, confirmDialog } from '../../utils/ui.js';

// Aba exibida (despesas ou receitas) — o cadastro é sempre do tipo da aba aberta.
let activeKind = 'expense';
let formState = null;

export async function render(container) {
  const activeSpace = await getActiveSpace();
  const categories = activeSpace ? await listCategories(activeSpace.id) : [];
  const tree = buildCategoryTree(categories.filter((category) => category.kind === activeKind));
  const activeTree = tree.filter((parent) => !parent.archived);
  const archivedTree = tree.filter((parent) => parent.archived);

  container.innerHTML = `
    <section class="view">
      <div class="view__header">
        <h1>${t('modules.categories.title')}</h1>
        <button type="button" id="categories-new-button" class="button button--soft">${iconSvg('plusCircle', { size: 18 })} ${t(`categories.newButton.${activeKind}`)}</button>
      </div>
      <div class="tabs" role="tablist">
        <button type="button" class="tabs__tab ${activeKind === 'expense' ? 'is-active' : ''}" data-tab="expense" role="tab" aria-selected="${activeKind === 'expense'}">${t('categories.tab.expense')}</button>
        <button type="button" class="tabs__tab ${activeKind === 'income' ? 'is-active' : ''}" data-tab="income" role="tab" aria-selected="${activeKind === 'income'}">${t('categories.tab.income')}</button>
      </div>
      ${activeTree.length === 0 ? `<div class="empty-state"><p>${t('categories.emptyState')}</p></div>` : `<ul class="entity-list">${activeTree.map((parent) => parentRowHtml(parent)).join('')}</ul>`}
      ${
        archivedTree.length
          ? `<p class="section-title">${iconSvg('folder', { size: 16 })} ${t('categories.archivedTitle')}</p>
             <ul class="entity-list">${archivedTree.map((parent) => parentRowHtml(parent)).join('')}</ul>`
          : ''
      }
      <div id="categories-modal-slot"></div>
    </section>
  `;

  for (const tab of container.querySelectorAll('[data-tab]')) {
    tab.addEventListener('click', () => {
      activeKind = tab.dataset.tab;
      render(container);
    });
  }

  container.querySelector('#categories-new-button').addEventListener('click', () => {
    formState = { mode: 'create', level: 'category' };
    renderForm(container, activeSpace, categories);
  });

  for (const element of container.querySelectorAll('[data-edit-id]')) {
    element.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      formState = { mode: 'edit', category: categories.find((category) => category.id === element.dataset.editId) };
      renderForm(container, activeSpace, categories);
    });
  }

  for (const button of container.querySelectorAll('[data-add-child]')) {
    button.addEventListener('click', () => {
      formState = { mode: 'create', level: 'subcategory', parentId: button.dataset.addChild };
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

  if (formState) renderForm(container, activeSpace, categories);
}

function parentRowHtml(parent) {
  const children = parent.children
    .map(
      (child) => `
        <li class="entity-row entity-row--clickable entity-row--child ${child.archived ? 'is-archived' : ''}" data-edit-id="${child.id}" tabindex="0">
          <span class="entity-row__main"><span class="entity-row__title">${escapeHtml(child.name)}${child.archived ? ` <span class="badge">${t('common.archivedBadge')}</span>` : ''}</span></span>
          <span class="entity-row__actions">
            <button type="button" class="link-button link-button--muted" data-archive-id="${child.id}">${iconSvg(child.archived ? 'unarchive' : 'archive', { size: 14 })} ${child.archived ? t('common.unarchive') : t('common.archive')}</button>
          </span>
        </li>`
    )
    .join('');

  return `
    <li class="entity-row entity-row--clickable ${parent.archived ? 'is-archived' : ''}" data-edit-id="${parent.id}" tabindex="0">
      ${categoryIconHtml(parent, { size: 36 })}
      <span class="entity-row__main"><span class="entity-row__title">${escapeHtml(parent.name)}</span></span>
      <span class="entity-row__actions">
        <button type="button" class="link-button link-button--muted" data-archive-id="${parent.id}">${iconSvg(parent.archived ? 'unarchive' : 'archive', { size: 14 })} ${parent.archived ? t('common.unarchive') : t('common.archive')}</button>
        ${parent.archived ? '' : `<button type="button" class="link-button link-button--primary" data-add-child="${parent.id}">${iconSvg('plus', { size: 14 })} ${t('categories.addSubcategory')}</button>`}
      </span>
    </li>
    ${children}
  `;
}

function renderForm(container, activeSpace, categories) {
  const slot = container.querySelector('#categories-modal-slot');
  const isEdit = formState.mode === 'edit';
  const category = formState.category;
  const kind = isEdit ? category.kind : activeKind;
  const level = isEdit ? (category.parentId ? 'subcategory' : 'category') : formState.level;
  const parentOptions = categories.filter((item) => !item.parentId && item.kind === kind && !item.archived && (!isEdit || item.id !== category.id));

  const kindLabel = t(`categories.kind.${kind}`);

  const close = () => {
    formState = null;
    render(container);
  };

  const titleKey = isEdit ? (level === 'subcategory' ? 'categories.form.titleEditSub' : 'categories.form.titleEdit') : level === 'subcategory' ? 'categories.form.titleCreateSub' : 'categories.form.titleCreate';

  const modal = openModal(slot, {
    title: `${t(titleKey)} <em>${kindLabel}</em>`,
    size: 'lg',
    onClose: close,
    body: `
      <form id="category-form" class="modal__body" novalidate>
        ${
          isEdit
            ? ''
            : `<div class="segmented">
                <button type="button" class="segmented__option ${level === 'category' ? 'is-active' : ''}" data-level="category">${t('categories.level.category')}</button>
                <button type="button" class="segmented__option ${level === 'subcategory' ? 'is-active' : ''}" data-level="subcategory" ${parentOptions.length ? '' : 'disabled'}>${t('categories.level.subcategory')}</button>
              </div>`
        }
        ${
          level === 'subcategory'
            ? `
              <div class="form-field">
                <label for="category-parent">${t('categories.form.parent')}</label>
                <select id="category-parent" name="parentId">
                  <option value="">${t('categories.form.parentSelect')}</option>
                  ${parentOptions
                    .map((parent) => `<option value="${parent.id}" ${(isEdit ? category.parentId : formState.parentId) === parent.id ? 'selected' : ''}>${escapeHtml(parent.name)}</option>`)
                    .join('')}
                </select>
              </div>
              <div class="form-field">
                <label for="category-name">${t('categories.form.subName')}</label>
                <input id="category-name" name="name" type="text" autocomplete="off" placeholder="${t('categories.form.subNamePlaceholder')}" value="${isEdit ? escapeHtml(category.name) : ''}" />
              </div>
            `
            : `
              <div style="display:flex;align-items:center;gap:16px">
                <span id="category-preview">${categoryIconHtml(isEdit ? category : { name: '', icon: null, color: CATEGORY_COLORS[0] }, { size: 56 })}</span>
                <div class="form-field" style="flex:1">
                  <label for="category-name">${t('categories.form.name')}</label>
                  <input id="category-name" name="name" type="text" autocomplete="off" placeholder="${t('categories.form.namePlaceholder')}" value="${isEdit ? escapeHtml(category.name) : ''}" />
                </div>
              </div>
              <div class="form-field">
                <span class="form-field__label">${t('categories.form.icon')}</span>
                ${iconPickerHtml('icon', isEdit ? category.icon : null)}
              </div>
              <div class="form-field">
                <span class="form-field__label">${t('categories.form.color')}</span>
                ${colorPickerHtml('color', isEdit ? category.color || null : CATEGORY_COLORS[0])}
              </div>
            `
        }
        <p class="form-error" id="category-form-error" hidden></p>
        <div class="form-actions form-actions--split">
          ${isEdit ? `<button type="button" class="button button--danger" id="category-delete">${iconSvg('trash', { size: 16 })} ${t('common.delete')}</button>` : '<span></span>'}
          <span style="display:flex;gap:8px">
            <button type="button" id="category-form-cancel" class="button">${t('common.cancel')}</button>
            <button type="submit" class="button button--primary">${isEdit ? t('common.save') : t(level === 'subcategory' ? 'categories.form.createSub' : 'categories.form.create')}</button>
          </span>
        </div>
        <div id="category-delete-slot"></div>
      </form>
    `,
  });

  const form = modal.querySelector('#category-form');
  modal.querySelector('#category-form-cancel').addEventListener('click', close);
  modal.querySelector('#category-name').focus();

  for (const button of modal.querySelectorAll('[data-level]')) {
    button.addEventListener('click', () => {
      formState.level = button.dataset.level;
      renderForm(container, activeSpace, categories);
    });
  }

  // Prévia ao vivo do ícone/cor escolhidos.
  const preview = modal.querySelector('#category-preview');
  if (preview) {
    const updatePreview = () => {
      const data = new FormData(form);
      preview.innerHTML = categoryIconHtml({ name: String(data.get('name') || ''), icon: data.get('icon'), color: data.get('color') }, { size: 56 });
    };
    form.addEventListener('change', updatePreview);
    form.addEventListener('input', updatePreview);
  }

  modal.querySelector('#category-delete')?.addEventListener('click', () => handleDelete(container, activeSpace, categories, modal));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const errorElement = modal.querySelector('#category-form-error');
    const showError = (message) => {
      errorElement.textContent = message;
      errorElement.hidden = false;
    };
    const name = String(formData.get('name') || '').trim();
    if (!isRequired(name)) return showError(t('categories.validation.nameRequired'));

    const duplicate = categories.some(
      (item) =>
        item.kind === kind &&
        item.name.trim().toLowerCase() === name.toLowerCase() &&
        (item.parentId || null) === (level === 'subcategory' ? String(formData.get('parentId') || '') || null : null) &&
        (!isEdit || item.id !== category.id)
    );
    if (duplicate) return showError(t('categories.validation.duplicate'));

    if (level === 'subcategory') {
      const parentId = String(formData.get('parentId') || '');
      if (!parentId) return showError(t('categories.validation.parentRequired'));
      if (isEdit) await updateCategory(category.id, { name, parentId });
      else await createCategory(activeSpace.id, { name, kind, parentId });
    } else {
      const icon = String(formData.get('icon') || '') || null;
      const color = String(formData.get('color') || '') || null;
      if (isEdit) await updateCategory(category.id, { name, icon, color });
      else await createCategory(activeSpace.id, { name, kind, parentId: null, icon, color });
    }

    formState = null;
    render(container);
  });
}

async function handleDelete(container, activeSpace, categories, modal) {
  const category = formState.category;
  if (!(await confirmDialog(t('categories.deleteConfirm')))) return;
  const result = await deleteCategory(activeSpace.id, category.id);
  if (result.allowed) {
    formState = null;
    render(container);
    return;
  }

  const slot = modal.querySelector('#category-delete-slot');
  if (result.reason === 'hasChildren') {
    slot.innerHTML = `<div class="form-note" style="margin:0"><p>${t('categories.deleteBlockedChildren')}</p></div>`;
    return;
  }

  // Lançamentos usam esta categoria: mover para outra do mesmo tipo, ou só arquivar.
  const targets = categories.filter((item) => item.id !== category.id && item.kind === category.kind && !item.archived);
  slot.innerHTML = `
    <div class="form-note" style="margin:0;display:flex;flex-direction:column;gap:12px">
      <p>${t('categories.deleteBlockedTransactions')}</p>
      <div class="form-field">
        <label for="category-reclassify-target">${t('categories.form.reclassifyTarget')}</label>
        <select id="category-reclassify-target">
          ${targets
            .map((target) => {
              const parent = target.parentId ? categories.find((item) => item.id === target.parentId) : null;
              return `<option value="${target.id}">${escapeHtml(parent ? `${parent.name} › ${target.name}` : target.name)}</option>`;
            })
            .join('')}
        </select>
      </div>
      <div class="form-actions">
        <button type="button" class="button" id="category-archive-instead">${t('common.archive')}</button>
        <button type="button" class="button button--danger" id="category-reclassify-confirm" ${targets.length ? '' : 'disabled'}>${t('categories.form.reclassifyAndDelete')}</button>
      </div>
    </div>
  `;

  slot.querySelector('#category-archive-instead').addEventListener('click', async () => {
    await setCategoryArchived(category.id, true);
    formState = null;
    render(container);
  });
  slot.querySelector('#category-reclassify-confirm').addEventListener('click', async () => {
    const targetId = slot.querySelector('#category-reclassify-target').value;
    await reclassifyAndDeleteCategory(activeSpace.id, category.id, targetId);
    formState = null;
    render(container);
  });
}

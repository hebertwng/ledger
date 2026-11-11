import { iconSvg } from './icons.js';
import { escapeHtml } from './html.js';
import { categoryIconHtml } from './ui.js';

// Pura: monta a lista exibida no seletor de categoria — só as categorias do tipo do lançamento
// (despesa ou receita), sem as arquivadas, com cada subcategoria logo abaixo da sua principal.
// A categoria já escolhida continua na lista mesmo se tiver sido arquivada depois.
export function buildCategoryOptions(categories, kind, selectedId = null) {
  const visible = (category) => category.kind === kind && (!category.archived || category.id === selectedId);
  const parents = categories.filter((category) => !category.parentId && visible(category)).sort((a, b) => a.name.localeCompare(b.name));
  const options = [];
  for (const parent of parents) {
    options.push({ category: parent, parent: null });
    categories
      .filter((child) => child.parentId === parent.id && visible(child))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((child) => options.push({ category: child, parent }));
  }
  return options;
}

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Seletor de categoria com busca. Ao buscar, uma subcategoria que bate com o texto aparece junto
// com a sua principal, para não perder o contexto.
export function mountCategoryCombo(root, { categories, kind, value = null, labels, onChange }) {
  let currentKind = kind;
  let currentValue = value;
  let open = false;
  let query = '';
  let highlighted = 0;
  const byId = new Map(categories.map((category) => [category.id, category]));

  const filteredOptions = () => {
    const options = buildCategoryOptions(categories, currentKind, currentValue);
    if (!query) return options;
    const needle = normalize(query);
    const matches = new Set();
    for (const option of options) {
      if (normalize(option.category.name).includes(needle)) {
        matches.add(option.category.id);
        if (option.parent) matches.add(option.parent.id);
      }
    }
    return options.filter((option) => matches.has(option.category.id));
  };

  const selectedHtml = () => {
    const category = currentValue ? byId.get(currentValue) : null;
    if (!category) return `<span class="combo__value combo__placeholder">${escapeHtml(labels.placeholder)}</span>`;
    const parent = category.parentId ? byId.get(category.parentId) : null;
    return `${categoryIconHtml(category, { parent, size: 26 })}<span class="combo__value">${escapeHtml(parent ? `${parent.name} › ${category.name}` : category.name)}</span>`;
  };

  const listHtml = (options) => {
    const items = options.map(
      (option, index) => `
        <li class="combo__option ${option.parent ? 'combo__option--child' : ''} ${option.category.id === currentValue ? 'is-selected' : ''} ${index === highlighted ? 'is-highlighted' : ''}"
            role="option" data-value="${option.category.id}" aria-selected="${option.category.id === currentValue}">
          ${option.parent ? '' : categoryIconHtml(option.category, { size: 24 })}
          <span>${escapeHtml(option.category.name)}</span>
        </li>`
    );
    const none = query
      ? ''
      : `<li class="combo__option ${!currentValue ? 'is-selected' : ''}" role="option" data-value="">${escapeHtml(labels.none)}</li>`;
    return items.length || none ? `${none}${items.join('')}` : `<li class="combo__empty">${escapeHtml(labels.empty)}</li>`;
  };

  function render() {
    const options = open ? filteredOptions() : [];
    if (highlighted >= options.length) highlighted = Math.max(0, options.length - 1);
    root.classList.add('combo');
    root.classList.toggle('is-open', open);
    root.innerHTML = `
      <button type="button" class="combo__button" aria-haspopup="listbox" aria-expanded="${open}">
        ${selectedHtml()}
        ${iconSvg('chevronDown', { size: 16 })}
      </button>
      ${
        open
          ? `<div class="combo__panel">
              <label class="combo__search">${iconSvg('search', { size: 16 })}<input type="text" value="${escapeHtml(query)}" placeholder="${escapeHtml(labels.search)}" aria-label="${escapeHtml(labels.search)}" /></label>
              <ul class="combo__list" role="listbox">${listHtml(options)}</ul>
            </div>`
          : ''
      }
    `;

    root.querySelector('.combo__button').addEventListener('click', () => {
      open = !open;
      query = '';
      highlighted = 0;
      render();
      if (open) root.querySelector('.combo__search input').focus();
    });

    if (!open) return;
    const input = root.querySelector('.combo__search input');
    input.addEventListener('input', () => {
      query = input.value;
      highlighted = 0;
      const list = root.querySelector('.combo__list');
      list.innerHTML = listHtml(filteredOptions());
      bindOptions();
    });
    input.addEventListener('keydown', (event) => {
      const optionElements = root.querySelectorAll('.combo__option');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        highlighted = Math.min(Math.max(highlighted + (event.key === 'ArrowDown' ? 1 : -1), 0), optionElements.length - 1);
        optionElements.forEach((element, index) => element.classList.toggle('is-highlighted', index === highlighted));
        optionElements[highlighted]?.scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const element = optionElements[highlighted];
        if (element) choose(element.dataset.value || null);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    });
    bindOptions();
  }

  function bindOptions() {
    root.querySelectorAll('.combo__option').forEach((element) => {
      element.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(element.dataset.value || null);
      });
    });
  }

  function choose(id) {
    currentValue = id;
    open = false;
    render();
    root.querySelector('.combo__button').focus();
    onChange?.(currentValue);
  }

  function close() {
    if (!open) return;
    open = false;
    render();
  }

  const onDocumentClick = (event) => {
    if (!document.body.contains(root)) {
      document.removeEventListener('mousedown', onDocumentClick);
      return;
    }
    if (!root.contains(event.target)) close();
  };
  document.addEventListener('mousedown', onDocumentClick);

  render();

  return {
    getValue: () => currentValue,
    // Trocar o tipo (despesa ↔ receita) limpa a categoria se ela não for do novo tipo.
    setKind(nextKind) {
      currentKind = nextKind;
      const category = currentValue ? byId.get(currentValue) : null;
      if (category && category.kind !== nextKind) {
        currentValue = null;
        onChange?.(null);
      }
      render();
    },
  };
}

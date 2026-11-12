import { iconSvg } from './icons.js';
import { escapeHtml } from './html.js';

// Seletor no mesmo estilo do seletor de categorias (.combo), sem campo de busca, aplicado
// automaticamente a todo <select> da aplicação (idioma, filtros, formulários).
//
// O <select> original continua no lugar, só escondido: ele segue sendo a fonte do valor, entra
// normalmente no FormData e recebe os eventos "change"/"input" — por isso nenhuma tela precisa
// mudar. Para manter um select nativo, marque-o com data-native.
//
// Variações de aparência pelo lugar onde o select está:
//   • .filter-chip       → "chip" compacto (filtros de Lançamentos e Relatórios);
//   • .sidebar__language → discreto, nas cores do menu, abrindo para cima;
//   • demais             → campo de formulário.
const ENHANCED = new WeakMap();

function variantOf(select) {
  if (select.closest('.sidebar__language')) return 'bare';
  if (select.closest('.filter-chip')) return 'chip';
  return 'field';
}

function optionItems(select) {
  const items = [];
  for (const child of select.children) {
    if (child instanceof HTMLOptGroupElement) {
      items.push({ group: child.label });
      for (const option of child.children) items.push({ option, child: true });
    } else if (child instanceof HTMLOptionElement) {
      items.push({ option: child, child: false });
    }
  }
  return items.filter((item) => item.group || !item.option.hidden);
}

function enhance(select) {
  if (ENHANCED.has(select) || select.multiple || select.hasAttribute('data-native') || select.size > 1) return;
  const variant = variantOf(select);
  const combo = document.createElement('div');
  combo.className = `combo combo--select combo--${variant}`;
  select.classList.add('select-native-hidden');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(combo);

  let open = false;
  let highlighted = -1;

  const choosable = () => optionItems(select).filter((item) => item.option && !item.option.disabled);

  const buttonLabel = () => {
    const option = select.options[select.selectedIndex];
    const text = option ? option.textContent.trim() : '';
    // Rótulo acessível: o <label for> do select, ou o aria-label dele.
    return { text, placeholder: !option || option.value === '' };
  };

  function renderButton() {
    const { text, placeholder } = buttonLabel();
    combo.classList.toggle('is-set', select.classList.contains('is-set'));
    combo.classList.toggle('is-disabled', select.disabled);
    const button = combo.querySelector('.combo__button');
    const labelText = select.getAttribute('aria-label') || (select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent.trim()) || '';
    const inner = `<span class="combo__value ${placeholder && variant === 'field' ? 'combo__placeholder' : ''}">${escapeHtml(text)}</span>${iconSvg('chevronDown', { size: variant === 'field' ? 16 : 12 })}`;
    if (button) {
      button.innerHTML = inner;
      button.disabled = select.disabled;
      button.setAttribute('aria-expanded', String(open));
      if (labelText) button.setAttribute('aria-label', `${labelText}: ${text}`);
      return;
    }
    combo.innerHTML = `<button type="button" class="combo__button" aria-haspopup="listbox" aria-expanded="false" ${select.disabled ? 'disabled' : ''}>${inner}</button>`;
    if (select.id) combo.querySelector('.combo__button').id = `${select.id}-combo`;
    if (labelText) combo.querySelector('.combo__button').setAttribute('aria-label', `${labelText}: ${text}`);
    bindButton();
  }

  function listHtml() {
    const items = optionItems(select);
    let index = -1;
    return items
      .map((item) => {
        if (item.group) return `<li class="combo__group" role="presentation">${escapeHtml(item.group)}</li>`;
        const { option } = item;
        if (!option.disabled) index += 1;
        const selected = option.selected;
        return `<li class="combo__option ${item.child ? 'combo__option--grouped' : ''} ${selected ? 'is-selected' : ''} ${option.disabled ? 'is-disabled' : ''} ${!option.disabled && index === highlighted ? 'is-highlighted' : ''}"
                   role="option" aria-selected="${selected}" ${option.disabled ? 'aria-disabled="true"' : `data-index="${index}"`}>
                  <span>${escapeHtml(option.textContent.trim())}</span>${selected ? iconSvg('check', { size: 14 }) : ''}
                </li>`;
      })
      .join('');
  }

  function openPanel() {
    if (select.disabled) return;
    open = true;
    const options = choosable();
    highlighted = Math.max(0, options.findIndex((item) => item.option.selected));
    combo.classList.add('is-open');
    const panel = document.createElement('div');
    panel.className = 'combo__panel';
    panel.innerHTML = `<ul class="combo__list" role="listbox">${listHtml()}</ul>`;
    combo.appendChild(panel);
    // Abre para cima quando não há espaço embaixo (ex.: seletor de idioma no rodapé do menu).
    const rect = combo.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    combo.classList.toggle('combo--up', variant === 'bare' || (spaceBelow < Math.min(260, panel.offsetHeight + 12) && rect.top > spaceBelow));
    panel.querySelectorAll('[data-index]').forEach((element) => {
      element.addEventListener('mousedown', (event) => {
        event.preventDefault();
        choose(Number(element.dataset.index));
      });
    });
    panel.querySelector('.is-highlighted, .is-selected')?.scrollIntoView({ block: 'nearest' });
    renderButton();
    document.addEventListener('mousedown', onOutside);
  }

  function closePanel() {
    if (!open) return;
    open = false;
    combo.classList.remove('is-open', 'combo--up');
    combo.querySelector('.combo__panel')?.remove();
    document.removeEventListener('mousedown', onOutside);
    renderButton();
  }

  function onOutside(event) {
    if (!combo.isConnected) {
      document.removeEventListener('mousedown', onOutside);
      return;
    }
    if (!combo.contains(event.target)) closePanel();
  }

  function choose(index) {
    const item = choosable()[index];
    closePanel();
    combo.querySelector('.combo__button')?.focus();
    if (!item || item.option.selected) return;
    select.value = item.option.value;
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    renderButton();
  }

  function moveHighlight(delta) {
    const count = choosable().length;
    if (!count) return;
    highlighted = Math.min(Math.max(highlighted + delta, 0), count - 1);
    combo.querySelectorAll('[data-index]').forEach((element) => element.classList.toggle('is-highlighted', Number(element.dataset.index) === highlighted));
    combo.querySelector('.is-highlighted')?.scrollIntoView({ block: 'nearest' });
  }

  function bindButton() {
    const button = combo.querySelector('.combo__button');
    button.addEventListener('click', () => (open ? closePanel() : openPanel()));
    button.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!open) openPanel();
        else moveHighlight(event.key === 'ArrowDown' ? 1 : -1);
      } else if ((event.key === 'Enter' || event.key === ' ') && open) {
        event.preventDefault();
        choose(highlighted);
      } else if (event.key === 'Escape' && open) {
        event.preventDefault();
        event.stopPropagation();
        closePanel();
      } else if (event.key === 'Tab') {
        closePanel();
      }
    });
  }

  // Mantém o botão em dia quando a tela muda o select por código (valor, opções, desabilitado).
  select.addEventListener('change', () => renderButton());
  new MutationObserver(() => {
    if (open) {
      const list = combo.querySelector('.combo__list');
      if (list) list.innerHTML = listHtml();
    }
    renderButton();
  }).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'class'] });

  ENHANCED.set(select, renderButton);
  renderButton();
}

// Valor alterado por código (select.value = …) não dispara evento; quem fizer isso pode chamar
// refreshEnhancedSelect(select). Como todas as telas redesenham o HTML a cada mudança, na prática
// o select já nasce com o valor certo.
export function refreshEnhancedSelect(select) {
  ENHANCED.get(select)?.();
}

export function enhanceSelects(root = document) {
  if (root instanceof HTMLSelectElement) enhance(root);
  root.querySelectorAll?.('select').forEach(enhance);
}

// Aplica a toda a página, inclusive aos selects que as telas criam depois.
export function autoEnhanceSelects() {
  enhanceSelects(document);
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element) enhanceSelects(node);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}

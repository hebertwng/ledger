import { iconSvg } from './icons.js';
import { escapeHtml } from './html.js';

// Calendário no mesmo estilo dos seletores (.combo), no lugar do calendário nativo do navegador.
// Vale para todo <input type="date"> e <input type="month"> da aplicação (marque data-native para
// manter o nativo). O campo continua digitável e continua sendo a fonte do valor (AAAA-MM-DD ou
// AAAA-MM): o calendário só escreve nele e dispara "input"/"change", então nenhuma tela muda.
//
// O painel fica preso ao <body> (position: fixed), abaixo do campo — ou acima, se não couber —,
// para não ser cortado por janelas com rolagem.
let getLocale = () => 'pt-BR';
const DEFAULT_LABELS = { today: 'Hoje', clear: 'Limpar', previous: 'Anterior', next: 'Próximo', thisMonth: 'Este mês' };
let getLabels = () => DEFAULT_LABELS;

let panel = null;
let current = null; // { input, mode, viewYear, viewMonth, focusISO }

const pad = (value) => String(value).padStart(2, '0');
const toISO = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const toMonthISO = (year, month) => `${year}-${pad(month + 1)}`;

function todayParts() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() };
}

function parseISO(value) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value || '');
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: match[3] ? Number(match[3]) : 1 };
}

function inRange(iso, input) {
  const min = input.min || '';
  const max = input.max || '';
  const key = iso.slice(0, min.length || iso.length);
  if (min && key < min) return false;
  if (max && iso.slice(0, max.length) > max) return false;
  return true;
}

function monthTitle(year, month) {
  const text = new Intl.DateTimeFormat(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month, 1)));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function weekdayNames() {
  // Semana começando no domingo (como nos calendários brasileiros e americanos).
  const format = new Intl.DateTimeFormat(getLocale(), { weekday: 'short', timeZone: 'UTC' });
  return Array.from({ length: 7 }, (_, index) => format.format(new Date(Date.UTC(2023, 0, 1 + index))).replace('.', '').slice(0, 3));
}

function monthShortNames() {
  const format = new Intl.DateTimeFormat(getLocale(), { month: 'short', timeZone: 'UTC' });
  return Array.from({ length: 12 }, (_, index) => {
    const text = format.format(new Date(Date.UTC(2023, index, 1))).replace('.', '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
}

/* ------------------------------------------------------------------ */
/* Marcação                                                            */
/* ------------------------------------------------------------------ */
function daysHtml() {
  const { input, viewYear, viewMonth, focusISO } = current;
  const today = todayParts();
  const todayISO = toISO(today.year, today.month, today.day);
  const first = new Date(viewYear, viewMonth, 1);
  const start = new Date(viewYear, viewMonth, 1 - first.getDay());
  const cells = [];
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    const iso = toISO(date.getFullYear(), date.getMonth(), date.getDate());
    const classes = ['dp__day'];
    if (date.getMonth() !== viewMonth) classes.push('is-outside');
    if (iso === input.value) classes.push('is-selected');
    if (iso === todayISO) classes.push('is-today');
    if (iso === focusISO) classes.push('is-focused');
    const disabled = !inRange(iso, input);
    cells.push(`<button type="button" class="${classes.join(' ')}" data-date="${iso}" tabindex="-1" ${disabled ? 'disabled' : ''} aria-pressed="${iso === input.value}">${date.getDate()}</button>`);
  }
  return `
    <div class="dp__weekdays">${weekdayNames().map((name) => `<span>${escapeHtml(name)}</span>`).join('')}</div>
    <div class="dp__grid">${cells.join('')}</div>`;
}

function monthsHtml() {
  const { input, viewYear, focusISO } = current;
  const today = todayParts();
  const names = monthShortNames();
  return `<div class="dp__months">${names
    .map((name, month) => {
      const iso = toMonthISO(viewYear, month);
      const classes = ['dp__month'];
      if (iso === input.value) classes.push('is-selected');
      if (viewYear === today.year && month === today.month) classes.push('is-today');
      if (iso === focusISO) classes.push('is-focused');
      return `<button type="button" class="${classes.join(' ')}" data-month="${iso}" tabindex="-1" ${inRange(iso, input) ? '' : 'disabled'}>${escapeHtml(name)}</button>`;
    })
    .join('')}</div>`;
}

function render() {
  const { input, mode, viewYear, viewMonth } = current;
  const labels = { ...DEFAULT_LABELS, ...getLabels() };
  const isMonth = mode === 'month';
  panel.innerHTML = `
    <div class="dp__header">
      <button type="button" class="dp__nav" data-nav="-1" aria-label="${escapeHtml(labels.previous)}">${iconSvg('chevronLeft', { size: 16 })}</button>
      <strong class="dp__title" aria-live="polite">${escapeHtml(isMonth ? String(viewYear) : monthTitle(viewYear, viewMonth))}</strong>
      <button type="button" class="dp__nav" data-nav="1" aria-label="${escapeHtml(labels.next)}">${iconSvg('chevronRight', { size: 16 })}</button>
    </div>
    ${isMonth ? monthsHtml() : daysHtml()}
    <div class="dp__footer">
      ${input.required ? '<span></span>' : `<button type="button" class="dp__link" data-action="clear">${escapeHtml(labels.clear)}</button>`}
      <button type="button" class="dp__link dp__link--strong" data-action="today">${escapeHtml(isMonth ? labels.thisMonth : labels.today)}</button>
    </div>`;
}

/* ------------------------------------------------------------------ */
/* Abrir, posicionar, escolher                                         */
/* ------------------------------------------------------------------ */
function position() {
  if (!current || !panel) return;
  const rect = current.input.getBoundingClientRect();
  if (!rect.width || !current.input.isConnected) return close();
  const width = panel.offsetWidth;
  const height = panel.offsetHeight;
  const spaceBelow = window.innerHeight - rect.bottom;
  const top = spaceBelow < height + 12 && rect.top > spaceBelow ? rect.top - height - 6 : rect.bottom + 6;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.left));
  panel.style.top = `${Math.round(Math.max(8, top))}px`;
  panel.style.left = `${Math.round(left)}px`;
}

function open(input) {
  if (input.disabled || input.readOnly) return;
  if (current?.input === input) return;
  close();
  const mode = input.type === 'month' ? 'month' : 'date';
  const today = todayParts();
  const parsed = parseISO(input.value) || today;
  current = {
    input,
    mode,
    viewYear: parsed.year,
    viewMonth: parsed.month,
    focusISO: input.value || (mode === 'month' ? toMonthISO(today.year, today.month) : toISO(today.year, today.month, today.day)),
  };
  panel = document.createElement('div');
  panel.className = `dp dp--${mode}`;
  panel.setAttribute('role', 'dialog');
  panel.addEventListener('mousedown', onPanelMouseDown);
  panel.addEventListener('click', onPanelClick);
  document.body.appendChild(panel);
  render();
  position();
  input.classList.add('is-picking');
}

function close() {
  if (!panel) return;
  current?.input.classList.remove('is-picking');
  panel.remove();
  panel = null;
  current = null;
}

function choose(value) {
  const { input } = current;
  close();
  if (input.value !== value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  input.focus();
}

function shiftView(delta) {
  if (current.mode === 'month') current.viewYear += delta;
  else {
    const date = new Date(current.viewYear, current.viewMonth + delta, 1);
    current.viewYear = date.getFullYear();
    current.viewMonth = date.getMonth();
  }
  render();
  position();
}

function onPanelMouseDown(event) {
  // Mantém o foco no campo (o painel não rouba o foco).
  event.preventDefault();
}

function onPanelClick(event) {
  const target = event.target.closest('button');
  if (!target || target.disabled || !current) return;
  if (target.dataset.nav) return shiftView(Number(target.dataset.nav));
  if (target.dataset.date) return choose(target.dataset.date);
  if (target.dataset.month) return choose(target.dataset.month);
  const today = todayParts();
  if (target.dataset.action === 'today') return choose(current.mode === 'month' ? toMonthISO(today.year, today.month) : toISO(today.year, today.month, today.day));
  if (target.dataset.action === 'clear') return choose('');
}

// Teclado com o calendário aberto: setas andam pelos dias (ou meses), PageUp/PageDown trocam o
// mês (ou ano), Enter escolhe, Esc fecha. Alt+↓ ou F4 abrem pelo teclado.
function onKeyDown(event) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement) || !isEnhanceable(input)) return;
  if (!current || current.input !== input) {
    if ((event.altKey && event.key === 'ArrowDown') || event.key === 'F4') {
      event.preventDefault();
      open(input);
    }
    return;
  }
  const isMonth = current.mode === 'month';
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: isMonth ? -3 : -7, ArrowDown: isMonth ? 3 : 7 }[event.key];
  if (step !== undefined) {
    event.preventDefault();
    const base = parseISO(current.focusISO);
    const next = isMonth ? new Date(base.year, base.month + step, 1) : new Date(base.year, base.month, base.day + step);
    current.focusISO = isMonth ? toMonthISO(next.getFullYear(), next.getMonth()) : toISO(next.getFullYear(), next.getMonth(), next.getDate());
    current.viewYear = next.getFullYear();
    current.viewMonth = next.getMonth();
    render();
  } else if (event.key === 'PageUp' || event.key === 'PageDown') {
    event.preventDefault();
    shiftView(event.key === 'PageUp' ? -1 : 1);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (inRange(current.focusISO, input)) choose(current.focusISO);
  } else if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (event.key === 'Tab') {
    close();
  }
}

function isEnhanceable(input) {
  return (input.type === 'date' || input.type === 'month') && !input.hasAttribute('data-native');
}

export function autoEnhanceDatePickers({ locale, texts } = {}) {
  if (locale) getLocale = locale;
  // texts: função que devolve os rótulos no idioma atual.
  if (texts) getLabels = texts;
  document.documentElement.classList.add('has-custom-datepicker');

  // Clique no campo abre o calendário próprio (e impede o nativo).
  document.addEventListener(
    'click',
    (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || !isEnhanceable(input)) return;
      event.preventDefault();
      open(input);
    },
    true
  );
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousedown', (event) => {
    if (!panel) return;
    if (panel.contains(event.target) || event.target === current?.input) return;
    close();
  });
  // Digitar no campo atualiza o mês exibido.
  document.addEventListener('input', (event) => {
    if (!current || event.target !== current.input) return;
    const parsed = parseISO(current.input.value);
    if (!parsed) return;
    current.viewYear = parsed.year;
    current.viewMonth = parsed.month;
    current.focusISO = current.input.value;
    render();
  });
  window.addEventListener('resize', () => position());
  document.addEventListener('scroll', () => position(), true);
  window.addEventListener('hashchange', () => close());
}

import { iconSvg } from './icons.js';
import { escapeHtml } from './html.js';

// Avisos no padrão visual do app — usados quando Ledi está desligada (com Ledi ligada, as mesmas
// mensagens viram falas dela; ver js/core/mascot.js → appMessage).
//
//   kind: 'success' (verde) · 'warning' (amarelo/laranja) · 'error' (vermelho) · 'info' (azul)
//
// Onde aparece: sempre no topo da janela do navegador, no mesmo lugar — por cima do conteúdo e
// de janelas (formulários) abertas; sobrevive ao redesenho da tela depois de salvar.
const ICONS = { success: 'checkCircle', warning: 'alert', error: 'alert', info: 'info' };
const DURATIONS = { success: 4000, info: 4500, warning: 6500, error: 9000 };

let host = null;

function topHost() {
  if (host?.isConnected) return host;
  host = document.createElement('div');
  host.className = 'app-notices';
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

function noticeHtml(message, kind, closeLabel) {
  return `
    ${iconSvg(ICONS[kind] || ICONS.info, { size: 18 })}
    <span class="app-notice__text">${escapeHtml(message)}</span>
    <button type="button" class="app-notice__close" aria-label="${escapeHtml(closeLabel)}">${iconSvg('close', { size: 14 })}</button>`;
}

function dismiss(notice) {
  if (!notice.isConnected || notice.classList.contains('is-leaving')) return;
  notice.classList.add('is-leaving');
  setTimeout(() => notice.remove(), 200);
}

/**
 * Mostra um aviso no topo da janela do navegador. (anchor é aceito por compatibilidade e ignorado.)
 */
// eslint-disable-next-line no-unused-vars
export function showNotice(message, kind = 'info', { anchor = null, closeLabel = 'Fechar' } = {}) {
  if (!message) return null;
  const notice = document.createElement('div');
  notice.className = `app-notice app-notice--${kind}`;
  notice.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  notice.innerHTML = noticeHtml(message, kind, closeLabel);
  notice.querySelector('.app-notice__close').addEventListener('click', () => dismiss(notice));

  // Sempre no mesmo lugar: topo da janela do navegador (inclusive erros de formulário, que
  // aparecem por cima da janela aberta).
  const container = topHost();
  // Evita empilhar a mesma mensagem repetida.
  for (const existing of container.querySelectorAll('.app-notice')) {
    if (existing.querySelector('.app-notice__text')?.textContent === message) existing.remove();
  }
  container.appendChild(notice);
  while (container.children.length > 3) container.firstElementChild.remove();
  setTimeout(() => dismiss(notice), DURATIONS[kind] || 5000);
  return notice;
}

import { t, getLocale } from '../../core/i18n.js';
import { todayISODate } from '../../utils/dates.js';
import { iconSvg } from '../../utils/icons.js';
import { escapeHtml } from '../../utils/html.js';
import { openModal } from '../../utils/ui.js';
import {
  buildBackup,
  validateBackup,
  summarizeBackup,
  restoreBackup,
  deleteMovements,
  deleteAllData,
} from '../../services/dataManagementRepository.js';

export function render(container) {
  container.innerHTML = `
    <section class="view">
      <div class="view__header"><h1>${t('modules.settings.title')}</h1></div>

      <p class="section-title">${iconSvg('folder', { size: 16 })} ${t('settings.data.title')}</p>
      <p class="form-hint" style="margin-bottom:12px">${t('settings.data.localNote')}</p>
      <ul class="entity-list settings-list">
        ${actionRow('backup', 'arrowDown', t('settings.backup.title'), t('settings.backup.description'), `<button type="button" class="button" id="settings-backup">${iconSvg('arrowDown', { size: 16 })} ${t('settings.backup.button')}</button>`)}
        ${actionRow('restore', 'arrowUp', t('settings.restore.title'), t('settings.restore.description'), `<label class="button" for="settings-restore-file">${iconSvg('arrowUp', { size: 16 })} ${t('settings.restore.button')}</label><input type="file" id="settings-restore-file" accept="application/json,.json" hidden />`)}
        ${actionRow('movements', 'transactions', t('settings.deleteMovements.title'), t('settings.deleteMovements.description'), `<button type="button" class="button button--danger" id="settings-delete-movements">${iconSvg('trash', { size: 16 })} ${t('settings.deleteMovements.button')}</button>`, true)}
        ${actionRow('all', 'trash', t('settings.deleteAll.title'), t('settings.deleteAll.description'), `<button type="button" class="button button--danger" id="settings-delete-all">${iconSvg('trash', { size: 16 })} ${t('settings.deleteAll.button')}</button>`, true)}
      </ul>

      <p class="section-title">${iconSvg('globe', { size: 16 })} ${t('settings.sync.title')}</p>
      <p class="form-hint">${t('modules.settings.comingSoon')}</p>
      <div id="settings-modal-slot"></div>
    </section>
  `;

  container.querySelector('#settings-backup').addEventListener('click', downloadBackup);
  container.querySelector('#settings-restore-file').addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) startRestore(container, file);
  });
  container.querySelector('#settings-delete-movements').addEventListener('click', () =>
    confirmDestructive(container, {
      title: t('settings.deleteMovements.title'),
      message: t('settings.deleteMovements.confirm'),
      run: deleteMovements,
    })
  );
  container.querySelector('#settings-delete-all').addEventListener('click', () =>
    confirmDestructive(container, {
      title: t('settings.deleteAll.title'),
      message: t('settings.deleteAll.confirm'),
      run: deleteAllData,
    })
  );
}

function actionRow(id, icon, title, description, action, danger = false) {
  return `
    <li class="entity-row settings-row" data-row="${id}">
      <span class="settings-row__icon ${danger ? 'is-danger' : ''}">${iconSvg(icon, { size: 18 })}</span>
      <span class="entity-row__main">
        <span class="entity-row__title">${title}</span>
        <span class="entity-row__subtitle">${description}</span>
      </span>
      <span class="entity-row__actions">${action}</span>
    </li>
  `;
}

async function downloadBackup() {
  const backup = await buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ledger-copia-${todayISODate()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function reloadToStart() {
  window.location.hash = '#/dashboard';
  window.location.reload();
}

// Exclusão: mostra o que vai acontecer, oferece baixar a cópia antes e só libera o botão depois
// de o usuário digitar a palavra de confirmação.
function confirmDestructive(container, { title, message, run }) {
  const slot = container.querySelector('#settings-modal-slot');
  const word = t('settings.confirmWord');
  const close = () => {
    slot.innerHTML = '';
  };
  const modal = openModal(slot, {
    title,
    size: 'sm',
    onClose: close,
    body: `
      <div class="modal__body">
        <div class="form-note" style="margin:0;background:var(--color-danger-soft)">
          <p>${message}</p>
          <p><strong>${t('settings.irreversible')}</strong></p>
        </div>
        <button type="button" class="button" id="confirm-backup-first">${iconSvg('arrowDown', { size: 16 })} ${t('settings.backupFirst')}</button>
        <div class="form-field">
          <label for="confirm-word">${t('settings.typeToConfirm', { word: `<strong>${escapeHtml(word)}</strong>` })}</label>
          <input id="confirm-word" type="text" autocomplete="off" spellcheck="false" />
        </div>
        <p class="form-error" id="confirm-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="button" id="confirm-cancel">${t('common.cancel')}</button>
          <button type="button" class="button button--danger" id="confirm-run" disabled>${iconSvg('trash', { size: 16 })} ${t('common.delete')}</button>
        </div>
      </div>
    `,
  });

  const input = modal.querySelector('#confirm-word');
  const runButton = modal.querySelector('#confirm-run');
  input.focus();
  input.addEventListener('input', () => {
    runButton.disabled = input.value.trim().toUpperCase() !== word.toUpperCase();
  });
  modal.querySelector('#confirm-backup-first').addEventListener('click', downloadBackup);
  modal.querySelector('#confirm-cancel').addEventListener('click', () => modal.querySelector('[data-modal-close]').click());
  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    try {
      await run();
      reloadToStart();
    } catch (error) {
      const errorElement = modal.querySelector('#confirm-error');
      errorElement.textContent = t('settings.failed', { message: error.message });
      errorElement.hidden = false;
      runButton.disabled = false;
    }
  });
}

async function startRestore(container, file) {
  const slot = container.querySelector('#settings-modal-slot');
  const close = () => {
    slot.innerHTML = '';
  };

  let parsed = null;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    parsed = null;
  }
  const result = validateBackup(parsed);

  if (!result.ok) {
    openModal(slot, {
      title: t('settings.restore.title'),
      size: 'sm',
      onClose: close,
      body: `<div class="modal__body"><div class="form-note" style="margin:0"><p>${t(`settings.restore.error.${result.reason}`)}</p></div></div>`,
    });
    return;
  }

  const summary = summarizeBackup(result.stores);
  const exportedAt = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString(getLocale()) : '-';
  const modal = openModal(slot, {
    title: t('settings.restore.title'),
    size: 'sm',
    onClose: close,
    body: `
      <div class="modal__body">
        <p>${t('settings.restore.summary', { date: escapeHtml(exportedAt) })}</p>
        <ul class="settings-summary">
          <li><span>${t('nav.accounts')}</span><strong>${summary.accounts}</strong></li>
          <li><span>${t('nav.creditCards')}</span><strong>${summary.creditCards}</strong></li>
          <li><span>${t('nav.categories')}</span><strong>${summary.categories}</strong></li>
          <li><span>${t('nav.transactions')}</span><strong>${summary.transactions}</strong></li>
        </ul>
        <div class="form-note" style="margin:0"><p>${t('settings.restore.replaceWarning')}</p></div>
        <p class="form-error" id="restore-error" hidden></p>
        <div class="form-actions">
          <button type="button" class="button" id="restore-cancel">${t('common.cancel')}</button>
          <button type="button" class="button button--primary" id="restore-run">${iconSvg('arrowUp', { size: 16 })} ${t('settings.restore.confirm')}</button>
        </div>
      </div>
    `,
  });
  modal.querySelector('#restore-cancel').addEventListener('click', () => modal.querySelector('[data-modal-close]').click());
  const restoreButton = modal.querySelector('#restore-run');
  restoreButton.addEventListener('click', async () => {
    restoreButton.disabled = true;
    try {
      await restoreBackup(result.stores);
      reloadToStart();
    } catch (error) {
      const errorElement = modal.querySelector('#restore-error');
      errorElement.textContent = t('settings.failed', { message: error.message });
      errorElement.hidden = false;
      restoreButton.disabled = false;
    }
  });
}

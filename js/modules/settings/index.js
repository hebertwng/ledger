import { t, getLocale } from '../../core/i18n.js';
import { todayISODate } from '../../utils/dates.js';
import { iconSvg } from '../../utils/icons.js';
import { escapeHtml } from '../../utils/html.js';
import { openModal } from '../../utils/ui.js';
import { getActiveSpace, updateOwnerName } from '../../core/bootstrap.js';
import { getThemePreference, setThemePreference } from '../../core/theme.js';
import {
  buildBackup,
  validateBackup,
  summarizeBackup,
  restoreBackup,
  deleteMovements,
  deleteAllData,
} from '../../services/dataManagementRepository.js';
import { formatCentsForInput } from '../../utils/moneyInput.js';
import { parseCurrencyInputToCents } from '../../utils/currency.js';
import {
  MASCOT_NAME,
  isMascotAvailable,
  getMascotSettings,
  updateMascotSettings,
  mascotReact,
  mascotReactAfterReload,
  mascotMessage,
  openGenderChooser,
} from '../../core/mascot.js';

function mascotSectionHtml() {
  if (!isMascotAvailable()) return '';
  const settings = getMascotSettings();
  return `
    <p class="section-title">${iconSvg('sparkles', { size: 16 })} ${t('settings.mascot.title')}</p>
    <p class="form-hint" style="margin-bottom:12px">${t('settings.mascot.description')}</p>
    <div class="mascot-settings">
      <div class="mascot-settings__fields">
        <label class="switch"><input type="checkbox" id="mascot-enabled" ${settings.enabled && settings.gender ? 'checked' : ''} /><span class="switch__track"></span>${t('settings.mascot.enabled')}</label>
        <div class="form-field">
          <span class="form-label">${t('settings.mascot.gender')}</span>
          <div class="lm-segment" role="radiogroup" aria-label="${t('settings.mascot.gender')}">
            ${['m', 'f']
              .map((value) => `<button type="button" role="radio" aria-checked="${settings.gender === value}" class="${settings.gender === value ? 'is-on' : ''}" data-mascot-gender="${value}">${MASCOT_NAME} · ${t(`mascot.gender.${value}`)}</button>`)
              .join('')}
          </div>
        </div>
        <div class="form-field">
          <label for="mascot-high-value">${t('settings.mascot.highValue')}</label>
          <div class="input-prefix"><span>${getLocale() === 'pt-BR' ? 'R$' : '$'}</span><input id="mascot-high-value" type="text" inputmode="numeric" data-money value="${formatCentsForInput(settings.highValueCents, getLocale())}" /></div>
          <small class="form-hint">${t('settings.mascot.highValueHint')}</small>
        </div>
        <p class="mascot-settings__rule">${t('settings.mascot.rule')}</p>
      </div>
    </div>
  `;
}

function bindMascotSection(container) {
  const enabled = container.querySelector('#mascot-enabled');
  if (!enabled) return;
  enabled.addEventListener('change', () => {
    // Ligar sem visual escolhido abre a apresentação de Ledi.
    if (enabled.checked && !getMascotSettings().gender) {
      openGenderChooser();
      return;
    }
    updateMascotSettings({ enabled: enabled.checked });
    render(container);
  });
  for (const button of container.querySelectorAll('[data-mascot-gender]')) {
    button.addEventListener('click', () => {
      updateMascotSettings({ gender: button.dataset.mascotGender, enabled: true });
      render(container);
    });
  }
  container.querySelector('#mascot-high-value').addEventListener('change', (event) => {
    const cents = parseCurrencyInputToCents(event.target.value);
    updateMascotSettings({ highValueCents: Math.max(0, cents) });
  });
}

// Seu perfil: nome com que a pessoa quer ser chamada (saudação, rodapé do menu e falas de Ledi).
// Em branco, a interface não mostra nome nenhum.
function profileSectionHtml(space) {
  return `
    <p class="section-title">${iconSvg('users', { size: 16 })} ${t('settings.profile.title')}</p>
    <form class="mascot-settings settings-profile" id="settings-profile-form" autocomplete="off">
      <div class="form-field">
        <label for="settings-owner-name">${t('settings.profile.nameLabel')}</label>
        <div class="settings-profile__row">
          <input id="settings-owner-name" name="ownerName" type="text" maxlength="60" placeholder="${escapeHtml(t('settings.profile.namePlaceholder'))}" value="${escapeHtml(space?.ownerName || '')}" />
          <button type="submit" class="button button--primary">${t('settings.profile.save')}</button>
        </div>
        <small class="form-hint">${t('settings.profile.nameHint')}</small>
      </div>
    </form>
  `;
}

function bindProfileSection(container) {
  const form = container.querySelector('#settings-profile-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = form.querySelector('#settings-owner-name').value.trim();
    await updateOwnerName(name);
    mascotMessage(name ? t('settings.profile.savedWithName', { name }) : t('settings.profile.cleared'), 'success');
    // Atualiza saudação e rodapé do menu.
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

// Aparência: tema claro, escuro ou automático (segue o sistema operacional).
function appearanceSectionHtml() {
  const preference = getThemePreference();
  const options = [
    ['light', 'sun', t('settings.appearance.light')],
    ['dark', 'moon', t('settings.appearance.dark')],
    ['system', 'settings', t('settings.appearance.system')],
  ];
  return `
    <p class="section-title">${iconSvg('sun', { size: 16 })} ${t('settings.appearance.title')}</p>
    <div class="mascot-settings">
      <div class="lm-segment settings-theme" role="radiogroup" aria-label="${t('settings.appearance.title')}">
        ${options
          .map(
            ([value, icon, label]) =>
              `<button type="button" role="radio" aria-checked="${preference === value}" class="${preference === value ? 'is-on' : ''}" data-theme-option="${value}">${iconSvg(icon, { size: 14 })} ${label}</button>`
          )
          .join('')}
      </div>
      <p class="form-hint" style="margin:10px 0 0">${t('settings.appearance.hint')}</p>
    </div>
  `;
}

function bindAppearanceSection(container) {
  for (const button of container.querySelectorAll('[data-theme-option]')) {
    button.addEventListener('click', () => {
      setThemePreference(button.dataset.themeOption);
      render(container);
    });
  }
}

export async function render(container) {
  const space = await getActiveSpace();
  container.innerHTML = `
    <section class="view">
      <div class="view__header"><h1>${t('modules.settings.title')}</h1></div>

      ${profileSectionHtml(space)}

      ${appearanceSectionHtml()}

      ${mascotSectionHtml()}

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

  bindProfileSection(container);
  bindAppearanceSection(container);
  bindMascotSection(container);
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
      run: async () => {
        await deleteMovements();
        mascotReactAfterReload('dataDeleted');
      },
    })
  );
  container.querySelector('#settings-delete-all').addEventListener('click', () =>
    confirmDestructive(container, {
      title: t('settings.deleteAll.title'),
      message: t('settings.deleteAll.confirm'),
      // Ajustes de Ledi são preferências (como tema e idioma) e não são apagados.
      run: async () => {
        await deleteAllData();
        mascotReactAfterReload('dataDeleted');
      },
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
  mascotReact('backupDone');
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
    // Com Ledi ligada, o erro vira fala dela; senão, abre a janela com a mensagem.
    if (mascotMessage(t(`settings.restore.error.${result.reason}`), 'error')) return;
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
      mascotReactAfterReload('dataRestored');
      reloadToStart();
    } catch (error) {
      const errorElement = modal.querySelector('#restore-error');
      errorElement.textContent = t('settings.failed', { message: error.message });
      errorElement.hidden = false;
      restoreButton.disabled = false;
    }
  });
}

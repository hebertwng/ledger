import { t } from '../../core/i18n.js';

export function render(container) {
  container.innerHTML = `
    <section class="view">
      <h1>${t('modules.settings.title')}</h1>
      <div class="empty-state">
        <p class="empty-state__badge">${t('common.comingSoonTitle')}</p>
        <p>${t('modules.settings.comingSoon')}</p>
      </div>
    </section>
  `;
}

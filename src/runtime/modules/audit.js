(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const page = document.querySelector('[data-page="audit"]');
  if (!page || page.dataset.bpRuntimeAudit === '1') return;
  page.dataset.bpRuntimeAudit = '1';

  const tbody = page.querySelector('tbody');
  const tableWrap = page.querySelector('.tablewrap');
  const subtitle = page.querySelector('.head p');
  if (!tbody || !tableWrap) return;

  if (subtitle) subtitle.textContent = 'Organization-scoped runtime audit for the current prototype. Tamper-evident server storage is required before production.';

  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar bp-runtime-audit-toolbar';
  toolbar.innerHTML = `
    <input class="search-table" id="bpAuditSearch" type="search" aria-label="Search audit events" placeholder="Search action, resource, target or correlation ID">
    <span class="secondary" id="bpAuditCount" aria-live="polite"></span>`;
  tableWrap.before(toolbar);

  const search = toolbar.querySelector('#bpAuditSearch');
  const count = toolbar.querySelector('#bpAuditCount');

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const formatTimestamp = (iso) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
  };

  const resourceName = (entity) => {
    const value = String(entity || 'runtime');
    return value.charAt(0).toUpperCase() + value.slice(1);
  };

  const render = () => {
    const query = search.value.trim().toLowerCase();
    const entries = api.audit.list();
    const filtered = entries.filter((entry) => !query || [entry.action, entry.entity, entry.entityId, entry.id, entry.tenantId, JSON.stringify(entry.metadata || {})].join(' ').toLowerCase().includes(query));

    tbody.innerHTML = filtered.length ? filtered.map((entry) => `
      <tr data-audit-id="${escapeHtml(entry.id)}">
        <td>${escapeHtml(formatTimestamp(entry.at))}</td><td>BrokerPad Runtime</td><td><code>${escapeHtml(entry.action)}</code></td>
        <td>${escapeHtml(resourceName(entry.entity))}</td><td>${escapeHtml(entry.entityId || '—')}</td><td><code>${escapeHtml(entry.id)}</code></td>
      </tr>`).join('') : '<tr><td colspan="6" class="secondary bp-empty-cell">No audit events match the current search.</td></tr>';
    count.textContent = `${filtered.length} of ${entries.length} events`;
  };

  search.addEventListener('input', render);
  api.events.on('audit', render);

  render();
  api.audit.record('audit.module.ready', 'module', 'audit');
})();

(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api || window.__brokerPadSettingsInstalled) return;
  window.__brokerPadSettingsInstalled = true;

  const USER_SCOPE = 'users';
  const AUTOMATION_SCOPE = 'automations';
  const INTEGRATION_SCOPE = 'integrations';
  const now = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const initialUsers = [
    { id: 'USR-1001', name: 'Jordan Lee', email: '', role: 'Sales Manager', team: 'Sales', status: 'Active', createdAt: '2026-08-26T12:00:00.000Z', updatedAt: '2026-08-26T12:00:00.000Z' },
    { id: 'USR-1002', name: 'Taylor Kim', email: '', role: 'Dispatcher', team: 'Operations', status: 'Active', createdAt: '2026-08-26T12:00:00.000Z', updatedAt: '2026-08-26T12:00:00.000Z' },
  ];

  const initialAutomations = [
    { id: 'AUT-1001', name: 'Quote follow-up', trigger: 'Quote sent + 24h', action: 'Send customer message', enabled: false, createdAt: '2026-08-26T12:00:00.000Z', updatedAt: '2026-08-26T12:00:00.000Z' },
    { id: 'AUT-1002', name: 'Pickup reminder', trigger: 'Pickup - 1 day', action: 'Send customer reminder', enabled: false, createdAt: '2026-08-26T12:00:00.000Z', updatedAt: '2026-08-26T12:00:00.000Z' },
  ];

  const initialIntegrations = [
    { id: 'central-dispatch', name: 'Central Dispatch', category: 'Loadboard', status: 'Needs credentials', accountLabel: '', description: 'Loadboard posting and status synchronization.', updatedAt: '2026-08-26T12:00:00.000Z' },
    { id: 'twilio', name: 'Twilio', category: 'Communications', status: 'Needs credentials', accountLabel: '', description: 'SMS and telephony transport.', updatedAt: '2026-08-26T12:00:00.000Z' },
    { id: 'quickbooks', name: 'QuickBooks', category: 'Accounting', status: 'Needs credentials', accountLabel: '', description: 'Accounting export and reconciliation.', updatedAt: '2026-08-26T12:00:00.000Z' },
  ];

  const normalizeUser = (row) => ({
    id: String(row.id || uid('USR')).toUpperCase(),
    name: String(row.name || '').trim(),
    email: String(row.email || '').trim(),
    role: String(row.role || 'Member').trim() || 'Member',
    team: String(row.team || 'General').trim() || 'General',
    status: ['Active', 'Inactive'].includes(row.status) ? row.status : 'Active',
    createdAt: row.createdAt || now(),
    updatedAt: row.updatedAt || now(),
  });

  const normalizeAutomation = (row) => ({
    id: String(row.id || uid('AUT')).toUpperCase(),
    name: String(row.name || '').trim(),
    trigger: String(row.trigger || '').trim(),
    action: String(row.action || '').trim(),
    enabled: Boolean(row.enabled),
    createdAt: row.createdAt || now(),
    updatedAt: row.updatedAt || now(),
  });

  const normalizeIntegration = (row) => ({
    id: String(row.id || uid('INT')).toLowerCase(),
    name: String(row.name || '').trim(),
    category: String(row.category || 'Other').trim() || 'Other',
    status: ['Needs credentials', 'Configured locally', 'Disabled'].includes(row.status) ? row.status : 'Needs credentials',
    accountLabel: String(row.accountLabel || '').trim(),
    description: String(row.description || '').trim(),
    updatedAt: row.updatedAt || now(),
  });

  function ensureArray(scope, seed, normalizer) {
    const existing = api.store.get(scope, null);
    if (Array.isArray(existing)) {
      const normalized = existing.map(normalizer);
      api.store.set(scope, normalized);
      return normalized;
    }
    const rows = seed.map(normalizer);
    api.store.set(scope, rows);
    api.audit.record(`${scope}.seed`, scope.slice(0, -1), '', { count: rows.length, source: 'settings-runtime' });
    return rows;
  }

  let users = ensureArray(USER_SCOPE, initialUsers, normalizeUser);
  let automations = ensureArray(AUTOMATION_SCOPE, initialAutomations, normalizeAutomation);
  let integrations = ensureArray(INTEGRATION_SCOPE, initialIntegrations, normalizeIntegration);

  const directory = Object.freeze({
    list() {
      return users.map((user) => ({ ...user }));
    },
    activeUsers() {
      return users.filter((user) => user.status === 'Active').map((user) => ({ ...user }));
    },
    get(id) {
      const user = users.find((item) => item.id === id);
      return user ? { ...user } : null;
    },
  });

  Object.defineProperty(window, 'BrokerPadDirectory', {
    configurable: true,
    enumerable: true,
    value: directory,
  });

  function modalShell() {
    let layer = document.querySelector('#bpSettingsModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpSettingsModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpSettingsModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openUserEditor(user, onCommit) {
    const creating = !user;
    const current = normalizeUser(user || {});
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpSettingsUserTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpSettingsUserTitle">${creating ? 'Add User' : 'Edit User'}</h3><p>${creating ? 'Create a directory member for BrokerPad.' : escapeHtml(current.id)}</p></div><button type="button" class="bp-runtime-close" data-settings-close aria-label="Close">×</button></div>
        <form id="bpSettingsUserForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Name *</span><input name="name" required value="${escapeHtml(current.name)}"></label>
            <label><span>Email</span><input name="email" type="email" value="${escapeHtml(current.email)}"></label>
            <label><span>Role *</span><input name="role" required value="${escapeHtml(current.role)}"></label>
            <label><span>Team *</span><input name="team" required value="${escapeHtml(current.team)}"></label>
            <label><span>Status</span><select name="status"><option ${current.status === 'Active' ? 'selected' : ''}>Active</option><option ${current.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select></label>
          </div>
          <div class="bp-runtime-form-error" id="bpSettingsUserError" hidden></div>
          <div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn" data-settings-close>Cancel</button><button type="submit" class="btn primary">${creating ? 'Add User' : 'Save Changes'}</button></div>
        </form>
      </div>`;
    layer.querySelectorAll('[data-settings-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpSettingsUserForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpSettingsUserError');
      if (!String(values.name || '').trim() || !String(values.role || '').trim() || !String(values.team || '').trim()) {
        error.textContent = 'Name, role and team are required.';
        error.hidden = false;
        return;
      }
      const email = String(values.email || '').trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        error.textContent = 'Enter a valid email address.';
        error.hidden = false;
        return;
      }
      onCommit(normalizeUser({ ...current, ...values, updatedAt: now() }), creating);
      closeModal();
    });
  }

  function openAutomationEditor(row, onCommit) {
    const creating = !row;
    const current = normalizeAutomation(row || {});
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpSettingsAutomationTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpSettingsAutomationTitle">${creating ? 'New Automation Rule' : 'Edit Automation Rule'}</h3><p>Rule definitions are stored locally; execution requires a production scheduler.</p></div><button type="button" class="bp-runtime-close" data-settings-close aria-label="Close">×</button></div>
        <form id="bpSettingsAutomationForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label class="bp-runtime-span-2"><span>Name *</span><input name="name" required value="${escapeHtml(current.name)}"></label>
            <label><span>Trigger *</span><input name="trigger" required value="${escapeHtml(current.trigger)}"></label>
            <label><span>Action *</span><input name="action" required value="${escapeHtml(current.action)}"></label>
            <label><span>Local state</span><select name="enabled"><option value="false" ${!current.enabled ? 'selected' : ''}>Disabled</option><option value="true" ${current.enabled ? 'selected' : ''}>Enabled locally</option></select></label>
          </div>
          <div class="bp-runtime-form-error" id="bpSettingsAutomationError" hidden></div>
          <div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn" data-settings-close>Cancel</button><button type="submit" class="btn primary">${creating ? 'Create Rule' : 'Save Changes'}</button></div>
        </form>
      </div>`;
    layer.querySelectorAll('[data-settings-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpSettingsAutomationForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpSettingsAutomationError');
      if (!String(values.name || '').trim() || !String(values.trigger || '').trim() || !String(values.action || '').trim()) {
        error.textContent = 'Name, trigger and action are required.';
        error.hidden = false;
        return;
      }
      onCommit(normalizeAutomation({ ...current, ...values, enabled: values.enabled === 'true', updatedAt: now() }), creating);
      closeModal();
    });
  }

  function openIntegrationEditor(row, onCommit) {
    const current = normalizeIntegration(row);
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpSettingsIntegrationTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpSettingsIntegrationTitle">${escapeHtml(current.name)}</h3><p>${escapeHtml(current.category)} integration · secret credentials are not stored in this browser prototype.</p></div><button type="button" class="bp-runtime-close" data-settings-close aria-label="Close">×</button></div>
        <form id="bpSettingsIntegrationForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label class="bp-runtime-span-2"><span>Account label</span><input name="accountLabel" value="${escapeHtml(current.accountLabel)}" placeholder="Non-secret account reference"></label>
            <label><span>Readiness</span><select name="status"><option ${current.status === 'Needs credentials' ? 'selected' : ''}>Needs credentials</option><option ${current.status === 'Configured locally' ? 'selected' : ''}>Configured locally</option><option ${current.status === 'Disabled' ? 'selected' : ''}>Disabled</option></select></label>
          </div>
          <div class="bp-runtime-integrity-warning">Production API keys, passwords and tokens must be stored server-side in a secret manager. This form intentionally stores no secret value.</div>
          <div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn" data-settings-close>Cancel</button><button type="submit" class="btn primary">Save Metadata</button></div>
        </form>
      </div>`;
    layer.querySelectorAll('[data-settings-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpSettingsIntegrationForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      onCommit(normalizeIntegration({ ...current, ...values, updatedAt: now() }));
      closeModal();
    });
  }

  function install() {
    const page = document.querySelector('[data-page="settings"]');
    if (!page || page.dataset.bpRuntimeSettings === '1') return;
    page.dataset.bpRuntimeSettings = '1';

    const legacyIntegrations = document.querySelector('[data-page="integrations"]');
    const legacyUsers = document.querySelector('[data-page="users"]');
    const legacyAutomations = document.querySelector('[data-page="automations"]');
    [legacyIntegrations, legacyUsers, legacyAutomations].forEach((legacy) => {
      if (!legacy) return;
      legacy.dataset.bpSettingsOwned = '1';
      legacy.setAttribute('aria-hidden', 'true');
    });

    page.innerHTML = `
      <div class="head"><div><h1>Settings</h1><p>Organization, users, automations, integrations and platform controls.</p></div></div>
      <div class="bp-settings-tabs" role="tablist" aria-label="Settings sections">
        <button type="button" class="active" role="tab" aria-selected="true" data-settings-tab="organization">Organization</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="users">Users & Roles</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="automations">Automations</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="integrations">Integrations</button>
        <button type="button" role="tab" aria-selected="false" data-settings-tab="security">Security</button>
      </div>
      <div class="bp-settings-panels">
        <section data-settings-panel="organization"></section>
        <section data-settings-panel="users" hidden></section>
        <section data-settings-panel="automations" hidden></section>
        <section data-settings-panel="integrations" hidden></section>
        <section data-settings-panel="security" hidden></section>
      </div>`;

    const panels = Object.fromEntries([...page.querySelectorAll('[data-settings-panel]')].map((panel) => [panel.dataset.settingsPanel, panel]));

    const renderOrganization = () => {
      const settings = api.settings.get();
      panels.organization.innerHTML = `
        <div class="grid3">
          <section class="card"><div class="cardh"><h2>Organization</h2></div><div class="cardb"><div class="record"><span>Tenant</span><b>${escapeHtml(api.tenantId)}</b></div><div class="record"><span>Runtime schema</span><b>v${escapeHtml(api.schemaVersion)}</b></div></div></section>
          <section class="card"><div class="cardh"><h2>Operations</h2></div><div class="cardb"><div class="record"><span>Sales settings</span><b>Runtime-owned</b></div><div class="record"><span>Dispatch settings</span><b>Runtime-owned</b></div></div></section>
          <section class="card"><div class="cardh"><h2>Data</h2></div><div class="cardb"><div class="record"><span>Persistence</span><b>Local tenant</b></div><div class="record"><span>Updated</span><b>${escapeHtml(settings.updatedAt || settings.createdAt || '—')}</b></div></div></section>
        </div>`;
    };

    const renderUsers = () => {
      panels.users.innerHTML = `
        <div class="bp-settings-section-head"><div><h2>Users & Roles</h2><p>Canonical organization directory. Active user IDs are available to internal collaboration features.</p></div><button type="button" class="btn primary" data-settings-user-new>+ Add user</button></div>
        <div class="tablewrap"><table><thead><tr><th>User</th><th>Role</th><th>Team</th><th>Status</th><th>Actions</th></tr></thead><tbody>${users.map((user) => `<tr><td><b>${escapeHtml(user.name)}</b><span class="secondary">${escapeHtml(user.id)}${user.email ? ` · ${escapeHtml(user.email)}` : ''}</span></td><td>${escapeHtml(user.role)}</td><td>${escapeHtml(user.team)}</td><td><span class="badge ${user.status === 'Active' ? 'green' : 'gray'}">${escapeHtml(user.status)}</span></td><td><button type="button" class="btn ghost" data-settings-user-edit="${escapeHtml(user.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
      panels.users.querySelector('[data-settings-user-new]')?.addEventListener('click', () => openUserEditor(null, commitUser));
      panels.users.querySelectorAll('[data-settings-user-edit]').forEach((button) => button.addEventListener('click', () => {
        const user = users.find((item) => item.id === button.dataset.settingsUserEdit);
        if (user) openUserEditor(user, commitUser);
      }));
    };

    const renderAutomations = () => {
      panels.automations.innerHTML = `
        <div class="bp-settings-section-head"><div><h2>Automations</h2><p>Rule definitions only. A backend scheduler is required before any rule executes automatically.</p></div><button type="button" class="btn primary" data-settings-automation-new>+ New rule</button></div>
        <div class="tablewrap"><table><thead><tr><th>Automation</th><th>Trigger</th><th>Action</th><th>Local state</th><th>Actions</th></tr></thead><tbody>${automations.map((row) => `<tr><td><b>${escapeHtml(row.name)}</b><span class="secondary">${escapeHtml(row.id)}</span></td><td>${escapeHtml(row.trigger)}</td><td>${escapeHtml(row.action)}</td><td><span class="badge ${row.enabled ? 'amber' : 'gray'}">${row.enabled ? 'Enabled locally' : 'Disabled'}</span></td><td><button type="button" class="btn ghost" data-settings-automation-edit="${escapeHtml(row.id)}">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
      panels.automations.querySelector('[data-settings-automation-new]')?.addEventListener('click', () => openAutomationEditor(null, commitAutomation));
      panels.automations.querySelectorAll('[data-settings-automation-edit]').forEach((button) => button.addEventListener('click', () => {
        const row = automations.find((item) => item.id === button.dataset.settingsAutomationEdit);
        if (row) openAutomationEditor(row, commitAutomation);
      }));
    };

    const renderIntegrations = () => {
      const loadboards = integrations.filter((row) => row.category === 'Loadboard');
      const others = integrations.filter((row) => row.category !== 'Loadboard');
      const card = (row) => `<section class="card"><div class="cardh"><h2>${escapeHtml(row.name)}</h2><span class="badge ${row.status === 'Configured locally' ? 'amber' : row.status === 'Disabled' ? 'gray' : 'red'}">${escapeHtml(row.status)}</span></div><div class="cardb"><p>${escapeHtml(row.description)}</p><p class="secondary">${row.accountLabel ? `Account: ${escapeHtml(row.accountLabel)}` : 'No account metadata stored.'}</p><button type="button" class="btn" data-settings-integration="${escapeHtml(row.id)}">Configure metadata</button></div></section>`;
      panels.integrations.innerHTML = `
        <div class="bp-settings-section-head"><div><h2>Integrations</h2><p>External providers are configured here. Loadboards do not have a standalone BrokerPad module.</p></div></div>
        <div class="bp-settings-group"><h3>Loadboards</h3><div class="grid3">${loadboards.map(card).join('')}</div></div>
        <div class="bp-settings-group"><h3>Other providers</h3><div class="grid3">${others.map(card).join('')}</div></div>`;
      panels.integrations.querySelectorAll('[data-settings-integration]').forEach((button) => button.addEventListener('click', () => {
        const row = integrations.find((item) => item.id === button.dataset.settingsIntegration);
        if (row) openIntegrationEditor(row, commitIntegration);
      }));
    };

    const renderSecurity = () => {
      const integrity = window.BrokerPadIntegrity;
      panels.security.innerHTML = `
        <div class="grid3">
          <section class="card"><div class="cardh"><h2>Runtime integrity</h2><span class="badge ${integrity?.ok ? 'green' : 'amber'}">${integrity?.ok ? 'Healthy' : 'Review'}</span></div><div class="cardb"><p>${integrity ? `${integrity.issueCount || 0} integrity issue(s) detected in the current tenant.` : 'Integrity scan initializes with the runtime.'}</p></div></section>
          <section class="card"><div class="cardh"><h2>Authentication</h2><span class="badge gray">Prototype</span></div><div class="cardb"><p>Server-side authentication, authorization and session enforcement are required before production.</p></div></section>
          <section class="card"><div class="cardh"><h2>Secrets</h2><span class="badge green">Not stored here</span></div><div class="cardb"><p>Integration secrets are intentionally excluded from browser persistence.</p></div></section>
        </div>`;
    };

    function commitUser(user, creating) {
      if (creating) users.unshift(user);
      else {
        const index = users.findIndex((item) => item.id === user.id);
        if (index >= 0) users[index] = user;
      }
      api.store.set(USER_SCOPE, users);
      api.events.emit('users:changed', { count: users.length, source: 'settings' });
      api.audit.record(creating ? 'user.create' : 'user.update', 'user', user.id, { role: user.role, team: user.team, status: user.status });
      renderUsers();
    }

    function commitAutomation(row, creating) {
      if (creating) automations.unshift(row);
      else {
        const index = automations.findIndex((item) => item.id === row.id);
        if (index >= 0) automations[index] = row;
      }
      api.store.set(AUTOMATION_SCOPE, automations);
      api.events.emit('automations:changed', { count: automations.length, source: 'settings' });
      api.audit.record(creating ? 'automation.create' : 'automation.update', 'automation', row.id, { enabled: row.enabled });
      renderAutomations();
    }

    function commitIntegration(row) {
      const index = integrations.findIndex((item) => item.id === row.id);
      if (index >= 0) integrations[index] = row;
      api.store.set(INTEGRATION_SCOPE, integrations);
      api.events.emit('integrations:changed', { count: integrations.length, source: 'settings' });
      api.audit.record('integration.metadata.update', 'integration', row.id, { status: row.status, accountLabel: row.accountLabel });
      renderIntegrations();
    }

    page.querySelectorAll('[data-settings-tab]').forEach((button) => button.addEventListener('click', () => {
      const target = button.dataset.settingsTab;
      page.querySelectorAll('[data-settings-tab]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      Object.entries(panels).forEach(([name, panel]) => { panel.hidden = name !== target; });
      if (target === 'security') renderSecurity();
    }));

    renderOrganization();
    renderUsers();
    renderAutomations();
    renderIntegrations();
    renderSecurity();

    window.addEventListener('brokerpad:integrity:checked', renderSecurity);
    api.audit.record('settings.module.ready', 'module', 'settings', {
      users: users.length,
      automations: automations.length,
      integrations: integrations.length,
      owner: 'settings',
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

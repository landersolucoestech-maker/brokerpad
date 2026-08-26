(() => {
  'use strict';

  const SCOPE = 'customers';
  const runtime = () => window.BrokerPadRuntime;
  const now = () => new Date().toISOString();
  const uid = () => `CUS-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const initialCustomers = [
    {
      id: 'CUS-1001',
      name: 'Alex Morgan',
      kind: 'Individual',
      email: 'alex@example.com',
      phone: '(305) 555-0181',
      source: 'Google Ads',
      status: 'Active',
      leads: 3,
      orders: 2,
      lifetimeValue: 2540,
      notes: '',
      createdAt: '2026-08-26T12:00:00.000Z',
      updatedAt: '2026-08-26T12:00:00.000Z',
    },
    {
      id: 'CUS-1002',
      name: 'Sunset Auto Group',
      kind: 'Business',
      email: 'ops@sunsetauto.com',
      phone: '(310) 555-0110',
      source: 'Referral',
      status: 'Active',
      leads: 8,
      orders: 14,
      lifetimeValue: 18980,
      notes: '',
      createdAt: '2026-08-25T12:00:00.000Z',
      updatedAt: '2026-08-25T12:00:00.000Z',
    },
  ];

  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  const relative = (iso) => {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60) return `${minutes || 1}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  const normalize = (customer) => ({
    id: customer.id || uid(),
    name: String(customer.name || '').trim(),
    kind: customer.kind === 'Business' ? 'Business' : 'Individual',
    email: String(customer.email || '').trim(),
    phone: String(customer.phone || '').trim(),
    source: String(customer.source || 'Direct').trim() || 'Direct',
    status: ['Active', 'Inactive', 'Do Not Contact'].includes(customer.status) ? customer.status : 'Active',
    leads: Math.max(0, Number(customer.leads) || 0),
    orders: Math.max(0, Number(customer.orders) || 0),
    lifetimeValue: Math.max(0, Number(customer.lifetimeValue) || 0),
    notes: String(customer.notes || '').trim(),
    createdAt: customer.createdAt || now(),
    updatedAt: customer.updatedAt || now(),
  });

  function ensureSeed() {
    const api = runtime();
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialCustomers.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('customers.seed', 'customer', '', { count: seeded.length });
    return seeded;
  }

  function save(customers) {
    runtime().store.set(SCOPE, customers);
    runtime().events.emit('customers:changed', { count: customers.length });
  }

  function modalShell() {
    let layer = document.querySelector('#bpCustomerModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpCustomerModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpCustomerModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openEditor(customer, onCommit) {
    const creating = !customer;
    const current = normalize(customer || {});
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpCustomerModalTitle">
        <div class="bp-runtime-modal-head">
          <div>
            <h3 id="bpCustomerModalTitle">${creating ? 'New Customer' : 'Edit Customer'}</h3>
            <p>${creating ? 'Create a canonical customer record.' : escapeHtml(current.id)}</p>
          </div>
          <button type="button" class="bp-runtime-close" data-customer-close aria-label="Close">×</button>
        </div>
        <form id="bpCustomerForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Name *</span><input name="name" required value="${escapeHtml(current.name)}"></label>
            <label><span>Customer type</span><select name="kind"><option ${current.kind === 'Individual' ? 'selected' : ''}>Individual</option><option ${current.kind === 'Business' ? 'selected' : ''}>Business</option></select></label>
            <label><span>Email</span><input name="email" type="email" value="${escapeHtml(current.email)}"></label>
            <label><span>Phone</span><input name="phone" value="${escapeHtml(current.phone)}"></label>
            <label><span>Source</span><input name="source" value="${escapeHtml(current.source)}"></label>
            <label><span>Status</span><select name="status"><option ${current.status === 'Active' ? 'selected' : ''}>Active</option><option ${current.status === 'Inactive' ? 'selected' : ''}>Inactive</option><option ${current.status === 'Do Not Contact' ? 'selected' : ''}>Do Not Contact</option></select></label>
            <label><span>Leads</span><input name="leads" type="number" min="0" value="${current.leads}"></label>
            <label><span>Orders</span><input name="orders" type="number" min="0" value="${current.orders}"></label>
            <label class="bp-runtime-span-2"><span>Lifetime value</span><input name="lifetimeValue" type="number" min="0" step="0.01" value="${current.lifetimeValue}"></label>
            <label class="bp-runtime-span-2"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(current.notes)}</textarea></label>
          </div>
          <div class="bp-runtime-form-error" id="bpCustomerFormError" hidden></div>
          <div class="bp-runtime-modal-foot">
            ${creating ? '' : '<button type="button" class="btn danger" data-customer-delete>Delete</button>'}
            <span class="bp-runtime-spacer"></span>
            <button type="button" class="btn" data-customer-close>Cancel</button>
            <button type="submit" class="btn primary">${creating ? 'Create Customer' : 'Save Changes'}</button>
          </div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-customer-close]').forEach((button) => button.addEventListener('click', closeModal));
    layer.addEventListener('click', (event) => {
      if (event.target === layer) closeModal();
    }, { once: true });

    const form = layer.querySelector('#bpCustomerForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const email = String(values.email || '').trim();
      const error = layer.querySelector('#bpCustomerFormError');
      if (!String(values.name || '').trim()) {
        error.textContent = 'Customer name is required.';
        error.hidden = false;
        return;
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        error.textContent = 'Enter a valid email address.';
        error.hidden = false;
        return;
      }
      onCommit('save', normalize({
        ...current,
        ...values,
        leads: Number(values.leads),
        orders: Number(values.orders),
        lifetimeValue: Number(values.lifetimeValue),
        createdAt: current.createdAt || now(),
        updatedAt: now(),
      }), creating);
      closeModal();
    });

    layer.querySelector('[data-customer-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete ${current.name}?`)) return;
      onCommit('delete', current, false);
      closeModal();
    });

    setTimeout(() => form.elements.name?.focus(), 0);
  }

  function install() {
    const api = runtime();
    if (!api) return;
    const page = document.querySelector('[data-page="customers"]');
    if (!page || page.dataset.bpRuntimeCustomers === '1') return;
    page.dataset.bpRuntimeCustomers = '1';

    const table = page.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const search = page.querySelector('.search-table');
    const createButton = page.querySelector('.head .btn.primary');
    if (!table || !tbody || !search || !createButton) return;

    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-bp-customer-actions-head]')) {
      const th = document.createElement('th');
      th.dataset.bpCustomerActionsHead = '1';
      th.textContent = 'Actions';
      headerRow.appendChild(th);
    }

    let customers = ensureSeed();

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const rows = customers.filter((customer) => !query || [
        customer.id, customer.name, customer.email, customer.phone, customer.kind, customer.source, customer.status,
      ].join(' ').toLowerCase().includes(query));

      tbody.innerHTML = rows.length ? rows.map((customer) => `
        <tr data-customer-id="${escapeHtml(customer.id)}">
          <td><button type="button" class="link" data-customer-edit="${escapeHtml(customer.id)}">${escapeHtml(customer.name)}</button><span class="secondary">${escapeHtml(customer.kind)} · ${escapeHtml(customer.id)}</span></td>
          <td>${escapeHtml(customer.email || '—')}</td>
          <td>${escapeHtml(customer.phone || '—')}</td>
          <td>${customer.leads}</td>
          <td>${customer.orders}</td>
          <td>${escapeHtml(money(customer.lifetimeValue))}</td>
          <td>${escapeHtml(relative(customer.updatedAt))}</td>
          <td><button type="button" class="btn ghost" data-customer-edit="${escapeHtml(customer.id)}">Edit</button></td>
        </tr>`).join('') : '<tr><td colspan="8" class="secondary" style="padding:18px;text-align:center">No customers match the current search.</td></tr>';
    };

    const commit = (action, customer, creating) => {
      if (action === 'delete') {
        customers = customers.filter((item) => item.id !== customer.id);
        save(customers);
        api.audit.record('customer.delete', 'customer', customer.id, { name: customer.name });
      } else if (creating) {
        customers.unshift(customer);
        save(customers);
        api.audit.record('customer.create', 'customer', customer.id, { name: customer.name });
      } else {
        const index = customers.findIndex((item) => item.id === customer.id);
        if (index >= 0) customers[index] = customer;
        save(customers);
        api.audit.record('customer.update', 'customer', customer.id, { name: customer.name });
      }
      render();
    };

    createButton.addEventListener('click', (event) => {
      event.preventDefault();
      openEditor(null, commit);
    });
    search.addEventListener('input', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-customer-edit]');
      if (!button) return;
      const customer = customers.find((item) => item.id === button.dataset.customerEdit);
      if (customer) openEditor(customer, commit);
    });

    render();
    api.audit.record('customers.module.ready', 'module', 'customers', { count: customers.length });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
})();

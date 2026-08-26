(() => {
  'use strict';

  const SCOPE = 'leads';
  const CUSTOMER_SCOPE = 'customers';
  const QUOTE_SCOPE = 'quotes';
  const runtime = () => window.BrokerPadRuntime;
  const now = () => new Date().toISOString();
  const uid = () => `LD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const statuses = ['New', 'Contacted', 'Quoted', 'Follow-up', 'Won', 'Lost'];
  const priorities = ['Normal', 'High', 'Urgent'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const initialLeads = [
    { id: 'LD-1001', customerId: 'CUS-1001', contactName: 'Alex Morgan', email: 'alex@example.com', phone: '(305) 555-0181', origin: 'Los Angeles, CA', destination: 'Miami, FL', vehicleYear: '2024', vehicleMake: 'Tesla', vehicleModel: 'Model 3', status: 'Quoted', quoteAmount: 1275, source: 'Google Ads', assignedTo: 'Sales Team', priority: 'Normal', notes: '', createdAt: '2026-08-26T11:50:00.000Z', updatedAt: '2026-08-26T11:54:00.000Z' },
    { id: 'LD-1002', customerId: '', contactName: 'David Chen', email: 'david@example.com', phone: '', origin: 'Newark, NJ', destination: 'Dallas, TX', vehicleYear: '2023', vehicleMake: 'BMW', vehicleModel: 'X5', status: 'Follow-up', quoteAmount: 1080, source: 'Referral', assignedTo: 'Sales Team', priority: 'High', notes: '', createdAt: '2026-08-26T11:20:00.000Z', updatedAt: '2026-08-26T11:38:00.000Z' },
  ];

  const normalize = (lead) => ({
    id: lead.id || uid(),
    customerId: String(lead.customerId || '').trim(),
    contactName: String(lead.contactName || '').trim(),
    email: String(lead.email || '').trim(),
    phone: String(lead.phone || '').trim(),
    origin: String(lead.origin || '').trim(),
    destination: String(lead.destination || '').trim(),
    vehicleYear: String(lead.vehicleYear || '').trim(),
    vehicleMake: String(lead.vehicleMake || '').trim(),
    vehicleModel: String(lead.vehicleModel || '').trim(),
    status: statuses.includes(lead.status) ? lead.status : 'New',
    quoteAmount: Math.max(0, Number(lead.quoteAmount) || 0),
    source: String(lead.source || 'Direct').trim() || 'Direct',
    assignedTo: String(lead.assignedTo || 'Unassigned').trim() || 'Unassigned',
    priority: priorities.includes(lead.priority) ? lead.priority : 'Normal',
    notes: String(lead.notes || '').trim(),
    createdAt: lead.createdAt || now(),
    updatedAt: lead.updatedAt || now(),
  });

  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const relative = (iso) => {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60) return `${minutes || 1}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  };
  const statusClass = (status) => ({ New: 'gray', Contacted: 'blue', Quoted: 'blue', 'Follow-up': 'amber', Won: 'green', Lost: 'red' }[status] || 'gray');

  function ensureSeed() {
    const api = runtime();
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialLeads.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('leads.seed', 'lead', '', { count: seeded.length });
    return seeded;
  }

  function customerList() {
    const rows = runtime().store.get(CUSTOMER_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  }

  function quoteList() {
    const rows = runtime().store.get(QUOTE_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  }

  function quotesForLead(leadId) {
    return quoteList().filter((quote) => quote.leadId === leadId).sort((a, b) => Date.parse(b.updatedAt || '') - Date.parse(a.updatedAt || ''));
  }

  function syncCustomerLeadCounts(leads) {
    const api = runtime();
    const customers = customerList();
    if (!customers.length) return;
    const counts = leads.reduce((map, lead) => {
      if (lead.customerId) map.set(lead.customerId, (map.get(lead.customerId) || 0) + 1);
      return map;
    }, new Map());
    let changed = false;
    const next = customers.map((customer) => {
      const count = counts.get(customer.id) || 0;
      if (Number(customer.leads) === count) return customer;
      changed = true;
      return { ...customer, leads: count, updatedAt: now() };
    });
    if (changed) {
      api.store.set(CUSTOMER_SCOPE, next);
      api.events.emit('customers:changed', { count: next.length, source: 'leads' });
    }
  }

  function save(leads, source = 'leads') {
    const api = runtime();
    api.store.set(SCOPE, leads);
    syncCustomerLeadCounts(leads);
    api.events.emit('leads:changed', { count: leads.length, source });
  }

  function modalShell() {
    let layer = document.querySelector('#bpLeadModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpLeadModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpLeadModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openEditor(lead, onCommit) {
    const creating = !lead;
    const current = normalize(lead || {});
    const customers = customerList();
    const linkedQuotes = creating ? [] : quotesForLead(current.id);
    const latestQuote = linkedQuotes[0] || null;
    const acceptedQuote = linkedQuotes.find((quote) => quote.status === 'Accepted');
    const quoteDerived = Boolean(latestQuote);
    const effectiveQuoteAmount = latestQuote ? Math.max(0, Number(latestQuote.customerPrice) || 0) : current.quoteAmount;
    const customerOptions = customers.map((customer) => `<option value="${escapeHtml(customer.id)}" ${customer.id === current.customerId ? 'selected' : ''}>${escapeHtml(customer.name)} · ${escapeHtml(customer.id)}</option>`).join('');

    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bpLeadModalTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpLeadModalTitle">${creating ? 'New Lead' : 'Edit Lead'}</h3><p>${creating ? 'Create a sales lead and transport request.' : escapeHtml(current.id)}</p></div><button type="button" class="bp-runtime-close" data-lead-close aria-label="Close">×</button></div>
        <form id="bpLeadForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Customer</span><select name="customerId"><option value="">Not linked</option>${customerOptions}</select></label>
            <label><span>Contact name *</span><input name="contactName" required value="${escapeHtml(current.contactName)}"></label>
            <label><span>Email</span><input name="email" type="email" value="${escapeHtml(current.email)}"></label>
            <label><span>Phone</span><input name="phone" value="${escapeHtml(current.phone)}"></label>
            <label><span>Origin *</span><input name="origin" required value="${escapeHtml(current.origin)}" placeholder="City, State or ZIP"></label>
            <label><span>Destination *</span><input name="destination" required value="${escapeHtml(current.destination)}" placeholder="City, State or ZIP"></label>
            <label><span>Vehicle year</span><input name="vehicleYear" value="${escapeHtml(current.vehicleYear)}"></label>
            <label><span>Vehicle make</span><input name="vehicleMake" value="${escapeHtml(current.vehicleMake)}"></label>
            <label><span>Vehicle model</span><input name="vehicleModel" value="${escapeHtml(current.vehicleModel)}"></label>
            <label><span>Status</span><select name="status">${statuses.map((status) => `<option ${status === current.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
            <label><span>${quoteDerived ? 'Quote amount · calculated' : 'Lead estimate'}</span><input name="quoteAmount" type="number" min="0" step="0.01" value="${effectiveQuoteAmount}" ${quoteDerived ? 'readonly aria-readonly="true" class="bp-derived-field"' : ''}></label>
            <label><span>Source</span><input name="source" value="${escapeHtml(current.source)}"></label>
            <label><span>Assigned to</span><input name="assignedTo" value="${escapeHtml(current.assignedTo)}"></label>
            <label><span>Priority</span><select name="priority">${priorities.map((priority) => `<option ${priority === current.priority ? 'selected' : ''}>${priority}</option>`).join('')}</select></label>
            <label class="bp-runtime-span-2"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(current.notes)}</textarea></label>
          </div>
          ${quoteDerived ? `<div class="bp-runtime-integrity-warning">Quote amount is owned by ${escapeHtml(latestQuote.id)}. Accepting a quote is the canonical way to mark this lead Won.</div>` : ''}
          <div class="bp-runtime-form-error" id="bpLeadFormError" hidden></div>
          <div class="bp-runtime-modal-foot">${creating ? '' : '<button type="button" class="btn danger" data-lead-delete>Delete</button>'}<span class="bp-runtime-spacer"></span><button type="button" class="btn" data-lead-close>Cancel</button><button type="submit" class="btn primary">${creating ? 'Create Lead' : 'Save Changes'}</button></div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-lead-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpLeadForm');
    const customerSelect = form.elements.customerId;
    customerSelect.addEventListener('change', () => {
      const customer = customers.find((item) => item.id === customerSelect.value);
      if (!customer) return;
      if (!form.elements.contactName.value.trim()) form.elements.contactName.value = customer.name || '';
      if (!form.elements.email.value.trim()) form.elements.email.value = customer.email || '';
      if (!form.elements.phone.value.trim()) form.elements.phone.value = customer.phone || '';
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpLeadFormError');
      if (!String(values.contactName || '').trim() || !String(values.origin || '').trim() || !String(values.destination || '').trim()) {
        error.textContent = 'Contact name, origin and destination are required.';
        error.hidden = false;
        return;
      }
      if (values.email && !/^\S+@\S+\.\S+$/.test(String(values.email).trim())) {
        error.textContent = 'Enter a valid email address.';
        error.hidden = false;
        return;
      }
      if (values.status === 'Won' && !acceptedQuote) {
        error.textContent = 'A lead can only be marked Won by accepting a linked quote.';
        error.hidden = false;
        return;
      }
      const nextStatus = acceptedQuote ? 'Won' : values.status;
      onCommit('save', normalize({
        ...current,
        ...values,
        status: nextStatus,
        quoteAmount: quoteDerived ? effectiveQuoteAmount : Number(values.quoteAmount),
        updatedAt: now(),
      }), creating);
      closeModal();
    });

    layer.querySelector('[data-lead-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete ${current.id} · ${current.contactName}?`)) return;
      onCommit('delete', current, false);
      closeModal();
    });
    setTimeout(() => form.elements.contactName?.focus(), 0);
  }

  function install() {
    const api = runtime();
    if (!api) return;
    const page = document.querySelector('[data-page="leads"]');
    if (!page || page.dataset.bpRuntimeLeads === '1') return;
    page.dataset.bpRuntimeLeads = '1';

    const table = page.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const search = page.querySelector('.search-table');
    const statusFilter = page.querySelector('.toolbar select');
    const createButton = page.querySelector('.head .btn.primary');
    if (!table || !tbody || !search || !createButton) return;

    if (statusFilter) statusFilter.innerHTML = '<option value="">All statuses</option>' + statuses.map((status) => `<option value="${status}">${status}</option>`).join('');
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-bp-lead-actions-head]')) {
      const th = document.createElement('th');
      th.dataset.bpLeadActionsHead = '1';
      th.textContent = 'Actions';
      headerRow.appendChild(th);
    }

    let leads = ensureSeed();
    syncCustomerLeadCounts(leads);
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const status = statusFilter?.value || '';
      const rows = leads.filter((lead) => {
        if (status && lead.status !== status) return false;
        if (!query) return true;
        return [lead.id, lead.contactName, lead.email, lead.phone, lead.origin, lead.destination, lead.vehicleYear, lead.vehicleMake, lead.vehicleModel, lead.source, lead.assignedTo].join(' ').toLowerCase().includes(query);
      });
      tbody.innerHTML = rows.length ? rows.map((lead) => `
        <tr data-lead-id="${escapeHtml(lead.id)}">
          <td><button type="button" class="link" data-lead-edit="${escapeHtml(lead.id)}">${escapeHtml(lead.id)} · ${escapeHtml(lead.contactName)}</button><span class="secondary">${escapeHtml(lead.email || lead.phone || 'No contact detail')}</span></td>
          <td>${escapeHtml(lead.origin || '—')} → ${escapeHtml(lead.destination || '—')}</td>
          <td>${escapeHtml([lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(' ') || '—')}</td>
          <td><span class="badge ${statusClass(lead.status)}">${escapeHtml(lead.status)}</span></td><td>${lead.quoteAmount ? escapeHtml(money(lead.quoteAmount)) : '—'}</td><td>${escapeHtml(lead.source)}</td><td>${escapeHtml(relative(lead.updatedAt))}</td>
          <td><button type="button" class="btn ghost" data-lead-edit="${escapeHtml(lead.id)}">Edit</button></td>
        </tr>`).join('') : '<tr><td colspan="8" class="secondary bp-empty-cell">No leads match the current filters.</td></tr>';
    };

    const commit = (action, lead, creating) => {
      if (action === 'delete') {
        leads = leads.filter((item) => item.id !== lead.id);
        save(leads, 'lead.delete');
        api.audit.record('lead.delete', 'lead', lead.id, { contactName: lead.contactName });
      } else if (creating) {
        leads.unshift(lead);
        save(leads, 'lead.create');
        api.audit.record('lead.create', 'lead', lead.id, { contactName: lead.contactName, customerId: lead.customerId });
      } else {
        const index = leads.findIndex((item) => item.id === lead.id);
        if (index >= 0) leads[index] = lead;
        save(leads, 'lead.update');
        api.audit.record('lead.update', 'lead', lead.id, { status: lead.status, customerId: lead.customerId });
      }
      render();
    };

    createButton.addEventListener('click', (event) => { event.preventDefault(); openEditor(null, commit); });
    search.addEventListener('input', render);
    statusFilter?.addEventListener('change', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-lead-edit]');
      if (!button) return;
      const lead = leads.find((item) => item.id === button.dataset.leadEdit);
      if (lead) openEditor(lead, commit);
    });
    api.events.on('leads:changed', () => {
      leads = (api.store.get(SCOPE, []) || []).map(normalize);
      syncCustomerLeadCounts(leads);
      render();
    });
    api.events.on('quotes:changed', () => {
      leads = (api.store.get(SCOPE, []) || []).map(normalize);
      render();
    });

    render();
    api.audit.record('leads.module.ready', 'module', 'leads', { count: leads.length });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

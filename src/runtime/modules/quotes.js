(() => {
  'use strict';

  const SCOPE = 'quotes';
  const LEAD_SCOPE = 'leads';
  const ORDER_SCOPE = 'orders';
  const runtime = () => window.BrokerPadRuntime;
  const now = () => new Date().toISOString();
  const uid = () => `QT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const orderUid = () => `OR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const statuses = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Expired', 'Rejected'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value) || 0);
  const relative = (iso) => {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60) return `${minutes || 1}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  };
  const statusClass = (status) => ({ Draft: 'gray', Sent: 'blue', Viewed: 'amber', Accepted: 'green', Expired: 'red', Rejected: 'red' }[status] || 'gray');

  const initialQuotes = [
    { id: 'QT-1001', leadId: 'LD-1001', customerId: 'CUS-1001', contactName: 'Alex Morgan', origin: 'Los Angeles, CA', destination: 'Miami, FL', vehicle: '2024 Tesla Model 3', customerPrice: 1275, carrierPay: 995, revision: 3, status: 'Sent', expiresAt: '2026-08-29', notes: '', createdAt: '2026-08-26T11:52:00.000Z', updatedAt: '2026-08-26T11:54:00.000Z' },
    { id: 'QT-1002', leadId: 'LD-1002', customerId: '', contactName: 'David Chen', origin: 'Newark, NJ', destination: 'Dallas, TX', vehicle: '2023 BMW X5', customerPrice: 1080, carrierPay: 845, revision: 1, status: 'Viewed', expiresAt: '2026-08-29', notes: '', createdAt: '2026-08-26T11:25:00.000Z', updatedAt: '2026-08-26T11:38:00.000Z' },
  ];

  const normalize = (quote) => ({
    id: quote.id || uid(), leadId: String(quote.leadId || ''), customerId: String(quote.customerId || ''),
    contactName: String(quote.contactName || '').trim(), origin: String(quote.origin || '').trim(), destination: String(quote.destination || '').trim(), vehicle: String(quote.vehicle || '').trim(),
    customerPrice: Math.max(0, Number(quote.customerPrice) || 0), carrierPay: Math.max(0, Number(quote.carrierPay) || 0), revision: Math.max(1, Number(quote.revision) || 1),
    status: statuses.includes(quote.status) ? quote.status : 'Draft', expiresAt: String(quote.expiresAt || ''), notes: String(quote.notes || '').trim(),
    createdAt: quote.createdAt || now(), updatedAt: quote.updatedAt || now(), acceptedAt: quote.acceptedAt || '', orderId: quote.orderId || '',
  });

  function ensureSeed() {
    const api = runtime();
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialQuotes.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('quotes.seed', 'quote', '', { count: seeded.length });
    return seeded;
  }

  const leads = () => {
    const rows = runtime().store.get(LEAD_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  };

  function save(quotes) {
    const api = runtime();
    api.store.set(SCOPE, quotes);
    api.events.emit('quotes:changed', { count: quotes.length });
  }

  function syncLead(quote) {
    if (!quote.leadId) return;
    const api = runtime();
    const rows = leads();
    const index = rows.findIndex((lead) => lead.id === quote.leadId);
    if (index < 0) return;
    const desired = quote.status === 'Accepted' ? 'Won' : ['Sent', 'Viewed'].includes(quote.status) ? 'Quoted' : rows[index].status;
    const next = { ...rows[index], quoteAmount: quote.customerPrice, status: desired, updatedAt: now() };
    rows[index] = next;
    api.store.set(LEAD_SCOPE, rows);
    api.events.emit('leads:changed', { count: rows.length, source: 'quotes' });
  }

  function createOrderFromQuote(quote) {
    const api = runtime();
    const orders = api.store.get(ORDER_SCOPE, []);
    const list = Array.isArray(orders) ? orders : [];
    const existing = list.find((order) => order.sourceQuoteId === quote.id || order.id === quote.orderId);
    if (existing) return existing;
    const order = {
      id: orderUid(), sourceQuoteId: quote.id, leadId: quote.leadId, customerId: quote.customerId, customerName: quote.contactName,
      origin: quote.origin, destination: quote.destination, vehicle: quote.vehicle, transport: 'Open', status: 'Booked',
      customerPrice: quote.customerPrice, carrierPay: quote.carrierPay, pickupStart: '', pickupEnd: '', carrierId: '', carrierName: '',
      createdAt: now(), updatedAt: now(), deliveredAt: '', settledAt: '', notes: quote.notes || '',
    };
    list.unshift(order);
    api.store.set(ORDER_SCOPE, list);
    api.events.emit('orders:changed', { count: list.length, source: 'quote.accepted' });
    api.audit.record('order.create.from_quote', 'order', order.id, { quoteId: quote.id, leadId: quote.leadId, customerId: quote.customerId });
    return order;
  }

  function modalShell() {
    let layer = document.querySelector('#bpQuoteModalLayer');
    if (layer) return layer;
    layer = document.createElement('div'); layer.id = 'bpQuoteModalLayer'; layer.className = 'bp-runtime-modal-layer'; layer.hidden = true; document.body.appendChild(layer); return layer;
  }
  function closeModal() { const layer = document.querySelector('#bpQuoteModalLayer'); if (layer) { layer.hidden = true; layer.innerHTML = ''; } }

  function openEditor(quote, onCommit) {
    const creating = !quote;
    const current = normalize(quote || {});
    const leadRows = leads();
    const leadOptions = leadRows.map((lead) => `<option value="${escapeHtml(lead.id)}" ${lead.id === current.leadId ? 'selected' : ''}>${escapeHtml(lead.id)} · ${escapeHtml(lead.contactName)}</option>`).join('');
    const margin = current.customerPrice > 0 ? ((current.customerPrice - current.carrierPay) / current.customerPrice * 100) : 0;
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true">
        <div class="bp-runtime-modal-head"><div><h3>${creating ? 'New Quote' : 'Edit Quote'}</h3><p>${creating ? 'Create a customer quote from a lead or manually.' : escapeHtml(current.id)}</p></div><button type="button" class="bp-runtime-close" data-quote-close>×</button></div>
        <form id="bpQuoteForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Lead</span><select name="leadId"><option value="">Manual quote</option>${leadOptions}</select></label>
            <label><span>Contact name *</span><input name="contactName" required value="${escapeHtml(current.contactName)}"></label>
            <label><span>Origin *</span><input name="origin" required value="${escapeHtml(current.origin)}"></label>
            <label><span>Destination *</span><input name="destination" required value="${escapeHtml(current.destination)}"></label>
            <label class="bp-runtime-span-2"><span>Vehicle *</span><input name="vehicle" required value="${escapeHtml(current.vehicle)}"></label>
            <label><span>Customer price *</span><input name="customerPrice" type="number" min="0" step="0.01" required value="${current.customerPrice}"></label>
            <label><span>Suggested carrier pay</span><input name="carrierPay" type="number" min="0" step="0.01" value="${current.carrierPay}"></label>
            <label><span>Revision</span><input name="revision" type="number" min="1" value="${current.revision}"></label>
            <label><span>Status</span><select name="status">${statuses.map((status) => `<option ${status === current.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
            <label><span>Expires</span><input name="expiresAt" type="date" value="${escapeHtml(current.expiresAt)}"></label>
            <label><span>Current margin</span><input disabled value="${margin.toFixed(1)}%"></label>
            <label class="bp-runtime-span-2"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(current.notes)}</textarea></label>
          </div>
          <div class="bp-runtime-form-error" id="bpQuoteFormError" hidden></div>
          <div class="bp-runtime-modal-foot">
            ${creating ? '' : '<button type="button" class="btn danger" data-quote-delete>Delete</button>'}
            ${!creating && current.status !== 'Accepted' ? '<button type="button" class="btn" data-quote-accept>Accept & Create Order</button>' : ''}
            <span class="bp-runtime-spacer"></span><button type="button" class="btn" data-quote-close>Cancel</button><button type="submit" class="btn primary">${creating ? 'Create Quote' : 'Save Changes'}</button>
          </div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-quote-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpQuoteForm');
    form.elements.leadId.addEventListener('change', () => {
      const lead = leadRows.find((item) => item.id === form.elements.leadId.value);
      if (!lead) return;
      form.elements.contactName.value = lead.contactName || '';
      form.elements.origin.value = lead.origin || '';
      form.elements.destination.value = lead.destination || '';
      form.elements.vehicle.value = [lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(' ');
      if (!Number(form.elements.customerPrice.value)) form.elements.customerPrice.value = lead.quoteAmount || 0;
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpQuoteFormError');
      if (!String(values.contactName || '').trim() || !String(values.origin || '').trim() || !String(values.destination || '').trim() || !String(values.vehicle || '').trim() || Number(values.customerPrice) <= 0) {
        error.textContent = 'Contact, route, vehicle and a customer price greater than zero are required.'; error.hidden = false; return;
      }
      const lead = leadRows.find((item) => item.id === values.leadId);
      onCommit('save', normalize({ ...current, ...values, customerId: lead?.customerId || current.customerId, customerPrice: Number(values.customerPrice), carrierPay: Number(values.carrierPay), revision: Number(values.revision), updatedAt: now() }), creating);
      closeModal();
    });
    layer.querySelector('[data-quote-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete ${current.id}?`)) return; onCommit('delete', current, false); closeModal();
    });
    layer.querySelector('[data-quote-accept]')?.addEventListener('click', () => {
      const accepted = normalize({ ...current, status: 'Accepted', acceptedAt: now(), updatedAt: now() });
      const order = createOrderFromQuote(accepted); accepted.orderId = order.id; onCommit('accept', accepted, false); closeModal();
    });
  }

  function install() {
    const api = runtime();
    if (!api) return;
    const page = document.querySelector('[data-page="quotes"]');
    if (!page || page.dataset.bpRuntimeQuotes === '1') return;
    page.dataset.bpRuntimeQuotes = '1';
    const table = page.querySelector('table'), tbody = table?.querySelector('tbody'), search = page.querySelector('.search-table'), head = page.querySelector('.head');
    if (!table || !tbody || !search || !head) return;
    let createButton = head.querySelector('[data-bp-new-quote]');
    if (!createButton) { createButton = document.createElement('button'); createButton.type = 'button'; createButton.className = 'btn primary'; createButton.dataset.bpNewQuote = '1'; createButton.textContent = '+ New quote'; head.appendChild(createButton); }
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-bp-quote-actions-head]')) { const th = document.createElement('th'); th.dataset.bpQuoteActionsHead = '1'; th.textContent = 'Actions'; headerRow.appendChild(th); }
    let quotes = ensureSeed();
    const render = () => {
      const query = search.value.trim().toLowerCase();
      const rows = quotes.filter((quote) => !query || [quote.id, quote.leadId, quote.contactName, quote.origin, quote.destination, quote.vehicle, quote.status].join(' ').toLowerCase().includes(query));
      tbody.innerHTML = rows.length ? rows.map((quote) => `<tr data-quote-id="${escapeHtml(quote.id)}"><td><button class="link" type="button" data-quote-edit="${escapeHtml(quote.id)}">${escapeHtml(quote.id)} · ${escapeHtml(quote.contactName)}</button><span class="secondary">${escapeHtml(quote.leadId || 'Manual quote')}</span></td><td>${escapeHtml(quote.origin)} → ${escapeHtml(quote.destination)}</td><td>${escapeHtml(quote.vehicle)}</td><td>${escapeHtml(money(quote.customerPrice))}</td><td>Rev ${quote.revision}</td><td><span class="badge ${statusClass(quote.status)}">${escapeHtml(quote.status)}</span></td><td>${escapeHtml(relative(quote.updatedAt))}</td><td><button class="btn ghost" type="button" data-quote-edit="${escapeHtml(quote.id)}">Edit</button></td></tr>`).join('') : '<tr><td colspan="8" class="secondary" style="padding:18px;text-align:center">No quotes match the current search.</td></tr>';
    };
    const commit = (action, quote, creating) => {
      if (action === 'delete') { quotes = quotes.filter((item) => item.id !== quote.id); save(quotes); api.audit.record('quote.delete', 'quote', quote.id); }
      else if (creating) { quotes.unshift(quote); save(quotes); syncLead(quote); api.audit.record('quote.create', 'quote', quote.id, { leadId: quote.leadId }); }
      else { const index = quotes.findIndex((item) => item.id === quote.id); if (index >= 0) quotes[index] = quote; save(quotes); syncLead(quote); api.audit.record(action === 'accept' ? 'quote.accept' : 'quote.update', 'quote', quote.id, { status: quote.status, orderId: quote.orderId }); }
      render();
    };
    createButton.addEventListener('click', () => openEditor(null, commit));
    search.addEventListener('input', render);
    tbody.addEventListener('click', (event) => { const button = event.target.closest('[data-quote-edit]'); if (!button) return; const quote = quotes.find((item) => item.id === button.dataset.quoteEdit); if (quote) openEditor(quote, commit); });
    render(); api.audit.record('quotes.module.ready', 'module', 'quotes', { count: quotes.length });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();

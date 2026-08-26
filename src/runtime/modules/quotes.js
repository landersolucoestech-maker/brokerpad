(() => {
  'use strict';

  const SCOPE = 'quotes';
  const LEAD_SCOPE = 'leads';
  const ORDER_SCOPE = 'orders';
  const statuses = ['Draft', 'Sent', 'Viewed', 'Accepted', 'Expired', 'Rejected'];
  const earlyOrderStatuses = new Set(['Booked', 'Sourcing']);
  const runtime = () => window.BrokerPadRuntime;
  const now = () => new Date().toISOString();
  const uid = () => `QT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const orderUid = () => `OR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
  const relative = (iso) => {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60) return `${minutes || 1}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  };
  const statusClass = (status) => ({
    Draft: 'gray', Sent: 'blue', Viewed: 'amber', Accepted: 'green', Expired: 'red', Rejected: 'red',
  }[status] || 'gray');

  const initialQuotes = [
    { id: 'QT-1001', leadId: 'LD-1001', customerId: 'CUS-1001', contactName: 'Alex Morgan', origin: 'Los Angeles, CA', destination: 'Miami, FL', vehicle: '2024 Tesla Model 3', customerPrice: 1275, carrierPay: 995, revision: 3, status: 'Sent', expiresAt: '2026-08-29', notes: '', createdAt: '2026-08-26T11:52:00.000Z', updatedAt: '2026-08-26T11:54:00.000Z' },
    { id: 'QT-1002', leadId: 'LD-1002', customerId: '', contactName: 'David Chen', origin: 'Newark, NJ', destination: 'Dallas, TX', vehicle: '2023 BMW X5', customerPrice: 1080, carrierPay: 845, revision: 1, status: 'Viewed', expiresAt: '2026-08-29', notes: '', createdAt: '2026-08-26T11:25:00.000Z', updatedAt: '2026-08-26T11:38:00.000Z' },
  ];

  const normalize = (quote) => ({
    id: quote.id || uid(),
    leadId: String(quote.leadId || ''),
    customerId: String(quote.customerId || ''),
    contactName: String(quote.contactName || '').trim(),
    origin: String(quote.origin || '').trim(),
    destination: String(quote.destination || '').trim(),
    vehicle: String(quote.vehicle || '').trim(),
    customerPrice: Math.max(0, Number(quote.customerPrice) || 0),
    carrierPay: Math.max(0, Number(quote.carrierPay) || 0),
    revision: Math.max(1, Number(quote.revision) || 1),
    status: statuses.includes(quote.status) ? quote.status : 'Draft',
    expiresAt: String(quote.expiresAt || ''),
    notes: String(quote.notes || '').trim(),
    createdAt: quote.createdAt || now(),
    updatedAt: quote.updatedAt || now(),
    acceptedAt: quote.acceptedAt || '',
    orderId: String(quote.orderId || ''),
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

  const leadRows = () => {
    const rows = runtime().store.get(LEAD_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  };

  function save(quotes, source) {
    const api = runtime();
    api.store.set(SCOPE, quotes);
    api.events.emit('quotes:changed', { count: quotes.length, source });
  }

  function syncLead(quote) {
    if (!quote.leadId) return;
    const api = runtime();
    const rows = leadRows();
    const index = rows.findIndex((lead) => lead.id === quote.leadId);
    if (index < 0) return;
    const desired = quote.status === 'Accepted'
      ? 'Won'
      : ['Sent', 'Viewed'].includes(quote.status)
        ? 'Quoted'
        : rows[index].status;
    rows[index] = { ...rows[index], quoteAmount: quote.customerPrice, status: desired, updatedAt: now() };
    api.store.set(LEAD_SCOPE, rows);
    api.events.emit('leads:changed', { count: rows.length, source: 'quotes' });
  }

  function ensureOrderForQuote(quote) {
    const api = runtime();
    const stored = api.store.get(ORDER_SCOPE, []);
    const orders = Array.isArray(stored) ? stored : [];
    const index = orders.findIndex((order) => order.sourceQuoteId === quote.id || (quote.orderId && order.id === quote.orderId));
    if (index >= 0) {
      const existing = orders[index];
      if (earlyOrderStatuses.has(existing.status)) {
        orders[index] = {
          ...existing,
          sourceQuoteId: quote.id,
          leadId: quote.leadId,
          customerId: quote.customerId,
          customerName: quote.contactName,
          origin: quote.origin,
          destination: quote.destination,
          vehicle: quote.vehicle,
          customerPrice: quote.customerPrice,
          carrierPay: quote.carrierPay,
          notes: quote.notes || existing.notes || '',
          updatedAt: now(),
        };
        api.store.set(ORDER_SCOPE, orders);
        api.events.emit('orders:changed', { count: orders.length, source: 'quote.accepted.sync' });
        api.audit.record('order.sync.from_quote', 'order', existing.id, { quoteId: quote.id, status: existing.status });
        return orders[index];
      }
      return existing;
    }

    const order = {
      id: orderUid(), sourceQuoteId: quote.id, leadId: quote.leadId, customerId: quote.customerId,
      customerName: quote.contactName, origin: quote.origin, destination: quote.destination, vehicle: quote.vehicle,
      transport: 'Open', status: 'Booked', customerPrice: quote.customerPrice, carrierPay: quote.carrierPay,
      pickupStart: '', pickupEnd: '', carrierId: '', carrierName: '', createdAt: now(), updatedAt: now(),
      deliveredAt: '', settledAt: '', notes: quote.notes || '',
    };
    orders.unshift(order);
    api.store.set(ORDER_SCOPE, orders);
    api.events.emit('orders:changed', { count: orders.length, source: 'quote.accepted' });
    api.audit.record('order.create.from_quote', 'order', order.id, { quoteId: quote.id, leadId: quote.leadId, customerId: quote.customerId });
    return order;
  }

  function removeLegacyOwners(root, page) {
    page.querySelectorAll('.bp-quote-benchmark, .bp-benchmark-zone, [data-bp-new-quote], #quoteNew').forEach((node) => node.remove());
    root.querySelectorAll(':scope > .quote-modal-layer, :scope > .quote-delete-layer').forEach((node) => node.remove());
  }

  function buildCanonicalPage(page) {
    page.innerHTML = `
      <div class="head">
        <div><h1>Quotes</h1><p>Customer quotes, revisions and pricing details.</p></div>
      </div>
      <div class="toolbar bp-quotes-toolbar">
        <input class="search-table" id="bpQuoteSearch" placeholder="Search quote, lead, route, vehicle..." aria-label="Search quotes">
        <select id="bpQuoteStatusFilter" aria-label="Filter quotes by status">
          <option value="">All statuses</option>
          ${statuses.map((status) => `<option>${status}</option>`).join('')}
        </select>
      </div>
      <div class="tablewrap quotes-tablewrap">
        <table>
          <thead><tr><th>Quote / lead</th><th>Route</th><th>Vehicle</th><th>Offer</th><th>Revision</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead>
          <tbody id="bpQuotesTbody"></tbody>
        </table>
      </div>
      <span class="bp-quote-benchmark bp-runtime-benchmark-blocker" hidden aria-hidden="true"></span>`;
  }

  function modalShell() {
    let layer = document.querySelector('#bpQuoteModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpQuoteModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpQuoteModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function quoteFromForm(form, current, leads, statusOverride = '') {
    const values = Object.fromEntries(new FormData(form).entries());
    const error = form.closest('.bp-runtime-modal')?.querySelector('#bpQuoteFormError');
    if (!String(values.contactName || '').trim() || !String(values.origin || '').trim() || !String(values.destination || '').trim() || !String(values.vehicle || '').trim() || Number(values.customerPrice) <= 0) {
      if (error) {
        error.textContent = 'Contact, route, vehicle and a customer price greater than zero are required.';
        error.hidden = false;
      }
      return null;
    }
    if (error) error.hidden = true;
    const lead = leads.find((item) => item.id === values.leadId);
    const status = statusOverride || values.status;
    return normalize({
      ...current, ...values, status,
      customerId: lead?.customerId || current.customerId,
      customerPrice: Number(values.customerPrice), carrierPay: Number(values.carrierPay), revision: Number(values.revision),
      acceptedAt: status === 'Accepted' ? (current.acceptedAt || now()) : current.acceptedAt,
      updatedAt: now(),
    });
  }

  function openEditor(quote, onCommit) {
    const creating = !quote;
    const current = normalize(quote || {});
    const leads = leadRows();
    const options = leads.map((lead) => `<option value="${escapeHtml(lead.id)}" ${lead.id === current.leadId ? 'selected' : ''}>${escapeHtml(lead.id)} · ${escapeHtml(lead.contactName)}</option>`).join('');
    const margin = current.customerPrice > 0 ? ((current.customerPrice - current.carrierPay) / current.customerPrice * 100) : 0;
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bpQuoteModalTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpQuoteModalTitle">${creating ? 'New Quote' : 'Edit Quote'}</h3><p>${creating ? 'Create a customer quote from a lead or manually.' : escapeHtml(current.id)}</p></div><button type="button" class="bp-runtime-close" data-quote-close aria-label="Close">×</button></div>
        <form id="bpQuoteForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Lead</span><select name="leadId"><option value="">Manual quote</option>${options}</select></label>
            <label><span>Contact name *</span><input name="contactName" required value="${escapeHtml(current.contactName)}"></label>
            <label><span>Origin *</span><input name="origin" required value="${escapeHtml(current.origin)}"></label>
            <label><span>Destination *</span><input name="destination" required value="${escapeHtml(current.destination)}"></label>
            <label class="bp-runtime-span-2"><span>Vehicle *</span><input name="vehicle" required value="${escapeHtml(current.vehicle)}"></label>
            <label><span>Customer price *</span><input name="customerPrice" type="number" min="0" step="0.01" required value="${current.customerPrice}"></label>
            <label><span>Suggested carrier pay</span><input name="carrierPay" type="number" min="0" step="0.01" value="${current.carrierPay}"></label>
            <label><span>Revision</span><input name="revision" type="number" min="1" value="${current.revision}"></label>
            <label><span>Status</span><select name="status">${statuses.map((status) => `<option ${status === current.status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
            <label><span>Expires</span><input name="expiresAt" type="date" value="${escapeHtml(current.expiresAt)}"></label>
            <label><span>Current margin</span><input name="marginDisplay" disabled value="${margin.toFixed(1)}%"></label>
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
    const updateMargin = () => {
      const price = Number(form.elements.customerPrice.value) || 0;
      const pay = Number(form.elements.carrierPay.value) || 0;
      form.elements.marginDisplay.value = price > 0 ? `${((price - pay) / price * 100).toFixed(1)}%` : '0.0%';
    };
    form.elements.customerPrice.addEventListener('input', updateMargin);
    form.elements.carrierPay.addEventListener('input', updateMargin);
    form.elements.leadId.addEventListener('change', () => {
      const lead = leads.find((item) => item.id === form.elements.leadId.value);
      if (!lead) return;
      form.elements.contactName.value = lead.contactName || '';
      form.elements.origin.value = lead.origin || '';
      form.elements.destination.value = lead.destination || '';
      form.elements.vehicle.value = [lead.vehicleYear, lead.vehicleMake, lead.vehicleModel].filter(Boolean).join(' ');
      if (!Number(form.elements.customerPrice.value)) form.elements.customerPrice.value = lead.quoteAmount || 0;
      updateMargin();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let next = quoteFromForm(form, current, leads);
      if (!next) return;
      const accepting = next.status === 'Accepted';
      if (accepting) {
        const order = ensureOrderForQuote(next);
        next = normalize({ ...next, orderId: order.id, acceptedAt: next.acceptedAt || now() });
      }
      onCommit(accepting ? 'accept' : 'save', next, creating);
      closeModal();
    });

    layer.querySelector('[data-quote-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete ${current.id}?`)) return;
      onCommit('delete', current, false);
      closeModal();
    });

    layer.querySelector('[data-quote-accept]')?.addEventListener('click', () => {
      let accepted = quoteFromForm(form, current, leads, 'Accepted');
      if (!accepted) return;
      const order = ensureOrderForQuote(accepted);
      accepted = normalize({ ...accepted, orderId: order.id, acceptedAt: accepted.acceptedAt || now() });
      onCommit('accept', accepted, false);
      closeModal();
    });
  }

  function bindTopbarCreate(root, page, onCreate) {
    const right = root.querySelector('.topbar .right');
    const bell = right?.querySelector('.notification-wrap');
    let current = root.querySelector('#quoteHeaderCreate');
    if (current) {
      const replacement = current.cloneNode(true);
      replacement.removeAttribute('style');
      replacement.textContent = '+ Create Quote';
      current.replaceWith(replacement);
      current = replacement;
    } else if (right) {
      current = document.createElement('button');
      current.type = 'button';
      current.id = 'quoteHeaderCreate';
      current.className = 'btn primary';
      current.textContent = '+ Create Quote';
      if (bell) right.insertBefore(current, bell);
      else right.appendChild(current);
    }
    if (!current) return;
    current.addEventListener('click', onCreate);
    const sync = () => { current.style.display = page.classList.contains('active') ? 'inline-flex' : 'none'; };
    sync();
    new MutationObserver(sync).observe(page, { attributes: true, attributeFilter: ['class'] });
  }

  function install() {
    const api = runtime();
    const root = document.querySelector('#lander-full-review');
    const page = root?.querySelector('[data-page="quotes"]');
    if (!api || !root || !page || page.dataset.bpRuntimeQuotes === '2') return;

    removeLegacyOwners(root, page);
    buildCanonicalPage(page);
    page.dataset.bpRuntimeQuotes = '2';

    const search = page.querySelector('#bpQuoteSearch');
    const statusFilter = page.querySelector('#bpQuoteStatusFilter');
    const tbody = page.querySelector('#bpQuotesTbody');
    let quotes = ensureSeed();

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const rows = quotes.filter((quote) => {
        const matchesQuery = !query || [quote.id, quote.leadId, quote.contactName, quote.origin, quote.destination, quote.vehicle, quote.status].join(' ').toLowerCase().includes(query);
        return matchesQuery && (!status || quote.status === status);
      });
      tbody.innerHTML = rows.length
        ? rows.map((quote) => `<tr data-quote-id="${escapeHtml(quote.id)}"><td><button class="link" type="button" data-quote-edit="${escapeHtml(quote.id)}">${escapeHtml(quote.id)} · ${escapeHtml(quote.contactName)}</button><span class="secondary">${escapeHtml(quote.leadId || 'Manual quote')}</span></td><td>${escapeHtml(quote.origin)} → ${escapeHtml(quote.destination)}</td><td>${escapeHtml(quote.vehicle)}</td><td>${escapeHtml(money(quote.customerPrice))}</td><td>Rev ${quote.revision}</td><td><span class="badge ${statusClass(quote.status)}">${escapeHtml(quote.status)}</span></td><td>${escapeHtml(relative(quote.updatedAt))}</td><td><button class="btn ghost" type="button" data-quote-edit="${escapeHtml(quote.id)}">Edit</button></td></tr>`).join('')
        : '<tr><td colspan="8" class="secondary bp-empty-cell">No quotes match the current filters.</td></tr>';
    };

    const commit = (action, quote, creating) => {
      if (action === 'delete') {
        quotes = quotes.filter((item) => item.id !== quote.id);
        save(quotes, 'quote.delete');
        api.audit.record('quote.delete', 'quote', quote.id);
      } else if (creating) {
        quotes.unshift(quote);
        save(quotes, action === 'accept' ? 'quote.accept' : 'quote.create');
        syncLead(quote);
        api.audit.record(action === 'accept' ? 'quote.accept' : 'quote.create', 'quote', quote.id, { leadId: quote.leadId, orderId: quote.orderId });
      } else {
        const index = quotes.findIndex((item) => item.id === quote.id);
        if (index >= 0) quotes[index] = quote;
        save(quotes, action === 'accept' ? 'quote.accept' : 'quote.update');
        syncLead(quote);
        api.audit.record(action === 'accept' ? 'quote.accept' : 'quote.update', 'quote', quote.id, { status: quote.status, orderId: quote.orderId });
      }
      render();
    };

    bindTopbarCreate(root, page, () => openEditor(null, commit));
    search.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-quote-edit]');
      if (!button) return;
      const quote = quotes.find((item) => item.id === button.dataset.quoteEdit);
      if (quote) openEditor(quote, commit);
    });

    api.events.on('quotes:changed', (event) => {
      if (event.detail?.detail?.source?.startsWith?.('quote.')) return;
      quotes = (api.store.get(SCOPE, []) || []).map(normalize);
      render();
    });

    render();
    api.audit.record('quotes.module.ready', 'module', 'quotes', { count: quotes.length, owner: 'runtime-only' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
(() => {
  'use strict';

  const SCOPE = 'orders';
  const CUSTOMER_SCOPE = 'customers';
  const runtime = () => window.BrokerPadRuntime;
  const now = () => new Date().toISOString();
  const uid = () => `OR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const statuses = ['Booked', 'Sourcing', 'Carrier Selected', 'Pickup Scheduled', 'Picked Up', 'In Transit', 'Delivered', 'Settled', 'Cancelled'];
  const orderEditorStatuses = ['Booked', 'Sourcing', 'Cancelled'];
  const transports = ['Open', 'Enclosed'];
  const historyLockedStatuses = new Set(['Picked Up', 'In Transit', 'Delivered', 'Settled']);

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const statusClass = (status) => ({ Booked: 'gray', Sourcing: 'amber', 'Carrier Selected': 'blue', 'Pickup Scheduled': 'blue', 'Picked Up': 'blue', 'In Transit': 'blue', Delivered: 'green', Settled: 'green', Cancelled: 'red' }[status] || 'gray');

  const initialOrders = [
    { id: 'OR-1001', sourceQuoteId: 'QT-1001', leadId: 'LD-1001', customerId: 'CUS-1001', customerName: 'Alex Morgan', origin: 'Los Angeles, CA', destination: 'Miami, FL', vehicle: '2024 Tesla Model 3', transport: 'Open', status: 'Sourcing', customerPrice: 1275, carrierPay: 995, pickupStart: '2026-08-25', pickupEnd: '2026-08-27', carrierId: '', carrierName: '', createdAt: '2026-08-24T12:00:00.000Z', updatedAt: '2026-08-26T11:40:00.000Z', deliveredAt: '', settledAt: '', notes: '' },
    { id: 'OR-1002', sourceQuoteId: '', leadId: 'LD-1002', customerId: '', customerName: 'David Chen', origin: 'Newark, NJ', destination: 'Dallas, TX', vehicle: '2023 BMW X5', transport: 'Open', status: 'Carrier Selected', customerPrice: 1080, carrierPay: 845, pickupStart: '2026-08-24', pickupEnd: '2026-08-25', carrierId: 'CAR-1001', carrierName: 'Northstar Vehicle Transport LLC', createdAt: '2026-08-23T12:00:00.000Z', updatedAt: '2026-08-26T10:45:00.000Z', deliveredAt: '', settledAt: '', notes: '' },
  ];

  const normalize = (order) => ({
    id: order.id || uid(),
    sourceQuoteId: String(order.sourceQuoteId || ''),
    leadId: String(order.leadId || ''),
    customerId: String(order.customerId || ''),
    customerName: String(order.customerName || '').trim(),
    origin: String(order.origin || '').trim(),
    destination: String(order.destination || '').trim(),
    vehicle: String(order.vehicle || '').trim(),
    transport: transports.includes(order.transport) ? order.transport : 'Open',
    status: statuses.includes(order.status) ? order.status : 'Booked',
    customerPrice: Math.max(0, Number(order.customerPrice) || 0),
    carrierPay: Math.max(0, Number(order.carrierPay) || 0),
    pickupStart: String(order.pickupStart || ''),
    pickupEnd: String(order.pickupEnd || ''),
    carrierId: String(order.carrierId || ''),
    carrierName: String(order.carrierName || '').trim(),
    assignedAt: order.assignedAt || '',
    pickedUpAt: order.pickedUpAt || '',
    createdAt: order.createdAt || now(),
    updatedAt: order.updatedAt || now(),
    deliveredAt: order.deliveredAt || '',
    settledAt: order.settledAt || '',
    notes: String(order.notes || '').trim(),
  });

  function ensureSeed() {
    const api = runtime();
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialOrders.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('orders.seed', 'order', '', { count: seeded.length });
    return seeded;
  }

  function customerList() {
    const rows = runtime().store.get(CUSTOMER_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  }

  function syncCustomers(orders) {
    const api = runtime();
    const customers = customerList();
    if (!customers.length) return;
    const stats = new Map();
    orders.filter((order) => order.status !== 'Cancelled' && order.customerId).forEach((order) => {
      const current = stats.get(order.customerId) || { count: 0, value: 0 };
      current.count += 1;
      current.value += Number(order.customerPrice) || 0;
      stats.set(order.customerId, current);
    });
    let changed = false;
    const next = customers.map((customer) => {
      const stat = stats.get(customer.id) || { count: 0, value: 0 };
      if (Number(customer.orders) === stat.count && Number(customer.lifetimeValue) === stat.value) return customer;
      changed = true;
      return { ...customer, orders: stat.count, lifetimeValue: stat.value, updatedAt: now() };
    });
    if (changed) {
      api.store.set(CUSTOMER_SCOPE, next);
      api.events.emit('customers:changed', { count: next.length, source: 'orders' });
    }
  }

  function save(orders, source = 'orders') {
    const api = runtime();
    api.store.set(SCOPE, orders);
    syncCustomers(orders);
    api.events.emit('orders:changed', { count: orders.length, source });
  }

  function modalShell() {
    let layer = document.querySelector('#bpOrderModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpOrderModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpOrderModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openEditor(order, onCommit) {
    const creating = !order;
    const current = normalize(order || {});
    const customers = customerList();
    const historyLocked = !creating && historyLockedStatuses.has(current.status);
    const lifecycleLocked = !creating && !orderEditorStatuses.includes(current.status);
    const options = customers.map((customer) => `<option value="${escapeHtml(customer.id)}" ${customer.id === current.customerId ? 'selected' : ''}>${escapeHtml(customer.name)} · ${escapeHtml(customer.id)}</option>`).join('');
    const statusOptions = lifecycleLocked
      ? `<option selected>${escapeHtml(current.status)}</option>`
      : orderEditorStatuses.map((value) => `<option ${value === current.status ? 'selected' : ''}>${value}</option>`).join('');
    const locked = historyLocked ? 'readonly aria-readonly="true"' : '';
    const disabled = historyLocked ? 'disabled' : '';

    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bpOrderModalTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpOrderModalTitle">${creating ? 'New Order' : 'Edit Order'}</h3><p>${creating ? 'Create a booked transport order.' : escapeHtml(current.id)}</p></div><button type="button" class="bp-runtime-close" data-order-close aria-label="Close">×</button></div>
        <form id="bpOrderForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Customer</span><select name="customerId" ${disabled}><option value="">Not linked</option>${options}</select></label>
            <label><span>Customer name *</span><input name="customerName" required value="${escapeHtml(current.customerName)}" ${locked}></label>
            <label><span>Origin *</span><input name="origin" required value="${escapeHtml(current.origin)}" ${locked}></label>
            <label><span>Destination *</span><input name="destination" required value="${escapeHtml(current.destination)}" ${locked}></label>
            <label class="bp-runtime-span-2"><span>Vehicle *</span><input name="vehicle" required value="${escapeHtml(current.vehicle)}" ${locked}></label>
            <label><span>Transport</span><select name="transport" ${disabled}>${transports.map((value) => `<option ${value === current.transport ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Status</span><select name="status" ${lifecycleLocked || historyLocked ? 'disabled' : ''}>${statusOptions}</select></label>
            <label><span>Customer price</span><input name="customerPrice" type="number" min="0" step="0.01" value="${current.customerPrice}" ${locked}></label>
            <label><span>Carrier pay</span><input name="carrierPay" type="number" min="0" step="0.01" value="${current.carrierPay}" ${locked}></label>
            <label><span>Pickup start</span><input name="pickupStart" type="date" value="${escapeHtml(current.pickupStart)}" ${locked}></label>
            <label><span>Pickup end</span><input name="pickupEnd" type="date" value="${escapeHtml(current.pickupEnd)}" ${locked}></label>
            <label><span>Carrier</span><input value="${escapeHtml(current.carrierName || 'Unassigned')}" readonly aria-readonly="true" class="bp-derived-field"></label>
            <label><span>Source quote</span><input value="${escapeHtml(current.sourceQuoteId || 'Manual order')}" readonly aria-readonly="true" class="bp-derived-field"></label>
            <label class="bp-runtime-span-2"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(current.notes)}</textarea></label>
          </div>
          ${lifecycleLocked ? '<div class="bp-runtime-integrity-warning">Operational status and carrier assignment are owned by Dispatch. This screen will not rewrite an active transport lifecycle.</div>' : ''}
          ${historyLocked ? '<div class="bp-runtime-integrity-warning">Route and economics are locked after pickup to preserve transport history. Notes remain editable.</div>' : ''}
          <div class="bp-runtime-form-error" id="bpOrderFormError" hidden></div>
          <div class="bp-runtime-modal-foot">${creating ? '' : '<button type="button" class="btn danger" data-order-delete>Delete</button>'}<span class="bp-runtime-spacer"></span><button type="button" class="btn" data-order-close>Cancel</button><button type="submit" class="btn primary">${creating ? 'Create Order' : 'Save Changes'}</button></div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-order-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpOrderForm');
    form.elements.customerId?.addEventListener('change', () => {
      const customer = customers.find((item) => item.id === form.elements.customerId.value);
      if (customer) form.elements.customerName.value = customer.name || '';
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpOrderFormError');
      if (historyLocked) {
        onCommit('save', normalize({ ...current, notes: values.notes, updatedAt: now() }), false);
        closeModal();
        return;
      }
      const status = lifecycleLocked ? current.status : (values.status || current.status || 'Booked');
      if (!String(values.customerName || '').trim() || !String(values.origin || '').trim() || !String(values.destination || '').trim() || !String(values.vehicle || '').trim()) {
        error.textContent = 'Customer, route and vehicle are required.';
        error.hidden = false;
        return;
      }
      if (values.pickupStart && values.pickupEnd && values.pickupEnd < values.pickupStart) {
        error.textContent = 'Pickup end cannot be earlier than pickup start.';
        error.hidden = false;
        return;
      }
      if (!creating && current.status === 'Cancelled' && status !== 'Cancelled') {
        error.textContent = 'Cancelled orders cannot be reopened by rewriting status. Create a new order instead.';
        error.hidden = false;
        return;
      }
      const next = normalize({
        ...current,
        ...values,
        customerId: values.customerId ?? current.customerId,
        transport: values.transport || current.transport,
        status,
        customerPrice: Number(values.customerPrice),
        carrierPay: Number(values.carrierPay),
        updatedAt: now(),
      });
      onCommit('save', next, creating);
      closeModal();
    });

    layer.querySelector('[data-order-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete ${current.id}?`)) return;
      onCommit('delete', current, false);
      closeModal();
    });
  }

  function install() {
    const api = runtime();
    if (!api) return;
    const page = document.querySelector('[data-page="orders"]');
    if (!page || page.dataset.bpRuntimeOrders === '1') return;
    page.dataset.bpRuntimeOrders = '1';

    const table = page.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const search = page.querySelector('.search-table');
    const head = page.querySelector('.head');
    if (!table || !tbody || !search || !head) return;

    let createButton = head.querySelector('[data-bp-new-order]');
    if (!createButton) {
      createButton = document.createElement('button');
      createButton.type = 'button';
      createButton.className = 'btn primary';
      createButton.dataset.bpNewOrder = '1';
      createButton.textContent = '+ New order';
      head.appendChild(createButton);
    }
    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-bp-order-actions-head]')) {
      const th = document.createElement('th');
      th.dataset.bpOrderActionsHead = '1';
      th.textContent = 'Actions';
      headerRow.appendChild(th);
    }

    let orders = ensureSeed();
    syncCustomers(orders);

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const rows = orders.filter((order) => !query || [order.id, order.customerName, order.origin, order.destination, order.vehicle, order.transport, order.status, order.carrierName, order.sourceQuoteId].join(' ').toLowerCase().includes(query));
      tbody.innerHTML = rows.length
        ? rows.map((order) => `<tr data-order-id="${escapeHtml(order.id)}"><td><button class="link" type="button" data-order-edit="${escapeHtml(order.id)}">${escapeHtml(order.id)} · ${escapeHtml(order.customerName)}</button><span class="secondary">${escapeHtml(order.sourceQuoteId || 'Manual order')}</span></td><td>${escapeHtml(order.origin)} → ${escapeHtml(order.destination)}</td><td>${escapeHtml(order.vehicle)}</td><td>${escapeHtml(order.transport)}</td><td><span class="badge ${statusClass(order.status)}">${escapeHtml(order.status)}</span></td><td>${escapeHtml(order.pickupStart || '—')}${order.pickupEnd && order.pickupEnd !== order.pickupStart ? ` – ${escapeHtml(order.pickupEnd)}` : ''}</td><td><button class="btn ghost" type="button" data-order-edit="${escapeHtml(order.id)}">Edit</button></td></tr>`).join('')
        : '<tr><td colspan="7" class="secondary bp-empty-cell">No orders match the current search.</td></tr>';
    };

    const commit = (action, order, creating) => {
      if (action === 'delete') {
        orders = orders.filter((item) => item.id !== order.id);
        save(orders, 'order.delete');
        api.audit.record('order.delete', 'order', order.id);
      } else if (creating) {
        orders.unshift(order);
        save(orders, 'order.create');
        api.audit.record('order.create', 'order', order.id, { customerId: order.customerId });
      } else {
        const index = orders.findIndex((item) => item.id === order.id);
        if (index >= 0) orders[index] = order;
        save(orders, 'order.update');
        api.audit.record('order.update', 'order', order.id, { status: order.status, carrierName: order.carrierName });
      }
      render();
    };

    createButton.addEventListener('click', () => openEditor(null, commit));
    search.addEventListener('input', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-order-edit]');
      if (!button) return;
      const order = orders.find((item) => item.id === button.dataset.orderEdit);
      if (order) openEditor(order, commit);
    });
    api.events.on('orders:changed', () => {
      orders = (runtime().store.get(SCOPE, []) || []).map(normalize);
      syncCustomers(orders);
      render();
    });

    render();
    api.audit.record('orders.module.ready', 'module', 'orders', { count: orders.length });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

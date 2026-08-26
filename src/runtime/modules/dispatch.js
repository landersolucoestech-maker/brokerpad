(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const ORDER_SCOPE = 'orders';
  const CARRIER_SCOPE = 'carriers';
  const now = () => new Date().toISOString();
  const statusOrder = ['Booked', 'Sourcing', 'Carrier Selected', 'Pickup Scheduled', 'Picked Up', 'In Transit', 'Delivered', 'Settled'];
  const lockedStatuses = new Set(['Picked Up', 'In Transit', 'Delivered', 'Settled']);

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  const effectiveInsuranceStatus = (carrier) => {
    const status = carrier?.insuranceStatus || 'Pending';
    const expiresAt = String(carrier?.insuranceExpiresAt || '').slice(0, 10);
    if (!expiresAt) return status;
    const expiry = Date.parse(`${expiresAt}T23:59:59Z`);
    if (Number.isFinite(expiry) && expiry < Date.now()) return 'Expired';
    return status;
  };

  const isEligibleCarrier = (carrier) => (
    carrier &&
    carrier.authorityStatus === 'Active' &&
    effectiveInsuranceStatus(carrier) === 'Verified' &&
    carrier.risk !== 'High' &&
    carrier.approval === 'Approved'
  );

  const dispatchStatus = (order) => {
    if (order.status === 'Cancelled') return ['Cancelled', 'red'];
    if (order.status === 'Settled') return ['Settled', 'green'];
    if (order.status === 'Delivered') return ['Delivered', 'green'];
    if (order.status === 'In Transit') return ['In Transit', 'blue'];
    if (order.status === 'Picked Up') return ['Picked Up', 'blue'];
    if (order.carrierId || order.carrierName) return ['Assigned', 'green'];
    if (['Sourcing', 'Booked'].includes(order.status)) return ['Unassigned', 'gray'];
    return [order.status || 'Pending', 'amber'];
  };

  const getOrders = () => {
    const rows = api.store.get(ORDER_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  };

  const getCarriers = () => {
    const rows = api.store.get(CARRIER_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  };

  function saveOrders(orders, source) {
    api.store.set(ORDER_SCOPE, orders);
    api.events.emit('orders:changed', { count: orders.length, source });
  }

  function modalShell() {
    let layer = document.querySelector('#bpDispatchModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpDispatchModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpDispatchModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openManage(order, onCommit) {
    const carriers = getCarriers();
    const eligible = carriers.filter(isEligibleCarrier);
    const currentCarrier = carriers.find((carrier) => carrier.id === order.carrierId);
    const available = currentCarrier && !eligible.some((carrier) => carrier.id === currentCarrier.id)
      ? [currentCarrier, ...eligible]
      : eligible;
    const carrierLocked = lockedStatuses.has(order.status);
    const carrierOptions = available.map((carrier) => `
      <option value="${escapeHtml(carrier.id)}" ${carrier.id === order.carrierId ? 'selected' : ''}>
        ${escapeHtml(carrier.name)} · USDOT ${escapeHtml(carrier.usdot || '—')}${isEligibleCarrier(carrier) ? '' : ' · CURRENT CARRIER REQUIRES REVIEW'}
      </option>`).join('');

    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpDispatchModalTitle">
        <div class="bp-runtime-modal-head">
          <div><h3 id="bpDispatchModalTitle">Dispatch ${escapeHtml(order.id)}</h3><p>${escapeHtml(order.origin)} → ${escapeHtml(order.destination)} · ${escapeHtml(order.vehicle)}</p></div>
          <button type="button" class="bp-runtime-close" data-dispatch-close aria-label="Close">×</button>
        </div>
        <form id="bpDispatchForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label class="bp-runtime-span-2"><span>Carrier</span><select name="carrierId" ${carrierLocked ? 'disabled' : ''}><option value="">Unassigned</option>${carrierOptions}</select>${carrierLocked ? `<input type="hidden" name="lockedCarrierId" value="${escapeHtml(order.carrierId || '')}">` : ''}</label>
            <label><span>Customer price</span><input disabled value="${escapeHtml(money(order.customerPrice))}"></label>
            <label><span>Carrier pay *</span><input name="carrierPay" type="number" min="0" step="0.01" required value="${Number(order.carrierPay) || 0}"></label>
            <label><span>Pickup start</span><input name="pickupStart" type="date" value="${escapeHtml(order.pickupStart || '')}"></label>
            <label><span>Pickup end</span><input name="pickupEnd" type="date" value="${escapeHtml(order.pickupEnd || '')}"></label>
            <label class="bp-runtime-span-2"><span>Order status</span><select name="status">
              ${['Sourcing', 'Carrier Selected', 'Pickup Scheduled', 'Picked Up', 'In Transit', 'Delivered'].map((status) => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}
            </select></label>
          </div>
          ${carrierLocked ? '<div class="bp-runtime-integrity-warning">Carrier assignment is locked after pickup. Operational completion remains available, but the carrier cannot be replaced or unassigned.</div>' : ''}
          <div class="bp-runtime-form-error" id="bpDispatchFormError" hidden></div>
          <div class="bp-runtime-modal-foot">
            ${(order.carrierId || order.carrierName) && !carrierLocked ? '<button type="button" class="btn danger" data-dispatch-unassign>Unassign</button>' : ''}
            <span class="bp-runtime-spacer"></span>
            <button type="button" class="btn" data-dispatch-close>Cancel</button>
            <button type="submit" class="btn primary">Save Dispatch</button>
          </div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-dispatch-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpDispatchForm');

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const carrierId = carrierLocked ? order.carrierId : String(values.carrierId || '');
      const selected = carriers.find((carrier) => carrier.id === carrierId);
      const error = layer.querySelector('#bpDispatchFormError');
      const changingCarrier = Boolean(selected?.id) && selected.id !== order.carrierId;

      if (selected && (changingCarrier || !order.carrierId) && !isEligibleCarrier(selected)) {
        error.textContent = 'This carrier is not dispatch eligible. Authority must be Active, insurance Verified and unexpired, approval Approved and risk cannot be High.';
        error.hidden = false;
        return;
      }
      if (selected && Number(values.carrierPay) <= 0) {
        error.textContent = 'Carrier pay must be greater than zero before assignment.';
        error.hidden = false;
        return;
      }
      if (!selected && !['Sourcing', 'Booked'].includes(values.status)) {
        error.textContent = 'An unassigned order cannot move beyond sourcing.';
        error.hidden = false;
        return;
      }
      if (values.pickupStart && values.pickupEnd && values.pickupEnd < values.pickupStart) {
        error.textContent = 'Pickup end cannot be earlier than pickup start.';
        error.hidden = false;
        return;
      }
      const previousRank = statusOrder.indexOf(order.status);
      const nextRank = statusOrder.indexOf(values.status);
      if (lockedStatuses.has(order.status) && nextRank >= 0 && previousRank >= 0 && nextRank < previousRank) {
        error.textContent = `Status cannot move backward from ${order.status}. Create a corrective operational event instead of rewriting the transport history.`;
        error.hidden = false;
        return;
      }

      const nextStatus = selected && ['Sourcing', 'Booked'].includes(values.status)
        ? 'Carrier Selected'
        : values.status;
      const updated = {
        ...order,
        carrierId: selected?.id || '',
        carrierName: selected?.name || (carrierLocked ? order.carrierName : ''),
        carrierPay: Number(values.carrierPay) || 0,
        pickupStart: values.pickupStart || '',
        pickupEnd: values.pickupEnd || '',
        status: nextStatus,
        assignedAt: selected ? (order.assignedAt || now()) : '',
        pickedUpAt: nextStatus === 'Picked Up' && !order.pickedUpAt ? now() : order.pickedUpAt || '',
        deliveredAt: nextStatus === 'Delivered' && !order.deliveredAt ? now() : order.deliveredAt || '',
        updatedAt: now(),
      };
      onCommit('save', updated, selected);
      closeModal();
    });

    layer.querySelector('[data-dispatch-unassign]')?.addEventListener('click', () => {
      if (lockedStatuses.has(order.status)) {
        window.alert(`Carrier assignment cannot be removed after ${order.status}.`);
        return;
      }
      if (!window.confirm(`Unassign the carrier from ${order.id}?`)) return;
      onCommit('unassign', {
        ...order,
        carrierId: '',
        carrierName: '',
        assignedAt: '',
        status: 'Sourcing',
        updatedAt: now(),
      }, null);
      closeModal();
    });
  }

  function install() {
    const page = document.querySelector('[data-page="dispatch"]');
    if (!page || page.dataset.bpRuntimeDispatch === '1') return;
    page.dataset.bpRuntimeDispatch = '1';

    const table = page.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const search = page.querySelector('.search-table');
    if (!table || !tbody || !search) return;

    let orders = getOrders();

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const rows = orders
        .filter((order) => order.status !== 'Settled')
        .filter((order) => !query || [
          order.id, order.customerName, order.origin, order.destination,
          order.vehicle, order.carrierName, order.status,
        ].join(' ').toLowerCase().includes(query));

      tbody.innerHTML = rows.length ? rows.map((order) => {
        const [label, klass] = dispatchStatus(order);
        return `
          <tr data-dispatch-order-id="${escapeHtml(order.id)}">
            <td><b>${escapeHtml(order.id)}</b><span class="secondary">${escapeHtml(order.customerName || '—')}</span></td>
            <td>${escapeHtml(order.origin)} → ${escapeHtml(order.destination)}<span class="secondary">${escapeHtml(order.pickupStart || 'Pickup not scheduled')}${order.pickupEnd ? ` – ${escapeHtml(order.pickupEnd)}` : ''}</span></td>
            <td>${escapeHtml(order.vehicle || '—')}</td>
            <td>${escapeHtml(order.carrierName || '—')}<span class="secondary">${order.carrierName ? escapeHtml(money(order.carrierPay)) : 'No carrier assigned'}</span></td>
            <td><span class="badge ${klass}">${escapeHtml(label)}</span></td>
            <td><button type="button" class="btn ${order.carrierName ? '' : 'primary'}" data-dispatch-manage="${escapeHtml(order.id)}">${order.carrierName ? 'Manage' : 'Assign'}</button></td>
          </tr>`;
      }).join('') : '<tr><td colspan="6" class="secondary bp-empty-cell">No active dispatch orders match the current search.</td></tr>';
    };

    const commit = (action, updatedOrder, carrier) => {
      const index = orders.findIndex((order) => order.id === updatedOrder.id);
      if (index < 0) return;
      const previous = orders[index];
      orders[index] = updatedOrder;
      saveOrders(orders, action === 'unassign' ? 'dispatch.unassign' : 'dispatch.save');

      if (action === 'unassign') {
        api.audit.record('carrier.assignment.removed', 'order', updatedOrder.id, {
          previousCarrierId: previous.carrierId || '',
          previousCarrierName: previous.carrierName || '',
        });
      } else {
        api.audit.record('carrier.assignment.updated', 'order', updatedOrder.id, {
          carrierId: carrier?.id || '',
          carrierName: carrier?.name || '',
          carrierPay: updatedOrder.carrierPay,
          status: updatedOrder.status,
        });
      }
      render();
    };

    search.addEventListener('input', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-dispatch-manage]');
      if (!button) return;
      const order = orders.find((item) => item.id === button.dataset.dispatchManage);
      if (order) openManage(order, commit);
    });

    api.events.on('orders:changed', () => {
      orders = getOrders();
      render();
    });
    api.events.on('carriers:changed', render);

    render();
    api.audit.record('dispatch.module.ready', 'module', 'dispatch', { activeOrders: orders.filter((order) => order.status !== 'Settled').length });
  }

  install();
})();

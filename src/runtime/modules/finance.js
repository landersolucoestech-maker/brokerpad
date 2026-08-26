(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const ORDER_SCOPE = 'orders';
  const PAYMENT_SCOPE = 'finance-payments';

  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const getOrders = () => {
    const rows = api.store.get(ORDER_SCOPE, []);
    return Array.isArray(rows) ? rows : [];
  };

  const getPayments = () => {
    const value = api.store.get(PAYMENT_SCOPE, { customer: {}, carrier: {} });
    return {
      customer: value && typeof value.customer === 'object' && value.customer ? { ...value.customer } : {},
      carrier: value && typeof value.carrier === 'object' && value.carrier ? { ...value.carrier } : {},
    };
  };

  const savePayments = (payments, source = 'finance') => {
    api.store.set(PAYMENT_SCOPE, payments);
    api.events.emit('finance:changed', { at: new Date().toISOString(), source });
  };

  function reconcilePayments(emit = false) {
    const orders = getOrders();
    const byId = new Map(orders.map((order) => [String(order.id), order]));
    const current = getPayments();
    const next = { customer: {}, carrier: {} };
    let changed = false;

    ['customer', 'carrier'].forEach((side) => {
      Object.entries(current[side]).forEach(([orderId, amount]) => {
        const order = byId.get(orderId);
        if (!order) {
          if (Number(amount) > 0) changed = true;
          return;
        }
        const maximum = side === 'customer' ? Math.max(0, Number(order.customerPrice) || 0) : Math.max(0, Number(order.carrierPay) || 0);
        const normalized = Math.min(maximum, Math.max(0, Number(amount) || 0));
        if (normalized > 0) next[side][orderId] = normalized;
        if (normalized !== Number(amount || 0)) changed = true;
      });
    });

    if (changed) {
      api.store.set(PAYMENT_SCOPE, next);
      api.audit.record('finance.ledger.reconciled', 'finance', '', { source: 'order-economics', cappedOrRemoved: true });
      if (emit) api.events.emit('finance:changed', { source: 'finance.reconcile' });
      return next;
    }
    return current;
  }

  function compute() {
    const orders = getOrders().filter((order) => order.status !== 'Cancelled');
    const payments = getPayments();
    const rows = orders.map((order) => {
      const customerPaid = Math.min(Number(order.customerPrice) || 0, Number(payments.customer[order.id]) || 0);
      const carrierPaid = Math.min(Number(order.carrierPay) || 0, Number(payments.carrier[order.id]) || 0);
      const customerBalance = Math.max(0, (Number(order.customerPrice) || 0) - customerPaid);
      const carrierBalance = Math.max(0, (Number(order.carrierPay) || 0) - carrierPaid);
      const grossProfit = (Number(order.customerPrice) || 0) - (Number(order.carrierPay) || 0);
      return { ...order, customerPaid, carrierPaid, customerBalance, carrierBalance, grossProfit };
    });
    const accountsReceivable = rows.reduce((sum, row) => sum + row.customerBalance, 0);
    const carrierPayables = rows.reduce((sum, row) => sum + row.carrierBalance, 0);
    const revenue = rows.reduce((sum, row) => sum + (Number(row.customerPrice) || 0), 0);
    const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
    const margin = revenue > 0 ? grossProfit / revenue * 100 : 0;
    return { rows, payments, accountsReceivable, carrierPayables, revenue, grossProfit, margin };
  }

  function modalShell() {
    let layer = document.querySelector('#bpFinancePaymentModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpFinancePaymentModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpFinancePaymentModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openPaymentModal(orderId, side, onCommit) {
    const order = getOrders().find((item) => item.id === orderId);
    if (!order) return;
    const maximum = side === 'customer' ? Number(order.customerPrice) || 0 : Number(order.carrierPay) || 0;
    if (maximum <= 0) return;
    const payments = getPayments();
    const already = Math.min(maximum, Number(payments[side][orderId]) || 0);
    const remaining = Math.max(0, maximum - already);

    const layer = modalShell();
    layer.hidden = false;
    const title = side === 'customer' ? 'Record Customer Payment' : 'Record Carrier Payment';
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpFinancePaymentTitle">
        <div class="bp-runtime-modal-head">
          <div><h3 id="bpFinancePaymentTitle">${title}</h3><p>${escapeHtml(order.id)} · ${escapeHtml(order.customerName || 'Order')}</p></div>
          <button type="button" class="bp-runtime-close" data-finance-payment-close aria-label="Close">×</button>
        </div>
        <form id="bpFinancePaymentForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label><span>Total</span><input value="${escapeHtml(money(maximum))}" disabled></label>
            <label><span>Already recorded</span><input value="${escapeHtml(money(already))}" disabled></label>
            <label class="bp-runtime-span-2"><span>Amount *</span><input name="amount" type="number" min="0.01" max="${remaining}" step="0.01" required value="${remaining || ''}" ${remaining <= 0 ? 'disabled' : ''}></label>
          </div>
          ${remaining <= 0 ? '<div class="bp-runtime-integrity-warning">This balance is already fully paid.</div>' : ''}
          <div class="bp-runtime-form-error" id="bpFinancePaymentError" hidden></div>
          <div class="bp-runtime-modal-foot">
            <span class="bp-runtime-spacer"></span>
            <button type="button" class="btn" data-finance-payment-close>Cancel</button>
            <button type="submit" class="btn primary" ${remaining <= 0 ? 'disabled' : ''}>Record Payment</button>
          </div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-finance-payment-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpFinancePaymentForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const amount = Number(form.elements.amount?.value);
      const error = layer.querySelector('#bpFinancePaymentError');
      if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
        error.textContent = `Enter an amount greater than zero and no more than ${money(remaining)}.`;
        error.hidden = false;
        return;
      }
      onCommit({ order, side, amount, already, maximum });
      closeModal();
    });
    if (remaining > 0) setTimeout(() => form.elements.amount?.select(), 0);
  }

  function install() {
    const page = document.querySelector('[data-page="finance"]');
    if (!page || page.dataset.bpRuntimeFinance === '1') return;
    page.dataset.bpRuntimeFinance = '1';

    const subtitle = page.querySelector('.head p');
    if (subtitle) subtitle.textContent = 'Order-level receivables, carrier payables, collections and gross margin from the active runtime ledger.';

    const kpis = [...page.querySelectorAll('.kpi')];
    if (kpis.length < 3) return;

    const detail = document.createElement('section');
    detail.className = 'card bp-runtime-finance-detail';
    detail.innerHTML = `
      <div class="cardh"><div><h2>Order economics</h2><span class="secondary">Prototype ledger · amounts persist per tenant</span></div></div>
      <div class="tablewrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Revenue</th><th>Customer balance</th><th>Carrier</th><th>Carrier balance</th><th>Gross profit</th><th>Actions</th></tr></thead><tbody id="bpFinanceRows"></tbody></table></div>`;
    page.appendChild(detail);
    const tbody = detail.querySelector('#bpFinanceRows');

    const render = () => {
      const result = compute();
      const openCustomer = result.rows.filter((row) => row.customerBalance > 0).length;
      const openCarrier = result.rows.filter((row) => row.carrierBalance > 0).length;

      kpis[0].querySelector('strong').textContent = money(result.accountsReceivable);
      kpis[0].querySelector('span').textContent = `${openCustomer} open order balances`;
      kpis[1].querySelector('strong').textContent = money(result.carrierPayables);
      kpis[1].querySelector('span').textContent = `${openCarrier} carrier balances`;
      kpis[2].querySelector('strong').textContent = money(result.grossProfit);
      kpis[2].querySelector('span').textContent = `${result.margin.toFixed(1)}% gross margin`;

      tbody.innerHTML = result.rows.length ? result.rows.map((row) => `
        <tr data-finance-order="${escapeHtml(row.id)}">
          <td><b>${escapeHtml(row.id)}</b><span class="secondary">${escapeHtml(row.status)}</span></td>
          <td>${escapeHtml(row.customerName || '—')}</td>
          <td>${escapeHtml(money(row.customerPrice))}</td>
          <td>${escapeHtml(money(row.customerBalance))}<span class="secondary">Paid ${escapeHtml(money(row.customerPaid))}</span></td>
          <td>${escapeHtml(row.carrierName || 'Unassigned')}<span class="secondary">Pay ${escapeHtml(money(row.carrierPay))}</span></td>
          <td>${escapeHtml(money(row.carrierBalance))}<span class="secondary">Paid ${escapeHtml(money(row.carrierPaid))}</span></td>
          <td><b>${escapeHtml(money(row.grossProfit))}</b></td>
          <td><div class="actions"><button type="button" class="btn ghost" data-finance-customer="${escapeHtml(row.id)}" ${row.customerBalance > 0 ? '' : 'disabled'}>Customer payment</button><button type="button" class="btn ghost" data-finance-carrier="${escapeHtml(row.id)}" ${row.carrierBalance > 0 && row.carrierPay > 0 ? '' : 'disabled'}>Carrier payment</button></div></td>
        </tr>`).join('') : '<tr><td colspan="8" class="secondary bp-empty-cell">No operational orders are available.</td></tr>';
    };

    const recordPayment = ({ order, side, amount, already, maximum }) => {
      const payments = getPayments();
      payments[side][order.id] = Math.min(maximum, already + amount);
      savePayments(payments, side === 'customer' ? 'payment.customer' : 'payment.carrier');
      api.audit.record(side === 'customer' ? 'payment.customer.received' : 'payment.carrier.recorded', 'order', order.id, {
        amount,
        cumulativePaid: payments[side][order.id],
        remaining: Math.max(0, maximum - payments[side][order.id]),
      });
      render();
    };

    tbody.addEventListener('click', (event) => {
      const customer = event.target.closest('[data-finance-customer]');
      if (customer) {
        openPaymentModal(customer.dataset.financeCustomer, 'customer', recordPayment);
        return;
      }
      const carrier = event.target.closest('[data-finance-carrier]');
      if (carrier) openPaymentModal(carrier.dataset.financeCarrier, 'carrier', recordPayment);
    });

    api.events.on('orders:changed', () => {
      reconcilePayments(false);
      render();
    });
    api.events.on('finance:changed', render);
    reconcilePayments(false);
    render();
    api.audit.record('finance.module.ready', 'module', 'finance');
  }

  install();
})();

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
      customer: value && typeof value.customer === 'object' ? value.customer : {},
      carrier: value && typeof value.carrier === 'object' ? value.carrier : {},
    };
  };

  const savePayments = (payments) => {
    api.store.set(PAYMENT_SCOPE, payments);
    api.events.emit('finance:changed', { at: new Date().toISOString() });
  };

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
          <td><div class="actions"><button type="button" class="btn ghost" data-finance-customer="${escapeHtml(row.id)}">Customer payment</button><button type="button" class="btn ghost" data-finance-carrier="${escapeHtml(row.id)}" ${row.carrierPay > 0 ? '' : 'disabled'}>Carrier payment</button></div></td>
        </tr>`).join('') : '<tr><td colspan="8" class="secondary" style="padding:18px;text-align:center">No operational orders are available.</td></tr>';
    };

    const recordPayment = (orderId, side) => {
      const order = getOrders().find((item) => item.id === orderId);
      if (!order) return;
      const maximum = side === 'customer' ? Number(order.customerPrice) || 0 : Number(order.carrierPay) || 0;
      if (maximum <= 0) return;
      const payments = getPayments();
      const already = Number(payments[side][orderId]) || 0;
      const remaining = Math.max(0, maximum - already);
      if (remaining <= 0) {
        window.alert('This balance is already fully paid.');
        return;
      }
      const answer = window.prompt(`Record ${side === 'customer' ? 'customer receipt' : 'carrier payment'} for ${orderId}. Remaining ${money(remaining)}.`, String(remaining));
      if (answer == null) return;
      const amount = Number(answer);
      if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
        window.alert(`Enter an amount greater than zero and no more than ${money(remaining)}.`);
        return;
      }
      payments[side][orderId] = already + amount;
      savePayments(payments);
      api.audit.record(side === 'customer' ? 'payment.customer.received' : 'payment.carrier.recorded', 'order', orderId, {
        amount,
        cumulativePaid: payments[side][orderId],
        remaining: Math.max(0, maximum - payments[side][orderId]),
      });
      render();
    };

    tbody.addEventListener('click', (event) => {
      const customer = event.target.closest('[data-finance-customer]');
      if (customer) return recordPayment(customer.dataset.financeCustomer, 'customer');
      const carrier = event.target.closest('[data-finance-carrier]');
      if (carrier) recordPayment(carrier.dataset.financeCarrier, 'carrier');
    });

    api.events.on('orders:changed', render);
    api.events.on('finance:changed', render);
    render();
    api.audit.record('finance.module.ready', 'module', 'finance');
  }

  install();
})();

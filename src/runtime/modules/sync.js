(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

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
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  };

  const leadStatusClass = (status) => ({
    New: 'gray',
    Contacted: 'blue',
    Quoted: 'blue',
    'Follow-up': 'amber',
    Won: 'green',
    Lost: 'red',
  }[status] || 'gray');

  const syncCustomers = () => {
    const rows = api.store.get('customers', []);
    if (!Array.isArray(rows)) return;
    rows.forEach((customer) => {
      const row = document.querySelector(`[data-page="customers"] tr[data-customer-id="${CSS.escape(customer.id)}"]`);
      if (!row) return;
      const cells = row.cells;
      if (cells.length >= 7) {
        cells[3].textContent = Number(customer.leads) || 0;
        cells[4].textContent = Number(customer.orders) || 0;
        cells[5].textContent = money(customer.lifetimeValue);
        cells[6].textContent = relative(customer.updatedAt);
      }
    });

    const form = document.querySelector('#bpCustomerForm');
    if (form && !form.closest('[hidden]')) {
      const idText = document.querySelector('#bpCustomerModalTitle')?.parentElement?.querySelector('p')?.textContent?.trim();
      const customer = rows.find((item) => item.id === idText);
      if (customer) {
        if (form.elements.leads) form.elements.leads.value = Number(customer.leads) || 0;
        if (form.elements.orders) form.elements.orders.value = Number(customer.orders) || 0;
        if (form.elements.lifetimeValue) form.elements.lifetimeValue.value = Number(customer.lifetimeValue) || 0;
      }
    }
  };

  const syncLeads = () => {
    const rows = api.store.get('leads', []);
    if (!Array.isArray(rows)) return;
    rows.forEach((lead) => {
      const row = document.querySelector(`[data-page="leads"] tr[data-lead-id="${CSS.escape(lead.id)}"]`);
      if (!row) return;
      const cells = row.cells;
      if (cells.length >= 7) {
        const badge = cells[3].querySelector('.badge');
        if (badge) {
          badge.className = `badge ${leadStatusClass(lead.status)}`;
          badge.textContent = lead.status;
        } else {
          cells[3].textContent = lead.status;
        }
        cells[4].textContent = Number(lead.quoteAmount) > 0 ? money(lead.quoteAmount) : '—';
        cells[6].textContent = relative(lead.updatedAt);
      }
    });

    const form = document.querySelector('#bpLeadForm');
    const title = document.querySelector('#bpLeadModalTitle');
    const idText = title?.parentElement?.querySelector('p')?.textContent?.trim();
    if (form && idText) {
      const lead = rows.find((item) => item.id === idText);
      if (lead) {
        if (form.elements.status) form.elements.status.value = lead.status;
        if (form.elements.quoteAmount) form.elements.quoteAmount.value = Number(lead.quoteAmount) || 0;
      }
    }
  };

  api.events.on('customers:changed', syncCustomers);
  api.events.on('leads:changed', syncLeads);
  api.events.on('orders:changed', syncCustomers);
  api.events.on('quotes:changed', syncLeads);

  syncCustomers();
  syncLeads();
  api.audit.record('runtime.sync.ready', 'module', 'sync');
})();

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

  function normalizeTableContracts() {
    document.querySelectorAll('#lander-full-review table').forEach((table) => {
      const headerRow = table.querySelector('thead tr');
      const dataRow = [...table.querySelectorAll('tbody tr')].find((row) => row.cells.length > 1 && !row.querySelector('td[colspan]'));
      if (!headerRow || !dataRow) return;

      while (headerRow.cells.length > dataRow.cells.length) {
        const last = headerRow.cells[headerRow.cells.length - 1];
        const previous = headerRow.cells[headerRow.cells.length - 2];
        if (!last || !/^actions$/i.test(last.textContent.trim())) break;
        if (previous && /^actions$/i.test(previous.textContent.trim())) {
          last.remove();
          continue;
        }
        break;
      }
    });
  }

  function communicationState() {
    const page = document.querySelector('[data-page="communications"]');
    if (!page) return { page: null, row: null, customer: null, noteMode: false, blocked: false };

    const activeId = page.querySelector('.comm-thread.active[data-conversation-id]')?.dataset.conversationId || '';
    const conversations = api.store.get('communications', []);
    const row = Array.isArray(conversations) ? conversations.find((item) => item.id === activeId) : null;
    const customers = api.store.get('customers', []);
    const customer = row?.customerId && Array.isArray(customers)
      ? customers.find((item) => item.id === row.customerId)
      : null;
    const noteMode = page.querySelector('[data-compose].active')?.dataset.compose === 'note';
    const blocked = Boolean(
      row &&
      row.channel !== 'internal' &&
      !noteMode &&
      customer?.status === 'Do Not Contact'
    );
    return { page, row, customer, noteMode, blocked };
  }

  function ensureContactNotice(page) {
    let notice = page.querySelector('[data-bp-contact-policy-notice]');
    if (notice) return notice;
    const composer = page.querySelector('#commComposer');
    if (!composer?.parentElement) return null;
    notice = document.createElement('div');
    notice.dataset.bpContactPolicyNotice = '1';
    notice.className = 'bp-contact-policy-notice';
    notice.hidden = true;
    composer.parentElement.insertBefore(notice, composer);
    return notice;
  }

  function applyCommunicationPolicy() {
    const { page, row, customer, blocked } = communicationState();
    if (!page || !row) return;
    const composer = page.querySelector('#commComposer');
    const send = page.querySelector('#commSend');
    const notice = ensureContactNotice(page);
    const closed = row.status === 'closed';

    if (composer) composer.disabled = closed || blocked;
    if (send) send.disabled = closed || blocked;

    if (notice) {
      notice.hidden = !blocked;
      notice.textContent = blocked
        ? `${customer?.name || row.name} is marked Do Not Contact. External replies are blocked; internal notes remain available.`
        : '';
    }
  }

  function blockDncSend(event) {
    const send = event.target.closest('#commSend');
    if (!send) return;
    const { row, customer, blocked } = communicationState();
    if (!row || !blocked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    api.audit.record('conversation.contact.blocked', 'conversation', row.id, {
      customerId: customer?.id || row.customerId || '',
      channel: row.channel,
      reason: 'do_not_contact',
    });
    applyCommunicationPolicy();
  }

  function blockDncFirstMessage(event) {
    const form = event.target.closest('#bpCommNewForm');
    if (!form) return;
    const values = Object.fromEntries(new FormData(form).entries());
    const channel = String(values.channel || 'internal');
    const customerId = String(values.customerId || '').trim().toUpperCase();
    const body = String(values.body || '').trim();
    if (!customerId || channel === 'internal' || !body) return;

    const customers = api.store.get('customers', []);
    const customer = Array.isArray(customers) ? customers.find((item) => item.id === customerId) : null;
    if (customer?.status !== 'Do Not Contact') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const error = form.querySelector('#bpCommNewError');
    if (error) {
      error.textContent = `${customer.name || customerId} is marked Do Not Contact. Create the conversation without an external first message or use an internal note.`;
      error.hidden = false;
    }
    api.audit.record('conversation.contact.blocked', 'customer', customerId, {
      channel,
      reason: 'do_not_contact_first_message',
    });
  }

  let scheduled = false;
  const scheduleConsistency = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      normalizeTableContracts();
      applyCommunicationPolicy();
    });
  };

  document.addEventListener('click', blockDncSend, true);
  document.addEventListener('submit', blockDncFirstMessage, true);
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-compose],[data-conversation-id]')) setTimeout(scheduleConsistency, 0);
  });

  api.events.on('customers:changed', () => {
    syncCustomers();
    scheduleConsistency();
  });
  api.events.on('leads:changed', syncLeads);
  api.events.on('orders:changed', syncCustomers);
  api.events.on('quotes:changed', syncLeads);
  api.events.on('communications:changed', scheduleConsistency);

  const observer = new MutationObserver(scheduleConsistency);
  const root = document.getElementById('lander-full-review');
  if (root) observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'disabled'] });

  syncCustomers();
  syncLeads();
  normalizeTableContracts();
  applyCommunicationPolicy();
  api.audit.record('runtime.sync.ready', 'module', 'sync', {
    tableContracts: true,
    contactPolicy: 'do-not-contact',
  });
})();

(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api || window.__brokerPadIntegrityInstalled) return;
  window.__brokerPadIntegrityInstalled = true;

  const now = () => new Date().toISOString();

  const modalId = (selector) => {
    const text = document.querySelector(selector)?.textContent?.trim() || '';
    const match = text.match(/\b(?:CUS|LD|QT|OR|CAR)-[A-Z0-9-]+\b/i);
    return match ? match[0].toUpperCase() : '';
  };

  const entityFromDeleteButton = (button) => {
    if (button.matches('[data-customer-delete]')) return ['customer', modalId('#bpCustomerModalTitle + p, #bpCustomerModalTitle ~ p')];
    if (button.matches('[data-lead-delete]')) return ['lead', modalId('#bpLeadModalTitle + p, #bpLeadModalTitle ~ p')];
    if (button.matches('[data-quote-delete]')) return ['quote', modalId('#bpQuoteForm') || modalId('#bpQuoteModalLayer .bp-runtime-modal-head p')];
    if (button.matches('[data-order-delete]')) return ['order', modalId('#bpOrderForm') || modalId('#bpOrderModalLayer .bp-runtime-modal-head p')];
    if (button.matches('[data-carrier-delete]')) return ['carrier', modalId('#bpCarrierForm') || modalId('#bpCarrierModalLayer .bp-runtime-modal-head p')];
    return ['', ''];
  };

  function protectReferencedDeletes(event) {
    const button = event.target.closest('[data-customer-delete],[data-lead-delete],[data-quote-delete],[data-order-delete],[data-carrier-delete]');
    if (!button) return;
    const [entity, id] = entityFromDeleteButton(button);
    if (!entity || !id) return;
    const refs = api.relations.references(entity, id);
    if (!refs.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const summary = api.relations.summary(entity, id);
    window.alert(`Cannot delete ${id}. It is referenced by ${summary}. Remove or reassign those records first.`);
    api.audit.record('integrity.delete.blocked', entity, id, {
      references: refs.map((ref) => ({ scope: ref.scope, type: ref.type, id: ref.id })),
    });
  }

  function lockDerivedCustomerMetrics() {
    const form = document.querySelector('#bpCustomerForm');
    if (!form) return;
    ['leads', 'orders', 'lifetimeValue'].forEach((name) => {
      const input = form.elements[name];
      if (!input) return;
      input.readOnly = true;
      input.setAttribute('aria-readonly', 'true');
      input.title = 'Calculated automatically from linked BrokerPad records.';
      input.classList.add('bp-derived-field');
    });
  }

  function pruneOrphanFinancePayments() {
    const orders = api.store.get('orders', []);
    if (!Array.isArray(orders)) return;
    const validIds = new Set(orders.map((order) => String(order.id || '')));
    const payments = api.store.get('finance-payments', { customer: {}, carrier: {} });
    if (!payments || typeof payments !== 'object') return;

    let removed = 0;
    const next = { customer: {}, carrier: {} };
    ['customer', 'carrier'].forEach((side) => {
      const source = payments[side] && typeof payments[side] === 'object' ? payments[side] : {};
      Object.entries(source).forEach(([orderId, amount]) => {
        const numeric = Number(amount) || 0;
        if (validIds.has(orderId) && numeric > 0) next[side][orderId] = numeric;
        else if (numeric > 0) removed += 1;
      });
    });

    if (!removed) return;
    api.store.set('finance-payments', next);
    api.events.emit('finance:changed', { source: 'integrity.prune', removed });
    api.audit.record('integrity.finance.orphans.pruned', 'finance', '', { removed, at: now() });
  }

  function auditBrokenLinks() {
    const customers = new Set((api.store.get('customers', []) || []).map((row) => row.id));
    const leads = new Set((api.store.get('leads', []) || []).map((row) => row.id));
    const quotes = new Set((api.store.get('quotes', []) || []).map((row) => row.id));
    const orders = new Set((api.store.get('orders', []) || []).map((row) => row.id));
    const carriers = new Set((api.store.get('carriers', []) || []).map((row) => row.id));
    const broken = [];

    (api.store.get('leads', []) || []).forEach((row) => {
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'lead.customer', id: row.id, target: row.customerId });
    });
    (api.store.get('quotes', []) || []).forEach((row) => {
      if (row.leadId && !leads.has(row.leadId)) broken.push({ type: 'quote.lead', id: row.id, target: row.leadId });
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'quote.customer', id: row.id, target: row.customerId });
      if (row.orderId && !orders.has(row.orderId)) broken.push({ type: 'quote.order', id: row.id, target: row.orderId });
    });
    (api.store.get('orders', []) || []).forEach((row) => {
      if (row.sourceQuoteId && !quotes.has(row.sourceQuoteId)) broken.push({ type: 'order.quote', id: row.id, target: row.sourceQuoteId });
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'order.customer', id: row.id, target: row.customerId });
      if (row.carrierId && !carriers.has(row.carrierId)) broken.push({ type: 'order.carrier', id: row.id, target: row.carrierId });
    });
    (api.store.get('documents', []) || []).forEach((row) => {
      const valid = row.entityType === 'Order' ? orders.has(row.entityId)
        : row.entityType === 'Carrier' ? carriers.has(row.entityId)
          : row.entityType === 'Customer' ? customers.has(row.entityId)
            : false;
      if (!valid) broken.push({ type: `document.${String(row.entityType || '').toLowerCase()}`, id: row.id, target: row.entityId });
    });

    window.BrokerPadIntegrity = Object.freeze({
      checkedAt: now(),
      brokenLinks: Object.freeze(broken.map((item) => Object.freeze({ ...item }))),
      ok: broken.length === 0,
    });
  }

  document.addEventListener('click', protectReferencedDeletes, true);

  const observer = new MutationObserver(() => lockDerivedCustomerMetrics());
  observer.observe(document.body, { childList: true, subtree: true });

  ['customers:changed', 'leads:changed', 'quotes:changed', 'orders:changed', 'carriers:changed', 'documents:changed'].forEach((eventName) => {
    api.events.on(eventName, () => {
      if (eventName === 'orders:changed') pruneOrphanFinancePayments();
      auditBrokenLinks();
    });
  });

  lockDerivedCustomerMetrics();
  pruneOrphanFinancePayments();
  auditBrokenLinks();
  api.audit.record('integrity.module.ready', 'module', 'integrity', { ok: window.BrokerPadIntegrity.ok });
})();

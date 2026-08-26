(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api || window.__brokerPadIntegrityInstalled) return;
  window.__brokerPadIntegrityInstalled = true;

  const now = () => new Date().toISOString();
  let reconciling = false;

  const modalId = (selector) => {
    const text = document.querySelector(selector)?.textContent?.trim() || '';
    const match = text.match(/\b(?:CUS|LD|QT|OR|CAR)-[A-Z0-9-]+\b/i);
    return match ? match[0].toUpperCase() : '';
  };

  const entityFromDeleteButton = (button) => {
    if (button.matches('[data-customer-delete]')) return ['customer', modalId('#bpCustomerModalTitle + p, #bpCustomerModalTitle ~ p')];
    if (button.matches('[data-lead-delete]')) return ['lead', modalId('#bpLeadModalTitle + p, #bpLeadModalTitle ~ p')];
    if (button.matches('[data-quote-delete]')) return ['quote', modalId('#bpQuoteModalLayer .bp-runtime-modal-head p')];
    if (button.matches('[data-order-delete]')) return ['order', modalId('#bpOrderModalLayer .bp-runtime-modal-head p')];
    if (button.matches('[data-carrier-delete]')) return ['carrier', modalId('#bpCarrierModalLayer .bp-runtime-modal-head p')];
    return ['', ''];
  };

  function showBlockedDelete(id, summary) {
    let layer = document.querySelector('#bpIntegrityBlockLayer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'bpIntegrityBlockLayer';
      layer.className = 'bp-runtime-modal-layer';
      layer.hidden = true;
      document.body.appendChild(layer);
    }
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="alertdialog" aria-modal="true" aria-labelledby="bpIntegrityBlockTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpIntegrityBlockTitle">Deletion blocked</h3><p>${id} is still referenced by other BrokerPad records.</p></div><button type="button" class="bp-runtime-close" data-integrity-close aria-label="Close">×</button></div>
        <div class="bp-runtime-form"><div class="bp-runtime-integrity-warning">Remove or reassign ${summary} before deleting this record.</div><div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn primary" data-integrity-close>OK</button></div></div>
      </div>`;
    layer.querySelectorAll('[data-integrity-close]').forEach((button) => button.addEventListener('click', () => {
      layer.hidden = true;
      layer.innerHTML = '';
    }));
  }

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
    showBlockedDelete(id, summary);
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

  const canonicalBusinessName = (value) => String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(llc|inc|incorporated|corp|corporation|ltd|limited)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  function reconcileSafeLegacyLinks() {
    if (reconciling) return;
    reconciling = true;
    try {
      const carriers = Array.isArray(api.store.get('carriers', [])) ? api.store.get('carriers', []) : [];
      const orders = Array.isArray(api.store.get('orders', [])) ? api.store.get('orders', []) : [];
      const quotes = Array.isArray(api.store.get('quotes', [])) ? api.store.get('quotes', []) : [];
      let orderChanges = 0;
      let quoteChanges = 0;

      orders.forEach((order) => {
        if (!order.carrierId && order.carrierName) {
          const target = canonicalBusinessName(order.carrierName);
          const matches = carriers.filter((carrier) => canonicalBusinessName(carrier.name) === target);
          if (target && matches.length === 1) {
            order.carrierId = matches[0].id;
            order.carrierName = matches[0].name;
            order.updatedAt = now();
            orderChanges += 1;
          }
        }
        if (order.sourceQuoteId) {
          const quote = quotes.find((item) => item.id === order.sourceQuoteId);
          if (quote && !quote.orderId) {
            quote.orderId = order.id;
            quoteChanges += 1;
          }
        }
      });

      quotes.forEach((quote) => {
        if (!quote.orderId) {
          const matches = orders.filter((order) => order.sourceQuoteId === quote.id);
          if (matches.length === 1) {
            quote.orderId = matches[0].id;
            quoteChanges += 1;
          }
        } else {
          const order = orders.find((item) => item.id === quote.orderId);
          if (order && !order.sourceQuoteId) {
            order.sourceQuoteId = quote.id;
            order.updatedAt = now();
            orderChanges += 1;
          }
        }
      });

      if (orderChanges) {
        api.store.set('orders', orders);
        api.events.emit('orders:changed', { count: orders.length, source: 'integrity.reconcile' });
      }
      if (quoteChanges) {
        api.store.set('quotes', quotes);
        api.events.emit('quotes:changed', { count: quotes.length, source: 'integrity.reconcile' });
      }
      if (orderChanges || quoteChanges) {
        api.audit.record('integrity.legacy.links.reconciled', 'integrity', '', { orderChanges, quoteChanges });
      }
    } finally {
      reconciling = false;
    }
  }

  function auditBrokenLinks() {
    const customerRows = Array.isArray(api.store.get('customers', [])) ? api.store.get('customers', []) : [];
    const leadRows = Array.isArray(api.store.get('leads', [])) ? api.store.get('leads', []) : [];
    const quoteRows = Array.isArray(api.store.get('quotes', [])) ? api.store.get('quotes', []) : [];
    const orderRows = Array.isArray(api.store.get('orders', [])) ? api.store.get('orders', []) : [];
    const carrierRows = Array.isArray(api.store.get('carriers', [])) ? api.store.get('carriers', []) : [];
    const documentRows = Array.isArray(api.store.get('documents', [])) ? api.store.get('documents', []) : [];
    const communicationRows = Array.isArray(api.store.get('communications', [])) ? api.store.get('communications', []) : [];

    const customers = new Set(customerRows.map((row) => row.id));
    const leads = new Set(leadRows.map((row) => row.id));
    const quotes = new Set(quoteRows.map((row) => row.id));
    const orders = new Set(orderRows.map((row) => row.id));
    const carriers = new Set(carrierRows.map((row) => row.id));
    const broken = [];

    leadRows.forEach((row) => {
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'lead.customer', id: row.id, target: row.customerId });
    });
    quoteRows.forEach((row) => {
      if (row.leadId && !leads.has(row.leadId)) broken.push({ type: 'quote.lead', id: row.id, target: row.leadId });
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'quote.customer', id: row.id, target: row.customerId });
      if (row.orderId && !orders.has(row.orderId)) broken.push({ type: 'quote.order', id: row.id, target: row.orderId });
      if (row.status === 'Accepted' && !row.orderId && !orderRows.some((order) => order.sourceQuoteId === row.id)) broken.push({ type: 'quote.accepted_without_order', id: row.id, target: '' });
    });
    orderRows.forEach((row) => {
      if (row.sourceQuoteId && !quotes.has(row.sourceQuoteId)) broken.push({ type: 'order.quote', id: row.id, target: row.sourceQuoteId });
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'order.customer', id: row.id, target: row.customerId });
      if (row.carrierId && !carriers.has(row.carrierId)) broken.push({ type: 'order.carrier', id: row.id, target: row.carrierId });
      if (!row.carrierId && row.carrierName && !['Booked', 'Sourcing', 'Cancelled'].includes(row.status)) broken.push({ type: 'order.carrier_unlinked', id: row.id, target: row.carrierName });
    });
    documentRows.forEach((row) => {
      const valid = row.entityType === 'Order' ? orders.has(row.entityId)
        : row.entityType === 'Carrier' ? carriers.has(row.entityId)
          : row.entityType === 'Customer' ? customers.has(row.entityId)
            : false;
      if (!valid) broken.push({ type: `document.${String(row.entityType || '').toLowerCase()}`, id: row.id, target: row.entityId });
    });
    communicationRows.forEach((row) => {
      if (row.customerId && !customers.has(row.customerId)) broken.push({ type: 'conversation.customer', id: row.id, target: row.customerId });
      if (row.leadId && !leads.has(row.leadId)) broken.push({ type: 'conversation.lead', id: row.id, target: row.leadId });
      if (row.quoteId && !quotes.has(row.quoteId)) broken.push({ type: 'conversation.quote', id: row.id, target: row.quoteId });
      if (row.orderId && !orders.has(row.orderId)) broken.push({ type: 'conversation.order', id: row.id, target: row.orderId });
    });

    const usdotGroups = carrierRows.reduce((map, row) => {
      const usdot = String(row.usdot || '').replace(/\D/g, '');
      if (!usdot) return map;
      if (!map.has(usdot)) map.set(usdot, []);
      map.get(usdot).push(row.id);
      return map;
    }, new Map());
    usdotGroups.forEach((ids, usdot) => {
      if (ids.length > 1) ids.forEach((id) => broken.push({ type: 'carrier.duplicate_usdot', id, target: usdot }));
    });

    window.BrokerPadIntegrity = Object.freeze({
      checkedAt: now(),
      issueCount: broken.length,
      brokenLinks: Object.freeze(broken.map((item) => Object.freeze({ ...item }))),
      ok: broken.length === 0,
    });
    window.dispatchEvent(new CustomEvent('brokerpad:integrity:checked', { detail: window.BrokerPadIntegrity }));
  }

  document.addEventListener('click', protectReferencedDeletes, true);

  const observer = new MutationObserver(() => lockDerivedCustomerMetrics());
  observer.observe(document.body, { childList: true, subtree: true });

  ['customers:changed', 'leads:changed', 'quotes:changed', 'orders:changed', 'carriers:changed', 'documents:changed', 'communications:changed'].forEach((eventName) => {
    api.events.on(eventName, () => {
      if (eventName === 'orders:changed') pruneOrphanFinancePayments();
      reconcileSafeLegacyLinks();
      auditBrokenLinks();
    });
  });

  lockDerivedCustomerMetrics();
  pruneOrphanFinancePayments();
  reconcileSafeLegacyLinks();
  auditBrokenLinks();
  api.audit.record('integrity.module.ready', 'module', 'integrity', { ok: window.BrokerPadIntegrity.ok, issueCount: window.BrokerPadIntegrity.issueCount });
})();

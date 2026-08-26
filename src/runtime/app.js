(() => {
  'use strict';

  const RUNTIME_VERSION = '0.2.0';
  const SCHEMA_VERSION = 1;
  const DEFAULT_TENANT_ID = 'tenant-demo';
  const PREFIX = 'brokerpad:runtime:v1:';
  const MAX_AUDIT_EVENTS = 500;

  const safeParse = (value, fallback) => {
    try {
      const parsed = JSON.parse(value);
      return parsed == null ? fallback : parsed;
    } catch (_) {
      return fallback;
    }
  };

  const now = () => new Date().toISOString();
  const memoryStorage = new Map();

  const storage = Object.freeze({
    getItem(key) {
      try {
        const value = window.localStorage.getItem(key);
        if (value != null) return value;
      } catch (_) {
        // Browser privacy/storage restrictions fall back to the in-memory store.
      }
      return memoryStorage.has(key) ? memoryStorage.get(key) : null;
    },
    setItem(key, value) {
      const serialized = String(value);
      let persisted = false;
      try {
        window.localStorage.setItem(key, serialized);
        persisted = true;
      } catch (_) {
        // Quota/security errors must not make the prototype unusable.
      }
      if (!persisted) memoryStorage.set(key, serialized);
      else memoryStorage.delete(key);
      return persisted;
    },
    removeItem(key) {
      try {
        window.localStorage.removeItem(key);
      } catch (_) {
        // Ignore and always clear the in-memory fallback.
      }
      memoryStorage.delete(key);
    },
  });

  const runtimeState = {
    version: RUNTIME_VERSION,
    schemaVersion: SCHEMA_VERSION,
    tenantId: storage.getItem(`${PREFIX}tenant`) || DEFAULT_TENANT_ID,
    startedAt: now(),
  };

  const keyFor = (scope) => `${PREFIX}${runtimeState.tenantId}:${scope}`;

  const store = Object.freeze({
    get(scope, fallback = null) {
      return safeParse(storage.getItem(keyFor(scope)), fallback);
    },
    set(scope, value) {
      storage.setItem(keyFor(scope), JSON.stringify(value));
      return value;
    },
    update(scope, updater, fallback = {}) {
      const current = this.get(scope, fallback);
      const clone = typeof structuredClone === 'function'
        ? structuredClone(current)
        : safeParse(JSON.stringify(current), current);
      const next = updater(clone);
      return this.set(scope, next);
    },
    remove(scope) {
      storage.removeItem(keyFor(scope));
    },
  });

  const asArray = (scope) => {
    const value = store.get(scope, []);
    return Array.isArray(value) ? value : [];
  };

  const relationResult = (scope, type, row, label = '') => ({
    scope,
    type,
    id: String(row?.id || ''),
    label: String(label || row?.name || row?.contactName || row?.customerName || row?.id || type),
  });

  const relations = Object.freeze({
    references(entity, entityId) {
      const id = String(entityId || '').trim();
      if (!id) return [];
      const refs = [];
      const customers = asArray('customers');
      const leads = asArray('leads');
      const quotes = asArray('quotes');
      const orders = asArray('orders');
      const carriers = asArray('carriers');
      const documents = asArray('documents');
      const communications = asArray('communications');

      if (entity === 'customer') {
        leads.filter((row) => row.customerId === id).forEach((row) => refs.push(relationResult('leads', 'lead', row)));
        quotes.filter((row) => row.customerId === id).forEach((row) => refs.push(relationResult('quotes', 'quote', row)));
        orders.filter((row) => row.customerId === id).forEach((row) => refs.push(relationResult('orders', 'order', row)));
        documents.filter((row) => row.entityType === 'Customer' && row.entityId === id).forEach((row) => refs.push(relationResult('documents', 'document', row)));
        communications.filter((row) => row.customerId === id).forEach((row) => refs.push(relationResult('communications', 'conversation', row)));
      } else if (entity === 'lead') {
        quotes.filter((row) => row.leadId === id).forEach((row) => refs.push(relationResult('quotes', 'quote', row)));
        orders.filter((row) => row.leadId === id).forEach((row) => refs.push(relationResult('orders', 'order', row)));
        communications.filter((row) => row.leadId === id).forEach((row) => refs.push(relationResult('communications', 'conversation', row)));
      } else if (entity === 'quote') {
        orders.filter((row) => row.sourceQuoteId === id || row.id === quotes.find((quote) => quote.id === id)?.orderId).forEach((row) => refs.push(relationResult('orders', 'order', row)));
        communications.filter((row) => row.quoteId === id).forEach((row) => refs.push(relationResult('communications', 'conversation', row)));
      } else if (entity === 'order') {
        quotes.filter((row) => row.orderId === id).forEach((row) => refs.push(relationResult('quotes', 'quote', row)));
        documents.filter((row) => row.entityType === 'Order' && row.entityId === id).forEach((row) => refs.push(relationResult('documents', 'document', row)));
        communications.filter((row) => row.orderId === id).forEach((row) => refs.push(relationResult('communications', 'conversation', row)));
        const payments = store.get('finance-payments', { customer: {}, carrier: {} }) || {};
        if (Number(payments.customer?.[id]) > 0 || Number(payments.carrier?.[id]) > 0) {
          refs.push({ scope: 'finance-payments', type: 'payment ledger', id, label: id });
        }
      } else if (entity === 'carrier') {
        orders.filter((row) => row.carrierId === id).forEach((row) => refs.push(relationResult('orders', 'order', row)));
        documents.filter((row) => row.entityType === 'Carrier' && row.entityId === id).forEach((row) => refs.push(relationResult('documents', 'document', row)));
      }

      // Keep the reads above explicit so future domains are added intentionally.
      void customers;
      void carriers;
      return refs;
    },
    hasReferences(entity, entityId) {
      return this.references(entity, entityId).length > 0;
    },
    summary(entity, entityId) {
      const refs = this.references(entity, entityId);
      const counts = refs.reduce((acc, ref) => {
        acc[ref.type] = (acc[ref.type] || 0) + 1;
        return acc;
      }, {});
      return Object.entries(counts).map(([type, count]) => `${count} ${type}${count === 1 ? '' : 's'}`).join(', ');
    },
  });

  const listeners = new Map();
  const events = Object.freeze({
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
      return () => listeners.get(type)?.delete(listener);
    },
    emit(type, detail = {}) {
      const payload = Object.freeze({ type, detail, at: now(), tenantId: runtimeState.tenantId });
      listeners.get(type)?.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          console.error('[BrokerPadRuntime:event]', error);
        }
      });
      window.dispatchEvent(new CustomEvent(`brokerpad:${type}`, { detail: payload }));
      return payload;
    },
  });

  const audit = Object.freeze({
    record(action, entity = 'runtime', entityId = '', metadata = {}) {
      const entry = {
        id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        tenantId: runtimeState.tenantId,
        action,
        entity,
        entityId,
        metadata,
        at: now(),
      };
      const entries = store.get('audit', []);
      const list = Array.isArray(entries) ? entries : [];
      list.unshift(entry);
      store.set('audit', list.slice(0, MAX_AUDIT_EVENTS));
      events.emit('audit', entry);
      return entry;
    },
    list() {
      const entries = store.get('audit', []);
      return Array.isArray(entries) ? entries : [];
    },
  });

  const settings = Object.freeze({
    get() {
      return store.get('settings', {
        schemaVersion: SCHEMA_VERSION,
        tenantId: runtimeState.tenantId,
        createdAt: runtimeState.startedAt,
      });
    },
    patch(patch) {
      const next = store.update('settings', (current) => ({
        ...current,
        ...patch,
        schemaVersion: SCHEMA_VERSION,
        tenantId: runtimeState.tenantId,
        updatedAt: now(),
      }), {});
      events.emit('settings:changed', next);
      return next;
    },
  });

  const health = Object.freeze({
    snapshot() {
      const pages = [...document.querySelectorAll('[data-page]')]
        .map((node) => node.dataset.page)
        .filter(Boolean);
      const sidebarLabels = [...document.querySelectorAll('#nav button')]
        .map((node) => node.textContent.trim());
      return {
        runtimeVersion: RUNTIME_VERSION,
        schemaVersion: SCHEMA_VERSION,
        tenantId: runtimeState.tenantId,
        title: document.title,
        pageCount: pages.length,
        pages,
        sidebarLabels,
        hasStandaloneLoadBoards: sidebarLabels.some((label) => /load\s*boards?/i.test(label)),
        hasReports: pages.includes('reports'),
        hasOrders: pages.includes('orders'),
        hasCarriers: pages.includes('carriers'),
        capturedAt: now(),
      };
    },
  });

  const ensureBranding = () => {
    document.title = 'BrokerPad';
    const brand = document.querySelector('.brand span:last-child');
    if (brand && /lander solutions/i.test(brand.textContent || '')) brand.textContent = 'BrokerPad';
    const mark = document.querySelector('.brand .mark');
    if (mark && mark.textContent.trim() === 'LS') mark.textContent = 'BP';
    const crumb = document.querySelector('.crumb');
    if (
      crumb?.firstChild?.nodeType === Node.TEXT_NODE &&
      /lander solutions/i.test(crumb.firstChild.textContent || '')
    ) {
      crumb.firstChild.textContent = 'BrokerPad / ';
    }
  };

  const installRuntimeMetadata = () => {
    document.documentElement.dataset.brokerpadRuntime = RUNTIME_VERSION;
    document.documentElement.dataset.brokerpadSchema = String(SCHEMA_VERSION);
    document.documentElement.dataset.brokerpadTenant = runtimeState.tenantId;
  };

  const boot = () => {
    ensureBranding();
    installRuntimeMetadata();
    settings.get();

    const previous = store.get('session', null);
    store.set('session', {
      firstStartedAt: previous?.firstStartedAt || runtimeState.startedAt,
      lastStartedAt: runtimeState.startedAt,
      runtimeVersion: RUNTIME_VERSION,
      schemaVersion: SCHEMA_VERSION,
    });

    audit.record('runtime.boot', 'runtime', RUNTIME_VERSION, {
      pageCount: document.querySelectorAll('[data-page]').length,
    });

    events.emit('runtime:ready', health.snapshot());
  };

  const api = Object.freeze({
    version: RUNTIME_VERSION,
    schemaVersion: SCHEMA_VERSION,
    get tenantId() {
      return runtimeState.tenantId;
    },
    store,
    events,
    audit,
    settings,
    relations,
    health,
  });

  Object.defineProperty(window, 'BrokerPadRuntime', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: api,
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

(() => {
  'use strict';

  const RUNTIME_VERSION = '0.1.0';
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

  const runtimeState = {
    version: RUNTIME_VERSION,
    schemaVersion: SCHEMA_VERSION,
    tenantId: localStorage.getItem(`${PREFIX}tenant`) || DEFAULT_TENANT_ID,
    startedAt: now(),
  };

  const keyFor = (scope) => `${PREFIX}${runtimeState.tenantId}:${scope}`;

  const store = Object.freeze({
    get(scope, fallback = null) {
      return safeParse(localStorage.getItem(keyFor(scope)), fallback);
    },
    set(scope, value) {
      localStorage.setItem(keyFor(scope), JSON.stringify(value));
      return value;
    },
    update(scope, updater, fallback = {}) {
      const current = this.get(scope, fallback);
      const next = updater(structuredClone(current));
      return this.set(scope, next);
    },
    remove(scope) {
      localStorage.removeItem(keyFor(scope));
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
      entries.unshift(entry);
      store.set('audit', entries.slice(0, MAX_AUDIT_EVENTS));
      events.emit('audit', entry);
      return entry;
    },
    list() {
      return store.get('audit', []);
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

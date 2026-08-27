(() => {
  'use strict';

  if (window.__brokerPadLegacySurfaceGuardInstalled) return;
  window.__brokerPadLegacySurfaceGuardInstalled = true;

  const SENTINEL_CLASS = 'bp-runtime-legacy-sentinel';

  const page = (name) => document.querySelector(`[data-page="${name}"]`);

  function emptySentinel(node, marker = '') {
    if (!node) return null;
    if (node.childNodes.length) node.replaceChildren();
    node.classList.add(SENTINEL_CLASS);
    node.setAttribute('aria-hidden', 'true');
    node.hidden = true;
    if (marker) node.dataset.bpLegacyOwner = marker;
    return node;
  }

  function ensureSentinel(container, className, marker) {
    if (!container) return null;
    let node = container.querySelector(`.${className}`);
    if (!node) {
      node = document.createElement('div');
      node.className = className;
      container.appendChild(node);
    }
    return emptySentinel(node, marker);
  }

  function pruneDashboard() {
    const owner = page('dashboard');
    if (!owner) return;
    const existing = owner.querySelector('.bp-benchmark-zone');
    if (existing) emptySentinel(existing, 'dashboard');
    else ensureSentinel(owner, 'bp-benchmark-zone', 'dashboard');
    owner.dataset.bpDashboardBenchmarkPruned = '1';
  }

  function pruneCRM() {
    const owner = page('crm');
    if (!owner) return;
    const leads = owner.querySelector('[data-crm-panel="leads"]');
    if (leads) ensureSentinel(leads, 'bp-lead-intel', 'crm-leads');
    ensureSentinel(owner, 'bp-repeat-intel', 'crm-customers');
    owner.dataset.bpCrmBenchmarkPruned = '1';
  }

  function pruneQuoteCalculator() {
    const owner = page('quote-calculator');
    if (!owner) return;
    ensureSentinel(owner, 'bp-pricing-intel', 'quote-calculator');
    owner.dataset.bpPricingBenchmarkPruned = '1';
  }

  function pruneOrders() {
    const owner = page('orders');
    if (!owner) return;
    ensureSentinel(owner, 'bp-order-benchmark', 'orders');

    // Load boards are integrations, never a standalone Orders action.
    owner.querySelectorAll('#orderPostLoadBoards,[data-lb-order-post]').forEach((node) => node.remove());
    owner.dataset.bpOrderBenchmarkPruned = '1';
    owner.dataset.bpLoadboardActionsPruned = '1';
  }

  function pruneCarriers() {
    const owner = page('carriers');
    if (!owner) return;
    ensureSentinel(owner, 'bp-carrier-network-intel', 'carriers');
    owner.dataset.bpCarrierBenchmarkPruned = '1';
  }

  function pruneCommunications() {
    const owner = page('communications');
    if (!owner) return;
    ensureSentinel(owner, 'bp-comm-benchmark', 'communications');
    owner.dataset.bpCommunicationsBenchmarkPruned = '1';
  }

  function pruneDocuments() {
    const owner = page('documents');
    if (!owner) return;
    ensureSentinel(owner, 'bp-doc-benchmark', 'documents');
    owner.dataset.bpDocumentsBenchmarkPruned = '1';
  }

  function pruneFinance() {
    const owner = page('finance');
    if (!owner) return;
    ensureSentinel(owner, 'bp-fin-benchmark', 'finance');

    // Product contract: P&L remains aggregate-only. The immutable accounting
    // enhancer still creates Company / Orders / Customers breakdown surfaces;
    // remove those surfaces while preserving date/type filters and KPI totals.
    owner.querySelector('#plSearch')?.remove();
    owner.querySelector('#plContent')?.remove();
    owner.querySelector('[data-pl-view]')?.closest('.stripe-card')?.remove();
    owner.dataset.bpFinanceBenchmarkPruned = '1';
    owner.dataset.bpPlAggregateOnly = '1';
  }

  function pruneSettings() {
    const owner = page('settings');
    if (!owner) return;

    const automations = owner.querySelector('[data-settings-panel="automations"]');
    const integrations = owner.querySelector('[data-settings-panel="integrations"]');
    const company = owner.querySelector('[data-settings-panel="company"],[data-settings-panel="general"]');
    const security = owner.querySelector('[data-settings-panel="security"]');

    if (automations) ensureSentinel(automations, 'bp-auto-benchmark', 'settings-automations');
    if (integrations) ensureSentinel(integrations, 'bp-integration-benchmark', 'settings-integrations');
    if (company) ensureSentinel(company, 'bp-org-benchmark', 'settings-company');
    if (security) ensureSentinel(security, 'bp-security-benchmark', 'settings-security');

    owner.dataset.bpSettingsBenchmarkPruned = '1';
  }

  function pruneQuoteLegacy() {
    const owner = page('quotes');
    if (!owner) return;
    owner.querySelectorAll('.bp-quote-benchmark:not(.bp-runtime-benchmark-blocker)').forEach((node) => node.remove());
    document.querySelectorAll('#lander-full-review > .quote-modal-layer,#lander-full-review > .quote-delete-layer').forEach((node) => node.remove());
  }

  function pruneAll() {
    pruneDashboard();
    pruneCRM();
    pruneQuoteLegacy();
    pruneQuoteCalculator();
    pruneOrders();
    pruneCarriers();
    pruneCommunications();
    pruneDocuments();
    pruneFinance();
    pruneSettings();
  }

  function schedulePrune() {
    pruneAll();
    queueMicrotask(pruneAll);
    requestAnimationFrame(pruneAll);
    setTimeout(pruneAll, 0);
    setTimeout(pruneAll, 50);
    // Benchmark boot starts after a delayed retry sequence; these passes make
    // the guard deterministic without polling forever.
    setTimeout(pruneAll, 650);
    setTimeout(pruneAll, 1500);
  }

  function install() {
    schedulePrune();

    const root = document.querySelector('#lander-full-review') || document.body;
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
      pruneAll();
    });
    observer.observe(root, { childList: true, subtree: true });

    document.addEventListener('click', (event) => {
      if (event.target.closest('#nav button,[data-go],.crm-tab,.bp-settings-tabs button')) {
        setTimeout(pruneAll, 0);
      }
    }, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

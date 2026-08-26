(() => {
  'use strict';

  if (window.__brokerPadBenchmarkRemovalGuardInstalled) return;
  window.__brokerPadBenchmarkRemovalGuardInstalled = true;

  const DASHBOARD_SELECTOR = '[data-page="dashboard"]';
  const ORDERS_SELECTOR = '[data-page="orders"]';

  function pruneDashboard() {
    const page = document.querySelector(DASHBOARD_SELECTOR);
    if (!page) return;
    page.querySelectorAll('.bp-benchmark-zone').forEach((node) => node.remove());
    page.dataset.bpDashboardBenchmarkPruned = '1';
  }

  function pruneOrders() {
    const page = document.querySelector(ORDERS_SELECTOR);
    if (!page) return;
    const zone = page.querySelector('.bp-order-benchmark');
    if (!zone) return;

    zone.querySelectorAll(':scope > .bp-benchmark-grid').forEach((grid) => grid.remove());
    page.dataset.bpOrderBenchmarkCardsPruned = '1';
  }

  function pruneAll() {
    pruneDashboard();
    pruneOrders();
  }

  function schedulePrune() {
    pruneAll();
    requestAnimationFrame(pruneAll);
    queueMicrotask(pruneAll);
    setTimeout(pruneAll, 0);
    setTimeout(pruneAll, 50);
  }

  function install() {
    schedulePrune();

    const pages = document.querySelector('#pages') || document.querySelector('#lander-full-review') || document.body;
    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
      pruneAll();
    });
    observer.observe(pages, { childList: true, subtree: true });

    document.addEventListener('click', (event) => {
      if (event.target.closest('#nav button[data-go="dashboard"], #nav button[data-go="orders"]')) {
        setTimeout(pruneAll, 0);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

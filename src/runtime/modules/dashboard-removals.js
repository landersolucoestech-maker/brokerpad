(() => {
  'use strict';

  if (window.__brokerPadDashboardRemovalGuardInstalled) return;
  window.__brokerPadDashboardRemovalGuardInstalled = true;

  const DASHBOARD_SELECTOR = '[data-page="dashboard"]';
  const LEGACY_SELECTOR = '.bp-benchmark-zone';

  function prune() {
    const page = document.querySelector(DASHBOARD_SELECTOR);
    if (!page) return;
    page.querySelectorAll(LEGACY_SELECTOR).forEach((node) => node.remove());
    page.dataset.bpDashboardBenchmarkPruned = '1';
  }

  function install() {
    const page = document.querySelector(DASHBOARD_SELECTOR);
    if (!page) return;

    prune();
    requestAnimationFrame(prune);
    queueMicrotask(prune);
    setTimeout(prune, 0);
    setTimeout(prune, 50);

    const observer = new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
      prune();
    });
    observer.observe(page, { childList: true, subtree: true });

    document.addEventListener('click', (event) => {
      if (event.target.closest('#nav button[data-go="dashboard"]')) setTimeout(prune, 0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

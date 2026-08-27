(() => {
  'use strict';

  const root = document.getElementById('lander-full-review');
  if (!root || root.dataset.bpUiSystem === '1') return;
  root.dataset.bpUiSystem = '1';

  const $ = (selector, context = root) => context.querySelector(selector);
  const $$ = (selector, context = root) => [...context.querySelectorAll(selector)];

  const setText = (selector, value) => {
    const node = $(selector);
    if (node && node.textContent !== value) node.textContent = value;
  };

  function normalizeProductLanguage() {
    const brand = $('.brand span:last-child');
    if (brand && brand.textContent !== 'BrokerPad') brand.textContent = 'BrokerPad';
    const mark = $('.brand .mark');
    if (mark && mark.textContent !== 'BP') mark.textContent = 'BP';
    const crumb = $('.crumb');
    if (crumb?.firstChild?.nodeType === Node.TEXT_NODE && crumb.firstChild.textContent !== 'BrokerPad / ') crumb.firstChild.textContent = 'BrokerPad / ';

    const userButton = $('#userAvatarButton');
    if (userButton) userButton.setAttribute('aria-label', 'User menu');
    setText('[data-user-action="profile"]', 'My profile');
    setText('[data-user-action="settings"]', 'Settings');
    setText('[data-user-action="logout"]', 'Sign out');

    const profileTitle = $('.user-dropdown-profile b');
    const profileSub = $('.user-dropdown-profile small');
    if (profileTitle && /usuário logado/i.test(profileTitle.textContent || '')) profileTitle.textContent = 'Signed-in user';
    if (profileSub && /avatar/i.test(profileSub.textContent || '')) profileSub.textContent = 'Add or change avatar';
  }

  function installMobileNavigation() {
    const sidebar = $('.sidebar');
    const topbar = $('.topbar');
    const crumb = $('.crumb');
    if (!sidebar || !topbar || !crumb) return;

    let toggle = $('.bp-mobile-nav-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'bp-mobile-nav-toggle';
      toggle.setAttribute('aria-label', 'Open navigation');
      toggle.setAttribute('aria-controls', 'nav');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.textContent = '☰';
      topbar.insertBefore(toggle, crumb);
    }

    let backdrop = $('.bp-mobile-sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'bp-mobile-sidebar-backdrop';
      backdrop.setAttribute('aria-hidden', 'true');
      root.appendChild(backdrop);
    }

    const close = () => {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open navigation');
      document.documentElement.classList.remove('bp-scroll-locked');
    };

    const open = () => {
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation');
      if (matchMedia('(max-width: 800px)').matches) document.documentElement.classList.add('bp-scroll-locked');
    };

    toggle.addEventListener('click', () => sidebar.classList.contains('is-open') ? close() : open());
    backdrop.addEventListener('click', close);
    $('#nav')?.addEventListener('click', (event) => {
      if (event.target.closest('button') && matchMedia('(max-width: 800px)').matches) close();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && sidebar.classList.contains('is-open')) close();
    });
    matchMedia('(min-width: 801px)').addEventListener?.('change', (event) => {
      if (event.matches) close();
    });
  }

  function accessibleNameFromContext(button) {
    const text = (button.textContent || '').trim();
    if (button.getAttribute('aria-label') || button.getAttribute('title')) return;
    if (text === '×') button.setAttribute('aria-label', 'Close');
    else if (/^\.{3}$|^•••$/.test(text)) button.setAttribute('aria-label', 'More actions');
    else if (text === '?') button.setAttribute('aria-label', 'Help');
  }

  function enhancePageSemantics() {
    $$('[data-page]').forEach((page) => {
      const name = page.dataset.page || 'page';
      const heading = $('h1', page);
      if (heading) {
        if (!heading.id) heading.id = `bp-page-title-${name}`;
        page.setAttribute('aria-labelledby', heading.id);
      }
      page.setAttribute('aria-hidden', page.classList.contains('active') ? 'false' : 'true');
    });

    $$('#nav button').forEach((button) => {
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
  }

  function enhanceTables() {
    $$('table').forEach((table) => {
      $$('th', table).forEach((th) => {
        if (!th.hasAttribute('scope')) th.setAttribute('scope', 'col');
      });
      const wrapper = table.closest('.tablewrap,.reports-tablewrap,.quotes-tablewrap,.carrier-table-wrap,.carrier-compliance-table-wrap,.finance-table-wrap,.stripe-table-wrap,.ci-table-wrap,.bp-tablewrap');
      if (wrapper) {
        if (!wrapper.hasAttribute('tabindex')) wrapper.tabIndex = 0;
        if (!wrapper.hasAttribute('role')) wrapper.setAttribute('role', 'region');
        const page = table.closest('[data-page]');
        const title = page?.querySelector('h1')?.textContent?.trim();
        if (title && !wrapper.getAttribute('aria-label')) wrapper.setAttribute('aria-label', `${title} data table`);
      }
    });
  }

  function enhanceForms() {
    $$('input, select, textarea').forEach((control) => {
      if (control.type === 'hidden' || control.type === 'file') return;
      if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby')) return;
      if (control.closest('label')) return;
      if (control.id && root.querySelector(`label[for="${CSS.escape(control.id)}"]`)) return;
      const placeholder = control.getAttribute('placeholder')?.trim();
      const name = control.getAttribute('name')?.replace(/[-_]+/g, ' ')?.trim();
      if (placeholder) control.setAttribute('aria-label', placeholder.replace(/\.{3}$/,'').trim());
      else if (name) control.setAttribute('aria-label', name);
    });

    $$('button').forEach(accessibleNameFromContext);
    document.querySelectorAll('.bp-runtime-modal-layer input,.bp-runtime-modal-layer select,.bp-runtime-modal-layer textarea').forEach((control) => {
      if (control.getAttribute('aria-label') || control.getAttribute('aria-labelledby') || control.closest('label')) return;
      const placeholder = control.getAttribute('placeholder')?.trim();
      const name = control.getAttribute('name')?.replace(/[-_]+/g, ' ')?.trim();
      if (placeholder) control.setAttribute('aria-label', placeholder.replace(/\.{3}$/,'').trim());
      else if (name) control.setAttribute('aria-label', name);
    });
  }

  function enhanceLiveRegions() {
    document.querySelectorAll('.bp-toast,.ci-toast,.report-toast,.bp-runtime-form-error,.finance-form-error,.carrier-form-error,.orders-modal-error,.bp-contact-policy-notice').forEach((node) => {
      if (!node.getAttribute('role')) node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
    });
  }

  const modalSelectors = [
    '.bp-runtime-modal-layer:not([hidden]) .bp-runtime-modal',
    '.bp-modal-layer.open .bp-modal',
    '.crm-modal-layer.open .crm-modal',
    '.carrier-modal-layer.open .carrier-modal',
    '.finance-modal-layer.open .finance-modal',
    '.quote-modal-layer.open .quote-record-modal',
    '.report-modal-layer:not([hidden]) .report-modal',
    '.stripe-modal-layer.open .stripe-modal',
    '.lb-modal-layer.open .lb-modal',
    '.orders-modal.open .orders-modal-dialog'
  ].join(',');

  const runtimeCloseSelectors = [
    '[aria-label="Close"]',
    '[data-bp-modal-close]',
    '[data-customer-close]',
    '[data-lead-close]',
    '[data-quote-close]',
    '[data-order-close]',
    '[data-carrier-close]',
    '[data-dispatch-close]',
    '[data-document-close]',
    '[data-comm-close]',
    '[data-settings-close]',
    '[data-integrity-close]',
    '[data-finance-close]',
    '.crm-modal-close',
    '.carrier-modal-close',
    '.finance-modal-close',
    '.orders-modal-close',
    '.report-modal-close',
    '.stripe-modal-close'
  ].join(',');

  function topModal() {
    const nodes = [...document.querySelectorAll(modalSelectors)];
    return nodes[nodes.length - 1] || null;
  }

  function focusableIn(modal) {
    return [...modal.querySelectorAll('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')]
      .filter((node) => node.offsetParent !== null);
  }

  let trackedModal = null;
  let modalOpener = null;

  function enhanceDialogs() {
    document.querySelectorAll(modalSelectors).forEach((modal) => {
      if (!modal.getAttribute('role')) modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      const title = modal.querySelector('h1,h2,h3');
      if (title) {
        if (!title.id) title.id = `bp-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
        if (!modal.getAttribute('aria-labelledby')) modal.setAttribute('aria-labelledby', title.id);
      }
    });
  }

  function syncModalFocus() {
    const modal = topModal();
    if (modal === trackedModal) return;

    if (!modal && trackedModal) {
      const opener = modalOpener;
      trackedModal = null;
      modalOpener = null;
      if (opener?.isConnected && typeof opener.focus === 'function') requestAnimationFrame(() => opener.focus());
      return;
    }

    if (modal) {
      if (!trackedModal) {
        const active = document.activeElement;
        modalOpener = active && active !== document.body && !modal.contains(active) ? active : null;
      }
      trackedModal = modal;
      requestAnimationFrame(() => {
        if (!modal.isConnected || modal.contains(document.activeElement)) return;
        const focusable = focusableIn(modal);
        if (focusable[0]) focusable[0].focus();
        else {
          modal.tabIndex = -1;
          modal.focus();
        }
      });
    }
  }

  function installModalKeyboardGuard() {
    document.addEventListener('keydown', (event) => {
      const modal = topModal();
      if (!modal) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        const close = modal.querySelector(runtimeCloseSelectors);
        close?.click();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = focusableIn(modal);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  function syncDynamicUi() {
    normalizeProductLanguage();
    enhancePageSemantics();
    enhanceTables();
    enhanceForms();
    enhanceLiveRegions();
    enhanceDialogs();
    syncModalFocus();
  }

  let scheduled = false;
  const scheduleSync = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      syncDynamicUi();
    });
  };

  installMobileNavigation();
  installModalKeyboardGuard();
  syncDynamicUi();

  // Runtime modal layers live on document.body rather than inside the legacy
  // application root. Observing body guarantees focus/semantics are normalized
  // for both canonical runtime modals and legacy overlays.
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class','hidden','aria-expanded','disabled'] });

  ['runtime:ready','customers:changed','leads:changed','quotes:changed','orders:changed','carriers:changed','documents:changed','communications:changed','finance:changed','users:changed'].forEach((name) => {
    window.addEventListener(`brokerpad:${name}`, scheduleSync);
  });
})();

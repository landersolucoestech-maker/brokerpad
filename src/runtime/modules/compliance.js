(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const page = document.querySelector('[data-page="compliance"]');
  if (!page || page.dataset.bpRuntimeCompliance === '1') return;
  page.dataset.bpRuntimeCompliance = '1';

  const tbody = page.querySelector('tbody');
  if (!tbody) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const badgeClass = (value) => {
    if (['Active', 'Verified', 'Valid', 'Low', 'Approved'].includes(value)) return 'green';
    if (['Inactive', 'Expired', 'High', 'Blocked'].includes(value)) return 'red';
    if (['Pending', 'Expires soon', 'Medium', 'Manual review', 'Review'].includes(value)) return 'amber';
    return 'gray';
  };

  const identityFromApproval = (approval) => {
    if (approval === 'Approved') return 'Verified';
    if (approval === 'Blocked') return 'Blocked';
    if (approval === 'Manual review') return 'Review';
    return 'Pending';
  };

  const render = () => {
    const carriers = api.store.get('carriers', []);
    const rows = Array.isArray(carriers) ? carriers : [];
    tbody.innerHTML = rows.length ? rows.map((carrier) => {
      const identity = identityFromApproval(carrier.approval);
      const documentText = carrier.insuranceStatus === 'Verified' ? 'COI verified' : 'COI review required';
      return `
        <tr data-compliance-carrier="${escapeHtml(carrier.id)}">
          <td><b>${escapeHtml(carrier.name)}</b><span class="secondary">USDOT ${escapeHtml(carrier.usdot || '—')}</span></td>
          <td><span class="badge ${badgeClass(carrier.authorityStatus)}">${escapeHtml(carrier.authorityStatus || 'Pending')}</span></td>
          <td><span class="badge ${badgeClass(carrier.insuranceStatus)}">${escapeHtml(carrier.insuranceStatus || 'Pending')}</span><span class="secondary">${escapeHtml(carrier.insuranceExpiresAt || 'No expiration date')}</span></td>
          <td><span class="badge ${badgeClass(identity)}">${escapeHtml(identity)}</span></td>
          <td>${escapeHtml(documentText)}<span class="secondary">Full document registry linkage pending</span></td>
          <td><span class="badge ${badgeClass(carrier.risk)}">${escapeHtml(carrier.risk || 'Medium')}</span></td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" class="secondary" style="padding:18px;text-align:center">No carrier compliance records are available.</td></tr>';
  };

  const subtitle = page.querySelector('.head p');
  if (subtitle) subtitle.textContent = 'Live compliance view derived from carrier authority, insurance, approval and risk data.';

  api.events.on('carriers:changed', render);
  render();
  api.audit.record('compliance.module.ready', 'module', 'compliance');
})();

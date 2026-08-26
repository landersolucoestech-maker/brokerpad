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
    if (['Active', 'Verified', 'Valid', 'Low', 'Approved', 'Signed'].includes(value)) return 'green';
    if (['Inactive', 'Expired', 'High', 'Blocked', 'Rejected'].includes(value)) return 'red';
    if (['Pending', 'Expires soon', 'Medium', 'Manual review', 'Review', 'Pending Verification', 'Pending Signature'].includes(value)) return 'amber';
    return 'gray';
  };

  const identityFromApproval = (approval) => {
    if (approval === 'Approved') return 'Verified';
    if (approval === 'Blocked') return 'Blocked';
    if (approval === 'Manual review') return 'Review';
    return 'Pending';
  };

  const latestInsuranceDocument = (carrierId, documents) => documents
    .filter((doc) => doc.entityType === 'Carrier' && doc.entityId === carrierId && doc.type === 'Insurance')
    .sort((a, b) => Date.parse(b.updatedAt || b.uploadedAt || '') - Date.parse(a.updatedAt || a.uploadedAt || ''))[0] || null;

  const render = () => {
    const carriers = api.store.get('carriers', []);
    const documents = api.store.get('documents', []);
    const rows = Array.isArray(carriers) ? carriers : [];
    const documentRows = Array.isArray(documents) ? documents : [];

    tbody.innerHTML = rows.length ? rows.map((carrier) => {
      const identity = identityFromApproval(carrier.approval);
      const evidence = latestInsuranceDocument(carrier.id, documentRows);
      const documentText = evidence
        ? `${evidence.name || evidence.id} · ${evidence.status || 'Draft'}`
        : 'No insurance document registered';
      const documentClass = evidence ? badgeClass(evidence.status) : 'red';
      return `
        <tr data-compliance-carrier="${escapeHtml(carrier.id)}">
          <td><b>${escapeHtml(carrier.name)}</b><span class="secondary">USDOT ${escapeHtml(carrier.usdot || '—')}</span></td>
          <td><span class="badge ${badgeClass(carrier.authorityStatus)}">${escapeHtml(carrier.authorityStatus || 'Pending')}</span></td>
          <td><span class="badge ${badgeClass(carrier.insuranceStatus)}">${escapeHtml(carrier.insuranceStatus || 'Pending')}</span><span class="secondary">${escapeHtml(carrier.insuranceExpiresAt || 'No expiration date')}</span></td>
          <td><span class="badge ${badgeClass(identity)}">${escapeHtml(identity)}</span></td>
          <td><span class="badge ${documentClass}">${escapeHtml(evidence?.status || 'Missing')}</span><span class="secondary">${escapeHtml(documentText)}</span></td>
          <td><span class="badge ${badgeClass(carrier.risk)}">${escapeHtml(carrier.risk || 'Medium')}</span></td>
        </tr>`;
    }).join('') : '<tr><td colspan="6" class="secondary bp-empty-cell">No carrier compliance records are available.</td></tr>';
  };

  const subtitle = page.querySelector('.head p');
  if (subtitle) subtitle.textContent = 'Live compliance view derived from carrier authority, insurance, approval, risk and registered evidence.';

  api.events.on('carriers:changed', render);
  api.events.on('documents:changed', render);
  render();
  api.audit.record('compliance.module.ready', 'module', 'compliance');
})();

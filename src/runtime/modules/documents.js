(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const SCOPE = 'documents';
  const now = () => new Date().toISOString();
  const uid = () => `DOC-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const entityTypes = ['Order', 'Carrier', 'Customer'];
  const documentTypes = ['Rate Confirmation', 'Transport Agreement', 'Carrier Agreement', 'Insurance', 'W-9', 'eBOL', 'POD', 'Condition Report', 'Photo', 'Other'];
  const statuses = ['Draft', 'Pending Signature', 'Signed', 'Pending Verification', 'Verified', 'Expired', 'Rejected'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const initialDocuments = [
    {
      id: 'DOC-1001', name: 'RC-OR-1001-v1.pdf', entityType: 'Order', entityId: 'OR-1001', type: 'Rate Confirmation',
      status: 'Signed', version: 1, source: 'BrokerPad', notes: '', uploadedAt: '2026-08-22T13:20:00.000Z',
      signedAt: '2026-08-22T13:28:00.000Z', verifiedAt: '', createdAt: '2026-08-22T13:20:00.000Z', updatedAt: '2026-08-22T13:28:00.000Z',
    },
    {
      id: 'DOC-1002', name: 'COI-Northstar-2026.pdf', entityType: 'Carrier', entityId: 'CAR-1001', type: 'Insurance',
      status: 'Verified', version: 3, source: 'Upload', notes: '', uploadedAt: '2026-08-18T10:10:00.000Z',
      signedAt: '', verifiedAt: '2026-08-18T10:25:00.000Z', createdAt: '2026-08-18T10:10:00.000Z', updatedAt: '2026-08-18T10:25:00.000Z',
    },
  ];

  const normalize = (doc) => ({
    id: doc.id || uid(),
    name: String(doc.name || '').trim(),
    entityType: entityTypes.includes(doc.entityType) ? doc.entityType : 'Order',
    entityId: String(doc.entityId || '').trim().toUpperCase(),
    type: documentTypes.includes(doc.type) ? doc.type : 'Other',
    status: statuses.includes(doc.status) ? doc.status : 'Draft',
    version: Math.max(1, Number(doc.version) || 1),
    source: String(doc.source || 'BrokerPad').trim() || 'BrokerPad',
    notes: String(doc.notes || '').trim(),
    uploadedAt: doc.uploadedAt || now(),
    signedAt: doc.signedAt || '',
    verifiedAt: doc.verifiedAt || '',
    createdAt: doc.createdAt || now(),
    updatedAt: doc.updatedAt || now(),
  });

  const formatDate = (iso) => {
    const d = new Date(iso || '');
    return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
  };

  const badgeClass = (status) => ({
    Signed: 'green', Verified: 'green', Draft: 'gray', 'Pending Signature': 'amber', 'Pending Verification': 'amber', Expired: 'red', Rejected: 'red',
  }[status] || 'gray');

  function ensureSeed() {
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialDocuments.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('documents.seed', 'document', '', { count: seeded.length });
    return seeded;
  }

  function save(rows, source = 'documents') {
    api.store.set(SCOPE, rows);
    api.events.emit('documents:changed', { count: rows.length, source });
  }

  function referencesFor(entityType) {
    const scope = ({ Order: 'orders', Carrier: 'carriers', Customer: 'customers' })[entityType];
    const rows = scope ? api.store.get(scope, []) : [];
    return Array.isArray(rows) ? rows : [];
  }

  function refLabel(entityType, row) {
    if (entityType === 'Order') return `${row.id} · ${row.customerName || row.origin || ''}`;
    if (entityType === 'Carrier') return `${row.id} · ${row.name || ''}`;
    return `${row.id} · ${row.name || ''}`;
  }

  function modalShell() {
    let layer = document.querySelector('#bpDocumentModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpDocumentModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpDocumentModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openEditor(documentRow, onCommit) {
    const creating = !documentRow;
    const current = normalize(documentRow || {});
    const layer = modalShell();
    layer.hidden = false;

    const entityOptions = (type) => referencesFor(type).map((row) => `<option value="${escapeHtml(row.id)}" ${row.id === current.entityId ? 'selected' : ''}>${escapeHtml(refLabel(type, row))}</option>`).join('');

    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bpDocumentModalTitle">
        <div class="bp-runtime-modal-head">
          <div><h3 id="bpDocumentModalTitle">${creating ? 'Register Document' : 'Edit Document'}</h3><p>${creating ? 'Create a canonical document record. File storage/signing remains integration-backed.' : escapeHtml(current.id)}</p></div>
          <button type="button" class="bp-runtime-close" data-document-close aria-label="Close">×</button>
        </div>
        <form id="bpDocumentForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label class="bp-runtime-span-2"><span>Document name *</span><input name="name" required value="${escapeHtml(current.name)}" placeholder="RC-OR-1042-v1.pdf"></label>
            <label><span>Entity type</span><select name="entityType">${entityTypes.map((value) => `<option ${value === current.entityType ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Linked record *</span><select name="entityId"><option value="">Select record</option>${entityOptions(current.entityType)}</select></label>
            <label><span>Document type</span><select name="type">${documentTypes.map((value) => `<option ${value === current.type ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Status</span><select name="status">${statuses.map((value) => `<option ${value === current.status ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Version</span><input name="version" type="number" min="1" step="1" value="${current.version}"></label>
            <label><span>Source</span><input name="source" value="${escapeHtml(current.source)}"></label>
            <label class="bp-runtime-span-2"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(current.notes)}</textarea></label>
          </div>
          ${(current.signedAt || current.verifiedAt) ? `<div class="bp-runtime-integrity-warning">Historical milestones are preserved: ${current.signedAt ? `signed ${escapeHtml(formatDate(current.signedAt))}` : ''}${current.signedAt && current.verifiedAt ? ' · ' : ''}${current.verifiedAt ? `verified ${escapeHtml(formatDate(current.verifiedAt))}` : ''}.</div>` : ''}
          <div class="bp-runtime-form-error" id="bpDocumentFormError" hidden></div>
          <div class="bp-runtime-modal-foot">
            ${creating ? '' : '<button type="button" class="btn danger" data-document-delete>Delete</button>'}
            <span class="bp-runtime-spacer"></span>
            <button type="button" class="btn" data-document-close>Cancel</button>
            <button type="submit" class="btn primary">${creating ? 'Register Document' : 'Save Changes'}</button>
          </div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-document-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpDocumentForm');
    const typeSelect = form.elements.entityType;
    const entitySelect = form.elements.entityId;
    typeSelect.addEventListener('change', () => {
      entitySelect.innerHTML = '<option value="">Select record</option>' + entityOptions(typeSelect.value);
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpDocumentFormError');
      if (!String(values.name || '').trim() || !String(values.entityId || '').trim()) {
        error.textContent = 'Document name and linked record are required.';
        error.hidden = false;
        return;
      }
      const linked = referencesFor(values.entityType).some((row) => String(row.id) === String(values.entityId));
      if (!linked) {
        error.textContent = 'The linked record no longer exists. Select a current record.';
        error.hidden = false;
        return;
      }
      const nextStatus = values.status;
      const next = normalize({
        ...current,
        ...values,
        version: Number(values.version),
        signedAt: nextStatus === 'Signed' ? (current.signedAt || now()) : current.signedAt,
        verifiedAt: nextStatus === 'Verified' ? (current.verifiedAt || now()) : current.verifiedAt,
        updatedAt: now(),
      });
      onCommit('save', next, creating);
      closeModal();
    });

    layer.querySelector('[data-document-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete document record ${current.name}?`)) return;
      onCommit('delete', current, false);
      closeModal();
    });
  }

  function install() {
    const page = document.querySelector('[data-page="documents"]');
    if (!page || page.dataset.bpRuntimeDocuments === '1') return;
    page.dataset.bpRuntimeDocuments = '1';

    const head = page.querySelector('.head');
    const table = page.querySelector('table');
    const tbody = table?.querySelector('tbody');
    if (!head || !table || !tbody) return;

    let actions = head.querySelector('.actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'actions';
      head.appendChild(actions);
    }
    if (!actions.querySelector('[data-document-new]')) {
      actions.insertAdjacentHTML('beforeend', '<button type="button" class="btn primary" data-document-new>+ Register document</button>');
    }

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = '<input class="search-table" type="search" placeholder="Search documents, entity, type or status…"><select data-document-status><option value="">All statuses</option>' + statuses.map((value) => `<option>${value}</option>`).join('') + '</select>';
    table.closest('.tablewrap')?.before(toolbar);

    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-bp-document-actions-head]')) {
      const th = document.createElement('th');
      th.dataset.bpDocumentActionsHead = '1';
      th.textContent = 'Actions';
      headerRow.appendChild(th);
    }

    const search = toolbar.querySelector('.search-table');
    const statusFilter = toolbar.querySelector('[data-document-status]');
    let documents = ensureSeed();

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const rows = documents.filter((doc) => {
        if (status && doc.status !== status) return false;
        return !query || [doc.id, doc.name, doc.entityType, doc.entityId, doc.type, doc.status, doc.source].join(' ').toLowerCase().includes(query);
      });
      tbody.innerHTML = rows.length ? rows.map((doc) => `
        <tr data-document-id="${escapeHtml(doc.id)}">
          <td><button class="link" type="button" data-document-edit="${escapeHtml(doc.id)}">${escapeHtml(doc.name)}</button><span class="secondary">${escapeHtml(doc.id)}</span></td>
          <td>${escapeHtml(doc.entityId)}<span class="secondary">${escapeHtml(doc.entityType)}</span></td>
          <td>${escapeHtml(doc.type)}</td>
          <td><span class="badge ${badgeClass(doc.status)}">${escapeHtml(doc.status)}</span></td>
          <td>v${doc.version}</td>
          <td>${escapeHtml(formatDate(doc.uploadedAt))}</td>
          <td><button type="button" class="btn ghost" data-document-edit="${escapeHtml(doc.id)}">Edit</button></td>
        </tr>`).join('') : '<tr><td colspan="7" class="secondary bp-empty-cell">No documents match the current filters.</td></tr>';
    };

    const commit = (action, doc, creating) => {
      if (action === 'delete') {
        documents = documents.filter((item) => item.id !== doc.id);
        save(documents, 'document.delete');
        api.audit.record('document.delete', 'document', doc.id, { name: doc.name, entityId: doc.entityId });
      } else if (creating) {
        documents.unshift(doc);
        save(documents, 'document.create');
        api.audit.record('document.create', 'document', doc.id, { type: doc.type, entityType: doc.entityType, entityId: doc.entityId, status: doc.status });
      } else {
        const index = documents.findIndex((item) => item.id === doc.id);
        if (index >= 0) documents[index] = doc;
        save(documents, 'document.update');
        api.audit.record('document.update', 'document', doc.id, { status: doc.status, version: doc.version, entityId: doc.entityId });
      }
      render();
    };

    actions.querySelector('[data-document-new]').addEventListener('click', () => openEditor(null, commit));
    search.addEventListener('input', render);
    statusFilter.addEventListener('change', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-document-edit]');
      if (!button) return;
      const doc = documents.find((item) => item.id === button.dataset.documentEdit);
      if (doc) openEditor(doc, commit);
    });
    api.events.on('documents:changed', () => {
      documents = (api.store.get(SCOPE, []) || []).map(normalize);
      render();
    });

    render();
    api.audit.record('documents.module.ready', 'module', 'documents', { count: documents.length });
  }

  install();
})();

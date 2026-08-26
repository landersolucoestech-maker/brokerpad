(() => {
  'use strict';

  const SCOPE = 'carriers';
  const api = window.BrokerPadRuntime;
  if (!api) return;

  const now = () => new Date().toISOString();
  const uid = () => `CAR-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const authorityStatuses = ['Active', 'Inactive', 'Pending'];
  const insuranceStatuses = ['Verified', 'Expires soon', 'Expired', 'Pending'];
  const risks = ['Low', 'Medium', 'High'];
  const approvals = ['Approved', 'Manual review', 'Blocked', 'Pending'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const initialCarriers = [
    {
      id: 'CAR-1001',
      name: 'Northstar Vehicle Transport LLC',
      usdot: '3948201',
      mc: 'MC-1284502',
      authorityStatus: 'Active',
      insuranceStatus: 'Verified',
      insuranceExpiresAt: '2027-02-15',
      risk: 'Low',
      approval: 'Approved',
      contactName: 'Dispatch Desk',
      email: 'dispatch@northstar.example',
      phone: '(888) 555-0112',
      lanes: 'CA→FL, CA→TX, AZ→FL',
      notes: '',
      createdAt: '2026-08-20T12:00:00.000Z',
      updatedAt: '2026-08-26T11:00:00.000Z',
    },
    {
      id: 'CAR-1002',
      name: 'BlueLine Auto Haul Inc.',
      usdot: '3821900',
      mc: 'MC-1205931',
      authorityStatus: 'Active',
      insuranceStatus: 'Expires soon',
      insuranceExpiresAt: '2026-09-07',
      risk: 'High',
      approval: 'Manual review',
      contactName: 'Operations',
      email: 'ops@blueline.example',
      phone: '(877) 555-0146',
      lanes: 'NJ→TX, PA→GA',
      notes: 'Insurance renewal required before approval.',
      createdAt: '2026-08-19T12:00:00.000Z',
      updatedAt: '2026-08-26T10:00:00.000Z',
    },
  ];

  const normalize = (carrier) => ({
    id: carrier.id || uid(),
    name: String(carrier.name || '').trim(),
    usdot: String(carrier.usdot || '').replace(/\D/g, ''),
    mc: String(carrier.mc || '').trim().toUpperCase(),
    authorityStatus: authorityStatuses.includes(carrier.authorityStatus) ? carrier.authorityStatus : 'Pending',
    insuranceStatus: insuranceStatuses.includes(carrier.insuranceStatus) ? carrier.insuranceStatus : 'Pending',
    insuranceExpiresAt: String(carrier.insuranceExpiresAt || ''),
    risk: risks.includes(carrier.risk) ? carrier.risk : 'Medium',
    approval: approvals.includes(carrier.approval) ? carrier.approval : 'Pending',
    contactName: String(carrier.contactName || '').trim(),
    email: String(carrier.email || '').trim(),
    phone: String(carrier.phone || '').trim(),
    lanes: String(carrier.lanes || '').trim(),
    notes: String(carrier.notes || '').trim(),
    createdAt: carrier.createdAt || now(),
    updatedAt: carrier.updatedAt || now(),
  });

  const isEligible = (carrier) => (
    carrier.authorityStatus === 'Active' &&
    carrier.insuranceStatus === 'Verified' &&
    carrier.risk !== 'High' &&
    carrier.approval === 'Approved'
  );

  const badgeClass = (value) => {
    if (['Active', 'Verified', 'Low', 'Approved'].includes(value)) return 'green';
    if (['Inactive', 'Expired', 'High', 'Blocked'].includes(value)) return 'red';
    if (['Pending', 'Expires soon', 'Medium', 'Manual review'].includes(value)) return 'amber';
    return 'gray';
  };

  function ensureSeed() {
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialCarriers.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('carriers.seed', 'carrier', '', { count: seeded.length });
    return seeded;
  }

  function save(carriers) {
    api.store.set(SCOPE, carriers);
    api.events.emit('carriers:changed', { count: carriers.length });
  }

  function modalShell() {
    let layer = document.querySelector('#bpCarrierModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpCarrierModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpCarrierModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openEditor(carrier, onCommit) {
    const creating = !carrier;
    const current = normalize(carrier || {});
    const layer = modalShell();
    layer.hidden = false;
    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true">
        <div class="bp-runtime-modal-head">
          <div><h3>${creating ? 'Add Carrier' : 'Edit Carrier'}</h3><p>${creating ? 'Create a carrier compliance record.' : escapeHtml(current.id)}</p></div>
          <button type="button" class="bp-runtime-close" data-carrier-close aria-label="Close">×</button>
        </div>
        <form id="bpCarrierForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label class="bp-runtime-span-2"><span>Legal name *</span><input name="name" required value="${escapeHtml(current.name)}"></label>
            <label><span>USDOT *</span><input name="usdot" inputmode="numeric" required value="${escapeHtml(current.usdot)}"></label>
            <label><span>MC number</span><input name="mc" value="${escapeHtml(current.mc)}"></label>
            <label><span>Authority</span><select name="authorityStatus">${authorityStatuses.map((value) => `<option ${value === current.authorityStatus ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Insurance</span><select name="insuranceStatus">${insuranceStatuses.map((value) => `<option ${value === current.insuranceStatus ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Insurance expires</span><input name="insuranceExpiresAt" type="date" value="${escapeHtml(current.insuranceExpiresAt)}"></label>
            <label><span>Risk</span><select name="risk">${risks.map((value) => `<option ${value === current.risk ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Approval</span><select name="approval">${approvals.map((value) => `<option ${value === current.approval ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
            <label><span>Contact</span><input name="contactName" value="${escapeHtml(current.contactName)}"></label>
            <label><span>Email</span><input name="email" type="email" value="${escapeHtml(current.email)}"></label>
            <label><span>Phone</span><input name="phone" value="${escapeHtml(current.phone)}"></label>
            <label class="bp-runtime-span-2"><span>Preferred lanes</span><input name="lanes" value="${escapeHtml(current.lanes)}" placeholder="CA→FL, TX→NY"></label>
            <label class="bp-runtime-span-2"><span>Notes</span><textarea name="notes" rows="4">${escapeHtml(current.notes)}</textarea></label>
          </div>
          <div class="bp-runtime-form-error" id="bpCarrierFormError" hidden></div>
          <div class="bp-runtime-modal-foot">
            ${creating ? '' : '<button type="button" class="btn danger" data-carrier-delete>Delete</button>'}
            <span class="bp-runtime-spacer"></span>
            <button type="button" class="btn" data-carrier-close>Cancel</button>
            <button type="submit" class="btn primary">${creating ? 'Add Carrier' : 'Save Changes'}</button>
          </div>
        </form>
      </div>`;

    layer.querySelectorAll('[data-carrier-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpCarrierForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const error = layer.querySelector('#bpCarrierFormError');
      if (!String(values.name || '').trim() || !String(values.usdot || '').replace(/\D/g, '')) {
        error.textContent = 'Carrier legal name and USDOT are required.';
        error.hidden = false;
        return;
      }
      if (values.email && !/^\S+@\S+\.\S+$/.test(String(values.email).trim())) {
        error.textContent = 'Enter a valid email address.';
        error.hidden = false;
        return;
      }
      const next = normalize({ ...current, ...values, updatedAt: now() });
      onCommit('save', next, creating);
      closeModal();
    });

    layer.querySelector('[data-carrier-delete]')?.addEventListener('click', () => {
      if (!window.confirm(`Delete ${current.name}? Existing orders will keep the historical carrier name.`)) return;
      onCommit('delete', current, false);
      closeModal();
    });
  }

  function install() {
    const page = document.querySelector('[data-page="carriers"]');
    if (!page || page.dataset.bpRuntimeCarriers === '1') return;
    page.dataset.bpRuntimeCarriers = '1';

    const table = page.querySelector('table');
    const tbody = table?.querySelector('tbody');
    const search = page.querySelector('.search-table');
    const createButton = page.querySelector('.head .btn.primary');
    if (!table || !tbody || !search || !createButton) return;

    const headerRow = table.querySelector('thead tr');
    if (headerRow && !headerRow.querySelector('[data-bp-carrier-actions-head]')) {
      const th = document.createElement('th');
      th.dataset.bpCarrierActionsHead = '1';
      th.textContent = 'Actions';
      headerRow.appendChild(th);
    }

    let carriers = ensureSeed();

    const render = () => {
      const query = search.value.trim().toLowerCase();
      const rows = carriers.filter((carrier) => !query || [
        carrier.id, carrier.name, carrier.usdot, carrier.mc, carrier.authorityStatus,
        carrier.insuranceStatus, carrier.risk, carrier.approval, carrier.lanes,
      ].join(' ').toLowerCase().includes(query));

      tbody.innerHTML = rows.length ? rows.map((carrier) => `
        <tr data-carrier-id="${escapeHtml(carrier.id)}">
          <td><button class="link" type="button" data-carrier-edit="${escapeHtml(carrier.id)}">${escapeHtml(carrier.name)}</button><span class="secondary">${escapeHtml(carrier.id)}${isEligible(carrier) ? ' · Dispatch eligible' : ' · Not dispatch eligible'}</span></td>
          <td>USDOT ${escapeHtml(carrier.usdot || '—')}<span class="secondary">${escapeHtml(carrier.mc || 'No MC')}</span></td>
          <td><span class="badge ${badgeClass(carrier.authorityStatus)}">${escapeHtml(carrier.authorityStatus)}</span></td>
          <td><span class="badge ${badgeClass(carrier.insuranceStatus)}">${escapeHtml(carrier.insuranceStatus)}</span></td>
          <td><span class="badge ${badgeClass(carrier.risk)}">${escapeHtml(carrier.risk)}</span></td>
          <td><span class="badge ${badgeClass(carrier.approval)}">${escapeHtml(carrier.approval)}</span></td>
          <td><button class="btn ghost" type="button" data-carrier-edit="${escapeHtml(carrier.id)}">Edit</button></td>
        </tr>`).join('') : '<tr><td colspan="7" class="secondary" style="padding:18px;text-align:center">No carriers match the current search.</td></tr>';
    };

    const commit = (action, carrier, creating) => {
      if (action === 'delete') {
        carriers = carriers.filter((item) => item.id !== carrier.id);
        save(carriers);
        api.audit.record('carrier.delete', 'carrier', carrier.id, { name: carrier.name });
      } else if (creating) {
        carriers.unshift(carrier);
        save(carriers);
        api.audit.record('carrier.create', 'carrier', carrier.id, { usdot: carrier.usdot, approval: carrier.approval });
      } else {
        const index = carriers.findIndex((item) => item.id === carrier.id);
        if (index >= 0) carriers[index] = carrier;
        save(carriers);
        api.audit.record('carrier.update', 'carrier', carrier.id, {
          authorityStatus: carrier.authorityStatus,
          insuranceStatus: carrier.insuranceStatus,
          risk: carrier.risk,
          approval: carrier.approval,
          eligible: isEligible(carrier),
        });
      }
      render();
    };

    createButton.addEventListener('click', (event) => {
      event.preventDefault();
      openEditor(null, commit);
    });
    search.addEventListener('input', render);
    tbody.addEventListener('click', (event) => {
      const button = event.target.closest('[data-carrier-edit]');
      if (!button) return;
      const carrier = carriers.find((item) => item.id === button.dataset.carrierEdit);
      if (carrier) openEditor(carrier, commit);
    });
    api.events.on('carriers:changed', () => {
      carriers = api.store.get(SCOPE, []).map(normalize);
      render();
    });

    render();
    api.audit.record('carriers.module.ready', 'module', 'carriers', { count: carriers.length });
  }

  install();
})();

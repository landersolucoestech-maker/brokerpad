(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const datasetDefs = [
    { id: 'customers', name: 'Customers', scope: 'customers', importable: true },
    { id: 'leads', name: 'Leads', scope: 'leads', importable: true },
    { id: 'quotes', name: 'Quotes', scope: 'quotes', importable: true },
    { id: 'orders', name: 'Orders', scope: 'orders', importable: true },
    { id: 'carriers', name: 'Carriers', scope: 'carriers', importable: true },
    { id: 'dispatch', name: 'Dispatch', scope: 'orders', importable: false },
    { id: 'documents', name: 'Documents', scope: 'documents', importable: true },
    { id: 'communications', name: 'Communications', scope: 'communications', importable: false },
    { id: 'finance', name: 'Finance', scope: 'orders', importable: false },
    { id: 'compliance', name: 'Compliance', scope: 'carriers', importable: false },
    { id: 'risk', name: 'Risk', scope: 'carriers', importable: false },
    { id: 'audit', name: 'Audit Log', scope: 'audit', importable: false },
    { id: 'settings', name: 'Settings', scope: 'settings', importable: false },
    { id: 'integrations', name: 'Integrations', scope: 'integrations', importable: false },
  ];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const xmlEscape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
  const now = () => new Date().toISOString();
  const text = (value) => String(value ?? '').trim();
  const nonNegative = (value) => Math.max(0, Number(value) || 0);
  const makeId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  function rowsFor(def) {
    if (def.id === 'settings') return [api.settings.get()];
    const rows = api.store.get(def.scope, []);
    if (!Array.isArray(rows)) return rows && typeof rows === 'object' ? [rows] : [];
    if (def.id === 'dispatch') return rows.filter((row) => row.status !== 'Settled').map((row) => ({ id: row.id, customerName: row.customerName, origin: row.origin, destination: row.destination, vehicle: row.vehicle, carrierId: row.carrierId, carrierName: row.carrierName, carrierPay: row.carrierPay, status: row.status, pickupStart: row.pickupStart, pickupEnd: row.pickupEnd, updatedAt: row.updatedAt }));
    if (def.id === 'finance') {
      const payments = api.store.get('finance-payments', { customer: {}, carrier: {} }) || {};
      return rows.map((row) => {
        const customerPaid = Math.min(nonNegative(row.customerPrice), nonNegative(payments.customer?.[row.id]));
        const carrierPaid = Math.min(nonNegative(row.carrierPay), nonNegative(payments.carrier?.[row.id]));
        return {
          id: row.id,
          customerName: row.customerName,
          customerPrice: nonNegative(row.customerPrice),
          carrierPay: nonNegative(row.carrierPay),
          customerPaid,
          carrierPaid,
          receivableBalance: Math.max(0, nonNegative(row.customerPrice) - customerPaid),
          payableBalance: Math.max(0, nonNegative(row.carrierPay) - carrierPaid),
          grossProfit: nonNegative(row.customerPrice) - nonNegative(row.carrierPay),
          status: row.status,
        };
      });
    }
    if (def.id === 'compliance') return rows.map((row) => ({ id: row.id, name: row.name, usdot: row.usdot, mc: row.mc, authorityStatus: row.authorityStatus, insuranceStatus: row.insuranceStatus, insuranceExpiresAt: row.insuranceExpiresAt, approval: row.approval, risk: row.risk }));
    if (def.id === 'risk') return rows.map((row) => ({ id: row.id, name: row.name, risk: row.risk, authorityStatus: row.authorityStatus, insuranceStatus: row.insuranceStatus, approval: row.approval, signal: row.risk === 'High' ? 'High carrier risk' : row.insuranceStatus !== 'Verified' ? 'Insurance not verified' : row.authorityStatus !== 'Active' ? 'Authority not active' : 'No blocking signal' }));
    if (def.id === 'communications') return rows.map((row) => ({ id: row.id, name: row.name, channel: row.channel, status: row.status, assignee: row.assignee, customerId: row.customerId, leadId: row.leadId, quoteId: row.quoteId, orderId: row.orderId, subject: row.subject, messageCount: Array.isArray(row.messages) ? row.messages.length : 0, updatedAt: row.updatedAt }));
    return rows;
  }

  function normalizeImported(def, rows) {
    const seen = new Set();
    const statuses = {
      leads: ['New', 'Contacted', 'Quoted', 'Follow-up', 'Won', 'Lost'],
      quotes: ['Draft', 'Sent', 'Viewed', 'Accepted', 'Expired', 'Rejected'],
      orders: ['Booked', 'Sourcing', 'Carrier Selected', 'Pickup Scheduled', 'Picked Up', 'In Transit', 'Delivered', 'Settled', 'Cancelled'],
      carriersAuthority: ['Active', 'Inactive', 'Pending'],
      carriersInsurance: ['Verified', 'Expires soon', 'Expired', 'Pending'],
      carriersRisk: ['Low', 'Medium', 'High'],
      carriersApproval: ['Approved', 'Manual review', 'Blocked', 'Pending'],
      documents: ['Draft', 'Pending Signature', 'Signed', 'Pending Verification', 'Verified', 'Expired', 'Rejected'],
    };

    const normalized = rows.map((raw, index) => {
      const row = raw && typeof raw === 'object' ? { ...raw } : {};
      let next;
      if (def.id === 'customers') {
        next = {
          ...row,
          id: text(row.id) || makeId('CUS'),
          name: text(row.name),
          kind: row.kind === 'Business' ? 'Business' : 'Individual',
          email: text(row.email), phone: text(row.phone), source: text(row.source) || 'Direct',
          status: ['Active', 'Inactive', 'Do Not Contact'].includes(row.status) ? row.status : 'Active',
          leads: nonNegative(row.leads), orders: nonNegative(row.orders), lifetimeValue: nonNegative(row.lifetimeValue),
          notes: text(row.notes), createdAt: text(row.createdAt) || now(), updatedAt: text(row.updatedAt) || now(),
        };
        if (!next.name) throw new Error(`Row ${index + 2}: customer name is required.`);
      } else if (def.id === 'leads') {
        next = {
          ...row,
          id: text(row.id) || makeId('LD'), customerId: text(row.customerId), contactName: text(row.contactName), email: text(row.email), phone: text(row.phone),
          origin: text(row.origin), destination: text(row.destination), vehicleYear: text(row.vehicleYear), vehicleMake: text(row.vehicleMake), vehicleModel: text(row.vehicleModel),
          status: statuses.leads.includes(row.status) ? row.status : 'New', quoteAmount: nonNegative(row.quoteAmount), source: text(row.source) || 'Direct', assignedTo: text(row.assignedTo) || 'Unassigned',
          priority: ['Normal', 'High', 'Urgent'].includes(row.priority) ? row.priority : 'Normal', notes: text(row.notes), createdAt: text(row.createdAt) || now(), updatedAt: text(row.updatedAt) || now(),
        };
        if (!next.contactName || !next.origin || !next.destination) throw new Error(`Row ${index + 2}: lead contact, origin and destination are required.`);
      } else if (def.id === 'quotes') {
        next = {
          ...row,
          id: text(row.id) || makeId('QT'), leadId: text(row.leadId), customerId: text(row.customerId), contactName: text(row.contactName), origin: text(row.origin), destination: text(row.destination), vehicle: text(row.vehicle),
          customerPrice: nonNegative(row.customerPrice), carrierPay: nonNegative(row.carrierPay), revision: Math.max(1, Number(row.revision) || 1), status: statuses.quotes.includes(row.status) ? row.status : 'Draft',
          expiresAt: text(row.expiresAt), notes: text(row.notes), acceptedAt: text(row.acceptedAt), orderId: text(row.orderId), createdAt: text(row.createdAt) || now(), updatedAt: text(row.updatedAt) || now(),
        };
        if (!next.contactName || !next.origin || !next.destination || !next.vehicle || next.customerPrice <= 0) throw new Error(`Row ${index + 2}: quote contact, route, vehicle and positive customer price are required.`);
      } else if (def.id === 'orders') {
        next = {
          ...row,
          id: text(row.id) || makeId('OR'), sourceQuoteId: text(row.sourceQuoteId), leadId: text(row.leadId), customerId: text(row.customerId), customerName: text(row.customerName), origin: text(row.origin), destination: text(row.destination), vehicle: text(row.vehicle),
          transport: row.transport === 'Enclosed' ? 'Enclosed' : 'Open', status: statuses.orders.includes(row.status) ? row.status : 'Booked', customerPrice: nonNegative(row.customerPrice), carrierPay: nonNegative(row.carrierPay),
          pickupStart: text(row.pickupStart), pickupEnd: text(row.pickupEnd), carrierId: text(row.carrierId), carrierName: text(row.carrierName), deliveredAt: text(row.deliveredAt), settledAt: text(row.settledAt), notes: text(row.notes),
          createdAt: text(row.createdAt) || now(), updatedAt: text(row.updatedAt) || now(),
        };
        if (!next.customerName || !next.origin || !next.destination || !next.vehicle) throw new Error(`Row ${index + 2}: order customer, route and vehicle are required.`);
      } else if (def.id === 'carriers') {
        next = {
          ...row,
          id: text(row.id) || makeId('CAR'), name: text(row.name), usdot: text(row.usdot).replace(/\D/g, ''), mc: text(row.mc).toUpperCase(),
          authorityStatus: statuses.carriersAuthority.includes(row.authorityStatus) ? row.authorityStatus : 'Pending', insuranceStatus: statuses.carriersInsurance.includes(row.insuranceStatus) ? row.insuranceStatus : 'Pending',
          insuranceExpiresAt: text(row.insuranceExpiresAt), risk: statuses.carriersRisk.includes(row.risk) ? row.risk : 'Medium', approval: statuses.carriersApproval.includes(row.approval) ? row.approval : 'Pending',
          contactName: text(row.contactName), email: text(row.email), phone: text(row.phone), lanes: text(row.lanes), notes: text(row.notes), createdAt: text(row.createdAt) || now(), updatedAt: text(row.updatedAt) || now(),
        };
        if (!next.name || !next.usdot) throw new Error(`Row ${index + 2}: carrier legal name and USDOT are required.`);
      } else if (def.id === 'documents') {
        next = {
          ...row,
          id: text(row.id) || makeId('DOC'), name: text(row.name), entityType: ['Order', 'Carrier', 'Customer'].includes(row.entityType) ? row.entityType : 'Order', entityId: text(row.entityId).toUpperCase(),
          type: text(row.type) || 'Other', status: statuses.documents.includes(row.status) ? row.status : 'Draft', version: Math.max(1, Number(row.version) || 1), source: text(row.source) || 'BrokerPad', notes: text(row.notes),
          uploadedAt: text(row.uploadedAt) || now(), signedAt: text(row.signedAt), verifiedAt: text(row.verifiedAt), createdAt: text(row.createdAt) || now(), updatedAt: text(row.updatedAt) || now(),
        };
        if (!next.name || !next.entityId) throw new Error(`Row ${index + 2}: document name and linked entity are required.`);
      } else {
        next = row;
      }

      if (!next.id) throw new Error(`Row ${index + 2}: record ID is required.`);
      if (seen.has(next.id)) throw new Error(`Row ${index + 2}: duplicate ID ${next.id}.`);
      seen.add(next.id);
      return next;
    });

    return normalized;
  }

  function columnName(index) {
    let result = '', value = index + 1;
    while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
    return result;
  }

  function flattenValue(value) {
    if (value == null) return '';
    if (Array.isArray(value) || typeof value === 'object') return JSON.stringify(value);
    return value;
  }

  async function createXlsx(def, rows) {
    if (!window.JSZip) throw new Error('JSZip is not available.');
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row || {})))];
    const safeHeaders = headers.length ? headers : ['id'];
    const dataRows = rows.length ? rows : [{ id: '' }];
    const sheetRows = [safeHeaders, ...dataRows.map((row) => safeHeaders.map((key) => flattenValue(row?.[key])))];
    const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => { const ref = `${columnName(c)}${r + 1}`; if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`; return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`; }).join('')}</row>`).join('')}</sheetData></worksheet>`;
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
    zip.folder('_rels').file('.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    zip.folder('xl').file('workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(def.name.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
    zip.folder('xl').folder('_rels').file('workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.folder('xl').folder('worksheets').file('sheet1.xml', sheetXml);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cellText(cell, sharedStrings) {
    const type = cell.getAttribute('t');
    if (type === 'inlineStr') return cell.querySelector('is t')?.textContent || '';
    const value = cell.querySelector('v')?.textContent || '';
    if (type === 's') return sharedStrings[Number(value)] ?? '';
    if (type === 'b') return value === '1';
    const number = Number(value);
    return value !== '' && Number.isFinite(number) ? number : value;
  }

  async function parseXlsx(file) {
    if (!window.JSZip) throw new Error('JSZip is not available.');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    let sharedStrings = [];
    const shared = zip.file('xl/sharedStrings.xml');
    if (shared) {
      const doc = new DOMParser().parseFromString(await shared.async('text'), 'application/xml');
      sharedStrings = [...doc.querySelectorAll('si')].map((si) => [...si.querySelectorAll('t')].map((t) => t.textContent || '').join(''));
    }
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    if (!sheetFile) throw new Error('The workbook does not contain xl/worksheets/sheet1.xml.');
    const doc = new DOMParser().parseFromString(await sheetFile.async('text'), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('The worksheet XML is invalid.');
    const parsedRows = [...doc.querySelectorAll('sheetData row')].map((row) => {
      const values = [];
      [...row.querySelectorAll('c')].forEach((cell) => {
        const ref = cell.getAttribute('r') || '', letters = ref.replace(/\d/g, '');
        let index = 0;
        for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64);
        if (index > 0) values[index - 1] = cellText(cell, sharedStrings);
      });
      return values;
    });
    if (!parsedRows.length) return [];
    const headerPairs = parsedRows[0]
      .map((value, index) => ({ header: String(value || '').trim(), index }))
      .filter((item) => item.header);
    if (!headerPairs.length) throw new Error('The workbook header row is empty.');
    return parsedRows.slice(1)
      .filter((row) => row.some((value) => value !== '' && value != null))
      .map((row) => Object.fromEntries(headerPairs.map(({ header, index }) => [header, row[index] ?? ''])));
  }

  function toast(message) {
    let el = document.querySelector('#bpReportsToast');
    if (!el) { el = document.createElement('div'); el.id = 'bpReportsToast'; el.className = 'report-toast'; document.body.appendChild(el); }
    el.textContent = message;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.remove(), 2600);
  }

  function install() {
    const page = document.querySelector('[data-page="reports"]');
    if (!page || page.dataset.bpRuntimeReports === '1') return;
    page.dataset.bpRuntimeReports = '1';
    const headCopy = page.querySelector('.head p');
    if (headCopy) headCopy.textContent = 'Import and export BrokerPad datasets. Each row represents one current dataset.';
    page.querySelector('.head .actions')?.remove();
    page.querySelector('.reports-toolbar')?.remove();
    page.querySelector('.reports-advanced')?.remove();
    page.querySelector('.reports-kpis')?.remove();
    page.querySelector('.reports-footnote')?.remove();
    const listHead = page.querySelector('.reports-list-head');
    if (listHead) listHead.innerHTML = '<div><h2>Datasets</h2></div>';

    const table = page.querySelector('#repTable'), tbody = table?.querySelector('tbody');
    if (!table || !tbody) return;
    table.querySelector('thead').innerHTML = '<tr><th>Dataset</th><th>Records</th><th>Source</th><th>Actions</th></tr>';

    const render = () => {
      tbody.innerHTML = datasetDefs.map((def) => {
        const rows = rowsFor(def);
        return `<tr data-dataset-id="${def.id}"><td><b>${escapeHtml(def.name)}</b><span class="secondary">${escapeHtml(def.scope)}</span></td><td>${rows.length.toLocaleString('en-US')}</td><td>BrokerPad runtime</td><td><div class="report-actions">${def.importable ? `<button type="button" class="btn" data-dataset-import="${def.id}">Import</button>` : ''}<button type="button" class="btn primary" data-dataset-export="${def.id}">Export</button></div></td></tr>`;
      }).join('');
    };

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    fileInput.hidden = true;
    page.appendChild(fileInput);
    let pendingImport = null;

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      const def = datasetDefs.find((item) => item.id === pendingImport);
      pendingImport = null;
      fileInput.value = '';
      if (!file || !def || !def.importable) return;
      try {
        const parsed = await parseXlsx(file);
        if (!parsed.length) throw new Error('The workbook has no data rows.');
        const rows = normalizeImported(def, parsed);
        if (!window.confirm(`Replace ${def.name} with ${rows.length} validated imported rows? This affects the current local tenant only.`)) return;
        api.store.set(def.scope, rows);
        api.events.emit(`${def.scope}:changed`, { count: rows.length, source: 'reports.import' });
        api.audit.record('dataset.import', 'dataset', def.id, { rows: rows.length, file: file.name, validated: true });
        render();
        const integrity = window.BrokerPadIntegrity;
        toast(`${def.name}: ${rows.length} rows imported${integrity && !integrity.ok ? ' · linked-record warnings detected' : ''}`);
      } catch (error) {
        console.error('[BrokerPad Reports import]', error);
        toast(`Import failed: ${error.message || error}`);
      }
    });

    tbody.addEventListener('click', async (event) => {
      const exportButton = event.target.closest('[data-dataset-export]');
      if (exportButton) {
        const def = datasetDefs.find((item) => item.id === exportButton.dataset.datasetExport);
        if (!def) return;
        try {
          const rows = rowsFor(def), blob = await createXlsx(def, rows), stamp = new Date().toISOString().slice(0, 10);
          download(blob, `brokerpad-${def.id}-${stamp}.xlsx`);
          api.audit.record('dataset.export', 'dataset', def.id, { rows: rows.length });
          toast(`${def.name}: XLSX exported`);
        } catch (error) {
          console.error('[BrokerPad Reports export]', error);
          toast(`Export failed: ${error.message || error}`);
        }
        return;
      }
      const importButton = event.target.closest('[data-dataset-import]');
      if (importButton) {
        pendingImport = importButton.dataset.datasetImport;
        fileInput.click();
      }
    });

    ['customers', 'leads', 'quotes', 'orders', 'carriers', 'documents', 'communications', 'audit', 'finance'].forEach((scope) => api.events.on(`${scope}:changed`, render));
    render();
    api.audit.record('reports.module.ready', 'module', 'reports', { datasets: datasetDefs.length, mode: 'import-export-only' });
  }

  install();
})();

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

  function rowsFor(def) {
    if (def.id === 'settings') return [api.settings.get()];
    const rows = api.store.get(def.scope, []);
    if (!Array.isArray(rows)) return rows && typeof rows === 'object' ? [rows] : [];
    if (def.id === 'dispatch') return rows.filter((row) => row.status !== 'Settled').map((row) => ({ id: row.id, customerName: row.customerName, origin: row.origin, destination: row.destination, vehicle: row.vehicle, carrierId: row.carrierId, carrierName: row.carrierName, carrierPay: row.carrierPay, status: row.status, pickupStart: row.pickupStart, pickupEnd: row.pickupEnd, updatedAt: row.updatedAt }));
    if (def.id === 'finance') return rows.map((row) => ({ id: row.id, customerName: row.customerName, customerPrice: row.customerPrice, carrierPay: row.carrierPay, customerPaid: row.customerPaid || 0, carrierPaid: row.carrierPaid || 0, receivableBalance: Math.max(0, Number(row.customerPrice || 0) - Number(row.customerPaid || 0)), payableBalance: Math.max(0, Number(row.carrierPay || 0) - Number(row.carrierPaid || 0)), grossProfit: Number(row.customerPrice || 0) - Number(row.carrierPay || 0), status: row.status }));
    if (def.id === 'compliance') return rows.map((row) => ({ id: row.id, name: row.name, usdot: row.usdot, mc: row.mc, authorityStatus: row.authorityStatus, insuranceStatus: row.insuranceStatus, insuranceExpiresAt: row.insuranceExpiresAt, approval: row.approval, risk: row.risk }));
    if (def.id === 'risk') return rows.map((row) => ({ id: row.id, name: row.name, risk: row.risk, authorityStatus: row.authorityStatus, insuranceStatus: row.insuranceStatus, approval: row.approval, signal: row.risk === 'High' ? 'High carrier risk' : row.insuranceStatus !== 'Verified' ? 'Insurance not verified' : row.authorityStatus !== 'Active' ? 'Authority not active' : 'No blocking signal' }));
    if (def.id === 'communications') return rows.map((row) => ({ id: row.id, name: row.name, channel: row.channel, status: row.status, assignee: row.assignee, customerId: row.customerId, leadId: row.leadId, quoteId: row.quoteId, orderId: row.orderId, subject: row.subject, messageCount: Array.isArray(row.messages) ? row.messages.length : 0, updatedAt: row.updatedAt }));
    return rows;
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
    if (shared) { const doc = new DOMParser().parseFromString(await shared.async('text'), 'application/xml'); sharedStrings = [...doc.querySelectorAll('si')].map((si) => [...si.querySelectorAll('t')].map((t) => t.textContent || '').join('')); }
    const sheetFile = zip.file('xl/worksheets/sheet1.xml');
    if (!sheetFile) throw new Error('The workbook does not contain xl/worksheets/sheet1.xml.');
    const doc = new DOMParser().parseFromString(await sheetFile.async('text'), 'application/xml');
    const parsedRows = [...doc.querySelectorAll('sheetData row')].map((row) => { const values = []; [...row.querySelectorAll('c')].forEach((cell) => { const ref = cell.getAttribute('r') || '', letters = ref.replace(/\d/g, ''); let index = 0; for (const ch of letters) index = index * 26 + (ch.charCodeAt(0) - 64); values[index - 1] = cellText(cell, sharedStrings); }); return values; });
    if (!parsedRows.length) return [];
    const headers = parsedRows[0].map((value) => String(value || '').trim()).filter(Boolean);
    return parsedRows.slice(1).filter((row) => row.some((value) => value !== '' && value != null)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  }

  function toast(message) {
    let el = document.querySelector('#bpReportsToast');
    if (!el) { el = document.createElement('div'); el.id = 'bpReportsToast'; el.className = 'report-toast'; document.body.appendChild(el); }
    el.textContent = message; clearTimeout(el._timer); el._timer = setTimeout(() => el.remove(), 2600);
  }

  function install() {
    const page = document.querySelector('[data-page="reports"]');
    if (!page || page.dataset.bpRuntimeReports === '1') return;
    page.dataset.bpRuntimeReports = '1';
    page.querySelector('.head p').textContent = 'Import and export BrokerPad datasets. Each row represents one current dataset.';
    page.querySelector('.head .actions')?.remove();
    page.querySelector('.reports-toolbar')?.remove();
    page.querySelector('.reports-advanced')?.remove();
    page.querySelector('.reports-kpis')?.remove();
    page.querySelector('.reports-footnote')?.remove();
    const listHead = page.querySelector('.reports-list-head');
    if (listHead) listHead.innerHTML = '<div><h2>Datasets</h2><span>Current tenant data</span></div>';

    const table = page.querySelector('#repTable'), tbody = table?.querySelector('tbody');
    if (!table || !tbody) return;
    table.querySelector('thead').innerHTML = '<tr><th>Dataset</th><th>Records</th><th>Source</th><th>Import</th><th>Export</th><th>Actions</th></tr>';

    const render = () => { tbody.innerHTML = datasetDefs.map((def) => { const rows = rowsFor(def); return `<tr data-dataset-id="${def.id}"><td><b>${escapeHtml(def.name)}</b><span class="secondary">${escapeHtml(def.scope)}</span></td><td>${rows.length.toLocaleString('en-US')}</td><td>BrokerPad runtime</td><td>${def.importable ? '<span class="badge green">Available</span>' : '<span class="badge gray">Export only</span>'}</td><td><span class="badge green">Available</span></td><td><div class="report-actions">${def.importable ? `<button type="button" class="btn" data-dataset-import="${def.id}">Import</button>` : ''}<button type="button" class="btn primary" data-dataset-export="${def.id}">Export</button></div></td></tr>`; }).join(''); };

    const fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; fileInput.hidden = true; page.appendChild(fileInput);
    let pendingImport = null;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0], def = datasetDefs.find((item) => item.id === pendingImport); fileInput.value = '';
      if (!file || !def || !def.importable) return;
      try {
        const rows = await parseXlsx(file);
        if (!rows.length) throw new Error('The workbook has no data rows.');
        if (!window.confirm(`Replace ${def.name} with ${rows.length} imported rows? This affects the current local tenant only.`)) return;
        api.store.set(def.scope, rows); api.events.emit(`${def.scope}:changed`, { count: rows.length, source: 'reports.import' }); api.audit.record('dataset.import', 'dataset', def.id, { rows: rows.length, file: file.name }); render(); toast(`${def.name}: ${rows.length} rows imported`);
      } catch (error) { console.error('[BrokerPad Reports import]', error); toast(`Import failed: ${error.message || error}`); }
    });

    tbody.addEventListener('click', async (event) => {
      const exportButton = event.target.closest('[data-dataset-export]');
      if (exportButton) {
        const def = datasetDefs.find((item) => item.id === exportButton.dataset.datasetExport); if (!def) return;
        try { const rows = rowsFor(def), blob = await createXlsx(def, rows), stamp = new Date().toISOString().slice(0, 10); download(blob, `brokerpad-${def.id}-${stamp}.xlsx`); api.audit.record('dataset.export', 'dataset', def.id, { rows: rows.length }); toast(`${def.name}: XLSX exported`); }
        catch (error) { console.error('[BrokerPad Reports export]', error); toast(`Export failed: ${error.message || error}`); }
        return;
      }
      const importButton = event.target.closest('[data-dataset-import]');
      if (importButton) { pendingImport = importButton.dataset.datasetImport; fileInput.click(); }
    });

    ['customers', 'leads', 'quotes', 'orders', 'carriers', 'documents', 'communications', 'audit'].forEach((scope) => api.events.on(`${scope}:changed`, render));
    render(); api.audit.record('reports.module.ready', 'module', 'reports', { datasets: datasetDefs.length, mode: 'import-export-only' });
  }

  install();
})();

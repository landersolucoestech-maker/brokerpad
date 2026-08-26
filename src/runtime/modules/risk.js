(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const page = document.querySelector('[data-page="risk"]');
  if (!page || page.dataset.bpRuntimeRisk === '1') return;
  page.dataset.bpRuntimeRisk = '1';

  const tbody = page.querySelector('tbody');
  if (!tbody) return;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const relative = (iso) => {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return 'Unknown';
    const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3600000));
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const severityClass = (severity) => ({ High: 'red', Medium: 'amber', Low: 'green' }[severity] || 'gray');

  function carrierSignals(carrier) {
    const signals = [];
    const add = (score, signal, severity, disposition) => signals.push({
      entity: carrier.name,
      entityId: carrier.id,
      score,
      signal,
      severity,
      disposition,
      detectedAt: carrier.updatedAt,
    });

    if (carrier.authorityStatus !== 'Active') {
      add(95, `Authority is ${carrier.authorityStatus || 'not active'}`, 'High', 'Blocked');
    }
    if (carrier.insuranceStatus === 'Expired') {
      add(95, 'Carrier insurance is expired', 'High', 'Blocked');
    } else if (carrier.insuranceStatus === 'Expires soon') {
      add(68, `Carrier insurance expires soon${carrier.insuranceExpiresAt ? ` (${carrier.insuranceExpiresAt})` : ''}`, 'Medium', 'Manual review');
    } else if (carrier.insuranceStatus !== 'Verified') {
      add(62, `Insurance status is ${carrier.insuranceStatus || 'pending'}`, 'Medium', 'Manual review');
    }
    if (carrier.risk === 'High') {
      add(82, 'Carrier risk classification is High', 'High', carrier.approval === 'Blocked' ? 'Blocked' : 'Manual review');
    } else if (carrier.risk === 'Medium') {
      add(52, 'Carrier risk classification is Medium', 'Medium', carrier.approval || 'Open');
    }
    if (carrier.approval === 'Manual review') {
      add(70, 'Carrier approval requires manual review', 'Medium', 'Manual review');
    } else if (carrier.approval === 'Blocked') {
      add(100, 'Carrier is blocked from dispatch', 'High', 'Blocked');
    } else if (carrier.approval === 'Pending') {
      add(45, 'Carrier approval is pending', 'Medium', 'Open');
    }
    return signals;
  }

  function orderSignals(order, carriers) {
    const signals = [];
    if (!order.carrierId) return signals;
    const carrier = carriers.find((item) => item.id === order.carrierId);
    if (!carrier) {
      signals.push({
        entity: order.id,
        entityId: order.id,
        score: 72,
        signal: 'Assigned carrier record is missing',
        severity: 'High',
        disposition: 'Manual review',
        detectedAt: order.updatedAt,
      });
      return signals;
    }
    const eligible = carrier.authorityStatus === 'Active' && carrier.insuranceStatus === 'Verified' && carrier.risk !== 'High' && carrier.approval === 'Approved';
    if (!eligible) {
      signals.push({
        entity: order.id,
        entityId: order.id,
        score: 88,
        signal: `Assigned carrier ${carrier.name} is no longer dispatch eligible`,
        severity: 'High',
        disposition: 'Manual review',
        detectedAt: order.updatedAt,
      });
    }
    return signals;
  }

  const render = () => {
    const carriers = api.store.get('carriers', []);
    const orders = api.store.get('orders', []);
    const carrierRows = Array.isArray(carriers) ? carriers : [];
    const orderRows = Array.isArray(orders) ? orders : [];
    const signals = [
      ...carrierRows.flatMap(carrierSignals),
      ...orderRows.flatMap((order) => orderSignals(order, carrierRows)),
    ].sort((a, b) => b.score - a.score);

    tbody.innerHTML = signals.length ? signals.map((item) => `
      <tr data-risk-target="${escapeHtml(item.entityId)}">
        <td>${escapeHtml(item.entity)}</td>
        <td><b>${item.score} / 100</b></td>
        <td>${escapeHtml(item.signal)}</td>
        <td><span class="badge ${severityClass(item.severity)}">${escapeHtml(item.severity)}</span></td>
        <td>${escapeHtml(relative(item.detectedAt))}</td>
        <td><span class="badge ${item.disposition === 'Blocked' ? 'red' : item.disposition === 'Manual review' ? 'amber' : 'gray'}">${escapeHtml(item.disposition)}</span></td>
      </tr>`).join('') : '<tr><td colspan="6" class="secondary" style="padding:18px;text-align:center">No active risk signals were detected from the runtime data.</td></tr>';
  };

  const subtitle = page.querySelector('.head p');
  if (subtitle) subtitle.textContent = 'Derived carrier and order risk signals. External fraud, identity and banking verification still require production integrations.';

  api.events.on('carriers:changed', render);
  api.events.on('orders:changed', render);
  render();
  api.audit.record('risk.module.ready', 'module', 'risk');
})();

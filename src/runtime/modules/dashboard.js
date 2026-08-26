(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api || window.__brokerPadDashboardInstalled) return;
  window.__brokerPadDashboardInstalled = true;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const relative = (iso) => {
    const timestamp = Date.parse(iso || '');
    if (!Number.isFinite(timestamp)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  };

  const rows = (scope) => {
    const value = api.store.get(scope, []);
    return Array.isArray(value) ? value : [];
  };

  const isCarrierEligible = (carrier) => (
    carrier &&
    carrier.authorityStatus === 'Active' &&
    carrier.insuranceStatus === 'Verified' &&
    carrier.risk !== 'High' &&
    carrier.approval === 'Approved'
  );

  const carrierIssue = (carrier) => {
    if (carrier.approval === 'Blocked') return ['Blocked from dispatch', 'red', 'Blocked'];
    if (carrier.authorityStatus !== 'Active') return [`Authority ${carrier.authorityStatus || 'not active'}`, 'red', 'Blocked'];
    if (carrier.insuranceStatus === 'Expired') return ['Insurance expired', 'red', 'High risk'];
    if (carrier.risk === 'High') return ['High carrier risk classification', 'red', 'High risk'];
    if (carrier.insuranceStatus === 'Expires soon') return [carrier.insuranceExpiresAt ? `Insurance expires ${carrier.insuranceExpiresAt}` : 'Insurance expires soon', 'amber', 'Review'];
    if (carrier.insuranceStatus !== 'Verified') return [`Insurance ${carrier.insuranceStatus || 'pending'}`, 'amber', 'Review'];
    if (carrier.approval !== 'Approved') return [`Approval ${carrier.approval || 'pending'}`, 'amber', 'Review'];
    if (carrier.risk === 'Medium') return ['Medium carrier risk classification', 'amber', 'Review'];
    return null;
  };

  function dispatchAttention(orders, carriers) {
    const carrierById = new Map(carriers.map((carrier) => [carrier.id, carrier]));
    return orders.filter((order) => {
      if (['Settled', 'Cancelled', 'Delivered'].includes(order.status)) return false;
      if (['Booked', 'Sourcing'].includes(order.status) && !order.carrierId) return true;
      if (order.carrierId && !isCarrierEligible(carrierById.get(order.carrierId))) return true;
      if (['Carrier Selected', 'Pickup Scheduled'].includes(order.status) && !order.pickupStart) return true;
      return false;
    });
  }

  function activityLabel(entry) {
    const action = String(entry.action || 'activity');
    const id = entry.entityId || '';
    const labels = {
      'quote.create': 'Quote created',
      'quote.update': 'Quote updated',
      'quote.accept': 'Quote accepted',
      'lead.create': 'Lead created',
      'lead.update': 'Lead updated',
      'order.create': 'Order created',
      'order.update': 'Order updated',
      'order.create.from_quote': 'Order created from quote',
      'carrier.create': 'Carrier added',
      'carrier.update': 'Carrier updated',
      'carrier.assignment.updated': 'Carrier assignment updated',
      'carrier.assignment.removed': 'Carrier assignment removed',
      'payment.customer.received': 'Customer payment received',
      'payment.carrier.recorded': 'Carrier payment recorded',
      'conversation.reply.queued': 'Customer reply queued',
      'conversation.team.message.added': 'Team message added',
      'document.create': 'Document registered',
      'document.update': 'Document updated',
      'dataset.import': 'Dataset imported',
      'dataset.export': 'Dataset exported',
    };
    const title = labels[action] || action.replace(/[._]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    return id ? `${title} · ${id}` : title;
  }

  function activityDetail(entry) {
    const metadata = entry.metadata || {};
    const values = [
      metadata.contactName,
      metadata.name,
      metadata.customerId,
      metadata.leadId,
      metadata.quoteId,
      metadata.carrierName,
      metadata.status,
      metadata.channel,
    ].filter(Boolean);
    return values.length ? values.slice(0, 3).join(' · ') : entry.entity ? `Resource: ${entry.entity}` : 'BrokerPad runtime';
  }

  function install() {
    const page = document.querySelector('[data-page="dashboard"]');
    if (!page || page.dataset.bpRuntimeDashboard === '1') return;
    page.dataset.bpRuntimeDashboard = '1';

    const kpis = [...page.querySelectorAll('.kpis .kpi')];
    const cards = [...page.querySelectorAll('.grid2 > .card')];
    if (kpis.length < 6 || cards.length < 3) return;

    const subtitle = page.querySelector('.head p');
    if (subtitle) subtitle.textContent = 'Live operational overview derived from the current BrokerPad tenant.';

    const render = () => {
      const leads = rows('leads');
      const quotes = rows('quotes');
      const orders = rows('orders');
      const carriers = rows('carriers');

      const openLeads = leads.filter((lead) => !['Won', 'Lost'].includes(lead.status));
      const followUp = openLeads.filter((lead) => ['Contacted', 'Quoted', 'Follow-up'].includes(lead.status));
      const activeQuotes = quotes.filter((quote) => ['Draft', 'Sent', 'Viewed'].includes(quote.status));
      const expiringQuotes = activeQuotes.filter((quote) => {
        if (!quote.expiresAt) return false;
        const expires = Date.parse(`${quote.expiresAt}T23:59:59`);
        if (!Number.isFinite(expires)) return false;
        const delta = expires - Date.now();
        return delta >= 0 && delta <= 86400000;
      });
      const inProgress = orders.filter((order) => !['Delivered', 'Settled', 'Cancelled'].includes(order.status));
      const inTransit = inProgress.filter((order) => order.status === 'In Transit');
      const attention = dispatchAttention(orders, carriers);
      const activeCarriers = carriers.filter((carrier) => carrier.authorityStatus === 'Active');
      const eligibleCarriers = activeCarriers.filter(isCarrierEligible);
      const complianceIssues = carriers.map((carrier) => ({ carrier, issue: carrierIssue(carrier) })).filter((item) => item.issue);

      const values = [
        ['Open Leads', openLeads.length, `${followUp.length} in active follow-up`],
        ['Active Quotes', activeQuotes.length, `${expiringQuotes.length} expire within 24h`],
        ['Orders In Progress', inProgress.length, `${inTransit.length} in transit`],
        ['Dispatch Attention', attention.length, attention.length ? 'Assignment or operational review required' : 'No blocking dispatch condition'],
        ['Active Carriers', activeCarriers.length, `${eligibleCarriers.length} dispatch eligible`],
        ['Compliance Alerts', complianceIssues.length, complianceIssues.length ? 'Review required' : 'No carrier compliance alerts'],
      ];
      values.forEach(([label, value, detail], index) => {
        const card = kpis[index];
        if (!card) return;
        const small = card.querySelector('small');
        const strong = card.querySelector('strong');
        const span = card.querySelector('span');
        if (small) small.textContent = label;
        if (strong) strong.textContent = String(value);
        if (span) span.textContent = detail;
      });

      const activities = api.audit.list()
        .filter((entry) => !/\.(?:module\.ready|seed)$/.test(String(entry.action || '')))
        .filter((entry) => !String(entry.action || '').includes('runtime.boot'))
        .slice(0, 6);
      const activityBody = cards[0].querySelector('.cardb');
      if (activityBody) activityBody.innerHTML = activities.length
        ? activities.map((entry) => `<div class="record"><div><b>${escapeHtml(activityLabel(entry))}</b><span class="secondary">${escapeHtml(activityDetail(entry))}</span></div><span>${escapeHtml(relative(entry.at))}</span></div>`).join('')
        : '<div class="secondary bp-empty-cell">No operational activity has been recorded yet.</div>';

      const recentLeads = [...leads]
        .sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0))
        .slice(0, 5);
      const leadBody = cards[1].querySelector('.cardb');
      if (leadBody) leadBody.innerHTML = recentLeads.length
        ? recentLeads.map((lead) => `<div class="record"><div><b>${escapeHtml(lead.contactName || lead.id)}</b><span class="secondary">${escapeHtml(lead.origin || '—')} → ${escapeHtml(lead.destination || '—')} · ${escapeHtml(lead.status || 'New')}</span></div><span>${escapeHtml(relative(lead.updatedAt))}</span></div>`).join('')
        : '<div class="secondary bp-empty-cell">No leads are available.</div>';

      const riskBody = cards[2].querySelector('.cardb');
      if (riskBody) riskBody.innerHTML = complianceIssues.length
        ? complianceIssues.slice(0, 5).map(({ carrier, issue }) => `<div class="record"><div><b>${escapeHtml(carrier.name || carrier.id)}</b><span class="secondary">${escapeHtml(issue[0])}</span></div><span class="badge ${escapeHtml(issue[1])}">${escapeHtml(issue[2])}</span></div>`).join('')
        : '<div class="secondary bp-empty-cell">No active carrier risk or compliance issues.</div>';
    };

    ['leads:changed', 'quotes:changed', 'orders:changed', 'carriers:changed', 'audit'].forEach((eventName) => api.events.on(eventName, render));
    window.addEventListener('brokerpad:integrity:checked', render);
    render();
    api.audit.record('dashboard.module.ready', 'module', 'dashboard', { source: 'runtime-stores' });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

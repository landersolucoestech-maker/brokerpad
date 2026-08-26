(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api || window.__brokerPadQuoteCalculatorInstalled) return;
  window.__brokerPadQuoteCalculatorInstalled = true;

  const POLICY_SCOPE = 'quote-calculator-policy';
  const DRAFT_SCOPE = 'quote-calculator-draft';
  const QUOTE_SCOPE = 'quotes';
  const now = () => new Date().toISOString();
  const quoteId = () => `QT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const vehicleId = () => `VEH-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
  const money = (value) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  const defaultPolicy = Object.freeze({
    version: 1,
    status: 'Local policy',
    baseRatePerMile: 0.62,
    baseFee: 0,
    minimumPerVehicle: 650,
    targetMarginPct: 22,
    roundingIncrement: 10,
    smallSuvAdjustment: 75,
    suvPickupAdjustment: 125,
    largeVehicleAdjustment: 200,
    oversizedAdjustment: 250,
    enclosedAdjustment: 325,
    inoperableAdjustment: 175,
    additionalVehicleDiscount: 60,
    urgentPct: 12,
    flexiblePct: -3,
    californiaOutboundPct: 5,
    floridaInboundPct: 9,
    expirationDays: 3,
  });

  const normalizePolicy = (value) => {
    const input = value && typeof value === 'object' ? value : {};
    const number = (key, fallback, min = 0, max = Number.POSITIVE_INFINITY) => {
      const candidate = Number(input[key]);
      return Number.isFinite(candidate) ? Math.min(max, Math.max(min, candidate)) : fallback;
    };
    return {
      version: Math.max(1, Math.floor(number('version', defaultPolicy.version, 1))),
      status: 'Local policy',
      baseRatePerMile: number('baseRatePerMile', defaultPolicy.baseRatePerMile),
      baseFee: number('baseFee', defaultPolicy.baseFee),
      minimumPerVehicle: number('minimumPerVehicle', defaultPolicy.minimumPerVehicle),
      targetMarginPct: number('targetMarginPct', defaultPolicy.targetMarginPct, 0, 95),
      roundingIncrement: Math.max(1, number('roundingIncrement', defaultPolicy.roundingIncrement, 1)),
      smallSuvAdjustment: number('smallSuvAdjustment', defaultPolicy.smallSuvAdjustment),
      suvPickupAdjustment: number('suvPickupAdjustment', defaultPolicy.suvPickupAdjustment),
      largeVehicleAdjustment: number('largeVehicleAdjustment', defaultPolicy.largeVehicleAdjustment),
      oversizedAdjustment: number('oversizedAdjustment', defaultPolicy.oversizedAdjustment),
      enclosedAdjustment: number('enclosedAdjustment', defaultPolicy.enclosedAdjustment),
      inoperableAdjustment: number('inoperableAdjustment', defaultPolicy.inoperableAdjustment),
      additionalVehicleDiscount: number('additionalVehicleDiscount', defaultPolicy.additionalVehicleDiscount),
      urgentPct: number('urgentPct', defaultPolicy.urgentPct, 0, 100),
      flexiblePct: Math.min(0, Math.max(-100, Number.isFinite(Number(input.flexiblePct)) ? Number(input.flexiblePct) : defaultPolicy.flexiblePct)),
      californiaOutboundPct: number('californiaOutboundPct', defaultPolicy.californiaOutboundPct, 0, 100),
      floridaInboundPct: number('floridaInboundPct', defaultPolicy.floridaInboundPct, 0, 100),
      expirationDays: Math.max(1, Math.floor(number('expirationDays', defaultPolicy.expirationDays, 1, 90))),
      updatedAt: input.updatedAt || '',
    };
  };

  const emptyVehicle = () => ({ id: vehicleId(), year: '', make: '', model: '', vehicleClass: 'Sedan', operability: 'Operable' });
  const normalizeVehicle = (vehicle) => ({
    id: String(vehicle?.id || vehicleId()),
    year: String(vehicle?.year || '').trim(),
    make: String(vehicle?.make || '').trim(),
    model: String(vehicle?.model || '').trim(),
    vehicleClass: ['Sedan', 'Small SUV', 'SUV', 'Pickup', 'Large Pickup / Van', 'Oversized'].includes(vehicle?.vehicleClass) ? vehicle.vehicleClass : 'Sedan',
    operability: vehicle?.operability === 'Inoperable' ? 'Inoperable' : 'Operable',
  });
  const normalizeDraft = (value) => {
    const input = value && typeof value === 'object' ? value : {};
    const vehicles = Array.isArray(input.vehicles) && input.vehicles.length ? input.vehicles.map(normalizeVehicle) : [emptyVehicle()];
    return {
      quoteId: String(input.quoteId || '').trim().toUpperCase(),
      pickup: String(input.pickup || '').trim(),
      delivery: String(input.delivery || '').trim(),
      distanceMiles: Math.max(0, Number(input.distanceMiles) || 0),
      transport: input.transport === 'Enclosed' ? 'Enclosed' : 'Open',
      timing: ['Standard', 'Urgent', 'Flexible'].includes(input.timing) ? input.timing : 'Standard',
      customerName: String(input.customerName || '').trim(),
      customerPhone: String(input.customerPhone || '').trim(),
      customerEmail: String(input.customerEmail || '').trim(),
      vehicles,
      savedAt: input.savedAt || '',
    };
  };

  let policy = normalizePolicy(api.store.get(POLICY_SCOPE, defaultPolicy));
  api.store.set(POLICY_SCOPE, policy);
  let draft = normalizeDraft(api.store.get(DRAFT_SCOPE, null));

  const stateFrom = (value) => {
    const text = String(value || '').toUpperCase();
    const match = text.match(/(?:,|\s)([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
    return match?.[1] || '';
  };

  const adjustmentForVehicle = (vehicle, transport, policyValue) => {
    let total = 0;
    if (vehicle.vehicleClass === 'Small SUV') total += policyValue.smallSuvAdjustment;
    else if (vehicle.vehicleClass === 'SUV' || vehicle.vehicleClass === 'Pickup') total += policyValue.suvPickupAdjustment;
    else if (vehicle.vehicleClass === 'Large Pickup / Van') total += policyValue.largeVehicleAdjustment;
    else if (vehicle.vehicleClass === 'Oversized') total += policyValue.oversizedAdjustment;
    if (vehicle.operability === 'Inoperable') total += policyValue.inoperableAdjustment;
    if (transport === 'Enclosed') total += policyValue.enclosedAdjustment;
    return total;
  };

  function calculate(draftValue, policyValue = policy) {
    const vehicleCount = Math.max(1, draftValue.vehicles.length);
    const distance = Math.max(0, Number(draftValue.distanceMiles) || 0);
    const distanceComponent = policyValue.baseFee + (distance * policyValue.baseRatePerMile * vehicleCount);
    let serviceAdjustments = draftValue.vehicles.reduce((sum, vehicle) => sum + adjustmentForVehicle(vehicle, draftValue.transport, policyValue), 0);
    if (vehicleCount > 1) serviceAdjustments -= policyValue.additionalVehicleDiscount * (vehicleCount - 1);
    const subtotal = Math.max(0, distanceComponent + serviceAdjustments);

    const originState = stateFrom(draftValue.pickup);
    const destinationState = stateFrom(draftValue.delivery);
    let marketPct = 0;
    const applied = [];
    if (originState === 'CA') { marketPct += policyValue.californiaOutboundPct; applied.push(`CA outbound +${policyValue.californiaOutboundPct}%`); }
    if (destinationState === 'FL') { marketPct += policyValue.floridaInboundPct; applied.push(`FL inbound +${policyValue.floridaInboundPct}%`); }
    const marketAdjustment = subtotal * (marketPct / 100);

    let timingPct = 0;
    if (draftValue.timing === 'Urgent') { timingPct = policyValue.urgentPct; applied.push(`Urgent +${policyValue.urgentPct}%`); }
    else if (draftValue.timing === 'Flexible') { timingPct = policyValue.flexiblePct; applied.push(`Flexible ${policyValue.flexiblePct}%`); }
    const timingAdjustment = (subtotal + marketAdjustment) * (timingPct / 100);

    const minimum = policyValue.minimumPerVehicle * vehicleCount;
    const rawCustomer = Math.max(minimum, subtotal + marketAdjustment + timingAdjustment);
    const rounding = Math.max(1, policyValue.roundingIncrement);
    const customerPrice = Math.round(rawCustomer / rounding) * rounding;
    const carrierPay = customerPrice * (1 - policyValue.targetMarginPct / 100);

    return {
      customerPrice,
      carrierPay,
      distanceComponent,
      serviceAdjustments,
      marketAdjustment,
      timingAdjustment,
      minimum,
      marginPct: policyValue.targetMarginPct,
      applied,
      vehicleCount,
      distance,
    };
  }

  function snapshotFromPage(page) {
    const vehicles = [...page.querySelectorAll('[data-qc-vehicle]')].map((card) => normalizeVehicle({
      id: card.dataset.qcVehicle,
      year: card.querySelector('[name="year"]')?.value,
      make: card.querySelector('[name="make"]')?.value,
      model: card.querySelector('[name="model"]')?.value,
      vehicleClass: card.querySelector('[name="vehicleClass"]')?.value,
      operability: card.querySelector('[name="operability"]')?.value,
    }));
    return normalizeDraft({
      quoteId: draft.quoteId,
      pickup: page.querySelector('#bpQcPickup')?.value,
      delivery: page.querySelector('#bpQcDelivery')?.value,
      distanceMiles: page.querySelector('#bpQcDistance')?.value,
      transport: page.querySelector('#bpQcTransport')?.value,
      timing: page.querySelector('#bpQcTiming')?.value,
      customerName: page.querySelector('#bpQcCustomerName')?.value,
      customerPhone: page.querySelector('#bpQcCustomerPhone')?.value,
      customerEmail: page.querySelector('#bpQcCustomerEmail')?.value,
      vehicles: vehicles.length ? vehicles : [emptyVehicle()],
      savedAt: draft.savedAt,
    });
  }

  function modalShell() {
    let layer = document.querySelector('#bpQuoteCalculatorModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpQuoteCalculatorModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closePolicyModal() {
    const layer = document.querySelector('#bpQuoteCalculatorModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function openPolicyModal(onCommit) {
    const layer = modalShell();
    layer.hidden = false;
    const field = (name, label, value, step = '1') => `<label><span>${label}</span><input name="${name}" type="number" min="0" step="${step}" value="${escapeHtml(value)}"></label>`;
    layer.innerHTML = `
      <div class="bp-runtime-modal bp-runtime-modal-wide" role="dialog" aria-modal="true" aria-labelledby="bpQcPolicyTitle">
        <div class="bp-runtime-modal-head"><div><h3 id="bpQcPolicyTitle">Pricing Policy</h3><p>Local deterministic policy. No route provider or external market-rate service is connected.</p></div><button type="button" class="bp-runtime-close" data-qc-policy-close aria-label="Close">×</button></div>
        <form id="bpQcPolicyForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            ${field('baseRatePerMile', 'Base rate / mile / vehicle', policy.baseRatePerMile, '0.01')}
            ${field('baseFee', 'Base fee', policy.baseFee, '1')}
            ${field('minimumPerVehicle', 'Minimum / vehicle', policy.minimumPerVehicle, '1')}
            ${field('targetMarginPct', 'Target margin %', policy.targetMarginPct, '0.1')}
            ${field('roundingIncrement', 'Rounding increment', policy.roundingIncrement, '1')}
            ${field('expirationDays', 'Quote expiration days', policy.expirationDays, '1')}
            ${field('smallSuvAdjustment', 'Small SUV adjustment', policy.smallSuvAdjustment, '1')}
            ${field('suvPickupAdjustment', 'SUV / Pickup adjustment', policy.suvPickupAdjustment, '1')}
            ${field('largeVehicleAdjustment', 'Large Pickup / Van adjustment', policy.largeVehicleAdjustment, '1')}
            ${field('oversizedAdjustment', 'Oversized adjustment', policy.oversizedAdjustment, '1')}
            ${field('enclosedAdjustment', 'Enclosed adjustment / vehicle', policy.enclosedAdjustment, '1')}
            ${field('inoperableAdjustment', 'Inoperable adjustment', policy.inoperableAdjustment, '1')}
            ${field('additionalVehicleDiscount', 'Additional vehicle discount', policy.additionalVehicleDiscount, '1')}
            ${field('urgentPct', 'Urgent timing %', policy.urgentPct, '0.1')}
            <label><span>Flexible timing %</span><input name="flexiblePct" type="number" max="0" step="0.1" value="${escapeHtml(policy.flexiblePct)}"></label>
            ${field('californiaOutboundPct', 'California outbound %', policy.californiaOutboundPct, '0.1')}
            ${field('floridaInboundPct', 'Florida inbound %', policy.floridaInboundPct, '0.1')}
          </div>
          <div class="bp-runtime-form-error" id="bpQcPolicyError" hidden></div>
          <div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn" data-qc-policy-close>Cancel</button><button type="submit" class="btn primary">Save Policy</button></div>
        </form>
      </div>`;
    layer.querySelectorAll('[data-qc-policy-close]').forEach((button) => button.addEventListener('click', closePolicyModal));
    const form = layer.querySelector('#bpQcPolicyForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      const next = normalizePolicy({ ...policy, ...values, version: policy.version + 1, updatedAt: now() });
      if (next.baseRatePerMile <= 0 || next.minimumPerVehicle <= 0) {
        const error = layer.querySelector('#bpQcPolicyError');
        error.textContent = 'Base rate and minimum per vehicle must be greater than zero.';
        error.hidden = false;
        return;
      }
      onCommit(next);
      closePolicyModal();
    });
  }

  function vehicleCard(vehicle, index) {
    return `
      <div class="bp-qc-vehicle" data-qc-vehicle="${escapeHtml(vehicle.id)}">
        <div class="bp-qc-vehicle-head"><b>Vehicle ${index + 1}</b><button type="button" class="btn ghost" data-qc-remove-vehicle ${index === 0 ? 'disabled' : ''}>Remove</button></div>
        <div class="bp-runtime-grid">
          <label><span>Year</span><input name="year" inputmode="numeric" value="${escapeHtml(vehicle.year)}"></label>
          <label><span>Make *</span><input name="make" required value="${escapeHtml(vehicle.make)}"></label>
          <label><span>Model *</span><input name="model" required value="${escapeHtml(vehicle.model)}"></label>
          <label><span>Vehicle class</span><select name="vehicleClass">${['Sedan', 'Small SUV', 'SUV', 'Pickup', 'Large Pickup / Van', 'Oversized'].map((value) => `<option ${value === vehicle.vehicleClass ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
          <label><span>Operability</span><select name="operability"><option ${vehicle.operability === 'Operable' ? 'selected' : ''}>Operable</option><option ${vehicle.operability === 'Inoperable' ? 'selected' : ''}>Inoperable</option></select></label>
        </div>
      </div>`;
  }

  function install() {
    const root = document.getElementById('lander-full-review');
    const page = document.querySelector('[data-page="quote-calculator"]');
    if (!root || !page || page.dataset.bpRuntimeQuoteCalculator === '1') return;
    page.dataset.bpRuntimeQuoteCalculator = '1';

    root.querySelector('[data-page="pricing-configuration"]')?.remove();
    ['qcHeaderSaveDraft', 'qcHeaderPricing', 'qcHeaderCalculate'].forEach((id) => root.querySelector(`#${id}`)?.remove());

    page.innerHTML = `
      <div class="head"><div><h1>Quote Calculator</h1><p>Deterministic local pricing using manual route distance and a persisted BrokerPad pricing policy.</p></div><div class="actions"><button type="button" class="btn" data-qc-save>Save Draft</button><button type="button" class="btn" data-qc-policy>Pricing Policy</button><button type="button" class="btn primary" data-qc-calculate>Calculate Quote</button></div></div>
      <div class="bp-qc-layout">
        <div class="stack">
          <section class="card"><div class="cardh"><div><h2>Route & Service</h2><span class="secondary">Distance is manual until a route provider is connected.</span></div><span class="badge amber">Manual distance</span></div><div class="cardb"><div class="bp-runtime-grid">
            <label><span>Pickup *</span><input id="bpQcPickup" required value="${escapeHtml(draft.pickup)}" placeholder="City, State or ZIP"></label>
            <label><span>Delivery *</span><input id="bpQcDelivery" required value="${escapeHtml(draft.delivery)}" placeholder="City, State or ZIP"></label>
            <label><span>Route distance (miles) *</span><input id="bpQcDistance" type="number" min="1" step="1" required value="${draft.distanceMiles || ''}"></label>
            <label><span>Transport</span><select id="bpQcTransport"><option ${draft.transport === 'Open' ? 'selected' : ''}>Open</option><option ${draft.transport === 'Enclosed' ? 'selected' : ''}>Enclosed</option></select></label>
            <label><span>Pickup timing</span><select id="bpQcTiming">${['Standard', 'Urgent', 'Flexible'].map((value) => `<option ${draft.timing === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
          </div></div></section>
          <section class="card"><div class="cardh"><div><h2>Vehicles</h2><span class="secondary">Pricing is calculated per vehicle using the same route distance.</span></div><button type="button" class="btn" data-qc-add-vehicle>+ Add Vehicle</button></div><div class="cardb" id="bpQcVehicles"></div></section>
          <section class="card"><div class="cardh"><h2>Customer & Contact</h2></div><div class="cardb"><div class="bp-runtime-grid">
            <label><span>Name *</span><input id="bpQcCustomerName" required value="${escapeHtml(draft.customerName)}"></label>
            <label><span>Phone</span><input id="bpQcCustomerPhone" value="${escapeHtml(draft.customerPhone)}"></label>
            <label class="bp-runtime-span-2"><span>Email</span><input id="bpQcCustomerEmail" type="email" value="${escapeHtml(draft.customerEmail)}"></label>
          </div></div></section>
        </div>
        <div class="stack">
          <section class="card bp-qc-result-card"><div class="cardh"><div><h2>Quote Estimate</h2><span class="secondary" data-qc-policy-label></span></div><span class="badge green" data-qc-result-state>Ready</span></div><div class="cardb">
            <div class="kpis bp-qc-result-kpis"><div class="kpi"><small>Customer price</small><strong data-qc-customer-price>$0</strong><span>Local estimate</span></div><div class="kpi"><small>Suggested carrier pay</small><strong data-qc-carrier-pay>$0</strong><span>Target margin applied</span></div></div>
            <div class="record"><span>Distance component</span><b data-qc-distance-component>$0</b></div>
            <div class="record"><span>Vehicle / service adjustments</span><b data-qc-service-adjustments>$0</b></div>
            <div class="record"><span>Market adjustment</span><b data-qc-market-adjustment>$0</b></div>
            <div class="record"><span>Timing adjustment</span><b data-qc-timing-adjustment>$0</b></div>
            <div class="record"><span>Minimum floor</span><b data-qc-minimum>$0</b></div>
            <div class="record"><span>Target margin</span><b data-qc-margin>0%</b></div>
            <div class="bp-qc-truth-note">This estimate uses the local BrokerPad pricing policy and the distance entered above. No map, mileage, loadboard or market-rate provider is queried.</div>
          </div></section>
          <section class="card"><div class="cardh"><h2>Quote Draft</h2></div><div class="cardb"><div class="record"><span>Persisted draft</span><b data-qc-saved-state>Not saved</b></div><div class="record"><span>Linked quote</span><b data-qc-linked-quote>Not created</b></div><div class="record"><span>Automatic lead creation</span><span class="badge gray">Disabled</span></div><button type="button" class="btn primary bp-qc-create-quote" data-qc-create-quote>Create Quote Draft</button><div class="bp-runtime-form-error" data-qc-error hidden></div></div></section>
        </div>
      </div>`;

    const vehiclesRoot = page.querySelector('#bpQcVehicles');
    const renderVehicles = () => {
      vehiclesRoot.innerHTML = draft.vehicles.map(vehicleCard).join('');
    };

    const renderResult = () => {
      draft = snapshotFromPage(page);
      const result = calculate(draft, policy);
      const set = (selector, value) => { const node = page.querySelector(selector); if (node) node.textContent = value; };
      set('[data-qc-customer-price]', money(result.customerPrice));
      set('[data-qc-carrier-pay]', money(result.carrierPay));
      set('[data-qc-distance-component]', money(result.distanceComponent));
      set('[data-qc-service-adjustments]', money(result.serviceAdjustments));
      set('[data-qc-market-adjustment]', money(result.marketAdjustment));
      set('[data-qc-timing-adjustment]', money(result.timingAdjustment));
      set('[data-qc-minimum]', money(result.minimum));
      set('[data-qc-margin]', `${result.marginPct.toFixed(1)}%`);
      set('[data-qc-policy-label]', `Policy v${policy.version} · ${policy.baseRatePerMile.toFixed(2)}/mi/vehicle · min ${money(policy.minimumPerVehicle)}/vehicle`);
      set('[data-qc-saved-state]', draft.savedAt ? `Saved ${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(draft.savedAt))}` : 'Not saved');
      set('[data-qc-linked-quote]', draft.quoteId || 'Not created');
      const state = page.querySelector('[data-qc-result-state]');
      if (state) {
        const valid = result.distance > 0 && draft.pickup && draft.delivery && draft.customerName && draft.vehicles.every((vehicle) => vehicle.make && vehicle.model);
        state.textContent = valid ? 'Calculated' : 'Needs input';
        state.className = `badge ${valid ? 'green' : 'amber'}`;
      }
      const create = page.querySelector('[data-qc-create-quote]');
      if (create) create.textContent = draft.quoteId ? 'Update Quote Draft' : 'Create Quote Draft';
      return result;
    };

    const validateDraft = () => {
      const error = page.querySelector('[data-qc-error]');
      const email = draft.customerEmail;
      const missingVehicle = draft.vehicles.some((vehicle) => !vehicle.make || !vehicle.model);
      let message = '';
      if (!draft.pickup || !draft.delivery || draft.distanceMiles <= 0 || !draft.customerName) message = 'Pickup, delivery, positive route distance and customer name are required.';
      else if (missingVehicle) message = 'Vehicle make and model are required for every vehicle.';
      else if (email && !/^\S+@\S+\.\S+$/.test(email)) message = 'Enter a valid customer email address.';
      if (error) {
        error.textContent = message;
        error.hidden = !message;
      }
      return !message;
    };

    const persistDraft = (source = 'quote-calculator.save') => {
      draft = snapshotFromPage(page);
      draft.savedAt = now();
      api.store.set(DRAFT_SCOPE, draft);
      api.events.emit('quote-calculator:changed', { source, quoteId: draft.quoteId });
      api.audit.record(source, 'quote-calculator', draft.quoteId || '', { vehicleCount: draft.vehicles.length, distanceMiles: draft.distanceMiles });
      renderResult();
    };

    const findCustomerId = () => {
      const email = draft.customerEmail.toLowerCase();
      if (!email) return '';
      const customers = api.store.get('customers', []);
      if (!Array.isArray(customers)) return '';
      const matches = customers.filter((customer) => String(customer.email || '').trim().toLowerCase() === email);
      return matches.length === 1 ? matches[0].id : '';
    };

    const vehicleSummary = () => {
      const names = draft.vehicles.map((vehicle) => [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' '));
      if (names.length <= 2) return names.join('; ');
      return `${names.slice(0, 2).join('; ')}; +${names.length - 2} more`;
    };

    const expiresAt = () => {
      const date = new Date();
      date.setDate(date.getDate() + policy.expirationDays);
      return date.toISOString().slice(0, 10);
    };

    const createOrUpdateQuote = () => {
      draft = snapshotFromPage(page);
      const result = renderResult();
      if (!validateDraft()) return;

      const quotes = api.store.get(QUOTE_SCOPE, []);
      const list = Array.isArray(quotes) ? [...quotes] : [];
      const existingIndex = draft.quoteId ? list.findIndex((quote) => quote.id === draft.quoteId && quote.status === 'Draft') : -1;
      const id = existingIndex >= 0 ? draft.quoteId : quoteId();
      const existing = existingIndex >= 0 ? list[existingIndex] : null;
      const quote = {
        id,
        leadId: existing?.leadId || '',
        customerId: existing?.customerId || findCustomerId(),
        contactName: draft.customerName,
        origin: draft.pickup,
        destination: draft.delivery,
        vehicle: vehicleSummary(),
        customerPrice: result.customerPrice,
        carrierPay: result.carrierPay,
        revision: existing?.revision || 1,
        status: 'Draft',
        expiresAt: existing?.expiresAt || expiresAt(),
        notes: `Quote Calculator · manual distance ${Math.round(draft.distanceMiles)} mi · ${draft.vehicles.length} vehicle(s) · policy v${policy.version}`,
        createdAt: existing?.createdAt || now(),
        updatedAt: now(),
        acceptedAt: '',
        orderId: '',
      };
      if (existingIndex >= 0) list[existingIndex] = quote;
      else list.unshift(quote);
      api.store.set(QUOTE_SCOPE, list);
      api.events.emit('quotes:changed', { count: list.length, source: 'quote.calculator' });
      api.audit.record(existingIndex >= 0 ? 'quote.calculator.update' : 'quote.calculator.create', 'quote', id, {
        customerId: quote.customerId,
        customerPrice: quote.customerPrice,
        carrierPay: quote.carrierPay,
        distanceMiles: draft.distanceMiles,
        vehicleCount: draft.vehicles.length,
        policyVersion: policy.version,
      });
      draft.quoteId = id;
      draft.savedAt = now();
      api.store.set(DRAFT_SCOPE, draft);
      renderResult();
    };

    renderVehicles();
    renderResult();

    page.addEventListener('input', (event) => {
      if (event.target.matches('input,select,textarea')) renderResult();
    });
    page.addEventListener('change', (event) => {
      if (event.target.matches('input,select,textarea')) renderResult();
    });
    page.querySelector('[data-qc-add-vehicle]')?.addEventListener('click', () => {
      draft = snapshotFromPage(page);
      draft.vehicles.push(emptyVehicle());
      renderVehicles();
      renderResult();
    });
    vehiclesRoot.addEventListener('click', (event) => {
      const button = event.target.closest('[data-qc-remove-vehicle]');
      if (!button) return;
      const card = button.closest('[data-qc-vehicle]');
      if (!card || draft.vehicles.length <= 1) return;
      draft = snapshotFromPage(page);
      draft.vehicles = draft.vehicles.filter((vehicle) => vehicle.id !== card.dataset.qcVehicle);
      if (!draft.vehicles.length) draft.vehicles = [emptyVehicle()];
      renderVehicles();
      renderResult();
    });
    page.querySelector('[data-qc-calculate]')?.addEventListener('click', () => {
      renderResult();
      validateDraft();
      page.querySelector('.bp-qc-result-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    page.querySelector('[data-qc-save]')?.addEventListener('click', () => persistDraft());
    page.querySelector('[data-qc-policy]')?.addEventListener('click', () => openPolicyModal((next) => {
      policy = next;
      api.store.set(POLICY_SCOPE, policy);
      api.events.emit('quote-calculator:policy-changed', { version: policy.version });
      api.audit.record('quote.calculator.policy.update', 'quote-calculator-policy', String(policy.version), {
        baseRatePerMile: policy.baseRatePerMile,
        minimumPerVehicle: policy.minimumPerVehicle,
        targetMarginPct: policy.targetMarginPct,
      });
      renderResult();
    }));
    page.querySelector('[data-qc-create-quote]')?.addEventListener('click', createOrUpdateQuote);

    api.events.on('customers:changed', renderResult);
    api.audit.record('quote-calculator.module.ready', 'module', 'quote-calculator', {
      policyVersion: policy.version,
      distanceSource: 'manual',
      persistence: true,
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

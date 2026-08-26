(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const SCOPE = 'communications';
  const now = () => new Date().toISOString();
  const uid = () => `CONV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const messageId = () => `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const channels = ['internal', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'website'];
  const externalChannels = channels.filter((channel) => channel !== 'internal');
  const conversationKinds = ['customer', 'team'];
  const customerStatuses = ['open', 'pending', 'closed'];
  const teamStatuses = ['active', 'archived'];
  const assignees = ['me', 'unassigned'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const titleChannel = (channel) => ({
    internal: 'Internal', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', website: 'Website',
  }[channel] || channel);

  const initialConversations = [
    {
      id: 'CONV-1001', kind: 'customer', key: 'alex', name: 'Alex Morgan', initials: 'AM', channel: 'whatsapp', status: 'open', assignee: 'me', participantIds: [],
      customerId: 'CUS-1001', leadId: 'LD-1001', quoteId: 'QT-1001', orderId: 'OR-1001', priority: 'Normal',
      phone: '(305) 555-0181', email: 'alex@example.com', subject: 'Pickup window confirmation', unread: 2,
      createdAt: '2026-08-26T11:08:00.000Z', updatedAt: '2026-08-26T11:26:00.000Z',
      messages: [
        { id: 'MSG-1001', kind: 'inbound', body: 'Hi, I received the quote. Is pickup between Aug 25 and 27 still available?', author: 'Alex Morgan', channel: 'whatsapp', at: '2026-08-26T11:08:00.000Z' },
        { id: 'MSG-1002', kind: 'outbound', body: 'Yes. We can keep that pickup window. I just need confirmation that the vehicle is running and accessible.', author: 'Jordan Lee', channel: 'whatsapp', at: '2026-08-26T11:11:00.000Z' },
        { id: 'MSG-1003', kind: 'inbound', body: 'Yes, the pickup window works for me. The vehicle runs and drives.', author: 'Alex Morgan', channel: 'whatsapp', at: '2026-08-26T11:26:00.000Z' },
        { id: 'MSG-1004', kind: 'note', body: 'Northstar is available for this lane. Carrier pay target is $925.', author: 'Taylor Kim · Dispatch', channel: 'internal', at: '2026-08-26T11:27:00.000Z' },
      ],
    },
    {
      id: 'CONV-1002', kind: 'team', key: 'northstar', name: 'Northstar Vehicle Transport', initials: 'NV', channel: 'internal', status: 'active', assignee: 'me', participantIds: [],
      customerId: '', leadId: '', quoteId: '', orderId: 'OR-1001', priority: 'Normal', phone: '', email: 'dispatch@northstar.example', subject: 'Carrier docs approved', unread: 0,
      createdAt: '2026-08-26T11:14:00.000Z', updatedAt: '2026-08-26T11:18:00.000Z',
      messages: [{ id: 'MSG-1101', kind: 'team', body: 'Carrier documents were approved. Ready to dispatch.', author: 'Dispatch Team', channel: 'internal', at: '2026-08-26T11:18:00.000Z' }],
    },
    {
      id: 'CONV-1003', kind: 'customer', key: 'sofia', name: 'Sofia Ramirez', initials: 'SR', channel: 'instagram', status: 'open', assignee: 'unassigned', participantIds: [],
      customerId: '', leadId: '', quoteId: '', orderId: '', priority: 'Normal', phone: '', email: '', subject: 'SUV shipping inquiry', unread: 1,
      createdAt: '2026-08-26T11:03:00.000Z', updatedAt: '2026-08-26T11:12:00.000Z',
      messages: [{ id: 'MSG-1201', kind: 'inbound', body: 'How much would it cost to ship my SUV to Texas?', author: 'Sofia Ramirez', channel: 'instagram', at: '2026-08-26T11:12:00.000Z' }],
    },
    {
      id: 'CONV-1004', kind: 'customer', key: 'web', name: 'James Davis', initials: 'JD', channel: 'website', status: 'pending', assignee: 'unassigned', participantIds: [],
      customerId: '', leadId: '', quoteId: '', orderId: '', priority: 'High', phone: '', email: '', subject: 'Two vehicle quote', unread: 0,
      createdAt: '2026-08-26T10:55:00.000Z', updatedAt: '2026-08-26T11:06:00.000Z',
      messages: [{ id: 'MSG-1301', kind: 'inbound', body: 'I need help with a quote for two vehicles.', author: 'James Davis', channel: 'website', at: '2026-08-26T11:06:00.000Z' }],
    },
  ];

  function activeUsers() {
    if (window.BrokerPadDirectory?.activeUsers) return window.BrokerPadDirectory.activeUsers();
    const rows = api.store.get('users', []);
    return Array.isArray(rows) ? rows.filter((user) => user.status === 'Active') : [];
  }

  function allUsers() {
    if (window.BrokerPadDirectory?.list) return window.BrokerPadDirectory.list();
    const rows = api.store.get('users', []);
    return Array.isArray(rows) ? rows : [];
  }

  const normalizeMessage = (message, conversationKind, conversationChannel) => {
    let kind = String(message.kind || '').trim();
    if (conversationKind === 'team') {
      kind = 'team';
    } else if (!['inbound', 'outbound', 'note'].includes(kind)) {
      kind = kind === 'team' ? 'note' : 'outbound';
    }
    const channel = kind === 'note' || kind === 'team'
      ? 'internal'
      : externalChannels.includes(message.channel) ? message.channel : conversationChannel;
    return {
      id: message.id || messageId(),
      kind,
      body: String(message.body || '').trim(),
      author: String(message.author || '').trim(),
      channel,
      delivery: kind === 'outbound' ? String(message.delivery || 'local-only').trim() : '',
      at: message.at || now(),
    };
  };

  const normalize = (row) => {
    const inferredKind = conversationKinds.includes(row.kind)
      ? row.kind
      : row.channel === 'internal' ? 'team' : 'customer';
    const channel = inferredKind === 'team'
      ? 'internal'
      : externalChannels.includes(row.channel) ? row.channel : 'website';
    let status;
    if (inferredKind === 'team') {
      status = teamStatuses.includes(row.status) ? row.status : row.status === 'closed' ? 'archived' : 'active';
    } else {
      status = customerStatuses.includes(row.status) ? row.status : row.status === 'archived' ? 'closed' : 'open';
    }
    const participantIds = Array.isArray(row.participantIds)
      ? [...new Set(row.participantIds.map((id) => String(id || '').trim().toUpperCase()).filter(Boolean))]
      : [];
    return {
      id: row.id || uid(),
      kind: inferredKind,
      key: String(row.key || row.id || uid()).trim(),
      name: String(row.name || '').trim(),
      initials: String(row.initials || '').trim().slice(0, 3).toUpperCase() || '—',
      channel,
      status,
      assignee: assignees.includes(row.assignee) ? row.assignee : 'unassigned',
      participantIds,
      customerId: inferredKind === 'customer' ? String(row.customerId || '').trim().toUpperCase() : '',
      leadId: inferredKind === 'customer' ? String(row.leadId || '').trim().toUpperCase() : '',
      quoteId: inferredKind === 'customer' ? String(row.quoteId || '').trim().toUpperCase() : '',
      orderId: String(row.orderId || '').trim().toUpperCase(),
      priority: String(row.priority || 'Normal').trim() || 'Normal',
      phone: inferredKind === 'customer' ? String(row.phone || '').trim() : '',
      email: String(row.email || '').trim(),
      subject: String(row.subject || '').trim(),
      unread: Math.max(0, Number(row.unread) || 0),
      messages: Array.isArray(row.messages) ? row.messages.map((message) => normalizeMessage(message, inferredKind, channel)) : [],
      createdAt: row.createdAt || now(),
      updatedAt: row.updatedAt || now(),
    };
  };

  function ensureSeed() {
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) {
      const normalized = existing.map(normalize);
      api.store.set(SCOPE, normalized);
      return normalized;
    }
    const seeded = initialConversations.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('communications.seed', 'conversation', '', { count: seeded.length });
    return seeded;
  }

  function save(rows, source = 'communications') {
    const normalized = rows.map(normalize);
    api.store.set(SCOPE, normalized);
    api.events.emit('communications:changed', { count: normalized.length, source });
  }

  const relative = (iso) => {
    const ts = Date.parse(iso || '');
    if (!Number.isFinite(ts)) return '—';
    const minutes = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (minutes < 60) return `${minutes || 1}m`;
    const hours = Math.floor(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  };

  const timeText = (iso) => {
    const d = new Date(iso || '');
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d);
  };

  const isClosed = (row) => row?.kind === 'team' ? row.status === 'archived' : row?.status === 'closed';

  function customerFor(row) {
    if (!row?.customerId) return null;
    const rows = api.store.get('customers', []);
    return Array.isArray(rows) ? rows.find((customer) => customer.id === row.customerId) || null : null;
  }

  function contactBlocked(row, composeMode) {
    if (!row || row.kind !== 'customer' || composeMode === 'note') return false;
    return customerFor(row)?.status === 'Do Not Contact';
  }

  function participantNames(row) {
    if (row?.kind !== 'team') return [];
    const ids = new Set(row.participantIds || []);
    return allUsers().filter((user) => ids.has(user.id)).map((user) => user.name || user.id);
  }

  function modalShell() {
    let layer = document.querySelector('#bpCommunicationModalLayer');
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'bpCommunicationModalLayer';
    layer.className = 'bp-runtime-modal-layer';
    layer.hidden = true;
    document.body.appendChild(layer);
    return layer;
  }

  function closeModal() {
    const layer = document.querySelector('#bpCommunicationModalLayer');
    if (!layer) return;
    layer.hidden = true;
    layer.innerHTML = '';
  }

  function linkedRecordExists(scope, id) {
    if (!id) return true;
    const rows = api.store.get(scope, []);
    return Array.isArray(rows) && rows.some((row) => String(row.id || '').toUpperCase() === id);
  }

  function openNewConversation(internalOnly, onCommit) {
    const layer = modalShell();
    layer.hidden = false;
    const users = activeUsers();
    const userOptions = users.map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name || user.id)} · ${escapeHtml(user.role || 'Member')} · ${escapeHtml(user.id)}</option>`).join('');
    const channelOptions = externalChannels.map((value) => `<option value="${value}">${titleChannel(value)}</option>`).join('');
    const identityFields = internalOnly
      ? `<label class="bp-runtime-span-2"><span>Participants *</span><select name="participantIds" multiple size="${Math.min(6, Math.max(3, users.length || 3))}" required>${userOptions}</select><small class="secondary">Only active users from Settings → Users & Roles are available.</small></label><input type="hidden" name="channel" value="internal">`
      : `<label class="bp-runtime-span-2"><span>Name *</span><input name="name" required></label><label><span>Channel</span><select name="channel">${channelOptions}</select></label><label><span>Assignee</span><select name="assignee"><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></label><label><span>Customer ID</span><input name="customerId" placeholder="CUS-1001"></label><label><span>Order ID</span><input name="orderId" placeholder="OR-1001"></label>`;

    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="bpCommNewTitle">
        <div class="bp-runtime-modal-head">
          <div><h3 id="bpCommNewTitle">${internalOnly ? 'New Internal Conversation' : 'New Customer Conversation'}</h3><p>${internalOnly ? 'Team conversations use active BrokerPad user IDs.' : 'External channels remain local until credentials are configured in Settings → Integrations.'}</p></div>
          <button type="button" class="bp-runtime-close" data-comm-close aria-label="Close">×</button>
        </div>
        <form id="bpCommNewForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            ${identityFields}
            <label class="bp-runtime-span-2"><span>Subject</span><input name="subject"></label>
            <label class="bp-runtime-span-2"><span>First message</span><textarea name="body" rows="4"></textarea></label>
          </div>
          <div class="bp-runtime-form-error" id="bpCommNewError" hidden></div>
          <div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn" data-comm-close>Cancel</button><button type="submit" class="btn primary">Create Conversation</button></div>
        </form>
      </div>`;
    layer.querySelectorAll('[data-comm-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpCommNewForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const values = Object.fromEntries(formData.entries());
      const error = layer.querySelector('#bpCommNewError');
      const body = String(values.body || '').trim();

      if (internalOnly) {
        const participantIds = [...new Set(formData.getAll('participantIds').map((id) => String(id).toUpperCase()))];
        const currentActiveUsers = activeUsers();
        const participants = participantIds.map((id) => currentActiveUsers.find((user) => user.id === id)).filter(Boolean);
        if (!participantIds.length || participants.length !== participantIds.length) {
          error.textContent = 'Select one or more active BrokerPad users.';
          error.hidden = false;
          return;
        }
        const name = participants.map((user) => user.name || user.id).join(', ');
        const initials = participants.slice(0, 2).map((user) => String(user.name || user.id).trim()[0] || '').join('').toUpperCase();
        const conversation = normalize({
          kind: 'team',
          name,
          initials,
          channel: 'internal',
          status: 'active',
          assignee: 'me',
          participantIds,
          subject: values.subject,
          messages: body ? [{ kind: 'team', body, author: 'Current User', channel: 'internal', at: now() }] : [],
        });
        onCommit(conversation);
        closeModal();
        return;
      }

      const customerId = String(values.customerId || '').trim().toUpperCase();
      const orderId = String(values.orderId || '').trim().toUpperCase();
      const name = String(values.name || '').trim();
      const channel = String(values.channel || 'website');
      if (!name) {
        error.textContent = 'Conversation name is required.';
        error.hidden = false;
        return;
      }
      if (!externalChannels.includes(channel)) {
        error.textContent = 'Customer conversations must use an external channel.';
        error.hidden = false;
        return;
      }
      if (customerId && !linkedRecordExists('customers', customerId)) {
        error.textContent = `Customer ${customerId} does not exist.`;
        error.hidden = false;
        return;
      }
      if (orderId && !linkedRecordExists('orders', orderId)) {
        error.textContent = `Order ${orderId} does not exist.`;
        error.hidden = false;
        return;
      }
      const linkedCustomer = customerId ? customerFor({ customerId }) : null;
      if (body && linkedCustomer?.status === 'Do Not Contact') {
        error.textContent = `${linkedCustomer.name || customerId} is marked Do Not Contact. Create the conversation without an external first message.`;
        error.hidden = false;
        api.audit.record('conversation.contact.blocked', 'customer', customerId, { channel, reason: 'do_not_contact_first_message' });
        return;
      }
      const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
      const conversation = normalize({
        kind: 'customer',
        name,
        initials,
        channel,
        status: 'open',
        assignee: values.assignee,
        customerId,
        orderId,
        subject: values.subject,
        messages: body ? [{ kind: 'outbound', body, author: 'Current User', channel, delivery: 'local-only', at: now() }] : [],
      });
      onCommit(conversation);
      closeModal();
    });
  }

  function install() {
    const page = document.querySelector('[data-page="communications"]');
    if (!page || page.dataset.bpRuntimeCommunications === '1') return;
    page.dataset.bpRuntimeCommunications = '1';

    const list = page.querySelector('#commList');
    const search = page.querySelector('#commSearch');
    const statusFilter = page.querySelector('#commStatusFilter');
    const assigneeFilter = page.querySelector('#commAssigneeFilter');
    const composer = page.querySelector('#commComposer');
    const sendButton = page.querySelector('#commSend');
    const messages = page.querySelector('#commMessages');
    if (!list || !search || !statusFilter || !assigneeFilter || !composer || !sendButton || !messages) return;

    statusFilter.innerHTML = '<option value="all">All statuses</option><option value="open">Open</option><option value="pending">Pending</option><option value="active">Active team</option><option value="closed">Closed / archived</option>';

    let conversations = ensureSeed();
    let activeId = conversations[0]?.id || '';
    let activeChannelFilter = 'all';
    let composeMode = 'reply';

    const stateBadge = page.querySelector('#commStateBadge');
    const activeName = page.querySelector('#commActiveName');
    const activeMeta = page.querySelector('#commActiveMeta');
    const activeAvatar = page.querySelector('#commActiveAvatar');
    const detailName = page.querySelector('#commDetailName');
    const detailAvatar = page.querySelector('#commDetailAvatar');
    const assigneeText = page.querySelector('#commAssignee');

    const channelButtons = [...page.querySelectorAll('.comm-channel[data-channel]')];
    const composeButtons = [...page.querySelectorAll('[data-compose]')];
    const conversationActions = page.querySelector('.comm-conversation-actions');
    if (conversationActions && !conversationActions.querySelector('[data-comm-toggle-status]')) {
      conversationActions.insertAdjacentHTML('afterbegin', '<button type="button" class="btn" data-comm-toggle-status>Close</button>');
    }

    let localNotice = page.querySelector('[data-comm-local-notice]');
    if (!localNotice) {
      localNotice = document.createElement('div');
      localNotice.dataset.commLocalNotice = '1';
      localNotice.className = 'bp-local-only-notice';
      localNotice.textContent = 'External messages are stored locally only until channel credentials/webhooks are configured in Settings → Integrations.';
      page.querySelector('.comm-conversation-head')?.after(localNotice);
    }

    let contactNotice = page.querySelector('[data-bp-contact-policy-notice]');
    if (!contactNotice) {
      contactNotice = document.createElement('div');
      contactNotice.dataset.bpContactPolicyNotice = '1';
      contactNotice.className = 'bp-contact-policy-notice';
      contactNotice.hidden = true;
      composer.parentElement?.insertBefore(contactNotice, composer);
    }

    function current() {
      return conversations.find((row) => row.id === activeId) || conversations[0] || null;
    }

    function channelMatch(row) {
      if (activeChannelFilter === 'all') return true;
      if (activeChannelFilter === 'mine') return row.assignee === 'me' && !isClosed(row);
      if (activeChannelFilter === 'unassigned') return row.assignee === 'unassigned' && !isClosed(row);
      if (activeChannelFilter === 'closed') return isClosed(row);
      return row.channel === activeChannelFilter;
    }

    function filteredRows() {
      const query = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const assignee = assigneeFilter.value;
      return conversations.filter((row) => {
        if (!channelMatch(row)) return false;
        if (status === 'closed' && !isClosed(row)) return false;
        if (status !== 'all' && status !== 'closed' && row.status !== status) return false;
        if (assignee === 'me' && row.assignee !== 'me') return false;
        if (assignee === 'unassigned' && row.assignee !== 'unassigned') return false;
        return !query || [row.name, row.subject, row.customerId, row.leadId, row.quoteId, row.orderId, row.channel, row.kind, ...participantNames(row), ...(row.messages || []).map((message) => message.body)].join(' ').toLowerCase().includes(query);
      }).sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
    }

    function updateChannelCounts() {
      channelButtons.forEach((button) => {
        const key = button.dataset.channel;
        let count = 0;
        if (key === 'all') count = conversations.filter((row) => !isClosed(row)).length;
        else if (key === 'mine') count = conversations.filter((row) => row.assignee === 'me' && !isClosed(row)).length;
        else if (key === 'unassigned') count = conversations.filter((row) => row.assignee === 'unassigned' && !isClosed(row)).length;
        else if (key === 'closed') count = conversations.filter(isClosed).length;
        else count = conversations.filter((row) => row.channel === key && !isClosed(row)).length;
        const badge = button.querySelector('b');
        if (badge) badge.textContent = String(count);
      });
    }

    function renderList() {
      const rows = filteredRows();
      if (!rows.some((row) => row.id === activeId) && rows[0]) activeId = rows[0].id;
      list.innerHTML = rows.length ? rows.map((row) => {
        const latest = row.messages[row.messages.length - 1];
        const source = row.kind === 'team' ? 'Team' : titleChannel(row.channel);
        return `<button type="button" class="comm-thread ${row.id === activeId ? 'active' : ''}" data-conversation-id="${escapeHtml(row.id)}" data-channel="${escapeHtml(row.channel)}" data-status="${escapeHtml(row.status)}" data-assignee="${escapeHtml(row.assignee)}" data-kind="${escapeHtml(row.kind)}">
          <span class="comm-avatar">${escapeHtml(row.initials)}</span>
          <span class="comm-thread-main"><span class="comm-thread-top"><b>${escapeHtml(row.name)}</b><time>${escapeHtml(relative(row.updatedAt))}</time></span>
          <span class="comm-thread-meta"><span class="comm-source ${escapeHtml(row.channel)}">${escapeHtml(source)}</span><span class="comm-dot"></span><span>${escapeHtml(row.subject || row.status)}</span></span>
          <span class="comm-preview">${escapeHtml(latest?.body || 'No messages yet')}</span></span>${row.unread ? `<span class="comm-unread">${row.unread}</span>` : ''}</button>`;
      }).join('') : '<div class="secondary bp-empty-cell">No conversations match the current filters.</div>';
      updateChannelCounts();
      renderConversation();
    }

    function renderConversation() {
      const row = current();
      if (!row) {
        messages.innerHTML = '<div class="secondary bp-empty-cell">Select or create a conversation.</div>';
        composer.disabled = true;
        sendButton.disabled = true;
        return;
      }
      if (row.unread) {
        row.unread = 0;
        row.updatedAt = row.updatedAt || now();
        save(conversations, 'conversation.read');
      }
      const teamNames = participantNames(row);
      if (activeName) activeName.textContent = row.name;
      if (activeMeta) activeMeta.textContent = row.kind === 'team'
        ? `Team · ${teamNames.length ? teamNames.join(', ') : 'Legacy internal conversation'}${row.orderId ? ` · ${row.orderId}` : ''}`
        : `${titleChannel(row.channel)} · ${row.subject || row.status}${row.orderId ? ` · ${row.orderId}` : ''}`;
      if (activeAvatar) activeAvatar.textContent = row.initials;
      if (detailName) detailName.textContent = row.name;
      if (detailAvatar) detailAvatar.textContent = row.initials;
      if (assigneeText) assigneeText.textContent = row.kind === 'team'
        ? (teamNames.length ? teamNames.join(', ') : 'Legacy internal conversation')
        : row.assignee === 'me' ? 'Current User' : 'Unassigned';
      if (stateBadge) {
        stateBadge.textContent = row.status[0].toUpperCase() + row.status.slice(1);
        stateBadge.className = `badge ${isClosed(row) ? 'gray' : row.status === 'pending' ? 'amber' : 'green'}`;
      }

      const toggle = page.querySelector('[data-comm-toggle-status]');
      if (toggle) toggle.textContent = row.kind === 'team'
        ? row.status === 'archived' ? 'Reopen' : 'Archive'
        : row.status === 'closed' ? 'Reopen' : 'Close';

      const assignButton = page.querySelector('.comm-conversation-actions .btn:not([data-comm-toggle-status])');
      if (assignButton) assignButton.hidden = row.kind === 'team';

      composeButtons.forEach((button) => {
        const noteButton = button.dataset.compose === 'note';
        button.hidden = row.kind === 'team' && noteButton;
        if (row.kind === 'team' && noteButton && button.classList.contains('active')) composeMode = 'reply';
      });
      composeButtons.forEach((button) => button.classList.toggle('active', button.dataset.compose === composeMode));

      const blocked = contactBlocked(row, composeMode);
      composer.disabled = isClosed(row) || blocked;
      sendButton.disabled = isClosed(row) || blocked;
      contactNotice.hidden = !blocked;
      contactNotice.textContent = blocked
        ? `${customerFor(row)?.name || row.name} is marked Do Not Contact. External replies are blocked; internal notes remain available.`
        : '';
      localNotice.hidden = row.kind === 'team';

      composer.placeholder = row.kind === 'team'
        ? 'Message team…'
        : composeMode === 'note' ? 'Add an internal note…' : `Reply through ${titleChannel(row.channel)}…`;
      sendButton.textContent = row.kind === 'team'
        ? 'Send team message'
        : composeMode === 'note' ? 'Add note' : 'Queue local reply';

      messages.innerHTML = '<div class="comm-day">Conversation</div>' + row.messages.map((message) => {
        if (message.kind === 'note' || message.kind === 'team') {
          return `<div class="comm-internal-note"><b>${message.kind === 'team' ? 'Team message' : 'Internal note'}</b><span>${escapeHtml(message.author || 'Current User')} · ${escapeHtml(timeText(message.at))}</span><p>${escapeHtml(message.body)}</p></div>`;
        }
        const klass = message.kind === 'inbound' ? 'inbound' : 'outbound';
        const delivery = message.delivery === 'local-only' ? ' · Local only' : '';
        return `<div class="comm-message ${klass}"><div class="comm-bubble">${escapeHtml(message.body)}</div><span>${escapeHtml(message.author || titleChannel(message.channel))} · ${escapeHtml(timeText(message.at))}${delivery}</span></div>`;
      }).join('');
      messages.scrollTop = messages.scrollHeight;
    }

    function persist(action, metadata = {}) {
      save(conversations, action);
      api.audit.record(action, 'conversation', activeId, metadata);
      renderList();
    }

    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-conversation-id]');
      if (!button) return;
      activeId = button.dataset.conversationId;
      composeMode = 'reply';
      renderList();
    });
    search.addEventListener('input', renderList);
    statusFilter.addEventListener('change', renderList);
    assigneeFilter.addEventListener('change', renderList);

    channelButtons.forEach((button) => button.addEventListener('click', () => {
      activeChannelFilter = button.dataset.channel;
      channelButtons.forEach((item) => item.classList.toggle('active', item === button));
      renderList();
    }));

    composeButtons.forEach((button) => button.addEventListener('click', () => {
      const row = current();
      if (row?.kind === 'team' && button.dataset.compose === 'note') return;
      composeMode = button.dataset.compose;
      composeButtons.forEach((item) => item.classList.toggle('active', item === button));
      renderConversation();
      if (!composer.disabled) composer.focus();
    }));

    const sendCurrent = () => {
      const row = current();
      const body = composer.value.trim();
      if (!row || !body || isClosed(row)) return;
      if (contactBlocked(row, composeMode)) {
        api.audit.record('conversation.contact.blocked', 'conversation', row.id, {
          customerId: row.customerId,
          channel: row.channel,
          reason: 'do_not_contact',
        });
        renderConversation();
        return;
      }
      const kind = row.kind === 'team' ? 'team' : composeMode === 'note' ? 'note' : 'outbound';
      row.messages.push(normalizeMessage({
        kind,
        body,
        author: 'Current User',
        channel: kind === 'outbound' ? row.channel : 'internal',
        delivery: kind === 'outbound' ? 'local-only' : '',
        at: now(),
      }, row.kind, row.channel));
      row.updatedAt = now();
      composer.value = '';
      const action = kind === 'team' ? 'conversation.team.message.added' : kind === 'note' ? 'conversation.note.added' : 'conversation.reply.queued';
      persist(action, { kind: row.kind, channel: row.channel, delivery: kind === 'outbound' ? 'local-only' : 'internal' });
    };

    sendButton.addEventListener('click', sendCurrent);
    composer.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        sendCurrent();
      }
    });

    page.querySelector('[data-comm-toggle-status]')?.addEventListener('click', () => {
      const row = current();
      if (!row) return;
      if (row.kind === 'team') row.status = row.status === 'archived' ? 'active' : 'archived';
      else row.status = row.status === 'closed' ? 'open' : 'closed';
      row.updatedAt = now();
      const action = isClosed(row) ? (row.kind === 'team' ? 'conversation.archived' : 'conversation.closed') : 'conversation.reopened';
      persist(action, { kind: row.kind, channel: row.channel, status: row.status });
    });

    const assignButton = page.querySelector('.comm-conversation-actions .btn:not([data-comm-toggle-status])');
    assignButton?.addEventListener('click', () => {
      const row = current();
      if (!row || row.kind === 'team') return;
      row.assignee = row.assignee === 'me' ? 'unassigned' : 'me';
      row.updatedAt = now();
      persist('conversation.assignment.changed', { assignee: row.assignee });
    });

    page.querySelector('#commNewInternal')?.addEventListener('click', () => openNewConversation(true, (row) => {
      conversations.unshift(row);
      activeId = row.id;
      persist('conversation.create', { kind: 'team', channel: 'internal', participantIds: row.participantIds });
    }));
    page.querySelector('#commNewConversation')?.addEventListener('click', () => openNewConversation(false, (row) => {
      conversations.unshift(row);
      activeId = row.id;
      persist('conversation.create', { kind: 'customer', channel: row.channel, customerId: row.customerId });
    }));

    api.events.on('communications:changed', () => {
      conversations = (api.store.get(SCOPE, []) || []).map(normalize);
      renderList();
    });
    api.events.on('users:changed', renderList);
    api.events.on('customers:changed', renderConversation);

    renderList();
    api.audit.record('communications.module.ready', 'module', 'communications', {
      count: conversations.length,
      customerConversations: conversations.filter((row) => row.kind === 'customer').length,
      teamConversations: conversations.filter((row) => row.kind === 'team').length,
    });
  }

  install();
})();

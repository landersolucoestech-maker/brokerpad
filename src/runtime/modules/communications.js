(() => {
  'use strict';

  const api = window.BrokerPadRuntime;
  if (!api) return;

  const SCOPE = 'communications';
  const now = () => new Date().toISOString();
  const uid = () => `CONV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const messageId = () => `MSG-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const channels = ['internal', 'whatsapp', 'facebook', 'instagram', 'tiktok', 'website'];
  const statuses = ['open', 'pending', 'closed'];
  const assignees = ['me', 'unassigned'];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));

  const titleChannel = (channel) => ({
    internal: 'Internal', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', website: 'Website',
  }[channel] || channel);

  const initialConversations = [
    {
      id: 'CONV-1001', key: 'alex', name: 'Alex Morgan', initials: 'AM', channel: 'whatsapp', status: 'open', assignee: 'me',
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
      id: 'CONV-1002', key: 'northstar', name: 'Northstar Vehicle Transport', initials: 'NV', channel: 'internal', status: 'open', assignee: 'me',
      customerId: '', leadId: '', quoteId: '', orderId: 'OR-1001', priority: 'Normal', phone: '', email: 'dispatch@northstar.example', subject: 'Carrier docs approved', unread: 0,
      createdAt: '2026-08-26T11:14:00.000Z', updatedAt: '2026-08-26T11:18:00.000Z',
      messages: [{ id: 'MSG-1101', kind: 'note', body: 'Carrier documents were approved. Ready to dispatch.', author: 'Dispatch Team', channel: 'internal', at: '2026-08-26T11:18:00.000Z' }],
    },
    {
      id: 'CONV-1003', key: 'sofia', name: 'Sofia Ramirez', initials: 'SR', channel: 'instagram', status: 'open', assignee: 'unassigned',
      customerId: '', leadId: '', quoteId: '', orderId: '', priority: 'Normal', phone: '', email: '', subject: 'SUV shipping inquiry', unread: 1,
      createdAt: '2026-08-26T11:03:00.000Z', updatedAt: '2026-08-26T11:12:00.000Z',
      messages: [{ id: 'MSG-1201', kind: 'inbound', body: 'How much would it cost to ship my SUV to Texas?', author: 'Sofia Ramirez', channel: 'instagram', at: '2026-08-26T11:12:00.000Z' }],
    },
    {
      id: 'CONV-1004', key: 'web', name: 'James Davis', initials: 'JD', channel: 'website', status: 'pending', assignee: 'unassigned',
      customerId: '', leadId: '', quoteId: '', orderId: '', priority: 'High', phone: '', email: '', subject: 'Two vehicle quote', unread: 0,
      createdAt: '2026-08-26T10:55:00.000Z', updatedAt: '2026-08-26T11:06:00.000Z',
      messages: [{ id: 'MSG-1301', kind: 'inbound', body: 'I need help with a quote for two vehicles.', author: 'James Davis', channel: 'website', at: '2026-08-26T11:06:00.000Z' }],
    },
  ];

  const normalizeMessage = (message) => ({
    id: message.id || messageId(),
    kind: ['inbound', 'outbound', 'note'].includes(message.kind) ? message.kind : 'outbound',
    body: String(message.body || '').trim(),
    author: String(message.author || '').trim(),
    channel: channels.includes(message.channel) ? message.channel : 'internal',
    delivery: String(message.delivery || (message.kind === 'outbound' ? 'local-only' : '')).trim(),
    at: message.at || now(),
  });

  const normalize = (row) => ({
    id: row.id || uid(),
    key: String(row.key || row.id || uid()).trim(),
    name: String(row.name || '').trim(),
    initials: String(row.initials || '').trim().slice(0, 3).toUpperCase() || '—',
    channel: channels.includes(row.channel) ? row.channel : 'internal',
    status: statuses.includes(row.status) ? row.status : 'open',
    assignee: assignees.includes(row.assignee) ? row.assignee : 'unassigned',
    customerId: String(row.customerId || '').trim(),
    leadId: String(row.leadId || '').trim(),
    quoteId: String(row.quoteId || '').trim(),
    orderId: String(row.orderId || '').trim(),
    priority: String(row.priority || 'Normal').trim() || 'Normal',
    phone: String(row.phone || '').trim(),
    email: String(row.email || '').trim(),
    subject: String(row.subject || '').trim(),
    unread: Math.max(0, Number(row.unread) || 0),
    messages: Array.isArray(row.messages) ? row.messages.map(normalizeMessage) : [],
    createdAt: row.createdAt || now(),
    updatedAt: row.updatedAt || now(),
  });

  function ensureSeed() {
    const existing = api.store.get(SCOPE, null);
    if (Array.isArray(existing)) return existing.map(normalize);
    const seeded = initialConversations.map(normalize);
    api.store.set(SCOPE, seeded);
    api.audit.record('communications.seed', 'conversation', '', { count: seeded.length });
    return seeded;
  }

  function save(rows, source = 'communications') {
    api.store.set(SCOPE, rows);
    api.events.emit('communications:changed', { count: rows.length, source });
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

  function openNewConversation(internalOnly, onCommit) {
    const layer = modalShell();
    layer.hidden = false;
    const allowed = internalOnly ? ['internal'] : channels;
    layer.innerHTML = `
      <div class="bp-runtime-modal" role="dialog" aria-modal="true">
        <div class="bp-runtime-modal-head">
          <div><h3>${internalOnly ? 'New Internal Conversation' : 'New Conversation'}</h3><p>External channels remain local until their integration credentials are configured.</p></div>
          <button type="button" class="bp-runtime-close" data-comm-close aria-label="Close">×</button>
        </div>
        <form id="bpCommNewForm" class="bp-runtime-form">
          <div class="bp-runtime-grid">
            <label class="bp-runtime-span-2"><span>Name *</span><input name="name" required></label>
            <label><span>Channel</span><select name="channel">${allowed.map((value) => `<option value="${value}">${titleChannel(value)}</option>`).join('')}</select></label>
            <label><span>Assignee</span><select name="assignee"><option value="me">Assigned to me</option><option value="unassigned">Unassigned</option></select></label>
            <label><span>Customer ID</span><input name="customerId" placeholder="CUS-1001"></label>
            <label><span>Order ID</span><input name="orderId" placeholder="OR-1001"></label>
            <label class="bp-runtime-span-2"><span>Subject</span><input name="subject"></label>
            <label class="bp-runtime-span-2"><span>First message / note</span><textarea name="body" rows="4"></textarea></label>
          </div>
          <div class="bp-runtime-modal-foot"><span class="bp-runtime-spacer"></span><button type="button" class="btn" data-comm-close>Cancel</button><button type="submit" class="btn primary">Create Conversation</button></div>
        </form>
      </div>`;
    layer.querySelectorAll('[data-comm-close]').forEach((button) => button.addEventListener('click', closeModal));
    const form = layer.querySelector('#bpCommNewForm');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = Object.fromEntries(new FormData(form).entries());
      if (!String(values.name || '').trim()) return;
      const channel = values.channel;
      const body = String(values.body || '').trim();
      const initials = String(values.name).trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase();
      const conversation = normalize({
        name: values.name,
        initials,
        channel,
        assignee: values.assignee,
        customerId: String(values.customerId || '').toUpperCase(),
        orderId: String(values.orderId || '').toUpperCase(),
        subject: values.subject,
        messages: body ? [{ kind: channel === 'internal' ? 'note' : 'outbound', body, author: 'Current User', channel, delivery: channel === 'internal' ? '' : 'local-only', at: now() }] : [],
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
      localNotice.className = 'secondary';
      localNotice.style.cssText = 'padding:7px 10px;border-bottom:1px solid #e5e7eb;background:#fff8e7;font-size:10px';
      localNotice.textContent = 'External messages are stored locally only until channel credentials/webhooks are configured in Settings → Integrations.';
      page.querySelector('.comm-conversation-head')?.after(localNotice);
    }

    function current() {
      return conversations.find((row) => row.id === activeId) || conversations[0] || null;
    }

    function channelMatch(row) {
      if (activeChannelFilter === 'all') return true;
      if (activeChannelFilter === 'mine') return row.assignee === 'me' && row.status !== 'closed';
      if (activeChannelFilter === 'unassigned') return row.assignee === 'unassigned' && row.status !== 'closed';
      if (activeChannelFilter === 'closed') return row.status === 'closed';
      return row.channel === activeChannelFilter;
    }

    function filteredRows() {
      const query = search.value.trim().toLowerCase();
      const status = statusFilter.value;
      const assignee = assigneeFilter.value;
      return conversations.filter((row) => {
        if (!channelMatch(row)) return false;
        if (status !== 'all' && row.status !== status) return false;
        if (assignee === 'me' && row.assignee !== 'me') return false;
        if (assignee === 'unassigned' && row.assignee !== 'unassigned') return false;
        return !query || [row.name, row.subject, row.customerId, row.orderId, row.channel, ...(row.messages || []).map((message) => message.body)].join(' ').toLowerCase().includes(query);
      });
    }

    function updateChannelCounts() {
      channelButtons.forEach((button) => {
        const key = button.dataset.channel;
        let count = 0;
        if (key === 'all') count = conversations.filter((row) => row.status !== 'closed').length;
        else if (key === 'mine') count = conversations.filter((row) => row.assignee === 'me' && row.status !== 'closed').length;
        else if (key === 'unassigned') count = conversations.filter((row) => row.assignee === 'unassigned' && row.status !== 'closed').length;
        else if (key === 'closed') count = conversations.filter((row) => row.status === 'closed').length;
        else count = conversations.filter((row) => row.channel === key && row.status !== 'closed').length;
        const badge = button.querySelector('b');
        if (badge) badge.textContent = String(count);
      });
    }

    function renderList() {
      const rows = filteredRows();
      if (!rows.some((row) => row.id === activeId) && rows[0]) activeId = rows[0].id;
      list.innerHTML = rows.length ? rows.map((row) => {
        const latest = row.messages[row.messages.length - 1];
        return `<button type="button" class="comm-thread ${row.id === activeId ? 'active' : ''}" data-conversation-id="${escapeHtml(row.id)}" data-channel="${escapeHtml(row.channel)}" data-status="${escapeHtml(row.status)}" data-assignee="${escapeHtml(row.assignee)}">
          <span class="comm-avatar">${escapeHtml(row.initials)}</span>
          <span class="comm-thread-main"><span class="comm-thread-top"><b>${escapeHtml(row.name)}</b><time>${escapeHtml(relative(row.updatedAt))}</time></span>
          <span class="comm-thread-meta"><span class="comm-source ${escapeHtml(row.channel)}">${escapeHtml(titleChannel(row.channel))}</span><span class="comm-dot"></span><span>${escapeHtml(row.subject || row.status)}</span></span>
          <span class="comm-preview">${escapeHtml(latest?.body || 'No messages yet')}</span></span>${row.unread ? `<span class="comm-unread">${row.unread}</span>` : ''}</button>`;
      }).join('') : '<div class="secondary" style="padding:18px;text-align:center">No conversations match the current filters.</div>';
      updateChannelCounts();
      renderConversation();
    }

    function renderConversation() {
      const row = current();
      if (!row) {
        messages.innerHTML = '<div class="secondary" style="padding:20px;text-align:center">Select or create a conversation.</div>';
        return;
      }
      if (row.unread) {
        row.unread = 0;
        row.updatedAt = row.updatedAt || now();
        save(conversations, 'conversation.read');
      }
      if (activeName) activeName.textContent = row.name;
      if (activeMeta) activeMeta.textContent = `${titleChannel(row.channel)} · ${row.subject || row.status}${row.orderId ? ` · ${row.orderId}` : ''}`;
      if (activeAvatar) activeAvatar.textContent = row.initials;
      if (detailName) detailName.textContent = row.name;
      if (detailAvatar) detailAvatar.textContent = row.initials;
      if (assigneeText) assigneeText.textContent = row.assignee === 'me' ? 'Current User' : 'Unassigned';
      if (stateBadge) {
        stateBadge.textContent = row.status[0].toUpperCase() + row.status.slice(1);
        stateBadge.className = `badge ${row.status === 'closed' ? 'gray' : row.status === 'pending' ? 'amber' : 'green'}`;
      }
      const toggle = page.querySelector('[data-comm-toggle-status]');
      if (toggle) toggle.textContent = row.status === 'closed' ? 'Reopen' : 'Close';
      composer.disabled = row.status === 'closed';
      sendButton.disabled = row.status === 'closed';
      composer.placeholder = composeMode === 'note' ? 'Add an internal note…' : `Reply through ${titleChannel(row.channel)}…`;
      sendButton.textContent = composeMode === 'note' ? 'Add note' : (row.channel === 'internal' ? 'Send internal message' : 'Queue local reply');
      messages.innerHTML = '<div class="comm-day">Conversation</div>' + row.messages.map((message) => {
        if (message.kind === 'note') {
          return `<div class="comm-internal-note"><b>Internal note</b><span>${escapeHtml(message.author || 'Current User')} · ${escapeHtml(timeText(message.at))}</span><p>${escapeHtml(message.body)}</p></div>`;
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
      composeMode = button.dataset.compose;
      composeButtons.forEach((item) => item.classList.toggle('active', item === button));
      renderConversation();
      composer.focus();
    }));

    sendButton.addEventListener('click', () => {
      const row = current();
      const body = composer.value.trim();
      if (!row || !body || row.status === 'closed') return;
      const kind = composeMode === 'note' || row.channel === 'internal' ? 'note' : 'outbound';
      row.messages.push(normalizeMessage({
        kind,
        body,
        author: 'Current User',
        channel: kind === 'note' ? 'internal' : row.channel,
        delivery: kind === 'outbound' && row.channel !== 'internal' ? 'local-only' : '',
        at: now(),
      }));
      row.updatedAt = now();
      composer.value = '';
      persist(kind === 'note' ? 'conversation.note.added' : 'conversation.reply.queued', { channel: row.channel, delivery: kind === 'outbound' && row.channel !== 'internal' ? 'local-only' : 'internal' });
    });

    page.querySelector('[data-comm-toggle-status]')?.addEventListener('click', () => {
      const row = current();
      if (!row) return;
      row.status = row.status === 'closed' ? 'open' : 'closed';
      row.updatedAt = now();
      persist(row.status === 'closed' ? 'conversation.closed' : 'conversation.reopened', { channel: row.channel });
    });

    const assignButton = page.querySelector('.comm-conversation-actions .btn:not([data-comm-toggle-status])');
    assignButton?.addEventListener('click', () => {
      const row = current();
      if (!row) return;
      row.assignee = row.assignee === 'me' ? 'unassigned' : 'me';
      row.updatedAt = now();
      persist('conversation.assignment.changed', { assignee: row.assignee });
    });

    page.querySelector('#commNewInternal')?.addEventListener('click', () => openNewConversation(true, (row) => {
      conversations.unshift(row);
      activeId = row.id;
      persist('conversation.create', { channel: row.channel, internal: true });
    }));
    page.querySelector('#commNewConversation')?.addEventListener('click', () => openNewConversation(false, (row) => {
      conversations.unshift(row);
      activeId = row.id;
      persist('conversation.create', { channel: row.channel, internal: row.channel === 'internal' });
    }));

    api.events.on('communications:changed', () => {
      conversations = api.store.get(SCOPE, []).map(normalize);
      renderList();
    });

    renderList();
    api.audit.record('communications.module.ready', 'module', 'communications', { count: conversations.length });
  }

  install();
})();

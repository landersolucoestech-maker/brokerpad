import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'notebook', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

const expectedRenderedNav = [
  'dashboard', 'crm', 'quotes', 'quote-calculator', 'orders', 'carriers',
  'communications', 'documents', 'finance', 'reports', 'audit', 'settings',
];

async function boot(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();
  await expect.poll(() => page.locator('#lander-full-review').evaluate((node) => node.dataset.bpUiSystem || '')).toBe('1');
}

async function assertNoDocumentOverflow(page, viewport, label = 'page') {
  const metrics = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(
    Math.max(metrics.html, metrics.body),
    `${label} widened the document at ${viewport.width}px (html=${metrics.html}, body=${metrics.body}, client=${metrics.client})`,
  ).toBeLessThanOrEqual(Math.max(metrics.client, viewport.width) + 2);
}

async function navItems(page) {
  return page.locator('#nav button').evaluateAll((nodes) => nodes
    .filter((node) => {
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    })
    .map((node) => ({
      key: node.dataset.go || (node.dataset.crmNav ? 'crm' : ''),
      text: (node.textContent || '').trim(),
    }))
    .filter((item) => item.key));
}

function navButton(page, item) {
  return item.key === 'crm'
    ? page.locator('#nav button[data-crm-nav]').first()
    : page.locator(`#nav button[data-go="${item.key}"]`).first();
}

async function openNavItem(page, item, mobile) {
  if (mobile) {
    const toggle = page.locator('.bp-mobile-nav-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  const button = navButton(page, item);
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(button).toHaveClass(/active/);
  await expect(button).toHaveAttribute('aria-current', 'page');
  const active = page.locator('#pages > .page.active');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('aria-hidden', 'false');
  return active;
}

async function assertVisibleTableContracts(active) {
  const tables = active.locator('table');
  for (let tableIndex = 0; tableIndex < await tables.count(); tableIndex++) {
    const table = tables.nth(tableIndex);
    const headers = table.locator('thead th');
    for (let i = 0; i < await headers.count(); i++) await expect(headers.nth(i)).toHaveAttribute('scope', 'col');

    const rows = table.locator('tbody tr');
    if (!(await rows.count())) continue;
    const first = rows.first();
    if (await first.locator('td[colspan]').count()) continue;
    const cellCount = await first.locator('td').count();
    if (cellCount > 1) expect(await headers.count(), 'table header count must match rendered row shape').toBe(cellCount);
  }
}

for (const viewport of viewports) {
  test(`all routed pages are structurally consistent at ${viewport.name}`, async ({ page }) => {
    await boot(page, viewport);
    const items = await navItems(page);
    expect(items.map((item) => item.key)).toEqual(expectedRenderedNav);

    for (const item of items) {
      const active = await openNavItem(page, item, viewport.width <= 800);
      await assertNoDocumentOverflow(page, viewport, item.key);
      await assertVisibleTableContracts(active);
    }

    if (viewport.width > 800) {
      const sidebar = await page.locator('.sidebar').boundingBox();
      expect(sidebar).not.toBeNull();
      expect(sidebar.height).toBeGreaterThanOrEqual(viewport.height - 2);
    } else {
      const toggle = page.locator('.bp-mobile-nav-toggle');
      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.sidebar')).toHaveClass(/is-open/);
      await page.keyboard.press('Escape');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }
  });
}

test('global user menu and tables expose normalized accessibility semantics', async ({ page }) => {
  await boot(page, viewports[0]);
  await expect(page.locator('#userAvatarButton')).toHaveAttribute('aria-label', 'User menu');
  await page.locator('#userAvatarButton').click();
  await expect(page.locator('[data-user-action="profile"]')).toHaveText('My profile');
  await expect(page.locator('[data-user-action="settings"]')).toHaveText('Settings');
  await expect(page.locator('[data-user-action="logout"]')).toHaveText('Sign out');

  const items = await navItems(page);
  const tableOwner = items.find((item) => /crm|orders|carriers|reports/i.test(item.text)) || items[0];
  const active = await openNavItem(page, tableOwner, false);
  const table = active.locator('table').first();
  if (await table.count()) {
    const headers = table.locator('th');
    for (let i = 0; i < await headers.count(); i++) await expect(headers.nth(i)).toHaveAttribute('scope', 'col');
    const wrapper = table.locator('xpath=ancestor::*[@role="region"][1]');
    if (await wrapper.count()) await expect(wrapper).toHaveAttribute('tabindex', '0');
  }
});

test('settings owns users automations integrations and loadboards', async ({ page }) => {
  await boot(page, viewports[0]);
  const items = await navItems(page);
  expect(items.map((item) => item.key)).not.toContain('integrations');
  expect(items.map((item) => item.key)).not.toContain('automations');
  expect(items.map((item) => item.key)).not.toContain('users');
  expect(items.map((item) => item.text.toLowerCase()).some((text) => /load\s*boards?/.test(text))).toBe(false);

  const settings = items.find((item) => item.key === 'settings');
  expect(settings).toBeTruthy();
  const active = await openNavItem(page, settings, false);
  await expect(active).toHaveAttribute('data-bp-runtime-settings', '1');
  await expect(active.locator('[data-settings-tab="users"]')).toBeVisible();
  await expect(active.locator('[data-settings-tab="automations"]')).toBeVisible();
  await expect(active.locator('[data-settings-tab="integrations"]')).toBeVisible();

  await active.locator('[data-settings-tab="integrations"]').click();
  await expect(active.locator('[data-settings-panel="integrations"]')).toBeVisible();
  await expect(active.locator('[data-settings-panel="integrations"]')).toContainText('Loadboards');
  await expect(active.locator('[data-settings-panel="integrations"]')).toContainText('Central Dispatch');
  await expect.poll(() => page.evaluate(() => window.BrokerPadDirectory?.activeUsers?.().length || 0)).toBeGreaterThan(0);
});

test('do not contact blocks external replies but keeps internal notes available', async ({ page }) => {
  await boot(page, viewports[0]);
  const items = await navItems(page);
  const communications = items.find((item) => item.key === 'communications');
  expect(communications).toBeTruthy();
  await openNavItem(page, communications, false);

  await page.evaluate(() => {
    const api = window.BrokerPadRuntime;
    const customers = api.store.get('customers', []);
    const index = customers.findIndex((customer) => customer.id === 'CUS-1001');
    if (index >= 0) customers[index] = { ...customers[index], status: 'Do Not Contact', updatedAt: new Date().toISOString() };
    api.store.set('customers', customers);
    api.events.emit('customers:changed', { count: customers.length, source: 'test.dnc' });
  });

  const thread = page.locator('.comm-thread[data-conversation-id="CONV-1001"]');
  await thread.click();
  const reply = page.locator('[data-compose="reply"]');
  if (await reply.count()) await reply.click();
  await expect(page.locator('#commSend')).toBeDisabled();
  await expect(page.locator('[data-bp-contact-policy-notice]')).toBeVisible();
  await expect(page.locator('[data-bp-contact-policy-notice]')).toContainText('Do Not Contact');

  const note = page.locator('[data-compose="note"]');
  await expect(note).toBeVisible();
  await note.click();
  await expect(page.locator('#commSend')).toBeEnabled();
});

test('modal geometry remains inside a mobile viewport', async ({ page }) => {
  const viewport = viewports[3];
  await boot(page, viewport);
  const items = await navItems(page);
  const crm = items.find((item) => item.key === 'crm');
  expect(crm).toBeTruthy();
  await openNavItem(page, crm, true);

  const create = page.locator('#pages > .page.active .btn.primary').filter({ hasText: /new|create/i }).first();
  if (await create.count()) {
    await create.click();
    const modal = page.locator('.crm-modal-layer.open .crm-modal, .bp-runtime-modal-layer:not([hidden]) .bp-runtime-modal').last();
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Escape');
  }
});

const visualLabels = [/dashboard/i, /crm/i, /quote calculator/i, /communications/i, /reports/i, /settings/i];
for (const viewport of [viewports[0], viewports[3]]) {
  test(`capture representative visual evidence at ${viewport.name}`, async ({ page }, testInfo) => {
    await boot(page, viewport);
    const items = await navItems(page);
    for (const pattern of visualLabels) {
      const item = items.find((candidate) => pattern.test(candidate.text));
      if (!item) continue;
      const active = await openNavItem(page, item, viewport.width <= 800);
      const key = (await active.getAttribute('data-page')) || item.key;
      await assertNoDocumentOverflow(page, viewport, key);
      await page.screenshot({ path: testInfo.outputPath(`${key}-${viewport.name}.png`), fullPage: true });
    }
  });
}

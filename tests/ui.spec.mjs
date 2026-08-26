import { test, expect } from '@playwright/test';

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'notebook', width: 1280, height: 800 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

async function boot(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();
  await expect.poll(() => page.locator('#lander-full-review').evaluate((node) => node.dataset.bpUiSystem || '')).toBe('1');
}

async function assertNoDocumentOverflow(page, viewport) {
  const metrics = await page.evaluate(() => ({
    html: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(Math.max(metrics.html, metrics.body)).toBeLessThanOrEqual(Math.max(metrics.client, viewport.width) + 2);
}

async function navItems(page) {
  return page.locator('#nav button').evaluateAll((nodes) => nodes.map((node, index) => ({
    index,
    text: (node.textContent || '').trim(),
  })));
}

async function openNavItem(page, item, mobile) {
  if (mobile) {
    const toggle = page.locator('.bp-mobile-nav-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  const button = page.locator('#nav button').nth(item.index);
  await button.click();
  await expect(button).toHaveClass(/active/);
  await expect(button).toHaveAttribute('aria-current', 'page');
  const active = page.locator('#pages > .page.active');
  await expect(active).toHaveCount(1);
  await expect(active).toHaveAttribute('aria-hidden', 'false');
  return active;
}

for (const viewport of viewports) {
  test(`all routed pages are structurally consistent at ${viewport.name}`, async ({ page }) => {
    await boot(page, viewport);
    const items = await navItems(page);
    expect(items.length).toBeGreaterThanOrEqual(17);

    for (const item of items) {
      await openNavItem(page, item, viewport.width <= 800);
      await assertNoDocumentOverflow(page, viewport);
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

test('modal geometry remains inside a mobile viewport', async ({ page }) => {
  const viewport = viewports[3];
  await boot(page, viewport);
  const items = await navItems(page);
  const crm = items.find((item) => /crm/i.test(item.text));
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
      const key = (await active.getAttribute('data-page')) || item.text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: testInfo.outputPath(`${key}-${viewport.name}.png`), fullPage: true });
      await assertNoDocumentOverflow(page, viewport);
    }
  });
}

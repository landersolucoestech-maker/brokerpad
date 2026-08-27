import { test, expect } from '@playwright/test';

test('canonical runtime owners neutralize late benchmark surfaces and Orders loadboard actions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();
  await page.waitForTimeout(1800);

  const sentinels = [
    ['[data-page="dashboard"] .bp-benchmark-zone', 'dashboard'],
    ['[data-page="crm"] .bp-lead-intel', 'crm-leads'],
    ['[data-page="crm"] .bp-repeat-intel', 'crm-customers'],
    ['[data-page="quote-calculator"] .bp-pricing-intel', 'quote-calculator'],
    ['[data-page="orders"] .bp-order-benchmark', 'orders'],
    ['[data-page="carriers"] .bp-carrier-network-intel', 'carriers'],
    ['[data-page="communications"] .bp-comm-benchmark', 'communications'],
    ['[data-page="documents"] .bp-doc-benchmark', 'documents'],
    ['[data-page="finance"] .bp-fin-benchmark', 'finance'],
    ['[data-page="settings"] [data-settings-panel="automations"] .bp-auto-benchmark', 'settings-automations'],
    ['[data-page="settings"] [data-settings-panel="integrations"] .bp-integration-benchmark', 'settings-integrations'],
    ['[data-page="settings"] [data-settings-panel="security"] .bp-security-benchmark', 'settings-security'],
  ];

  for (const [selector, owner] of sentinels) {
    const node = page.locator(selector);
    await expect(node, `legacy sentinel missing for ${owner}`).toHaveCount(1);
    await expect(node, `legacy sentinel must stay hidden for ${owner}`).toBeHidden();
    await expect(node).toHaveAttribute('data-bp-legacy-owner', owner);
    await expect.poll(() => node.evaluate((element) => element.childNodes.length)).toBe(0);
  }

  const orders = page.locator('[data-page="orders"]');
  await expect(orders.locator('#orderPostLoadBoards')).toHaveCount(0);
  await expect(orders.locator('[data-lb-order-post]')).toHaveCount(0);

  // Simulate the immutable loadboard enhancer trying to add Orders actions.
  await orders.evaluate((node) => {
    const direct = document.createElement('button');
    direct.id = 'orderPostLoadBoards';
    direct.textContent = 'Post to Load Boards';
    node.appendChild(direct);

    const menu = document.createElement('button');
    menu.dataset.lbOrderPost = 'OR-TEST';
    menu.textContent = 'Post to Load Boards';
    node.appendChild(menu);
  });

  await expect.poll(() => orders.locator('#orderPostLoadBoards,[data-lb-order-post]').count()).toBe(0);

  // Simulate late content entering one sentinel. It must be emptied while the
  // sentinel itself remains to block the legacy install retry.
  const communications = page.locator('[data-page="communications"] .bp-comm-benchmark');
  await communications.evaluate((node) => {
    node.hidden = false;
    node.innerHTML = '<section class="bp-card"><h3>Calling Workspace</h3></section>';
  });
  await expect.poll(() => communications.evaluate((node) => node.childNodes.length)).toBe(0);
  await expect(communications).toBeHidden();
});

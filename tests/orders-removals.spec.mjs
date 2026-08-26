import { test, expect } from '@playwright/test';

test('orders keeps lifecycle and removes benchmark cards permanently', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();

  const ordersNav = page.locator('#nav button[data-go="orders"]').first();
  if (await ordersNav.count()) await ordersNav.click();

  const orders = page.locator('[data-page="orders"]');
  await expect(orders).toHaveClass(/active/);

  await expect(orders.locator('.bp-order-benchmark .bp-lifecycle')).toBeVisible();
  await expect(orders.locator('.bp-order-benchmark > .bp-benchmark-grid')).toHaveCount(0);

  const removed = [
    'Interested Carriers · OR-1001',
    'Carrier Match & Repricing',
    'Master / Sub-Orders',
    'Order Completion Controls',
  ];

  for (const label of removed) {
    await expect(orders, `removed Orders card must stay absent: ${label}`).not.toContainText(label);
  }

  await orders.evaluate((node) => {
    const zone = node.querySelector('.bp-order-benchmark');
    if (!zone) return;
    const grid = document.createElement('div');
    grid.className = 'bp-benchmark-grid';
    grid.innerHTML = '<section class="bp-card"><h3>Interested Carriers · OR-1001</h3></section><section class="bp-card"><h3>Order Completion Controls</h3></section>';
    zone.appendChild(grid);
  });

  await expect.poll(() => orders.locator('.bp-order-benchmark > .bp-benchmark-grid').count()).toBe(0);
  await expect(orders.locator('.bp-order-benchmark .bp-lifecycle')).toBeVisible();
});

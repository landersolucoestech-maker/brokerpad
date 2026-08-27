import { test, expect } from '@playwright/test';

test('dashboard permanently neutralizes legacy benchmark KPIs and cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();
  await expect.poll(() => page.locator('#lander-full-review').evaluate((node) => node.dataset.bpUiSystem || '')).toBe('1');

  const dashboardNav = page.locator('#nav button[data-go="dashboard"]').first();
  if (await dashboardNav.count()) await dashboardNav.click();

  const dashboard = page.locator('[data-page="dashboard"]');
  await expect(dashboard).toHaveClass(/active/);
  await expect(dashboard).toHaveAttribute('data-bp-runtime-dashboard', '1');
  await expect(dashboard).toHaveAttribute('data-bp-dashboard-benchmark-pruned', '1');

  const removedLabels = [
    'Lead response',
    'Quote → Book',
    'Dispatch cycle',
    'Carrier acceptance',
    'Revenue / agent',
    'Follow-up completion',
    'My Work',
    'Acquisition & Revenue Attribution',
    'Customer Experience',
    'Exceptions Requiring Action',
  ];

  for (const label of removedLabels) {
    await expect(dashboard, `removed Dashboard block must stay absent: ${label}`).not.toContainText(label);
  }

  const sentinel = dashboard.locator('.bp-benchmark-zone.bp-runtime-legacy-sentinel');
  await expect(sentinel).toHaveCount(1);
  await expect(sentinel).toBeHidden();
  await expect.poll(() => sentinel.evaluate((node) => node.childNodes.length)).toBe(0);

  // Simulate a late legacy reinjection inside the sentinel. The guard must empty
  // it again without deleting the marker that blocks the immutable retry.
  await sentinel.evaluate((node) => {
    node.hidden = false;
    node.innerHTML = '<div class="bp-metrics"><div class="bp-metric"><small>Lead response</small></div></div><section class="bp-card"><h3>My Work</h3></section>';
  });

  await expect.poll(() => sentinel.evaluate((node) => node.childNodes.length)).toBe(0);
  await expect(sentinel).toBeHidden();
  await expect(dashboard).not.toContainText('Lead response');
  await expect(dashboard).not.toContainText('My Work');
});

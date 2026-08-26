import { test, expect } from '@playwright/test';

test('dashboard permanently removes legacy benchmark KPIs and cards', async ({ page }) => {
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
  await expect(dashboard.locator('.bp-benchmark-zone')).toHaveCount(0);

  // Simulate a late legacy reinjection. The guard must remove the entire zone again.
  await dashboard.evaluate((node) => {
    const legacy = document.createElement('div');
    legacy.className = 'bp-benchmark-zone';
    legacy.innerHTML = '<div class="bp-metrics"><div class="bp-metric"><small>Lead response</small></div></div><section class="bp-card"><h3>My Work</h3></section>';
    node.appendChild(legacy);
  });

  await expect.poll(() => dashboard.locator('.bp-benchmark-zone').count()).toBe(0);
  await expect(dashboard).not.toContainText('Lead response');
  await expect(dashboard).not.toContainText('My Work');
});

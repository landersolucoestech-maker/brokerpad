import { test, expect } from '@playwright/test';

test('carriers removes benchmark cards permanently', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();

  const nav = page.locator('#nav button[data-go="carriers"]').first();
  if (await nav.count()) await nav.click();

  const carriers = page.locator('[data-page="carriers"]');
  await expect(carriers).toHaveClass(/active/);

  for (const label of ['Carrier Onboarding', 'Private Carrier Network']) {
    await expect(carriers, `removed Carriers card must stay absent: ${label}`).not.toContainText(label);
  }

  const legacy = carriers.locator('.bp-carrier-network-intel');
  if (await legacy.count()) {
    await expect(legacy).toBeHidden();
    await expect(legacy.locator(':scope > *')).toHaveCount(0);
  }

  await carriers.evaluate((node) => {
    let zone = node.querySelector('.bp-carrier-network-intel');
    if (!zone) {
      zone = document.createElement('div');
      zone.className = 'bp-carrier-network-intel bp-benchmark-zone';
      node.appendChild(zone);
    }
    zone.innerHTML = '<section class="bp-card"><h3>Carrier Onboarding</h3></section><section class="bp-card"><h3>Private Carrier Network</h3></section>';
  });

  await expect.poll(async () => carriers.locator('.bp-carrier-network-intel > *').count()).toBe(0);
  await expect(carriers).not.toContainText('Carrier Onboarding');
  await expect(carriers).not.toContainText('Private Carrier Network');
});

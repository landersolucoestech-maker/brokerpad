import { test, expect } from '@playwright/test';

const owners = ['dashboard','crm','quotes','quote-calculator','orders','carriers','communications','documents','finance','reports','audit','settings'];
const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
];

async function boot(page, viewport) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();
  await expect.poll(() => page.locator('#lander-full-review').evaluate((node) => node.dataset.bpUiSystem || '')).toBe('1');
}

async function openOwner(page, owner, mobile) {
  if (mobile) {
    const toggle = page.locator('.bp-mobile-nav-toggle');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }
  const nav = owner === 'crm'
    ? page.locator('#nav button[data-crm-nav]').first()
    : page.locator(`#nav button[data-go="${owner}"]`).first();
  await nav.scrollIntoViewIfNeeded();
  await nav.click();
  const active = page.locator('#pages > .page.active');
  await expect(active).toHaveCount(1);
  return active;
}

for (const viewport of viewports) {
  test(`comparative screenshots for every owner at ${viewport.name}`, async ({ page }, testInfo) => {
    await boot(page, viewport);
    for (const owner of owners) {
      const active = await openOwner(page, owner, viewport.width <= 800);
      const documentWidth = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth));
      expect(documentWidth, `${owner} must not widen ${viewport.name} viewport`).toBeLessThanOrEqual(viewport.width + 2);
      await active.screenshot({ path: testInfo.outputPath(`${owner}-${viewport.name}.png`), animations: 'disabled' });
    }
  });
}

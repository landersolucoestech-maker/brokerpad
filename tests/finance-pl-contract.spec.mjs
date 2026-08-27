import { test, expect } from '@playwright/test';

test('Accounting P&L stays aggregate-only without company order or customer breakdowns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();

  const accounting = page.locator('#nav button[data-go="finance"]').first();
  await accounting.click();

  const plNav = page.locator('[data-accounting-section="pl"]').first();
  if (await plNav.count()) await plNav.click();

  const finance = page.locator('[data-page="finance"]');
  await expect(finance).toHaveClass(/active/);
  await expect.poll(() => finance.getAttribute('data-bp-pl-aggregate-only')).toBe('1');

  await expect(finance.locator('#plSearch')).toHaveCount(0);
  await expect(finance.locator('#plContent')).toHaveCount(0);
  await expect(finance.locator('[data-pl-view]')).toHaveCount(0);
  await expect(finance).not.toContainText('Company P&L');
  await expect(finance).not.toContainText('P&L by Order');
  await expect(finance).not.toContainText('P&L by Customer');
  await expect(finance).not.toContainText('Revenue and expenses by category for the selected period.');

  // Preserve the useful aggregate controls and top-level P&L metrics.
  if (await finance.locator('#plStartDate').count()) await expect(finance.locator('#plStartDate')).toBeVisible();
  if (await finance.locator('#plEndDate').count()) await expect(finance.locator('#plEndDate')).toBeVisible();
  if (await finance.locator('#plType').count()) await expect(finance.locator('#plType')).toBeVisible();
  if (await finance.locator('#plMetrics').count()) {
    await expect(finance.locator('#plMetrics')).toBeVisible();
    await expect(finance.locator('#plMetrics')).toContainText('Total Revenue');
    await expect(finance.locator('#plMetrics')).toContainText('Total Expenses');
    await expect(finance.locator('#plMetrics')).toContainText('Net Profit');
  }
});

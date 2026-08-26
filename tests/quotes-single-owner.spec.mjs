import { test, expect } from '@playwright/test';

test('quotes renders one canonical runtime surface', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();

  const quotesNav = page.locator('#nav button[data-go="quotes"]').first();
  if (await quotesNav.count()) await quotesNav.click();

  const quotes = page.locator('[data-page="quotes"]');
  await expect(quotes).toHaveClass(/active/);
  await expect(quotes).toHaveAttribute('data-bp-runtime-quotes', '2');

  await expect(quotes.locator('.bp-quote-benchmark:not(.bp-runtime-benchmark-blocker)')).toHaveCount(0);
  await expect(quotes.locator('.bp-runtime-benchmark-blocker')).toBeHidden();
  await expect(quotes.locator('#quoteNew, [data-bp-new-quote]')).toHaveCount(0);
  await expect(quotes.locator('.head .btn')).toHaveCount(0);
  await expect(page.locator('#lander-full-review > .quote-modal-layer, #lander-full-review > .quote-delete-layer')).toHaveCount(0);

  await expect(quotes.locator('#bpQuoteSearch')).toBeVisible();
  await expect(quotes.locator('#bpQuoteStatusFilter')).toBeVisible();
  await expect(quotes.locator('#bpQuotesTbody')).toBeVisible();
  await expect(page.locator('#quoteHeaderCreate')).toHaveCount(1);
  await expect(page.locator('#quoteHeaderCreate')).toBeVisible();

  await page.waitForTimeout(1500);
  await expect(quotes.locator('.bp-quote-benchmark:not(.bp-runtime-benchmark-blocker)')).toHaveCount(0);

  await page.locator('#quoteHeaderCreate').click();
  await expect(page.locator('#bpQuoteModalLayer')).toBeVisible();
  await expect(page.locator('#bpQuoteModalTitle')).toHaveText('New Quote');
});

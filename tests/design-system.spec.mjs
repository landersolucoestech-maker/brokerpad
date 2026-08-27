import { test, expect } from '@playwright/test';

const desktop = { width: 1440, height: 1000 };
const mobile = { width: 390, height: 844 };
const owners = ['dashboard','crm','quotes','quote-calculator','orders','carriers','communications','documents','finance','reports','audit','settings'];

async function boot(page, viewport = desktop) {
  await page.setViewportSize(viewport);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#lander-full-review')).toBeVisible();
  await expect.poll(() => page.locator('#lander-full-review').evaluate((node) => node.dataset.bpUiSystem || '')).toBe('1');
}

async function openOwner(page, owner, isMobile = false) {
  if (isMobile) {
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

async function canonicalGeometry(active, viewport) {
  const result = await active.evaluate((node) => {
    const visible = (el) => el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const heading = node.querySelector('h1');
    const button = [...node.querySelectorAll('.btn')].find(visible);
    const control = [...node.querySelectorAll('input:not([type="hidden"]):not([type="file"]),select')].find(visible);
    const card = [...node.querySelectorAll('.card,.bp-card')].find(visible);
    const wrapper = [...node.querySelectorAll('.tablewrap,.reports-tablewrap,.quotes-tablewrap,.carrier-table-wrap,.finance-table-wrap,.bp-tablewrap')].find(visible);
    const style = (el) => el ? getComputedStyle(el) : null;
    return {
      headingSize: style(heading)?.fontSize || '',
      headingWeight: style(heading)?.fontWeight || '',
      buttonHeight: button?.getBoundingClientRect().height || 0,
      controlHeight: control?.getBoundingClientRect().height || 0,
      cardRadius: style(card)?.borderRadius || '',
      wrapperOverflowX: style(wrapper)?.overflowX || '',
      pageWidth: node.getBoundingClientRect().width,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      rootBg: getComputedStyle(document.querySelector('#lander-full-review')).backgroundColor,
      rootHeight: document.querySelector('#lander-full-review').getBoundingClientRect().height,
    };
  });

  expect(result.headingSize).toBe(viewport.width <= 520 ? '20px' : '22px');
  expect(Number(result.headingWeight)).toBeGreaterThanOrEqual(700);
  if (result.buttonHeight) {
    expect(result.buttonHeight).toBeGreaterThanOrEqual(30);
    expect(result.buttonHeight).toBeLessThanOrEqual(42);
  }
  if (result.controlHeight) {
    expect(result.controlHeight).toBeGreaterThanOrEqual(30);
    expect(result.controlHeight).toBeLessThanOrEqual(42);
  }
  if (result.cardRadius) expect(result.cardRadius).toBe('8px');
  if (result.wrapperOverflowX) expect(['auto','scroll']).toContain(result.wrapperOverflowX);
  expect(result.pageWidth).toBeLessThanOrEqual(viewport.width + 1);
  expect(result.bodyBg).toBe(result.rootBg);
  expect(result.rootHeight).toBeGreaterThanOrEqual(viewport.height - 1);
}

for (const viewport of [desktop, mobile]) {
  test(`canonical visual metrics hold across every owner at ${viewport.width}px`, async ({ page }) => {
    await boot(page, viewport);
    for (const owner of owners) {
      const active = await openOwner(page, owner, viewport.width <= 800);
      await canonicalGeometry(active, viewport);
    }
  });
}

test('runtime modal traps focus, exposes dialog semantics and restores opener focus', async ({ page }) => {
  await boot(page, desktop);
  await openOwner(page, 'quotes', false);

  const opener = page.locator('#quoteHeaderCreate');
  await expect(opener).toBeVisible();
  await opener.focus();
  await opener.click();

  const modal = page.locator('.bp-runtime-modal-layer:not([hidden]) .bp-runtime-modal').last();
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');
  await expect(modal).toHaveAttribute('aria-labelledby', /.+/);
  await expect.poll(() => modal.evaluate((node) => node.contains(document.activeElement))).toBe(true);

  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || '')).toBe('quoteHeaderCreate');
});

test('mobile sidebar owns scroll lock without inline document styles', async ({ page }) => {
  await boot(page, mobile);
  const toggle = page.locator('.bp-mobile-nav-toggle');
  await toggle.click();
  await expect(page.locator('html')).toHaveClass(/bp-scroll-locked/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).not.toHaveClass(/bp-scroll-locked/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

test('account menu is normalized and keyboard-closeable', async ({ page }) => {
  await boot(page, desktop);
  const button = page.locator('#userAvatarButton');
  await expect(button).toHaveAttribute('aria-label', 'User menu');
  await expect(button).toHaveAttribute('aria-haspopup', 'true');
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  const menu = page.locator('#userDropdown');
  await expect(menu).toBeVisible();
  await expect(menu).toHaveAttribute('role', 'menu');
  await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeHidden();
});

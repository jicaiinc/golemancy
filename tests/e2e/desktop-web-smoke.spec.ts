import { expect, test } from '@playwright/test';

test('desktop UI renders the product shell through the auxiliary Vite path', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Golemancy').first()).toBeVisible();
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.main')).toBeVisible();
  await expect(page.locator('textarea.composer__input')).toBeVisible();
});

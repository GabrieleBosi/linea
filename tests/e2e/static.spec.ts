// What only the static demo build does: the replay banner, the replayed memo and cover text, the
// manual path when no recording matches, the data kept per tab, and the reset without a token.
// npm run e2e

import { expect, test, type Page } from '@playwright/test'
import { isStatic } from './target'

test.skip(!isStatic, 'Static demo build only.')

async function runSteps(page: Page, ids: string[]): Promise<void> {
  await page.goto('/design/scenarios/a')
  for (const [i, id] of ids.entries()) {
    await page.getByRole('button', { name: `Run next step (${id})` }).click()
    await expect(page.getByText(`${i + 1} of 11 done`)).toBeVisible({ timeout: 30_000 })
  }
}

async function requestUrl(page: Page): Promise<string> {
  const href = await page.locator('li', { hasText: 'Approve the scripted lines' }).getByRole('link', { name: 'Open screen' }).getAttribute('href')
  expect(href).toBeTruthy()
  return href ?? ''
}

test('the landing page tells the case and leads into scenario A', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('quote-to-order')
  await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
  await expect(page.getByText('8 of 8')).toBeVisible()
  await page.getByRole('link', { name: 'Run scenario A' }).first().click()
  await expect(page).toHaveURL(/\/design\/scenarios\/a$/)
  await expect(page.getByText('0 of 11 done')).toBeVisible()
})

test('the header says the AI steps replay, and has no Live switch', async ({ page }) => {
  await page.goto('/requests')
  await expect(page.getByRole('note')).toContainText('AI steps replay recorded model outputs')
  await expect(page.getByRole('group', { name: 'AI mode' })).toHaveCount(0)
  await expect(page.getByText('No requests yet.')).toBeVisible()
})

test('the price memo and the cover text replay their recorded outputs', async ({ page }) => {
  await runSteps(page, ['A1', 'A2'])
  const url = await requestUrl(page)

  // L1 is still a draft: the composer offers the memo.
  await page.goto(`${url}?line=1`)
  await page.getByRole('button', { name: 'Generate memo' }).click()
  await expect(page.getByText(/780\.91 EUR per piece/)).toBeVisible()
  await page.getByRole('button', { name: 'View AI trace' }).first().click()
  await expect(page.getByText('price_memo · replay ·')).toBeVisible()
  await page.keyboard.press('Escape')

  // After A4 both lines are priced: preparing R1 by hand gives the input the recording was made for.
  await page.goto('/design/scenarios/a')
  for (const [i, id] of ['A3', 'A4'].entries()) {
    await page.getByRole('button', { name: `Run next step (${id})` }).click()
    await expect(page.getByText(`${i + 3} of 11 done`)).toBeVisible({ timeout: 30_000 })
  }
  await page.goto(url)
  await page.getByRole('button', { name: 'Prepare revision' }).click()
  await expect(page).toHaveURL(/\/revisions\/1$/)
  await expectCoverReplays(page)
})

test('the cover text of the draft R2 in scenario A replays', async ({ page }) => {
  await runSteps(page, ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7'])
  const url = await requestUrl(page)
  await page.goto(`${url}/revisions/2`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Revision R2')
  await expectCoverReplays(page)
})

async function expectCoverReplays(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Generate cover text' }).click()
  await expect(page.getByText(/no recorded output matches this input/)).toHaveCount(0)
  await page.getByRole('button', { name: 'View AI trace' }).first().click()
  await expect(page.getByText('cover_text · replay ·')).toBeVisible()
}

test('an input without a recording takes the manual path', async ({ page }) => {
  await page.goto('/requests/new')
  await page.getByLabel('Paste the request').fill('Please quote 12 pcs HEB 300 in S355, 8 m long, for our hall in Graz.')
  await page.getByRole('button', { name: 'Extract lines' }).click()
  await expect(page.getByText(/no recorded output matches this input/)).toBeVisible()
  await expect(page.getByText('Add the lines manually.')).toBeVisible()
})

test('the data stays with the tab across a reload, and the reset clears it without a token', async ({ page }) => {
  await runSteps(page, ['A1', 'A2'])
  await page.goto('/requests')
  await expect(page.getByRole('row').filter({ hasText: 'Ebrecht Fabrication' })).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Ebrecht Fabrication' })).toHaveCount(1)

  await page.getByRole('button', { name: 'Menu' }).click()
  await page.getByRole('menuitem', { name: 'Reset demo…' }).click()
  await expect(page.getByLabel('Reset token')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  await expect(page.getByText('No requests yet.')).toBeVisible()
  await page.reload()
  await expect(page.getByText('No requests yet.')).toBeVisible()

  // The player's saved run went with the data.
  await page.goto('/design/scenarios/a')
  await expect(page.getByText('0 of 11 done')).toBeVisible()
})

test('a new tab starts on the seeded data', async ({ browser }) => {
  const first = await browser.newContext()
  const a = await first.newPage()
  await runSteps(a, ['A1', 'A2'])
  const second = await browser.newContext()
  const b = await second.newPage()
  await b.goto('/requests')
  await expect(b.getByText('No requests yet.')).toBeVisible()
  await first.close()
  await second.close()
})

// UI smoke tests for scenarios A and B. Spec 13 phase 4, item 5.
// The step player runs a scenario through the services in replay mode (the AI drafts come from
// the recorded outputs), and the test then reads the product screens. Static demo build by
// default (npm run e2e): every test starts on a clean copy of the seeded data in a new browser
// context. Full stack (npx netlify dev:exec "npm run e2e:full"): the demo is reset first through
// the reset function, since the scenario's reference expectations hold on a clean history.

import { expect, test, type Page } from '@playwright/test'
import { fullStack, resetToken } from './target'

async function runAll(page: Page, id: 'a' | 'b', steps: number): Promise<string> {
  if (fullStack) {
    await page.goto('/requests')
    await page.getByRole('group', { name: 'AI mode' }).getByRole('button', { name: 'Replay' }).click()
  }
  await page.goto(`/design/scenarios/${id}`)
  await expect(page.getByRole('heading', { level: 1 })).toContainText(`Scenario ${id.toUpperCase()}`)
  await page.getByRole('button', { name: 'Run all' }).click()
  await expect(page.getByText(`${steps} of ${steps} done`)).toBeVisible({ timeout: 180_000 })
  await expect(page.getByText('failed', { exact: true })).toHaveCount(0)
  // Every AI draft matched the script on every field: one intake and two replies per scenario.
  await expect(page.getByText('The draft matches the script on every field.')).toHaveCount(3)
  const ref = /R-2026-\d{4}/.exec((await page.locator('main div.sticky').innerText()) ?? '')
  expect(ref).not.toBeNull()
  return ref![0]
}

test.describe('scenarios through the UI', () => {
  test.beforeEach(async ({ request }) => {
    if (!fullStack) return
    test.skip(!resetToken, 'DEMO_RESET_TOKEN is not set. Run: npx netlify dev:exec "npm run e2e:full"')
    const res = await request.post('/api/demo/reset', { headers: { 'x-demo-reset-token': resetToken ?? '' } })
    expect(res.ok(), 'demo reset').toBeTruthy()
  })

  test('scenario A runs end to end and the screens show the result', async ({ page }) => {
    const requestRef = await runAll(page, 'a', 11)

    await page.goto(`/requests?q=${requestRef}`)
    const row = page.getByRole('row').filter({ hasText: requestRef })
    await expect(row).toContainText('Ebrecht Fabrication')
    await expect(row).toContainText('converted')
    await row.click()

    await expect(page.getByRole('heading', { level: 1 })).toContainText(requestRef)
    await expect(page.getByText(/order O-2026-\d{4}/)).toBeVisible()
    await expect(page.getByRole('cell', { name: 'L1' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'L2' })).toBeVisible()

    // Revision R2 supersedes R1 and carries the volume discount on L2.
    const url = page.url()
    await page.goto(`${url.replace(/\/$/, '')}/revisions/2`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Revision R2')
    await expect(page.getByRole('cell', { name: 'L2' })).toBeVisible()
    await page.getByRole('button', { name: /Show changes from R1/ }).click()
    await expect(page.getByText('60').first()).toBeVisible()

    await page.goto(`${url.replace(/\/$/, '')}/revisions/1`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('superseded')

    // The data survives a reload.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('superseded')

    await page.goto('/ops')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Operations queue')
  })

  test('scenario B runs end to end and the screens show the result', async ({ page }) => {
    const requestRef = await runAll(page, 'b', 12)

    await page.goto(`/requests?q=${requestRef}`)
    const row = page.getByRole('row').filter({ hasText: requestRef })
    await expect(row).toContainText('Torvane Structures')
    await row.click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(requestRef)
    // L1 failed its check, L3 is the alternative, and the request ends in an order.
    await expect(page.getByRole('cell', { name: 'L3' })).toBeVisible()
    await expect(page.getByText(/order O-2026-\d{4}/)).toBeVisible()

    const url = page.url()
    await page.goto(`${url.replace(/\/$/, '')}/revisions/2`)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Revision R2')
    await expect(page.getByRole('cell', { name: 'L3' })).toBeVisible()
  })
})

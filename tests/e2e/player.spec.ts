// The step player keeps its run across "Open screen", Back and a reload (a blocker found in a walk-through).
// The tests start with the in-page "Reset demo and start", which is the path that lost the
// scenario state before the fix. Static demo build by default (npm run e2e); the full stack in
// replay mode with the injected token: npx netlify dev:exec "npm run e2e:full"

import { expect, test, type Page } from '@playwright/test'
import { fullStack, isStatic, resetToken as token } from './target'

const NO_TOKEN = 'DEMO_RESET_TOKEN is not set. Run: npx netlify dev:exec "npm run e2e:full"'
const NO_NETWORK = 'Simulates a slow or failing database request; the static build makes none.'

async function startScenarioA(page: Page): Promise<void> {
  if (fullStack) {
    await page.goto('/requests')
    await page.getByRole('group', { name: 'AI mode' }).getByRole('button', { name: 'Replay' }).click()
  }
  await page.goto('/design/scenarios/a')
  await page.getByRole('button', { name: 'Reset demo and start' }).click()
  if (fullStack) await page.getByLabel('Reset token').fill(token ?? '')
  await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
  // "0 of 11 done" shows before the reset too: the dialog closes only when the reset has finished.
  await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 })
  await expect(page.getByText('0 of 11 done')).toBeVisible()
}

async function runNext(page: Page, stepId: string, done: number): Promise<void> {
  await page.getByRole('button', { name: `Run next step (${stepId})` }).click()
  await expect(page.getByText(`${done} of 11 done`)).toBeVisible({ timeout: 60_000 })
}

async function expectA3Succeeds(page: Page): Promise<void> {
  await expect(page.getByText('2 of 11 done')).toBeVisible({ timeout: 30_000 })
  await runNext(page, 'A3', 3)
  await expect(page.getByText(/Missing state/)).toHaveCount(0)
  await expect(page.locator('li', { hasText: 'A3' }).getByText('failed', { exact: true })).toHaveCount(0)
}

test.describe('step player survives navigation', () => {
  test.skip(fullStack && !token, NO_TOKEN)

  test('A2, Open screen, Back, then A3 succeeds', async ({ page }) => {
    await startScenarioA(page)
    await runNext(page, 'A1', 1)
    await runNext(page, 'A2', 2)
    const a2 = page.locator('li', { hasText: 'Approve the scripted lines' })
    await a2.getByRole('link', { name: 'Open screen' }).click()
    await expect(page).toHaveURL(/\/requests\/[^/?#]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('R-2026-')
    await page.goBack()
    await expect(page).toHaveURL(/\/design\/scenarios\/a$/)
    await expectA3Succeeds(page)
  })

  test('A2, reload, then A3 succeeds', async ({ page }) => {
    await startScenarioA(page)
    await runNext(page, 'A1', 1)
    await runNext(page, 'A2', 2)
    await page.reload()
    await expectA3Succeeds(page)
  })
})

test.describe('scenario B survives navigation', () => {
  test.skip(fullStack && !token, NO_TOKEN)

  test('B3, Open screen, Back, reload, then the rest succeeds', async ({ page }) => {
    if (fullStack) {
      await page.goto('/requests')
      await page.getByRole('group', { name: 'AI mode' }).getByRole('button', { name: 'Replay' }).click()
    }
    await page.goto('/design/scenarios/b')
    await page.getByRole('button', { name: 'Reset demo and start' }).click()
    if (fullStack) await page.getByLabel('Reset token').fill(token ?? '')
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 })
    for (const [i, id] of ['B1', 'B2', 'B3'].entries()) {
      await page.getByRole('button', { name: `Run next step (${id})` }).click()
      await expect(page.getByText(`${i + 1} of 12 done`)).toBeVisible({ timeout: 60_000 })
    }
    await page.locator('ol > li').nth(2).getByRole('link', { name: 'Open screen' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Revision R1')
    await page.goBack()
    await expect(page).toHaveURL(/\/design\/scenarios\/b$/)
    await page.reload()
    await expect(page.getByText('3 of 12 done')).toBeVisible()
    await page.getByRole('button', { name: 'Run all' }).click()
    await expect(page.getByText('12 of 12 done')).toBeVisible({ timeout: 180_000 })
    await expect(page.getByText('failed', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/Missing state/)).toHaveCount(0)
  })
})

test.describe('revision diff', () => {
  test.skip(fullStack && !token, NO_TOKEN)

  test('"Show changes from R1" works on the first click on a slow network', async ({ page }) => {
    test.skip(isStatic, NO_NETWORK)
    await startScenarioA(page)
    await page.getByRole('button', { name: 'Run all' }).click()
    await expect(page.getByText('11 of 11 done')).toBeVisible({ timeout: 180_000 })
    const href = await page.locator('li', { hasText: 'Price L2 in R2' }).getByRole('link', { name: 'Open screen' }).getAttribute('href')
    // Hold the revision snapshots back, as a slow connection would.
    await page.route('**/rest/v1/quotation_lines*', async (route) => {
      await page.waitForTimeout(2000)
      await route.continue()
    })
    await page.goto(href ?? '')
    const toggle = page.getByRole('button', { name: /changes from R1/ })
    await expect(toggle).toBeDisabled()
    await toggle.click() // waits until enabled
    await expect(toggle).toHaveText('Hide changes from R1')
    await expect(page.locator('main td .line-through').first()).toBeVisible()
  })
})

test.describe('step player guards', () => {
  test.skip(fullStack && !token, NO_TOKEN)

  test('Open screen is disabled while Run all is busy', async ({ page }) => {
    await startScenarioA(page)
    await page.getByRole('button', { name: 'Run all' }).click()
    // The static build replays in well under a second per AI step: check while A1 still runs.
    if (fullStack) await expect(page.getByText('1 of 11 done')).toBeVisible({ timeout: 60_000 })
    const a1Open = page.locator('ol > li').first().getByRole('link', { name: 'Open screen' })
    await expect(page.getByRole('button', { name: 'Run all' })).toBeDisabled()
    await expect(a1Open).toBeDisabled()
    await expect(page.locator('ol').getByRole('link', { name: 'Open screen', disabled: false })).toHaveCount(0)
    await expect(page.getByText('11 of 11 done')).toBeVisible({ timeout: 180_000 })
    await expect(a1Open).toBeEnabled()
  })

  test('A to B through the sidebar: B starts at 0 with its own state', async ({ page }) => {
    await startScenarioA(page)
    await runNext(page, 'A1', 1)
    await runNext(page, 'A2', 2)
    const bar = page.locator('main div.sticky')
    const aRef = (await bar.innerText()).match(/R-\d{4}-\d{4}/)?.[0]
    expect(aRef).toBeTruthy()

    await page.getByRole('navigation', { name: 'Design', exact: true }).getByRole('link', { name: 'Scenario B' }).click()
    await expect(page).toHaveURL(/\/design\/scenarios\/b$/)
    await expect(page.getByText('0 of 12 done')).toBeVisible()
    await expect(bar).not.toContainText('R-20')
    await expect(page.getByRole('button', { name: 'Run next step (B1)' })).toBeEnabled()

    await page.getByRole('button', { name: 'Run next step (B1)' }).click()
    await expect(page.getByText('1 of 12 done')).toBeVisible({ timeout: 60_000 })
    await page.getByRole('button', { name: 'Run next step (B2)' }).click()
    await expect(page.getByText('2 of 12 done')).toBeVisible({ timeout: 60_000 })
    const bRef = (await bar.innerText()).match(/R-\d{4}-\d{4}/)?.[0]
    expect(bRef).toBeTruthy()
    expect(bRef).not.toBe(aRef)
    await expect(page.getByText(/Missing state/)).toHaveCount(0)

    // Back to A through the sidebar: A's own run comes back from session storage.
    await page.getByRole('navigation', { name: 'Design', exact: true }).getByRole('link', { name: 'Scenario A' }).click()
    await expect(page.getByText('2 of 11 done')).toBeVisible()
    await expect(bar).toContainText(aRef ?? '')
  })
})

test.describe('player bar position', () => {
  for (const width of [1280, 1920]) {
    test(`pins below the header at ${width} px, never over the role switch`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 })
      await page.goto('/design/scenarios/a')
      await expect(page.getByRole('button', { name: 'Run all' })).toBeVisible()
      for (const y of [400, 100_000]) {
        await page.mouse.wheel(0, y)
        await page.waitForTimeout(300)
        const header = await page.locator('body > div header').first().boundingBox()
        const role = await page.getByRole('group', { name: 'Role' }).boundingBox()
        const bar = await page.locator('main div.sticky').boundingBox()
        expect(header && header.y).toBe(0)
        expect(role && role.y >= 0).toBe(true)
        expect(bar && header && bar.y >= header.y + header.height - 0.5).toBe(true)
        expect(bar && bar.y < 800).toBe(true)
      }
    })
  }
})

test.describe('deep-linked composer', () => {
  test.skip(fullStack && !token, NO_TOKEN)

  test('after A3, Open screen shows the saved price, as opening the line in the workspace does', async ({ page }) => {
    await startScenarioA(page)
    await runNext(page, 'A1', 1)
    await runNext(page, 'A2', 2)
    // Visit the workspace before A3 prices L1, so the app holds a copy of the request without the price.
    await page.locator('li', { hasText: 'Approve the scripted lines' }).getByRole('link', { name: 'Open screen' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('R-2026-')
    await page.goBack()
    await runNext(page, 'A3', 3)

    await page.locator('ol > li').nth(2).getByRole('link', { name: 'Open screen' }).click()
    const price = page.getByLabel('Unit price (EUR)')
    await expect(price).toHaveValue(/^\d+(\.\d+)?$/)
    const deepLinked = await price.inputValue()
    await expect(page.getByText(/^Margin \d+\.\d%/)).toBeVisible()

    await page.keyboard.press('Escape')
    await page.locator('tr[data-line-no="1"] td').first().click()
    await expect(page.getByLabel('Unit price (EUR)')).toHaveValue(deepLinked)
  })
})

test.describe('a step that wrote and then failed its check', () => {
  test.skip(fullStack && !token, NO_TOKEN)

  test('cannot run again, stays blocked after a reload, and the reset clears it', async ({ page }) => {
    test.skip(isStatic, NO_NETWORK)
    await startScenarioA(page)
    await runNext(page, 'A1', 1)
    // A2 creates the request and its lines; its check then reads no line, so the check fails after the write.
    await page.route('**/rest/v1/lines?*request_id=eq.*', (route) => (route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : route.continue()))
    await page.getByRole('button', { name: 'Run next step (A2)' }).click()
    const a2 = page.locator('ol > li').nth(1)
    await expect(a2.getByText('failed', { exact: true })).toBeVisible({ timeout: 60_000 })
    await page.unroute('**/rest/v1/lines?*request_id=eq.*')

    const blocked = async () => {
      await expect(a2.getByText(/changed the data before its check failed/)).toBeVisible()
      await expect(a2.getByRole('button', { name: 'Run', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: /^Run next step/ })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Run all' })).toBeDisabled()
    }
    await blocked()
    await page.reload()
    await blocked()

    await page.getByRole('button', { name: 'Reset demo and start' }).click()
    await page.getByRole('button', { name: 'Reset demo', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 60_000 })
    await expect(page.getByText('0 of 11 done')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Run next step (A1)' })).toBeEnabled()
  })
})

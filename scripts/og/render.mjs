// Renders scripts/og/og.html to public/og-image.png, 1200 × 627, the link-preview image.
// Run: npm run og:render (needs the network for the Inter font).

import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(resolve(here, 'og.html')).href)
await page.evaluate(() => document.fonts.ready)
const out = resolve(here, '../../public/og-image.png')
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log(`Wrote ${out}`)

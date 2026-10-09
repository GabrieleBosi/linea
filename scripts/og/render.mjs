// Renders scripts/og/og.html to public/og-image-v2.png, 1200 × 627, the link-preview image.
// The name carries a version because link previews are cached by URL: a new image needs a new name.
// Run: npm run og:render (needs the network for the Inter font).

import { chromium } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 627 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(resolve(here, 'og.html')).href)
await page.evaluate(() => document.fonts.ready)
const out = resolve(here, '../../public/og-image-v2.png')
await page.screenshot({ path: out, type: 'png' })
await browser.close()
console.log(`Wrote ${out}`)

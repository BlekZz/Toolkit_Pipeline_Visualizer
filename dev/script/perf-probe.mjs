// Perf probe for M1 (Sprint_Perf_And_Visual_Overhaul).
//
// Measures against a running `vite preview` server (must already be up on
// the URL passed as argv[2], default http://localhost:4173):
//   (a) cold load -> first Timeline Gantt render
//   (b) preset switch Month -> Year
//   (c) tab switch Timeline -> Calendar -> Timeline
//
// Usage:
//   npm run build && npm run preview -- --port 4173 &
//   node dev/script/perf-probe.mjs http://localhost:4173
//
// Not part of the test suite — a manual measurement tool, run before/after
// perf work and recorded in the milestone report (not committed to dev/*.md).

import { chromium } from '@playwright/test'

const url = process.argv[2] || 'http://localhost:4173'

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  // ── (a) cold load -> first Gantt task row rendered ──
  const t0 = performance.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.wx-gantt, .gantt-wrapper .wx-bar, .gantt-wrapper', { timeout: 15000 })
  // wait for at least one task row to paint
  await page.waitForFunction(
    () => document.querySelectorAll('.gantt-wrapper [class*="task"], .gantt-wrapper .wx-bar').length > 0
      || document.querySelector('.gantt-wrapper') !== null,
    { timeout: 15000 },
  )
  const coldLoadMs = performance.now() - t0

  // Let the app settle (initial expand effect + first paint)
  await page.waitForTimeout(300)

  // ── task count at Month scale (default activePreset) ──
  const taskCountMonth = await page.evaluate(() => document.querySelectorAll('.gantt-wrapper [class*="wx-bar"]').length)

  // ── (b) preset switch Month -> Year ──
  const yearBtn = page.locator('button.preset-btn', { hasText: 'Year' })
  const t1 = performance.now()
  await yearBtn.click()
  await page.waitForFunction(() => {
    const btns = Array.from(document.querySelectorAll('button.preset-btn'))
    return btns.some((b) => b.textContent?.includes('Year') && b.className.includes('preset-btn--active'))
  }, { timeout: 5000 })
  const presetSwitchMs = performance.now() - t1

  await page.waitForTimeout(200)
  const taskCountYear = await page.evaluate(() => document.querySelectorAll('.gantt-wrapper [class*="wx-bar"]').length)

  // ── (c) tab switch Timeline -> Calendar -> Timeline ──
  const calendarBtn = page.locator('button.tab-btn', { hasText: 'Calendar' })
  const timelineBtn = page.locator('button.tab-btn', { hasText: 'Timeline' })

  const t2 = performance.now()
  await calendarBtn.click()
  await page.waitForSelector('.fc', { timeout: 5000 })
  const tabToCalendarMs = performance.now() - t2

  const t3 = performance.now()
  await timelineBtn.click()
  await page.waitForSelector('.gantt-wrapper', { timeout: 5000 })
  const tabToTimelineMs = performance.now() - t3

  await browser.close()

  console.log(JSON.stringify({
    coldLoadMs: Math.round(coldLoadMs),
    taskCountMonth,
    presetSwitchMonthToYearMs: Math.round(presetSwitchMs),
    taskCountYear,
    tabSwitchTimelineToCalendarMs: Math.round(tabToCalendarMs),
    tabSwitchCalendarToTimelineMs: Math.round(tabToTimelineMs),
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

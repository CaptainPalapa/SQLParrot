#!/usr/bin/env node
/**
 * Capture screenshots of SQL Parrot for the README.
 * Run with: node scripts/capture-screenshots.js
 *
 * Prerequisites:
 * - App must be running at http://localhost:3000 (npm run dev)
 * - npx playwright install chromium (if not already installed)
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.SCREENSHOT_BASE_URL || 'http://localhost:3000';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'screenshots');

async function waitForApp(page, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 5000 });
      if (response && response.ok) break;
    } catch (e) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function captureScreenshots() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await waitForApp(page);
    await page.waitForLoadState('networkidle');

    // Handle password setup if shown (click Skip to get to main app)
    const skipButton = page.locator('button:has-text("Skip")');
    if (await skipButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await skipButton.click();
      await page.waitForLoadState('networkidle');
      await new Promise(r => setTimeout(r, 500));
    }

    // 1. Main dashboard - Groups tab
    await page.locator('button:has-text("Groups")').first().click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'dashboard-groups.png'), fullPage: false });
    console.log('Captured: dashboard-groups.png');

    // 2. Profiles tab
    await page.locator('button:has-text("Profiles")').first().click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'profiles.png'), fullPage: false });
    console.log('Captured: profiles.png');

    // 3. Settings tab
    await page.locator('button:has-text("Settings")').first().click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'settings.png'), fullPage: false });
    console.log('Captured: settings.png');

    // 4. History tab
    await page.locator('button:has-text("History")').first().click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'history.png'), fullPage: false });
    console.log('Captured: history.png');

    // 5. Theme browser - click palette icon
    const paletteBtn = page.locator('button[title="Change Theme"]');
    if (await paletteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await paletteBtn.click();
      await new Promise(r => setTimeout(r, 600));
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'theme-browser.png'), fullPage: false });
      console.log('Captured: theme-browser.png');
      await page.keyboard.press('Escape');
    }

    // 6. About tab
    await page.locator('button:has-text("About")').first().click();
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'about.png'), fullPage: false });
    console.log('Captured: about.png');

    console.log('All screenshots saved to docs/screenshots/');
  } catch (err) {
    console.error('Screenshot capture failed:', err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

captureScreenshots();

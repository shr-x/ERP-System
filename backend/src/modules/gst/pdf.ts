import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { env } from '../env/env';

export function resolveChromeExecutablePath() {
  if (env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(env.PUPPETEER_EXECUTABLE_PATH)) {
    return env.PUPPETEER_EXECUTABLE_PATH;
  }

  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return undefined;
}

export async function htmlToPdfBuffer(html: string) {
  const executablePath = resolveChromeExecutablePath();
  if (!executablePath) {
    throw new Error('Chrome executable not found. Set PUPPETEER_EXECUTABLE_PATH.');
  }

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' }
    });
    return pdf;
  } finally {
    await browser.close();
  }
}


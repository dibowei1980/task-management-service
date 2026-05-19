const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    console.log(`   [${msg.type().toUpperCase()}]`, msg.text());
  });

  page.on('request', request => {
    if (request.url().includes('5050')) {
      console.log('   [REQUEST]', request.method(), request.url());
    }
  });

  page.on('response', response => {
    if (response.url().includes('5050')) {
      console.log('   [RESPONSE]', response.status(), response.url());
    }
  });

  page.on('requestfailed', request => {
    console.log('   [REQUEST FAILED]', request.url(), request.failure().errorText);
  });

  console.log('1. Navigate to login page...');
  await page.goto('http://localhost:5174/', { waitUntil: 'networkidle' });

  console.log('2. Click SSO button...');
  await (await page.$('button:has-text("统一身份认证")')).click();
  await page.waitForURL('**/login**', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log('3. Fill UPM login...');
  const u = await page.$('input[id="username"]') || await page.$('input[name="username"]');
  const p = await page.$('input[id="password"]') || await page.$('input[name="password"]');
  await u.fill('admin');
  await p.fill('admin123');
  await (await page.$('button[type="submit"]') || await page.$('button:has-text("登录")')).click();

  console.log('4. Wait for SSO callback...');
  await page.waitForURL('**/sso/callback**', { timeout: 20000 }).catch(e => {
    console.log('   Wait failed:', e.message.substring(0, 200));
  });
  console.log('   URL:', page.url());

  console.log('5. Waiting for token exchange (up to 20s)...');
  await page.waitForURL('**/projects**', { timeout: 20000 }).catch(() => {});
  console.log('   Final URL:', page.url());

  await browser.close();
})();

import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQ FAIL:', request.url(), request.failure().errorText));

  await page.goto('http://localhost:5173');
  
  await new Promise(r => setTimeout(r, 2000));
  console.log('Sending CSV demo request...');
  await fetch('http://localhost:8081/debug/start-csv-demo', { method: 'POST' });
  
  await new Promise(r => setTimeout(r, 5000));
  await browser.close();
})();

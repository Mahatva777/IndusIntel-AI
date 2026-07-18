import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 2000));
  
  const getSensorData = async () => {
    return await page.evaluate(() => {
      const sensors = Array.from(document.querySelectorAll('.font-mono'));
      return sensors.map(el => el.textContent).filter(t => t.includes('.')).slice(0, 5);
    });
  };

  console.log('Sensors before demo:', await getSensorData());

  console.log('Sending CSV demo request...');
  await fetch('http://localhost:8081/debug/start-csv-demo', { method: 'POST' });
  
  await new Promise(r => setTimeout(r, 4000));
  console.log('Sensors after demo (4s):', await getSensorData());

  await new Promise(r => setTimeout(r, 4000));
  console.log('Sensors after demo (8s):', await getSensorData());

  await browser.close();
})();

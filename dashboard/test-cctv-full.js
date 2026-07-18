import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:5173');
  await new Promise(r => setTimeout(r, 2000));
  
  console.log('Sending CSV demo request...');
  await fetch('http://localhost:8081/debug/start-csv-demo', { method: 'POST' });
  
  const getState = async () => {
    return await page.evaluate(() => {
      const incidents = Array.from(document.querySelectorAll('.font-semibold')).map(e => e.textContent);
      const activeCamera = document.querySelector('.border-teal-400') || document.querySelector('.border-severity-emergency');
      const activeCameraText = activeCamera ? activeCamera.textContent : 'none';
      return { incidents, activeCameraText };
    });
  };
  
  await new Promise(r => setTimeout(r, 4000));
  console.log('State after 4s (should be normal):', await getState());

  console.log('Waiting 40 seconds to reach the 42s offset...');
  await new Promise(r => setTimeout(r, 40000));
  console.log('State after 44s (should be emergency):', await getState());

  await browser.close();
})();

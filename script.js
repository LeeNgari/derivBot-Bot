const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

(async () => {
  // Prepare CSV writer
  const csvFilePath = path.join(__dirname, 'deriv_bot_results.csv');
  const csvWriter = createCsvWriter({
    path: csvFilePath,
    header: [
      { id: 'timestamp', title: 'Timestamp' },
      { id: 'iteration', title: 'Iteration' },
      { id: 'totalStake', title: 'Total Stake' },
      { id: 'totalPayout', title: 'Total Payout' },
      { id: 'numRuns', title: 'Number of Runs' },
      { id: 'contractsLost', title: 'Contracts Lost' },
      { id: 'contractsWon', title: 'Contracts Won' },
      { id: 'totalProfitLoss', title: 'Total Profit/Loss' }
    ],
    append: true
  });

  console.log('Launching browser');
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--start-maximized',
      '--profile-directory=Profile 5'
    ],
    executablePath: 'C:\\Users\\ADMIN\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe',
    userDataDir: 'C:\\Users\\ADMIN\\AppData\\Local\\Google\\Chrome\\User Data',
  });

  console.log('Opening new page');
  const page = await browser.newPage();

  await page.setViewport({
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
  });

  // Listen for console logs and errors
  page.on('console', (msg) => console.log('Browser console:', msg.text()));
  page.on('pageerror', (err) => console.error('Page error:', err.toString()));

  // Retry mechanism for navigation and element loading
  const retry = async (fn, retries = 3, delay = 2000) => {
    try {
      return await fn();
    } catch (err) {
      if (retries <= 0) throw err;
      console.log(`Retrying... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retry(fn, retries - 1, delay);
    }
  };

  console.log('Navigating to Deriv Bot Builder');
  await retry(async () => {
    await page.goto('https://dbot.deriv.com/#bot_builder', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#db-animation__run-button', { visible: true, timeout: 60000 });
  });

  console.log('Page loaded successfully');

  // Function to extract and record the required values
  const recordResults = async (iteration) => {
    const results = await page.evaluate(() => {
      const getTileValue = (title) => {
        const tile = Array.from(document.querySelectorAll('.run-panel__tile')).find(
          (tile) => tile.querySelector('.run-panel__tile-title')?.textContent.includes(title)
        );
        return tile?.querySelector('.run-panel__tile-content')?.textContent.trim() || '0';
      };

      return {
        numRuns: getTileValue('No. of runs'),
        contractsLost: getTileValue('Contracts lost'),
        contractsWon: getTileValue('Contracts won'),
        totalProfitLoss: getTileValue('Total profit/loss'),
      };
    });

    const record = {
      iteration,
      ...results
    };

    await csvWriter.writeRecords([record]);
    return results;
  };

  // Main loop
  for (let iteration = 1; iteration <= 30; iteration++) {
    console.log(`Starting iteration ${iteration}`);

    console.log('Clicking Run button');
    await retry(async () => {
      await page.click('#db-animation__run-button');
      await page.waitForSelector('#db-animation__stop-button:not([disabled])', { visible: true, timeout: 60000 });
    });

    while (true) {
      const results = await page.evaluate(() => {
        const getTileValue = (title) => {
          const tile = Array.from(document.querySelectorAll('.run-panel__tile')).find(
            (tile) => tile.querySelector('.run-panel__tile-title')?.textContent.includes(title)
          );
          return tile?.querySelector('.run-panel__tile-content')?.textContent.trim() || '0';
        };
        return getTileValue('Total profit/loss');
      });

      const totalProfitLoss = parseFloat(results.replace('USD', '').trim());

      if (totalProfitLoss >= 3 || totalProfitLoss <= -5) {
        console.log('Stopping bot as profit/loss condition met');
        await retry(async () => {
          await page.click('#db-animation__stop-button');
          await page.waitForSelector('#db-run-panel__clear-button', { visible: true, timeout: 60000 });
        });

        console.log('Recording final results');
        await recordResults(iteration);

        console.log('Waiting 2 seconds before resetting');
        await new Promise(resolve => setTimeout(resolve, 2000));

        console.log('Clicking Reset button');
        await retry(async () => {
          await page.click('#db-run-panel__clear-button');
          await page.waitForSelector('#db-animation__run-button', { visible: true, timeout: 60000 });
        });

        console.log('Waiting 2 seconds before next iteration');
        await new Promise(resolve => setTimeout(resolve, 2000));

        break;
      }

     
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    if (iteration === 20) {
      break;
    }
  }

  console.log('Script completed');
  await browser.close();
})();
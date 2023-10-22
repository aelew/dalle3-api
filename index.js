const { Cluster } = require('puppeteer-cluster');
const express = require('express');

require('dotenv').config();

const app = express();
let count = 1;

const _U = process.env._U;
if (!_U) {
  console.error('Missing `_U` environment variable.');
  process.exit(1);
}

const ANON = process.env.ANON;
if (!_U) {
  console.error('Missing `ANON` environment variable.');
  process.exit(1);
}

const MAX_CONCURRENCY = process.env.MAX_CONCURRENCY
  ? parseInt(process.env.MAX_CONCURRENCY)
  : 4;

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: MAX_CONCURRENCY,
    puppeteerOptions: {
      args: ['--disable-blink-features=AutomationControlled'],
      headless: 'new'
    }
  });

  await cluster.task(async ({ page, data: query }) => {
    await page.setCookie({ name: '_U', value: _U, domain: 'www.bing.com' });
    await page.setCookie({ name: 'ANON', value: ANON, domain: 'www.bing.com' });

    await page.goto(
      'https://www.bing.com/images/create?q=' + encodeURIComponent(query)
    );

    await page.waitForXPath("//img[@class='mimg']", {
      timeout: 60000,
      visible: true
    });

    // Ensure all images are loaded (just in case)
    new Promise((r) => setTimeout(r, 1000));

    const elements = await page.$$('.mimg');
    const images = [];

    await new Promise((resolve) => {
      elements.forEach(async (img, i) => {
        const srcProperty = await img.getProperty('src');
        const srcObject = await srcProperty.jsonValue();
        const srcUrl = srcObject.toString().split('?')[0];
        if (!images.includes(srcUrl)) {
          images.push(srcUrl);
        }
        if (i === elements.length - 1) {
          resolve();
        }
      });
    });

    return images;
  });

  app.get('/generate', async function (req, res) {
    if (process.env.AUTH && req.headers['authorization'] !== process.env.AUTH) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }

    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ success: false, error: 'invalid_query' });
    }

    const requestId = count;
    count++;

    console.log(`[${requestId}] Received query: "${query}"`);

    try {
      const images = await cluster.execute(query);
      console.log(`[${requestId}] Generated ${images.length} images.`);
      res.json({ success: true, images });
    } catch (err) {
      console.log(`[${requestId}] An error occurred.`);
      console.error(err);
      res.status(500).json({ success: false, error: 'generate_error' });
    }
  });

  const port = process.env.PORT || 5000;

  app.listen(port, () =>
    console.log(`Express server listening on port ${port}.`)
  );
})();

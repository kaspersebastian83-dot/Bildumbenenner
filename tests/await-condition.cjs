// Playwright 1.56 does not retry a Promise that later resolves to false.
// Await its resolved value explicitly; reject rather than accepting a negative result.
async function waitForAsync(page, predicate, arg, { timeout = 30000, interval = 25 } = {}) {
  const deadline = Date.now() + timeout;
  do {
    const handle = await page.evaluateHandle(predicate, arg);
    if (await handle.evaluate(value => !!value)) return handle;
    await handle.dispose();
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(interval);
  } while (Date.now() < deadline);
  throw new Error('Async condition timed out without a positive result');
}
module.exports = { waitForAsync };

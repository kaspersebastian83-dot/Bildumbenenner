// Playwright 1.56 does not retry a Promise that later resolves to false.
// Await the resolved positive value, with a deadline for each async probe too.
async function waitForAsync(page, predicate, arg, { timeout = 30000, interval = 25 } = {}) {
  const deadline = Date.now() + timeout;
  const expired = () => new Error('Async condition timed out without a positive result');
  do {
    const pending = page.evaluateHandle(predicate, arg);
    let timer, handle;
    try {
      handle = await Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject(expired()), Math.max(1, deadline-Date.now())); })]);
    } catch (error) {
      // A late result must not leak a browser handle after our deadline.
      pending.then(h => h.dispose()).catch(() => {});
      throw error;
    } finally { clearTimeout(timer); }
    if (await handle.evaluate(value => !!value)) return handle;
    await handle.dispose();
    if (Date.now() >= deadline) break;
    await page.waitForTimeout(interval);
  } while (Date.now() < deadline);
  throw expired();
}
module.exports = { waitForAsync };

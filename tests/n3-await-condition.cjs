const assert = require('node:assert/strict');
const { waitForAsync } = require('./await-condition.cjs');
(async () => {
  let tries = 0, disposed = 0;
  const page = { evaluateHandle: async fn => { const value = await fn(); return { evaluate: async fn => fn(value), dispose: async () => disposed++ }; }, waitForTimeout: ms => new Promise(r => setTimeout(r, ms)) };
  await assert.rejects(waitForAsync(page, async () => false, undefined, { timeout: 35, interval: 2 }), /without a positive result/);
  const h = await waitForAsync(page, async () => ++tries === 3 ? { confirmed:true } : false, undefined, { timeout: 100 });
  assert.equal(await h.evaluate(v => v.confirmed), true); assert.equal(tries, 3); assert.ok(disposed >= 2);
  await assert.rejects(waitForAsync(page, async () => { throw Error('read failure'); }), /read failure/);
  console.log('PASS N3 async waits: false fails, eventual positive retries, read errors propagate');
})().catch(e => { console.error(e); process.exitCode = 1; });

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HermesClient } from './client.mjs';
async function fixture(t, fetchImpl) {
  const dataDir = await mkdtemp(join(tmpdir(), 'migpt-hermes-'));
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const options = { baseUrl: 'http://localhost:8642/v1', apiKey: 'test-only-key', dataDir, fetchImpl };
  const client = new HermesClient(options); await client.init();
  return { client, options, dataDir };
}
const answer = text => Response.json({ choices: [{ finish_reason: 'stop', message: { content: text } }] });
test('restart retains session and raw user text; sends no local history', async t => {
  const calls = [];
  const { client, options } = await fixture(t, async (url, init) => { calls.push({ url, ...init }); return answer('记住了'); });
  const restarted = new HermesClient(options); await restarted.init();
  assert.equal(restarted.sessionId, client.sessionId);
  assert.equal(await restarted.ask({ text: '记住我喜欢绿茶', timestamp: 123 }), '记住了');
  assert.equal(calls[0].url, 'http://localhost:8642/v1/chat/completions');
  assert.equal(calls[0].headers['X-Hermes-Session-Id'], client.sessionId);
  assert.equal(calls[0].headers.Authorization, 'Bearer test-only-key');
  const body = JSON.parse(calls[0].body);
  assert.equal(body.messages.length, 2);
  assert.deepEqual(body.messages[1], { role: 'user', content: '记住我喜欢绿茶' });
  assert.equal(body.stream, false);
});
test('concurrent questions execute sequentially even after failure', async t => {
  const order = []; let active = 0; let max = 0;
  const { client } = await fixture(t, async (_, init) => {
    const text = JSON.parse(init.body).messages[1].content;
    active++; max = Math.max(active, max); order.push(text);
    await new Promise(resolve => setTimeout(resolve, 10)); active--;
    return text === 'first' ? new Response('', { status: 503 }) : answer('second answer');
  });
  const results = await Promise.allSettled([client.ask({ text: 'first', timestamp: 1 }), client.ask({ text: 'second', timestamp: 2 })]);
  assert.equal(max, 1); assert.deepEqual(order, ['first', 'second']);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[1].value, 'second answer');
});
test('same device event retains idempotency key; new event gets new key', async t => {
  const keys = [];
  const { client } = await fixture(t, async (_, init) => { keys.push(init.headers['Idempotency-Key']); return answer('ok'); });
  await client.ask({ text: 'hello', timestamp: 1 }); await client.ask({ text: 'hello', timestamp: 1 }); await client.ask({ text: 'hello', timestamp: 2 });
  assert.equal(keys[0], keys[1]); assert.notEqual(keys[0], keys[2]);
});
test('uncertain delivery is never retried or assigned a new session', async t => {
  let count = 0;
  const { client } = await fixture(t, async () => { count++; throw new Error('network disconnected'); });
  const id = client.sessionId;
  await assert.rejects(client.ask({ text: 'run task', timestamp: 1 }), { code: 'DELIVERY_UNCERTAIN' });
  assert.equal(count, 1); assert.equal(client.sessionId, id);
});
test('foreign session conflict is surfaced without retries', async t => {
  let count = 0;
  const { client } = await fixture(t, async () => { count++; return new Response('private diagnostic', { status: 409 }); });
  await assert.rejects(client.ask({ text: 'hello', timestamp: 1 }), { code: 'HTTP_409' }); assert.equal(count, 1);
});
test('backend change and corrupt saved state fail closed', async t => {
  const { options, dataDir } = await fixture(t, async () => answer('ok'));
  await assert.rejects(new HermesClient({ ...options, baseUrl: 'http://other/v1' }).init(), /endpoint changed/);
  await writeFile(join(dataDir, 'hermes-session.json'), 'broken');
  await assert.rejects(new HermesClient(options).init());
});
test('failed/cancelled/empty responses cannot become successful spoken replies', async t => {
  for (const response of [
    { choices: [{ finish_reason: 'error', message: { content: 'failed diagnostic' } }] },
    { choices: [{ finish_reason: 'cancelled', message: { content: 'cancelled' } }] },
    { choices: [{ message: { content: '' } }] },
  ]) {
    const { client } = await fixture(t, async () => Response.json(response));
    await assert.rejects(client.ask({ text: 'hello', timestamp: 1 }));
  }
});
test('API check is read-only and creates no session', async t => {
  const calls = [];
  const { options } = await fixture(t, async (url, init) => { calls.push({ url, init }); return Response.json({ data: [{ id: 'hermes-agent' }] }); });
  const checker = new HermesClient(options);
  assert.deepEqual(await checker.check(), ['hermes-agent']); assert.equal(checker.sessionId, undefined);
  assert.equal(calls[0].url, 'http://localhost:8642/v1/models'); assert.equal(calls[0].init.method, undefined);
});

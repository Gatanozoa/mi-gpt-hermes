import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

export class HermesError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export class HermesClient {
  constructor({ baseUrl, apiKey, dataDir, model = 'hermes-agent', timeoutMs = 180000, fetchImpl = fetch }) {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid HERMES_BASE_URL');
    if (!apiKey?.trim()) throw new Error('HERMES_API_KEY is required');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1000) throw new Error('Invalid HERMES_TIMEOUT_MS');
    this.baseUrl = url.href.replace(/\/$/, '');
    this.apiKey = apiKey; this.dataDir = dataDir; this.model = model;
    this.timeoutMs = timeoutMs; this.fetch = fetchImpl; this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(this.dataDir, { recursive: true });
    const file = join(this.dataDir, 'hermes-session.json');
    try {
      const state = JSON.parse(await readFile(file, 'utf8'));
      if (!/^[a-f0-9-]{36}$/.test(state.sessionId)) throw new Error('Invalid saved session');
      if (state.baseUrl !== this.baseUrl) throw new Error('Hermes endpoint changed; archive hermes-session.json before switching backend');
      this.sessionId = state.sessionId;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.sessionId = randomUUID();
      await writeFile(file + '.tmp', JSON.stringify({ sessionId: this.sessionId, baseUrl: this.baseUrl }), { mode: 0o600 });
      await rename(file + '.tmp', file);
    }
  }
  async check() {
    const response = await this.fetch(`${this.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(10000), redirect: 'error',
    });
    if (!response.ok) throw new HermesError(`HTTP_${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new HermesError('INVALID_MODELS_RESPONSE');
    return body.data.map(item => item.id);
  }
  ask(message) {
    // Upstream polls while an answer is running. Serialize requests to preserve turn order.
    const task = this.queue.then(() => this.send(message));
    this.queue = task.catch(() => {});
    return task;
  }
  async send({ text, timestamp }) {
    if (!text?.trim()) throw new HermesError('EMPTY_MESSAGE');
    if (!this.sessionId) throw new HermesError('NOT_INITIALIZED');
    const id = createHash('sha256').update(JSON.stringify([this.sessionId, timestamp, text])).digest('hex');
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json',
          'X-Hermes-Session-Id': this.sessionId, 'Idempotency-Key': id },
        signal: AbortSignal.timeout(this.timeoutMs),
        body: JSON.stringify({ model: this.model, stream: false, messages: [
          { role: 'system', content: '这是小爱音箱语音入口。请用简洁、自然的中文回答，避免表格、代码块和冗长链接。保留你原有的身份、工具及记忆。涉及用户偏好或过去讨论时，请按需检索已有记忆；用户明确要求记住时，请使用可用的记忆工具保存。' },
          { role: 'user', content: text },
        ] }),
      });
    } catch { throw new HermesError('DELIVERY_UNCERTAIN'); }
    // Never auto-retry: a tool may already have run before a timeout or failure.
    if (!response.ok) throw new HermesError(`HTTP_${response.status}`);
    let body;
    try { body = await response.json(); } catch { throw new HermesError('INVALID_RESPONSE'); }
    const choice = body.choices?.[0];
    if (['error', 'cancelled', 'tool_calls'].includes(choice?.finish_reason)) throw new HermesError('TURN_FAILED');
    const answer = choice?.message?.content;
    if (typeof answer !== 'string' || !answer.trim()) throw new HermesError('EMPTY_RESPONSE');
    return answer.trim();
  }
}

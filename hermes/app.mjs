import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { HermesClient } from './client.mjs';
import { parseTriggers, matchesTrigger, stripTrigger } from './triggers.mjs';

const env = process.env;
const dataDir = resolve(env.DATA_DIR || '/data');
const client = new HermesClient({
  baseUrl: env.HERMES_BASE_URL || 'http://127.0.0.1:8642/v1',
  apiKey: env.HERMES_API_KEY, dataDir,
  model: env.HERMES_MODEL || 'hermes-agent', timeoutMs: Number(env.HERMES_TIMEOUT_MS || 180000),
});

async function main() {
  if (process.argv.includes('--check')) {
    const models = await client.check();
    console.log('Hermes API 连接成功，可用模型：', models.join(', '));
    return;
  }
  for (const key of ['MI_USER', 'MI_PASS', 'MI_DID']) if (!env[key]?.trim()) throw new Error(`${key} is required`);
  const hardware = env.MI_HARDWARE || 'L05B';
  if (!['L05B', 'LX05'].includes(hardware)) throw new Error('MI_HARDWARE must be L05B or LX05');
  const keywords = parseTriggers(env.MI_AI_KEYWORDS);
  await client.init();
  await mkdir(dataDir, { recursive: true });
  // mi-service stores its Xiaomi login cache relative to the working directory.
  process.chdir(dataDir);
  const { AISpeaker } = await import('../dist-hermes/hermes-speaker.js');
  const speaker = new AISpeaker({
    userId: env.MI_USER, password: env.MI_PASS, did: env.MI_DID,
    name: '赫尔墨斯', streamResponse: false, debug: false, enableTrace: false,
    ttsCommand: hardware === 'LX05' ? [5, 1] : [5, 3],
    wakeUpCommand: hardware === 'LX05' ? [5, 3] : [5, 1],
    callAIKeywords: [],
    commands: [{
      match: message => matchesTrigger(message.text, keywords),
      run: message => speaker.askAIForAnswer(message),
    }],
    wakeUpKeywords: [], exitKeywords: [], switchSpeakerKeywords: [],
    onAIAsking: ['请稍等'], onAIReplied: [],
    askAI: async (message) => {
      const text = stripTrigger(message.text, keywords);
      if (!text) return { text: '请在触发词后说出你的问题。' };
      // Leave the original speaker event intact for upstream interruption checks.
      // Hermes receives only the question; timestamps still identify the device event.
      try { return { text: await client.ask({ ...message, text }) }; }
      catch (error) {
        // Do not log API responses, prompts, keys or Xiaomi credentials.
        console.error('Hermes 请求未完成：', error.code || 'UNKNOWN');
        return { text: error.code === 'DELIVERY_UNCERTAIN'
          ? '暂时没有收到结果，任务可能仍在执行，请先到微信确认。'
          : '这次请求没有正常完成，请稍后查看赫尔墨斯的状态。' };
      }
    },
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { speaker.stop(); process.exit(0); });
  console.log(`MiGPT Hermes 已启动，音箱配置 ${hardware}，连续对话关闭。`);
  console.log('Hermes 触发前缀：', keywords.join('、'));
  await speaker.run();
}
main().catch(error => {
  console.error('启动失败：', error.code || (error.message?.includes('required') ? error.message : '请检查配置和数据目录，详细连接信息不会输出。'));
  process.exitCode = 1;
});

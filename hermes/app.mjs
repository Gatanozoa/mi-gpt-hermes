import { resolve } from 'node:path';
import { HermesClient } from './client.mjs';
import { parseTriggers, voiceCommands } from './triggers.mjs';

const env = process.env;
const dataDir = resolve(env.DATA_DIR || '/data');
async function main() {
  const client = new HermesClient({
    baseUrl: env.HERMES_BASE_URL || 'http://hermes:8642/v1',
    apiKey: env.HERMES_API_KEY, dataDir,
    model: env.HERMES_MODEL || 'hermes-agent', timeoutMs: Number(env.HERMES_TIMEOUT_MS || 180000),
  });
  if (process.argv.includes('--check')) {
    const models = await client.check();
    console.log('Hermes API 连接成功，可用模型：', models.join(', '));
    return;
  }
  for (const key of ['MI_USER', 'MI_PASS', 'MI_DID']) if (!env[key]?.trim()) throw new Error(`${key} is required`);
  const hardware = env.MI_HARDWARE || 'L05B';
  if (!['L05B', 'LX05'].includes(hardware)) throw new Error('MI_HARDWARE must be L05B or LX05');
  const keywords = parseTriggers(env.MI_AI_KEYWORDS);
  try { await client.init(); } catch (error) {
    throw new Error(`无法读写音箱会话文件（DATA_DIR/hermes-session.json）：${error.code || '文件操作失败'}`);
  }
  // mi-service stores its Xiaomi login cache relative to the working directory.
  process.chdir(dataDir);
  const { AISpeaker } = await import('../dist-hermes/hermes-speaker.js');
  const speaker = new AISpeaker({
    userId: env.MI_USER, password: env.MI_PASS, did: env.MI_DID,
    name: '赫尔墨斯', streamResponse: false, debug: false, enableTrace: false,
    ttsCommand: hardware === 'LX05' ? [5, 1] : [5, 3],
    wakeUpCommand: hardware === 'LX05' ? [5, 3] : [5, 1],
    callAIKeywords: [],
    commands: voiceCommands(keywords, message => speaker.askAIForAnswer(message)),
    wakeUpKeywords: [], exitKeywords: [], switchSpeakerKeywords: [],
    onAIAsking: ['请稍等'], onAIReplied: [],
    askAI: async (message) => {
      if (!message.text) return { text: '请在触发词后说出你的问题。' };
      try { return { text: await client.ask(message) }; }
      catch (error) {
        // Do not log API responses, prompts, keys or Xiaomi credentials.
        console.error('Hermes 请求未完成：', error.code || 'UNKNOWN');
        if (error.code === 'CONNECTION_FAILED') return { text: '没有连上赫尔墨斯，这次问题没有送达。' };
        return { text: error.code === 'DELIVERY_UNCERTAIN'
          ? '暂时没有收到结果，任务可能仍在执行，请先到微信确认。'
          : '这次请求没有正常完成，请稍后查看赫尔墨斯的状态。' };
      }
    },
  });
  const shutdown = async () => {
    console.info('正在停止接收提问，等待已接收的问题处理和播报完成。');
    await speaker.drain();
    process.exit(0);
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
  console.log(`MiGPT Hermes 已启动，音箱配置 ${hardware}，连续对话关闭。`);
  console.log('Hermes 触发前缀：', keywords.join('、'));
  try { await speaker.run(); } catch (error) {
    throw new Error(`小米音箱服务启动或运行失败，请检查账号、设备和网络（${error.code || '未知错误'}）`);
  }
}
main().catch(error => {
  console.error('启动失败：', error.cause?.code || error.code || error.message);
  process.exitCode = 1;
});

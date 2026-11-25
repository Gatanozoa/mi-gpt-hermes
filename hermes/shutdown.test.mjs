import test from 'node:test';
import assert from 'node:assert/strict';
import { AISpeaker } from '../dist-hermes/hermes-speaker.js';

test('drain waits for an accepted question and its final TTS command', { timeout: 5000 }, async () => {
  const asking = Promise.withResolvers();
  const answer = Promise.withResolvers();
  const speaking = Promise.withResolvers();
  const playback = Promise.withResolvers();
  const speaker = new AISpeaker({
    callAIKeywords: ['问问AI'], onAIAsking: [], streamResponse: false,
    askAI: async () => { asking.resolve(); return answer.promise; },
  });
  speaker.initMiServices = async () => { speaker.MiNA = { pause: async () => {} }; };
  speaker.activeKeepAliveMode = async () => {};
  speaker.exitKeepAliveIfNeeded = async () => {};
  let polls = 0;
  speaker.fetchNextMessage = async () => {
    polls++;
    speaker.currentQueryMsg = { timestamp: polls, text: '问问AI你好' };
    return speaker.currentQueryMsg;
  };
  speaker.response = async ({ text }) => { speaking.resolve(text); await playback.promise; };
  const run = speaker.run();
  await asking.promise;
  const drained = speaker.drain();
  answer.resolve({ text: '你好' });
  assert.equal(await speaking.promise, '你好');
  assert.equal(speaker.status, 'running');
  playback.resolve();
  await drained;
  await run;
  assert.equal(speaker.status, 'stopped');
  assert.equal(polls, 1);
});

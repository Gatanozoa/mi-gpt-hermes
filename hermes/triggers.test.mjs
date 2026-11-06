import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_TRIGGERS, parseTriggers, matchesTrigger } from './triggers.mjs';

test('only requested prefixes match by default, including English case variants', () => {
  const words = parseTriggers();
  for (const prefix of DEFAULT_TRIGGERS) assert.equal(matchesTrigger(prefix + '今天的安排', words), true);
  assert.equal(matchesTrigger(' 问问Hermes今天的安排', words), true);
  for (const text of ['请开灯', '你好', '问问天气', '赫尔墨斯你好', '告诉小爱你好', '我想问问爱马仕']) {
    assert.equal(matchesTrigger(text, words), false, text);
  }
});

test('environment supports custom prefixes, Chinese commas and rejects an empty list', () => {
  assert.deepEqual(parseTriggers(' 找助手， 问小赫,找助手 '), ['找助手', '问小赫']);
  assert.equal(matchesTrigger('找助手帮个忙', parseTriggers('找助手')), true);
  assert.equal(matchesTrigger('问问hermes你好', parseTriggers('找助手')), false);
  assert.throws(() => parseTriggers(' ,， '), /MI_AI_KEYWORDS/);
});

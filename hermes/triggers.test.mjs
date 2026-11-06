import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTriggers, matchesTrigger } from './triggers.mjs';

test('only configured prefixes match, including English case variants', () => {
  const words = parseTriggers('询问助手,askHermes');
  for (const prefix of words) assert.equal(matchesTrigger(prefix + '今天的安排', words), true);
  assert.equal(matchesTrigger(' AskHermes今天的安排', words), true);
  for (const text of ['请开灯', '你好', '问问天气', '赫尔墨斯你好', '告诉小爱你好', '我想问问爱马仕']) {
    assert.equal(matchesTrigger(text, words), false, text);
  }
});

test('missing or empty environment has no fallback prefixes', () => {
  for (const value of [undefined, null, '', '  ', ',，']) {
    assert.throws(() => parseTriggers(value), /MI_AI_KEYWORDS is required/);
  }
});

test('environment supports custom prefixes, Chinese commas and rejects an empty list', () => {
  assert.deepEqual(parseTriggers(' 找助手， 问小赫,找助手 '), ['找助手', '问小赫']);
  assert.equal(matchesTrigger('找助手帮个忙', parseTriggers('找助手')), true);
  assert.equal(matchesTrigger('问问hermes你好', parseTriggers('找助手')), false);
  assert.throws(() => parseTriggers(' ,， '), /MI_AI_KEYWORDS/);
});

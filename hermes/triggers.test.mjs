import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTriggers, matchesTrigger, stripTrigger } from './triggers.mjs';

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

test('strip only the leading trigger and separator, preserving question content', () => {
  const words = parseTriggers('问问AI,告诉助手');
  assert.equal(stripTrigger('问问AI里面有几张我的照片', words), '里面有几张我的照片');
  assert.equal(stripTrigger('  问问ai， ：里面有几张我的照片？', words), '里面有几张我的照片？');
  assert.equal(stripTrigger('告诉助手：请记住“问问AI”是触发词', words), '请记住“问问AI”是触发词');
  assert.equal(stripTrigger('问问AI -5 加 3 是多少？', words), '-5 加 3 是多少？');
  assert.equal(stripTrigger('我想问问AI这件事', words), '我想问问AI这件事');
});

test('strip longest prefix once and detect an empty question', () => {
  const words = parseTriggers('问问,问问AI');
  assert.equal(stripTrigger('问问AI，解释一下', words), '解释一下');
  assert.equal(stripTrigger('问问AI，问问AI是什么意思', words), '问问AI是什么意思');
  assert.equal(stripTrigger('问问AI， ！', words), '');
});

export function parseTriggers(value) {
  if (typeof value !== 'string') throw new Error('MI_AI_KEYWORDS is required; configure prefixes in .env');
  const words = [...new Set(value.split(/[,，]/).map(word => word.trim()).filter(Boolean))];
  if (!words.length) throw new Error('MI_AI_KEYWORDS is required; configure at least one prefix in .env');
  return words;
}

export function matchesTrigger(text, words) {
  return findTrigger(text, words) !== undefined;
}

function findTrigger(text, words) {
  const input = text.trimStart().toLowerCase();
  // Prefer the most specific prefix when configured prefixes overlap.
  return [...words].sort((a, b) => b.length - a.length)
    .find(word => input.startsWith(word.toLowerCase()));
}

export function stripTrigger(text, words) {
  const input = text.trimStart();
  const prefix = findTrigger(input, words);
  if (prefix === undefined) return text;
  return input.slice(prefix.length).replace(/^[\s,，:：;；。.!！?？、]+/u, '').trim();
}

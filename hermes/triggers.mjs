export function parseTriggers(value) {
  if (typeof value !== 'string') throw new Error('MI_AI_KEYWORDS is required; configure prefixes in .env');
  const words = [...new Set(value.split(/[,，]/).map(word => word.trim()).filter(Boolean))];
  if (!words.length) throw new Error('MI_AI_KEYWORDS is required; configure at least one prefix in .env');
  return words;
}

export function matchesTrigger(text, words) {
  const input = text.trimStart().toLowerCase();
  return words.some(word => input.startsWith(word.toLowerCase()));
}

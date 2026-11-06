export const DEFAULT_TRIGGERS = ['问问hermes', '问问爱马仕', '问问赫尔墨斯', '告诉爱马仕', '告诉赫尔墨斯'];

export function parseTriggers(value) {
  if (value === undefined) return [...DEFAULT_TRIGGERS];
  const words = [...new Set(value.split(/[,，]/).map(word => word.trim()).filter(Boolean))];
  if (!words.length) throw new Error('MI_AI_KEYWORDS requires at least one prefix');
  return words;
}

export function matchesTrigger(text, words) {
  const input = text.trimStart().toLowerCase();
  return words.some(word => input.startsWith(word.toLowerCase()));
}

export function parseTriggers(value) {
  if (typeof value !== 'string') throw new Error('MI_AI_KEYWORDS is required; configure prefixes in .env');
  const words = [...new Set(value.split(/[,，]/).map(word => word.trim()).filter(Boolean))];
  if (!words.length) throw new Error('MI_AI_KEYWORDS is required; configure at least one prefix in .env');
  return words;
}

export function voiceCommands(words, handleQuestion) {
  return [...words].sort((a, b) => b.length - a.length).map(prefix => ({
    match: message => message.text.trimStart().toLowerCase().startsWith(prefix.toLowerCase()),
    run: message => handleQuestion({
      ...message,
      text: message.text.trimStart().slice(prefix.length).replace(/^[\s,，:：;；。.!！?？、]+/u, '').trim(),
    }),
  }));
}

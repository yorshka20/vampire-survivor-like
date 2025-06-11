export function emojiToBase64(emoji: string): string {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Set canvas size
  canvas.width = 64;
  canvas.height = 64;

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw emoji
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, canvas.width / 2, canvas.height / 2);

  // Convert to base64
  return canvas.toDataURL('image/png');
}

// Cache for emoji base64 strings
const emojiCache: Record<string, string> = {};

export function getEmojiBase64(emoji: string): string {
  if (!emojiCache[emoji]) {
    emojiCache[emoji] = emojiToBase64(emoji);
  }
  return emojiCache[emoji];
}

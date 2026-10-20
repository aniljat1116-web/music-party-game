// Generates consistent, beautiful gradient pairs and initials based on player nickname

const GRADIENTS: [string, string][] = [
  ['#8b5cf6', '#6366f1'], // Purple to Indigo
  ['#06b6d4', '#0284c7'], // Cyan to Blue
  ['#ec4899', '#8b5cf6'], // Pink to Purple
  ['#f59e0b', '#ef4444'], // Amber to Red
  ['#10b981', '#059669'], // Emerald to Green
  ['#6366f1', '#3b82f6'], // Indigo to Sky
  ['#14b8a6', '#06b6d4'], // Teal to Cyan
  ['#d946ef', '#8b5cf6'], // Fuchsia to Purple
  ['#f97316', '#eab308']  // Orange to Yellow
];

export function getPlayerGradient(nickname: string): [string, string] {
  if (!nickname) return GRADIENTS[0];
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index] || GRADIENTS[0];
}

export function getPlayerInitials(nickname: string): string {
  if (!nickname) return '?';
  const parts = nickname.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return nickname.slice(0, 2).toUpperCase();
}

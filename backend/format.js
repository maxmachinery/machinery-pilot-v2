/**
 * Convert a UTC ISO timestamp to Europe/London local time string.
 * Automatically handles BST/GMT based on the date.
 * Output format: "18/05/2026, 11:30:00"
 */
export function formatLondonTime(utcIsoString) {
  if (!utcIsoString) return '';
  const date = new Date(utcIsoString);
  if (isNaN(date)) return utcIsoString;
  return date.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Return a human-relative time string ("2 min ago", "3h ago") using
 * Europe/London as the reference. Falls back to formatLondonTime for
 * dates older than a week.
 */
export function formatLondonRelative(utcIsoString) {
  if (!utcIsoString) return '';
  const date = new Date(utcIsoString);
  if (isNaN(date)) return utcIsoString;
  const now = new Date();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatLondonTime(utcIsoString);
}

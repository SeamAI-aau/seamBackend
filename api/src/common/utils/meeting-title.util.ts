/** Default meeting title when none is provided at upload, e.g. "Meeting · May 28, 2026 · 8:16 AM". */
export function buildDefaultMeetingTitle(date: Date = new Date()): string {
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  const lastComma = formatted.lastIndexOf(', ');
  if (lastComma === -1) {
    return `Meeting · ${formatted}`;
  }

  const datePart = formatted.slice(0, lastComma);
  const timePart = formatted.slice(lastComma + 2);
  return `Meeting · ${datePart} · ${timePart}`;
}

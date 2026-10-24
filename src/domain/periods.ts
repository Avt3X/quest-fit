// Challenge window presets in the device's local time zone. The time zone name is sent with the
// challenge so the server and every participant agree on the boundaries.

export type PeriodPreset = 'weekly' | 'monthly' | 'yearly';

export interface Window {
  start: Date;
  end: Date;
}

/** Monday 00:00 local of the week containing `now`. */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - weekday);
  return d;
}

export function periodWindow(preset: PeriodPreset, now: Date): Window {
  if (preset === 'weekly') {
    const start = startOfWeek(now);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (preset === 'monthly') {
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: new Date(now.getFullYear(), now.getMonth() + 1, 1) };
  }
  return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear() + 1, 0, 1) };
}

/** Inclusive local start date and exclusive end date chosen in a calendar UI. */
export function customWindow(startDay: Date, lastDayInclusive: Date): Window {
  const start = new Date(startDay.getFullYear(), startDay.getMonth(), startDay.getDate());
  const end = new Date(lastDayInclusive.getFullYear(), lastDayInclusive.getMonth(), lastDayInclusive.getDate() + 1);
  return { start, end };
}

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function formatWindow(start: Date, end: Date, timeZone?: string): string {
  const lastDay = new Date(end.getTime() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(timeZone ? { timeZone } : {}) });
  return `${fmt(start)} – ${fmt(lastDay)}`;
}

export function formatDeadline(end: Date, timeZone: string): string {
  const text = end.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
    timeZoneName: 'short',
  });
  return text;
}

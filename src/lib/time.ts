export function formatCountdown(target: string): string {
  const now = Date.now();
  const diff = new Date(target).getTime() - now;

  if (diff <= 0) return 'Now';

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);

  if (days > 0) return `${days}d ${hours}h remaining`;
  if (hours > 0) return `${hours}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

export function formatDateTime(target: string): string {
  return new Date(target).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatFullDate(target: string): string {
  return new Date(target).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function toLocalInput(target: string): string {
  const d = new Date(target);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalInput(local: string): string {
  return new Date(local).toISOString();
}

// Build an ISO string from a date + optional time; blank time defaults to 00:00.
export function fromDateAndTime(date: string, time: string): string {
  const t = time || '00:00';
  return new Date(`${date}T${t}`).toISOString();
}

export function toLocalDate(target: string): string {
  const d = new Date(target);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function toLocalTime(target: string): string {
  const d = new Date(target);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(11, 16);
}

// Common timezones for the selector
export const COMMON_TIMEZONES: { label: string; value: string }[] = [
  { label: 'Use my device timezone', value: '' },
  { label: 'UTC', value: 'UTC' },
  { label: 'New York (EST/EDT)', value: 'America/New_York' },
  { label: 'Chicago (CST/CDT)', value: 'America/Chicago' },
  { label: 'Denver (MST/MDT)', value: 'America/Denver' },
  { label: 'Los Angeles (PST/PDT)', value: 'America/Los_Angeles' },
  { label: 'Anchorage (AKST/AKDT)', value: 'America/Anchorage' },
  { label: 'London (GMT/BST)', value: 'Europe/London' },
  { label: 'Paris (CET/CEST)', value: 'Europe/Paris' },
  { label: 'Berlin (CET/CEST)', value: 'Europe/Berlin' },
  { label: 'Dubai (GST)', value: 'Asia/Dubai' },
  { label: 'India (IST)', value: 'Asia/Kolkata' },
  { label: 'Singapore (SGT)', value: 'Asia/Singapore' },
  { label: 'Tokyo (JST)', value: 'Asia/Tokyo' },
  { label: 'Sydney (AEST/AEDT)', value: 'Australia/Sydney' },
  { label: 'Auckland (NZST/NZDT)', value: 'Pacific/Auckland' },
];

export function timezoneLabel(tz: string | null): string {
  if (!tz) return '';
  const found = COMMON_TIMEZONES.find((t) => t.value === tz);
  if (found) return found.label;
  return tz;
}

// Format a date/time in a specific IANA timezone
export function formatInTimezone(target: string, tz: string | null): string {
  const d = new Date(target);
  if (!tz) {
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }
  try {
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: tz,
      timeZoneName: 'short',
    });
  } catch {
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }
}

const reject = message => { throw new Error(message); };

/** Bounded one-day timed ICS import; unsupported recurrence never disappears silently. */
export function previewCalendar(text, ownerId = 'priya', day = undefined) {
  if (typeof text !== 'string' || text.length > 50000 || !text.includes('BEGIN:VCALENDAR')) reject('Choose an ICS calendar smaller than 50 KB.');
  if (!['alex', 'priya'].includes(ownerId)) reject('Choose Alex or Priya as the calendar owner.');
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const blocks = [...unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)END:VEVENT/g)];
  if (!blocks.length || blocks.length > 40) reject('Import 1–40 timed commitments from one day.');
  const events = [];
  for (const [, block] of blocks) {
    if (/^(RRULE|RDATE|EXDATE|RECURRENCE-ID)[;:]/m.test(block)) reject('Recurring events are not supported. Export individual events for the chosen day.');
    if (/^STATUS:CANCELLED\s*$/m.test(block)) continue;
    const fields = {};
    for (const line of block.split(/\r?\n/)) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const key = line.slice(0, separator);
      fields[key.split(';')[0]] = { key, value: line.slice(separator + 1).trim() };
    }
    const parse = field => {
      if (!field || /VALUE=DATE(?:;|$)/.test(field.key)) reject('All-day events are not supported. Import timed commitments.');
      if (field.key.includes('TZID=')) reject('Export floating local times or UTC timestamps. Named timezones are not supported in this bounded importer.');
      const match = field.value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
      if (!match) reject('A calendar event has an invalid date or time.');
      const [, y, m, d, h, minute, second = '00', utc] = match;
      const date = new Date(Date.UTC(+y, +m - 1, +d, +h, +minute, +second));
      if (date.getUTCFullYear() !== +y || date.getUTCMonth() !== +m - 1 || date.getUTCDate() !== +d || +h > 23 || +minute > 59 || +second > 59) reject('A calendar event has an invalid date or time.');
      // Floating times are the demo household's local wall clock. UTC is displayed in India time.
      if (utc) date.setUTCMinutes(date.getUTCMinutes() + 330);
      return { day: date.toISOString().slice(0, 10), minutes: date.getUTCHours() * 60 + date.getUTCMinutes() };
    };
    const start = parse(fields.DTSTART), end = parse(fields.DTEND);
    if (start.day !== end.day || end.minutes <= start.minutes) reject('Commitments must start and finish on the same day.');
    const title = (fields.SUMMARY?.value ?? 'Imported commitment').replace(/\\n/g, ' ').replace(/\\([,;\\])/g, '$1').slice(0, 120);
    events.push({ title, owner: ownerId, start: start.minutes, end: end.minutes, day: start.day, location: (fields.LOCATION?.value ?? 'Home').slice(0, 80), kind: 'work', status: 'scheduled', flexible: false });
  }
  const chosenDay = day ?? events[0]?.day;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chosenDay ?? '')) reject('Choose a calendar day.');
  const selected = events.filter(event => event.day === chosenDay);
  if (!selected.length) reject('No timed commitments were found on the selected day.');
  return { day: chosenDay, ownerId, events: selected, skipped: events.length - selected.length, timezone: 'Asia/Kolkata (UTC) or floating local time' };
}

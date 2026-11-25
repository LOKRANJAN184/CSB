// Formatting helpers for money, dates and times (Indian conventions).

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
export const rupees = (n) => '₹' + inr.format(Number(n) || 0);
export const signedRupees = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + rupees(Math.abs(n));

// Dates are always 'YYYY-MM-DD' strings in the shop's time zone (India).
const TZ = 'Asia/Kolkata';
export const todayStr = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

const parse = (s) => new Date(s + 'T12:00:00Z'); // noon UTC: safe from time-zone edge cases
const toStr = (d) => d.toISOString().slice(0, 10);

export const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return toStr(d); };
export const addMonths = (m, n) => { const d = parse(m + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return toStr(d).slice(0, 7); };
export const monthStart = (s) => s.slice(0, 8) + '01';
export const monthEnd = (m) => { const d = parse(m + '-01'); d.setUTCMonth(d.getUTCMonth() + 1, 0); return toStr(d); };

export const fmtDate = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  parse(s).toLocaleDateString('en-IN', { timeZone: 'UTC', ...opts });
export const fmtMonth = (m) => parse(m + '-01').toLocaleDateString('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
export const fmtDateTime = (iso) => new Date(iso).toLocaleString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export function relativeDay(s) {
  const t = todayStr();
  if (s === t) return 'Today';
  if (s === addDays(t, -1)) return 'Yesterday';
  return fmtDate(s, { weekday: 'long' });
}

// Attendance times are stored as "08:00 AM"; <input type="time"> uses "08:00".
export function to24h(t) {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(t || '');
  if (!m) return '';
  let h = Number(m[1]) % 12;
  if (m[3] === 'PM') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
export function to12h(t) {
  const m = /^(\d{2}):(\d{2})$/.exec(t || '');
  if (!m) return '';
  const h = Number(m[1]);
  return `${String(h % 12 || 12).padStart(2, '0')}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const initials = (name = '') => name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
export const maskPhone = (p = '') => p.length === 10 ? `${p.slice(0, 2)}••• ••${p.slice(-3)}` : p;

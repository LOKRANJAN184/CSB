const env = require('../config/env');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// "en-CA" formats dates as YYYY-MM-DD, which is exactly what we store.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: env.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in the shop's time zone, as 'YYYY-MM-DD'. */
const today = () => dayFormatter.format(new Date());

const isDate = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(s));
const isMonth = (s) => typeof s === 'string' && MONTH_RE.test(s);

/** Number of days between two 'YYYY-MM-DD' strings, inclusive. */
const daysInclusive = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;

/** All 'YYYY-MM-DD' strings from `from` through `to`, inclusive. */
const eachDate = (from, to) => {
  const out = [];
  const start = Date.parse(from + 'T00:00:00Z');
  const end = Date.parse(to + 'T00:00:00Z');
  for (let ms = start; ms <= end; ms += 86400000) {
    out.push(new Date(ms).toISOString().slice(0, 10));
  }
  return out;
};

const daysInMonth = (month) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

module.exports = { today, isDate, isMonth, daysInclusive, eachDate, daysInMonth };

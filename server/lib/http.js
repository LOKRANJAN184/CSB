// Small helpers so every route answers in the same shape:
//   success → { ok: true, ...data }
//   failure → { ok: false, code, message }

class HttpError extends Error {
  constructor(status, message, code = 'ERROR', extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const badRequest = (msg) => new HttpError(400, msg, 'BAD_REQUEST');
const unauthorized = (msg = 'Please log in again.', code = 'UNAUTHORIZED') => new HttpError(401, msg, code);
const forbidden = (msg = 'You do not have permission to do that.', code = 'FORBIDDEN', extra) =>
  new HttpError(403, msg, code, extra);
const notFound = (msg = 'Not found.') => new HttpError(404, msg, 'NOT_FOUND');

/** Turn anything into a finite, non-negative money amount rounded to paise. */
const money = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
};

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Who did something, in the shape stored on records and audit logs. */
const actor = (user) => ({ userId: String(user.id), name: user.name, role: user.role });

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound, money, str, actor };

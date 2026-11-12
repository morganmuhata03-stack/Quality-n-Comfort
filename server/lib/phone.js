// Phone numbers are stored in international format (E.164) so that
// 0977 123 456, 260977123456 and +260 977 123 456 are the same account.
// Numbers without a country code are treated as Zambian (+260).
const PHONE_REGEX = /^\+[1-9][0-9]{7,14}$/;

function normalizePhone(raw) {
  let p = String(raw ?? "").replace(/[\s\-().]/g, "");
  if (p.startsWith("00")) p = "+" + p.slice(2);
  if (p.startsWith("+")) return p;
  if (/^0[0-9]{9}$/.test(p)) return "+260" + p.slice(1);
  if (/^260[0-9]{9}$/.test(p)) return "+" + p;
  if (/^[0-9]{9}$/.test(p)) return "+260" + p;
  return p;
}

function isValidPhone(phone) {
  if (!PHONE_REGEX.test(phone)) return false;
  return !phone.startsWith("+260") || phone.length === 13; // +260 + 9 digits
}

module.exports = { normalizePhone, isValidPhone };

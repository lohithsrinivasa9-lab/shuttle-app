// Shared server-side input validation. Mirrors the client-side checks in public/book.js so
// guests get instant feedback in the browser, but nothing gets into the database without also
// passing these same rules here.

// Letters, spaces, hyphens, apostrophes, periods only (covers names like "Mary-Jane" or
// "O'Brien") - no digits or stray symbols.
const NAME_RE = /^[A-Za-z][A-Za-z'\-.\s]{0,79}$/;
function isValidName(name) {
  return typeof name === "string" && NAME_RE.test(name.trim());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email) {
  return typeof email === "string" && EMAIL_RE.test(email.trim());
}

// Common countries with their expected national-number digit length(s). Not exhaustive - any
// dial code not listed here falls back to a generic 4-15 digit sanity check rather than being
// rejected outright, since we can't hardcode every country's numbering plan.
const PHONE_COUNTRIES = [
  { code: "US", name: "United States", dial: "+1", digits: [10] },
  { code: "CA", name: "Canada", dial: "+1", digits: [10] },
  { code: "GB", name: "United Kingdom", dial: "+44", digits: [10] },
  { code: "IN", name: "India", dial: "+91", digits: [10] },
  { code: "AU", name: "Australia", dial: "+61", digits: [9] },
  { code: "DE", name: "Germany", dial: "+49", digits: [10, 11] },
  { code: "FR", name: "France", dial: "+33", digits: [9] },
  { code: "MX", name: "Mexico", dial: "+52", digits: [10] },
  { code: "BR", name: "Brazil", dial: "+55", digits: [10, 11] },
  { code: "JP", name: "Japan", dial: "+81", digits: [10] },
  { code: "CN", name: "China", dial: "+86", digits: [11] },
  { code: "IT", name: "Italy", dial: "+39", digits: [9, 10] },
  { code: "ES", name: "Spain", dial: "+34", digits: [9] },
  { code: "AE", name: "United Arab Emirates", dial: "+971", digits: [9] },
  { code: "SG", name: "Singapore", dial: "+65", digits: [8] },
  { code: "NZ", name: "New Zealand", dial: "+64", digits: [8, 9] },
  { code: "ZA", name: "South Africa", dial: "+27", digits: [9] },
  { code: "IE", name: "Ireland", dial: "+353", digits: [9] },
  { code: "NL", name: "Netherlands", dial: "+31", digits: [9] },
  { code: "PH", name: "Philippines", dial: "+63", digits: [10] }
];

function isValidPhoneDigits(dial, digitsOnly) {
  if (!digitsOnly) return false;
  const country = PHONE_COUNTRIES.find((c) => c.dial === dial);
  const len = digitsOnly.length;
  if (country) return country.digits.includes(len);
  return len >= 4 && len <= 15; // generic fallback for an unlisted dial code
}

module.exports = { isValidName, isValidEmail, PHONE_COUNTRIES, isValidPhoneDigits };

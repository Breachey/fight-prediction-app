export function normalizePhoneNumber(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function isValidPhoneNumber(value) {
  return /^\d{10}$/.test(normalizePhoneNumber(value));
}

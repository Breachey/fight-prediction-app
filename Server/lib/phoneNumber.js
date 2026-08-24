function normalizePhoneNumber(value) {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function isValidPhoneNumber(value) {
  return /^\d{10}$/.test(normalizePhoneNumber(value));
}

module.exports = {
  isValidPhoneNumber,
  normalizePhoneNumber,
};

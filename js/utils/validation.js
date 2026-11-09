export function isRequired(value) {
  return value !== undefined && value !== null && String(value).trim().length > 0;
}

export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

export function isValidDayOfMonth(value) {
  return Number.isInteger(value) && value >= 1 && value <= 31;
}

export function isValidISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

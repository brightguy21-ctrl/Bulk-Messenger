/**
 * utils/contacts.js
 * Contact model helpers and phone number normalisation
 */

/**
 * @typedef {Object} Contact
 * @property {string} id          - UUID
 * @property {string} name        - Display name
 * @property {string} phone       - Normalised E.164 phone number (e.g. +233244123456)
 * @property {string} [group]     - Optional group label
 * @property {string} [custom]    - Optional custom value for {{custom}} variable
 * @property {number} createdAt   - Unix timestamp ms
 */

/**
 * Normalise a raw phone string to E.164.
 * Handles inputs starting with 0, +, country code, or raw digits.
 *
 * @param {string} raw         - Raw phone input from user / file
 * @param {string} [defaultCC] - Country code to prepend if missing (e.g. "+233")
 * @returns {string|null}      - E.164 string or null if invalid
 */
export function normalisePhone(raw, defaultCC = '+1') {
  if (!raw) return null;

  let digits = String(raw).trim();

  // Remove all non-digit, non-plus characters
  digits = digits.replace(/[^\d+]/g, '');

  // Already in E.164 (starts with +)
  if (digits.startsWith('+')) {
    return digits.length >= 7 ? digits : null;
  }

  // Starts with 00 → replace with +
  if (digits.startsWith('00')) {
    digits = '+' + digits.slice(2);
    return digits.length >= 7 ? digits : null;
  }

  // Starts with 0 → local format, prepend country code (strip leading 0)
  if (digits.startsWith('0')) {
    digits = defaultCC + digits.slice(1);
    return digits.length >= 10 ? digits : null;
  }

  // Pure digits — assume already has country code prefix (no leading 0 or +)
  digits = defaultCC + digits;
  return digits.length >= 10 ? digits : null;
}

/**
 * Create a new Contact object.
 * @param {Partial<Contact> & { phone: string }} data
 * @param {string} [defaultCC]
 * @returns {Contact|null}
 */
export function createContact(data, defaultCC = '+1') {
  const phone = normalisePhone(data.phone, defaultCC);
  if (!phone) return null;

  return {
    id: crypto.randomUUID(),
    name: (data.name || '').trim() || phone,
    phone,
    group: (data.group || '').trim(),
    custom: (data.custom || '').trim(),
    createdAt: Date.now(),
  };
}

/**
 * Deduplicate contacts by phone number.
 * @param {Contact[]} contacts
 * @returns {Contact[]}
 */
export function deduplicate(contacts) {
  const seen = new Set();
  return contacts.filter((c) => {
    if (seen.has(c.phone)) return false;
    seen.add(c.phone);
    return true;
  });
}

/**
 * Get unique group names from a contacts array.
 * @param {Contact[]} contacts
 * @returns {string[]}
 */
export function getGroups(contacts) {
  const groups = new Set(contacts.map((c) => c.group).filter(Boolean));
  return [...groups].sort();
}

/**
 * Filter contacts by search query (name or phone).
 * @param {Contact[]} contacts
 * @param {string} query
 * @returns {Contact[]}
 */
export function filterContacts(contacts, query) {
  const q = query.toLowerCase().trim();
  if (!q) return contacts;
  return contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.group || '').toLowerCase().includes(q)
  );
}

/**
 * Get first letter(s) of a name for avatar display.
 * @param {string} name
 * @returns {string}
 */
export function getInitials(name) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

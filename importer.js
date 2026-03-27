/**
 * utils/importer.js
 * Parse Excel (.xlsx/.xls), CSV (.csv/.txt), and PDF contact files.
 *
 * Expected columns (case-insensitive): name, phone / number, group, custom
 * Phone can also be in the first numeric column if no header matches.
 */

import { createContact, deduplicate } from './contacts.js';

/**
 * @param {File} file
 * @param {string} defaultCC - Default country code for normalisation
 * @returns {Promise<import('./contacts.js').Contact[]>}
 */
export async function importFile(file, defaultCC = '+1') {
  const ext = file.name.split('.').pop().toLowerCase();

  switch (ext) {
    case 'xlsx':
    case 'xls':
      return importExcel(file, defaultCC);
    case 'csv':
    case 'txt':
      return importCSV(file, defaultCC);
    case 'pdf':
      return importPDF(file, defaultCC);
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

// ── Excel ────────────────────────────────────────────────

async function importExcel(file, defaultCC) {
  // XLSX must be loaded via lib/xlsx.full.min.js (available globally)
  if (typeof XLSX === 'undefined') {
    throw new Error('XLSX library not loaded. Ensure lib/xlsx.full.min.js is included.');
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  return rowsToContacts(rows, defaultCC);
}

// ── CSV ──────────────────────────────────────────────────

async function importCSV(file, defaultCC) {
  const text = await file.text();
  const rows = parseCSVText(text);
  return rowsToContacts(rows, defaultCC);
}

/** Minimal CSV parser — handles quoted fields and multiple delimiters. */
function parseCSVText(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter).map((h) => h.toLowerCase().trim());

  return lines.slice(1).map((line) => {
    const values = splitLine(line, delimiter);
    const row = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
}

function detectDelimiter(line) {
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of line) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function splitLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim().replace(/^"|"$/g, ''));
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim().replace(/^"|"$/g, ''));
  return result;
}

// ── PDF ──────────────────────────────────────────────────

async function importPDF(file, defaultCC) {
  // Extract all text from the PDF and search for phone patterns
  const text = await extractPDFText(file);
  return extractPhonesFromText(text, defaultCC);
}

async function extractPDFText(file) {
  // Use pdfjsLib if available (loaded externally), else fall back to raw text scrape
  if (typeof pdfjsLib !== 'undefined') {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map((item) => item.str).join(' ') + '\n';
    }
    return fullText;
  }

  // Fallback: read as raw binary and extract printable ASCII runs
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c >= 0x20 && c < 0x7f) text += String.fromCharCode(c);
    else if (c === 0x0a || c === 0x0d) text += '\n';
  }
  return text;
}

/**
 * Extract phone numbers from free-form text.
 * @param {string} text
 * @param {string} defaultCC
 * @returns {import('./contacts.js').Contact[]}
 */
function extractPhonesFromText(text, defaultCC) {
  // Match numbers: starts with +, 00, or 0; 7–15 digits
  const phoneRegex = /(?:\+|00|0)\d[\d\s\-().]{5,17}\d/g;
  const matches = text.match(phoneRegex) || [];

  const contacts = matches
    .map((raw, idx) => {
      const cleaned = raw.replace(/[\s\-().]/g, '');
      return createContact({ name: `Imported ${idx + 1}`, phone: cleaned }, defaultCC);
    })
    .filter(Boolean);

  return deduplicate(contacts);
}

// ── Shared row converter ─────────────────────────────────

const NAME_KEYS   = ['name', 'full name', 'fullname', 'contact', 'first name'];
const PHONE_KEYS  = ['phone', 'number', 'mobile', 'cell', 'telephone', 'tel', 'whatsapp', 'sms'];
const GROUP_KEYS  = ['group', 'category', 'tag', 'list', 'segment'];
const CUSTOM_KEYS = ['custom', 'extra', 'note', 'variable'];

function pickKey(row, candidates) {
  for (const key of candidates) {
    const match = Object.keys(row).find((k) => k.toLowerCase().includes(key));
    if (match !== undefined) return row[match];
  }
  return '';
}

/**
 * @param {Record<string, string>[]} rows
 * @param {string} defaultCC
 * @returns {import('./contacts.js').Contact[]}
 */
function rowsToContacts(rows, defaultCC) {
  const contacts = rows
    .map((row) => {
      const phone = pickKey(row, PHONE_KEYS) || firstNumericCell(row);
      if (!phone) return null;

      return createContact(
        {
          name:   pickKey(row, NAME_KEYS),
          phone:  String(phone),
          group:  pickKey(row, GROUP_KEYS),
          custom: pickKey(row, CUSTOM_KEYS),
        },
        defaultCC
      );
    })
    .filter(Boolean);

  return deduplicate(contacts);
}

function firstNumericCell(row) {
  for (const val of Object.values(row)) {
    if (/[\d+]{6,}/.test(String(val))) return String(val);
  }
  return null;
}

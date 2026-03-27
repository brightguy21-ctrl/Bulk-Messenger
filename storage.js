/**
 * utils/storage.js
 * Thin promise wrapper around chrome.storage.local
 */

export const Storage = {

  /** @param {string} key @returns {Promise<any>} */
  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] ?? null);
      });
    });
  },

  /** @param {string} key @param {any} value @returns {Promise<void>} */
  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  },

  /** @param {string} key @returns {Promise<void>} */
  async remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve);
    });
  },

  /** @returns {Promise<void>} */
  async clear() {
    return new Promise((resolve) => {
      chrome.storage.local.clear(resolve);
    });
  },

  // ── Convenience wrappers ──────────────────

  /** @returns {Promise<import('./contacts.js').Contact[]>} */
  async getContacts() {
    return (await this.get('contacts')) || [];
  },

  /** @param {import('./contacts.js').Contact[]} contacts */
  async saveContacts(contacts) {
    await this.set('contacts', contacts);
  },

  /** @returns {Promise<any[]>} */
  async getTemplates() {
    return (await this.get('templates')) || [];
  },

  /** @param {any[]} templates */
  async saveTemplates(templates) {
    await this.set('templates', templates);
  },

  /** @returns {Promise<any>} */
  async getSettings() {
    return (await this.get('settings')) || {};
  },

  /** @param {any} settings */
  async saveSettings(settings) {
    await this.set('settings', settings);
  },

  /** @returns {Promise<any[]>} */
  async getHistory() {
    return (await this.get('blastHistory')) || [];
  },

  /** @param {any} entry */
  async appendHistory(entry) {
    const history = await this.getHistory();
    history.unshift(entry); // newest first
    // keep max 200 records
    await this.set('blastHistory', history.slice(0, 200));
  },

  async clearHistory() {
    await this.remove('blastHistory');
  },
};

/**
 * utils/storage.js
 * chrome.storage.local wrapper — NO ES module syntax (MV3 compatible).
 * Attached to window.BWStorage for cross-file access in popup context.
 */

window.BWStorage = {

  async get(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result[key] ?? null));
    });
  },

  async set(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  },

  async remove(key) {
    return new Promise((resolve) => {
      chrome.storage.local.remove([key], resolve);
    });
  },

  async clear() {
    return new Promise((resolve) => chrome.storage.local.clear(resolve));
  },

  async getContacts()    { return (await this.get('contacts'))     || []; },
  async saveContacts(c)  { await this.set('contacts', c); },
  async getTemplates()   { return (await this.get('templates'))    || []; },
  async saveTemplates(t) { await this.set('templates', t); },
  async getSettings()    { return (await this.get('settings'))     || {}; },
  async saveSettings(s)  { await this.set('settings', s); },
  async getHistory()     { return (await this.get('blastHistory')) || []; },
  async clearHistory()   { await this.remove('blastHistory'); },

  async appendHistory(entry) {
    const history = await this.getHistory();
    history.unshift(entry);
    await this.set('blastHistory', history.slice(0, 200));
  },
};

/**
 * utils/sender.js
 * Orchestrates bulk message sending for both WhatsApp and SMS channels.
 * Emits progress events and respects delay / fail-safe settings.
 */

import { Storage } from './storage.js';

export const MIN_RECIPIENTS = 20;
export const MAX_RECIPIENTS = 150;

/**
 * @typedef {Object} BlastOptions
 * @property {'whatsapp'|'sms'} channel
 * @property {string}           message
 * @property {import('./contacts.js').Contact[]} recipients
 * @property {number}           delaySeconds   - Base delay between messages
 * @property {boolean}          randomDelay    - Add ±2s randomisation
 * @property {boolean}          failSafe       - Stop after 5 consecutive failures
 * @property {Function}         onProgress     - Callback (current, total, status)
 * @property {Function}         onComplete     - Callback (summary)
 * @property {Function}         onCancel       - Callback when cancelled
 */

export class BlastSender {
  /** @param {BlastOptions} options */
  constructor(options) {
    this.options   = options;
    this._cancelled = false;
    this._sent      = 0;
    this._failed    = 0;
    this._consec    = 0; // consecutive failures
  }

  cancel() {
    this._cancelled = true;
  }

  /**
   * Start the blast.  Sends messages sequentially with delay.
   */
  async run() {
    const { channel, recipients, onProgress, onComplete, onCancel } = this.options;

    for (let i = 0; i < recipients.length; i++) {
      if (this._cancelled) {
        onCancel?.({ sent: this._sent, failed: this._failed });
        return;
      }

      const contact = recipients[i];
      const personalised = this._personalise(contact);

      onProgress?.(i, recipients.length, `Sending to ${contact.name}…`);

      let success = false;
      try {
        if (channel === 'whatsapp') {
          success = await this._sendWhatsApp(contact.phone, personalised);
        } else {
          success = await this._sendSMS(contact.phone, personalised);
        }
      } catch (err) {
        console.warn('[BlastWave] Send error:', err);
        success = false;
      }

      if (success) {
        this._sent++;
        this._consec = 0;
      } else {
        this._failed++;
        this._consec++;
        if (this.options.failSafe && this._consec >= 5) {
          onProgress?.(i + 1, recipients.length, '⚠ Stopped: 5 consecutive failures');
          break;
        }
      }

      // Notify after each result
      onProgress?.(i + 1, recipients.length, null);

      // Wait before next (unless last)
      if (i < recipients.length - 1) {
        await this._wait();
      }
    }

    const summary = {
      channel,
      total:  this._sent + this._failed,
      sent:   this._sent,
      failed: this._failed,
      date:   Date.now(),
      message: this.options.message.slice(0, 60),
    };

    await Storage.appendHistory(summary);
    onComplete?.(summary);
  }

  // ── Private ──────────────────────────────────────────

  _personalise(contact) {
    const now  = new Date();
    const date = now.toLocaleDateString();
    return this.options.message
      .replace(/\{\{name\}\}/gi,   contact.name   || '')
      .replace(/\{\{phone\}\}/gi,  contact.phone  || '')
      .replace(/\{\{date\}\}/gi,   date)
      .replace(/\{\{custom\}\}/gi, contact.custom || '');
  }

  /**
   * Sends via WhatsApp Web by opening the wa.me link in a new tab and
   * delegating to the content script for DOM automation.
   * @param {string} phone
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  async _sendWhatsApp(phone, message) {
    return new Promise((resolve) => {
      // Strip leading + for wa.me compatibility
      const num = phone.replace(/^\+/, '');
      const url = `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(message)}`;

      chrome.tabs.create({ url, active: false }, (tab) => {
        if (!tab) { resolve(false); return; }

        // Listen for the content script to report success/failure
        const listener = (msg, sender) => {
          if (sender.tab?.id === tab.id && msg?.type === 'BLAST_RESULT') {
            chrome.runtime.onMessage.removeListener(listener);
            chrome.tabs.remove(tab.id).catch(() => {});
            resolve(msg.success);
          }
        };

        chrome.runtime.onMessage.addListener(listener);

        // Timeout after 30 seconds
        setTimeout(() => {
          chrome.runtime.onMessage.removeListener(listener);
          chrome.tabs.remove(tab.id).catch(() => {});
          resolve(false);
        }, 30_000);
      });
    });
  }

  /**
   * SMS via CallMeBot API (free WhatsApp / SMS gateway).
   * For production, swap with your preferred SMS API (Twilio, Africa's Talking, etc.).
   * @param {string} phone
   * @param {string} message
   * @returns {Promise<boolean>}
   */
  async _sendSMS(phone, message) {
    const settings = await Storage.getSettings();
    const apiKey   = settings.smsApiKey;
    const sender   = settings.myPhone;

    if (!apiKey || !sender) {
      // SMS API not configured — open system SMS intent as fallback
      const num = phone.replace(/^\+/, '');
      const url = `sms:${num}?body=${encodeURIComponent(message)}`;
      await chrome.tabs.create({ url, active: false });
      return true; // optimistically assume success
    }

    // Africa's Talking SMS API example (replace with your provider)
    try {
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: {
          'Accept':       'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'apiKey':       apiKey,
        },
        body: new URLSearchParams({
          username: settings.smsUsername || 'sandbox',
          to:       phone,
          message,
          from:     sender,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  _wait() {
    const base = (this.options.delaySeconds || 5) * 1000;
    const jitter = this.options.randomDelay
      ? Math.floor(Math.random() * 4000) - 2000 // ±2 s
      : 0;
    const delay = Math.max(1000, base + jitter);
    return new Promise((r) => setTimeout(r, delay));
  }
}

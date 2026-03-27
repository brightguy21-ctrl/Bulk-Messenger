/**
 * content/whatsapp-injector.js
 * Injected into web.whatsapp.com to automate message sending.
 *
 * Flow:
 *  1. Extension opens a WhatsApp tab with ?phone=&text= URL params
 *  2. This script waits for the chat to load
 *  3. Clicks Send, then reports success/failure back to background
 */

(function () {
  'use strict';

  // Only run on the chat URL pattern (with phone param from the extension)
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('phone')) return;

  const MAX_WAIT_MS   = 25_000;  // maximum time to wait for WhatsApp UI
  const POLL_INTERVAL = 800;     // how often to check for UI elements

  let elapsed   = 0;
  let sent      = false;

  const interval = setInterval(() => {
    elapsed += POLL_INTERVAL;

    if (elapsed >= MAX_WAIT_MS) {
      clearInterval(interval);
      reportResult(false, 'Timeout: WhatsApp did not load in time.');
      return;
    }

    // Try to find and click the Send button
    if (trySend()) {
      clearInterval(interval);
    }
  }, POLL_INTERVAL);

  /**
   * Attempt to find the message input, confirm text is pre-filled, and click Send.
   * @returns {boolean} true if send was attempted
   */
  function trySend() {
    // WhatsApp Web selectors (may change with updates — keep maintained)
    const SEND_BTN_SELECTOR = '[data-testid="send"], [data-icon="send"], button[aria-label="Send"]';
    const INPUT_SELECTOR    = '[data-testid="conversation-compose-box-input"], div[contenteditable="true"][data-tab="10"]';

    const sendBtn = document.querySelector(SEND_BTN_SELECTOR);
    const input   = document.querySelector(INPUT_SELECTOR);

    if (!sendBtn || !input) return false;

    // Confirm text is populated (WhatsApp fills from URL param automatically)
    const hasText = input.textContent.trim().length > 0 || input.innerText.trim().length > 0;

    if (!hasText) return false;

    // Small debounce — make sure UI is stable
    if (!sent) {
      sent = true;
      setTimeout(() => {
        try {
          sendBtn.click();
          setTimeout(() => reportResult(true), 1200);
        } catch (err) {
          reportResult(false, err.message);
        }
      }, 400);
    }

    return true;
  }

  /**
   * Send result back to the extension service worker.
   * @param {boolean} success
   * @param {string}  [reason]
   */
  function reportResult(success, reason) {
    try {
      chrome.runtime.sendMessage({
        type:    'BLAST_RESULT',
        success,
        reason:  reason || null,
      });
    } catch {
      // Extension context may be invalidated — silently ignore
    }
  }
})();

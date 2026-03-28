/**
 * WhatsApp Bulk Sender - Injector
 * Runs on web.whatsapp.com when opened with ?phone= parameter
 */

(function () {
  'use strict';

  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('phone')) return;   // Only run when we open a send link

  console.log('[WhatsApp Injector] Loaded for number:', urlParams.get('phone'));

  const MAX_WAIT_MS = 30000;      // Max time to wait for chat to load
  const POLL_INTERVAL = 700;
  let elapsed = 0;
  let sent = false;

  const interval = setInterval(() => {
    elapsed += POLL_INTERVAL;

    if (elapsed >= MAX_WAIT_MS) {
      clearInterval(interval);
      reportResult(false, 'Timeout: WhatsApp chat did not load in time.');
      return;
    }

    if (trySendMessage()) {
      clearInterval(interval);
    }
  }, POLL_INTERVAL);

  function trySendMessage() {
    // Updated selectors (more reliable as of 2026)
    const SEND_BTN_SELECTOR = '[data-testid="send"], [data-icon="send"], button[aria-label*="Send"], span[data-icon="send"]';
    const INPUT_SELECTOR = 'div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"], #main div[contenteditable="true"]';

    const sendBtn = document.querySelector(SEND_BTN_SELECTOR);
    const inputBox = document.querySelector(INPUT_SELECTOR);

    if (!sendBtn || !inputBox) return false;

    // Check if message text is already filled by WhatsApp from URL
    const hasText = inputBox.textContent.trim().length > 3 || inputBox.innerText.trim().length > 3;

    if (!hasText) return false;

    if (!sent) {
      sent = true;

      // Small delay to let UI stabilize
      setTimeout(() => {
        try {
          sendBtn.click();
          console.log('[WhatsApp Injector] Send button clicked successfully');

          // Report success after a short delay
          setTimeout(() => {
            reportResult(true);
          }, 1500);

        } catch (err) {
          reportResult(false, err.message || 'Failed to click send');
        }
      }, 500);
    }

    return true;
  }

  function reportResult(success, reason = null) {
    try {
      chrome.runtime.sendMessage({
        type: 'BLAST_RESULT',
        success: success,
        reason: reason,
        phone: urlParams.get('phone')
      });
    } catch (e) {
      console.error('[WhatsApp Injector] Failed to send result:', e);
    }
  }
})();

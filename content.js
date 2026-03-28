/**
 * WhatsApp Bulk Sender - Injector (content/whatsapp-injector.js)
 * This script runs only when WhatsApp Web is opened with ?phone= parameter
 * It waits for the chat to load, confirms the message is pre-filled, and clicks Send.
 */

(function () {
  'use strict';

  // Only activate if this page was opened by our bulk sender with a phone number
  const urlParams = new URLSearchParams(window.location.search);
  if (!urlParams.has('phone')) {
    return;
  }

  const phone = urlParams.get('phone');
  console.log(`[WA Injector] Loaded for phone: ${phone}`);

  const MAX_WAIT = 28000;      // Maximum time to wait for WhatsApp chat to load
  const POLL_INTERVAL = 650;
  let elapsed = 0;
  let alreadySent = false;

  const pollInterval = setInterval(() => {
    elapsed += POLL_INTERVAL;

    if (elapsed >= MAX_WAIT) {
      clearInterval(pollInterval);
      reportResult(false, 'Timeout - WhatsApp chat did not load in time');
      return;
    }

    if (trySendMessage()) {
      clearInterval(pollInterval);
    }
  }, POLL_INTERVAL);

  /**
   * Try to find input box and send button, then click send
   * @returns {boolean} true if send was attempted
   */
  function trySendMessage() {
    // More reliable selectors based on current WhatsApp Web (2026)
    const INPUT_SELECTOR = 'div[contenteditable="true"][role="textbox"], div[contenteditable="true"][data-tab="10"], #main div[contenteditable="true"]';
    const SEND_SELECTOR = '[data-testid="send"], [data-icon="send"], span[data-icon="send"], button[aria-label*="Send"]';

    const inputBox = document.querySelector(INPUT_SELECTOR);
    const sendButton = document.querySelector(SEND_SELECTOR);

    // Wait until both elements are visible
    if (!inputBox || !sendButton) {
      return false;
    }

    // Check that WhatsApp has pre-filled the message from the &text= parameter
    const messageText = inputBox.innerText || inputBox.textContent || '';
    if (messageText.trim().length < 2) {
      return false;   // Message not yet filled
    }

    if (alreadySent) return true;

    alreadySent = true;

    console.log(`[WA Injector] Message ready. Sending to ${phone}`);

    // Small delay to make sure UI is fully stable
    setTimeout(() => {
      try {
        sendButton.click();

        // Report success back to background script after a short delay
        setTimeout(() => {
          reportResult(true);
        }, 1200);

      } catch (error) {
        console.error('[WA Injector] Click failed:', error);
        reportResult(false, error.message || 'Failed to click send button');
      }
    }, 450);

    return true;
  }

  /**
   * Send result back to the background service worker
   */
  function reportResult(success, reason = null) {
    try {
      chrome.runtime.sendMessage({
        type: 'BLAST_RESULT',
        success: success,
        phone: phone,
        reason: reason
      });
    } catch (e) {
      console.error('[WA Injector] Could not send result to background:', e);
    }
  }

})();

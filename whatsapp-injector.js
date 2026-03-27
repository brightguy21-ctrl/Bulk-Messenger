/**
 * Attempt to find the message input, confirm text is pre-filled, and send.
 * @returns {boolean} true if send was attempted
 */
let sent = false;

function trySend() {
  const INPUT_SELECTOR = 'div[contenteditable="true"]';
  const SEND_BTN_SELECTOR = 'button[aria-label="Send"], [data-testid="send"]';

  const input   = document.querySelector(INPUT_SELECTOR);
  const sendBtn = document.querySelector(SEND_BTN_SELECTOR);

  if (!input) {
    console.debug('No input field found yet.');
    return false;
  }

  const text = input.innerText?.trim() || input.textContent?.trim() || '';
  if (!text.length) {
    console.debug('Input field is empty.');
    return false;
  }

  if (!sent) {
    sent = true;
    setTimeout(() => {
      try {
        if (sendBtn) {
          console.debug('Clicking send button.');
          sendBtn.click();
        } else {
          console.debug('Send button not found, simulating Enter key.');
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true
          }));
        }
        setTimeout(() => reportResult(true), 1200);
      } catch (err) {
        console.error('Send attempt failed:', err);
        reportResult(false, err.message);
      }
    }, 400);
  }

  return true;
}

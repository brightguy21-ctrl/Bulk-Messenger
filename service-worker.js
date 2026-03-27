/**
 * background/service-worker.js
 * Handles:
 *  - Scheduled blast alarms
 *  - Message routing between popup and content scripts
 *  - Desktop notifications
 */

import { Storage } from '../utils/storage.js';
import { BlastSender } from '../utils/sender.js';

// ── Alarm listener (scheduled blasts) ──────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'scheduledBlast') return;

  const pending = await Storage.get('scheduledBlast');
  if (!pending) return;

  const allContacts = await Storage.getContacts();
  const recipients  = allContacts.filter((c) => pending.recipientIds.includes(c.id));

  if (recipients.length === 0) {
    await Storage.remove('scheduledBlast');
    return;
  }

  const sender = new BlastSender({
    channel:      pending.channel,
    message:      pending.message,
    recipients,
    delaySeconds: pending.delaySeconds || 5,
    randomDelay:  true,
    failSafe:     true,
    onComplete: async (summary) => {
      await Storage.remove('scheduledBlast');
      chrome.notifications.create({
        type:    'basic',
        iconUrl: 'assets/icons/icon48.png',
        title:   'BlastWave Scheduled Blast Complete',
        message: `✓ ${summary.sent} sent · ✗ ${summary.failed} failed`,
      });
    },
  });

  await sender.run();
});

// ── Extension install / update ─────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Seed default templates on first install
    seedDefaultTemplates();
  }
});

async function seedDefaultTemplates() {
  const existing = await Storage.getTemplates();
  if (existing.length > 0) return;

  const defaults = [
    {
      id:       crypto.randomUUID(),
      name:     'Hello & Welcome',
      body:     'Hi {{name}}, welcome! We\'re excited to have you with us. Feel free to reach out anytime. 😊',
      category: 'Announcement',
      updatedAt: Date.now(),
    },
    {
      id:       crypto.randomUUID(),
      name:     'Flash Promo',
      body:     '🔥 {{name}}, exclusive deal just for you! Use code BLAST20 for 20% off today only. Limited time — act fast!',
      category: 'Promotion',
      updatedAt: Date.now(),
    },
    {
      id:       crypto.randomUUID(),
      name:     'Appointment Reminder',
      body:     'Hi {{name}}, this is a reminder about your appointment on {{date}}. Reply to confirm or reschedule. Thank you!',
      category: 'Reminder',
      updatedAt: Date.now(),
    },
    {
      id:       crypto.randomUUID(),
      name:     'Follow-up',
      body:     'Hey {{name}}! Just checking in. We noticed you haven\'t been around lately — is there anything we can help with?',
      category: 'Follow-up',
      updatedAt: Date.now(),
    },
  ];

  await Storage.saveTemplates(defaults);
}

// ── Keep-alive ping (Manifest V3 workaround) ───────────
// Service workers can be terminated; this keeps critical state fresh.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ alive: true });
  }
  // Allow async response
  return true;
});

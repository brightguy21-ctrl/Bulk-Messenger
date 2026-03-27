/**
 * popup/popup.js
 * Main controller for the BlastWave popup.
 * Orchestrates all tabs: Compose, Contacts, Templates, Analytics, Settings.
 */

import { Storage }                         from '../utils/storage.js';
import { createContact, deduplicate,
         filterContacts, getGroups,
         getInitials }                      from '../utils/contacts.js';
import { importFile }                       from '../utils/importer.js';
import { BlastSender, MIN_RECIPIENTS,
         MAX_RECIPIENTS }                   from '../utils/sender.js';
import { showToast }                        from '../utils/toast.js';

// ─────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────
let allContacts   = [];
let selectedIds   = new Set();  // contacts chosen as recipients
let templates     = [];
let settings      = {};
let blastSender   = null;
let editContactId = null;       // null = new, string = editing
let editTemplateId = null;

const DEFAULTS = {
  delaySeconds: 5,
  randomDelay:  true,
  failSafe:     true,
  notifications: true,
};

// ─────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  [allContacts, templates, settings] = await Promise.all([
    Storage.getContacts(),
    Storage.getTemplates(),
    Storage.getSettings(),
  ]);

  applySettings();
  initTabs();
  initCompose();
  initContacts();
  initTemplates();
  initAnalytics();
  initSettings();
  renderAccountChip();
});

// ─────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      item.classList.add('active');
      document.getElementById(`tab-${tab}`)?.classList.add('active');

      if (tab === 'analytics') renderAnalytics();
    });
  });

  document.getElementById('goToContacts')?.addEventListener('click', () => {
    document.querySelector('[data-tab="contacts"]')?.click();
  });
}

// ─────────────────────────────────────────────────────────
// COMPOSE
// ─────────────────────────────────────────────────────────
function initCompose() {
  // Channel toggle
  document.querySelectorAll('.ch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ch-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Character count
  const msgBody  = document.getElementById('messageBody');
  const charCount = document.getElementById('charCount');
  msgBody.addEventListener('input', () => {
    charCount.textContent = msgBody.value.length;
  });

  // Variable chips
  document.querySelectorAll('.var-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const pos = msgBody.selectionStart;
      const val = msgBody.value;
      msgBody.value = val.slice(0, pos) + chip.dataset.var + val.slice(pos);
      msgBody.focus();
      msgBody.selectionStart = msgBody.selectionEnd = pos + chip.dataset.var.length;
      charCount.textContent = msgBody.value.length;
    });
  });

  // Delay slider
  const delaySlider = document.getElementById('delaySlider');
  const delayVal    = document.getElementById('delayVal');
  delaySlider.value = settings.delaySeconds ?? DEFAULTS.delaySeconds;
  delayVal.textContent = `${delaySlider.value}s`;
  delaySlider.addEventListener('input', () => {
    delayVal.textContent = `${delaySlider.value}s`;
  });

  // Schedule clear
  document.getElementById('clearSchedule')?.addEventListener('click', () => {
    document.getElementById('scheduleTime').value = '';
  });

  // Clear recipients
  document.getElementById('clearRecipients')?.addEventListener('click', () => {
    selectedIds.clear();
    renderRecipientBox();
    updateBlastBtn();
  });

  // Blast button
  document.getElementById('blastBtn')?.addEventListener('click', startBlast);
  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    blastSender?.cancel();
  });
}

function getActiveChannel() {
  return document.querySelector('.ch-btn.active')?.dataset.channel || 'whatsapp';
}

async function startBlast() {
  const message = document.getElementById('messageBody').value.trim();
  if (!message) { showToast('Please enter a message.', 'error'); return; }

  const recipients = allContacts.filter((c) => selectedIds.has(c.id));

  if (recipients.length < MIN_RECIPIENTS) {
    showToast(`Select at least ${MIN_RECIPIENTS} recipients.`, 'error'); return;
  }
  if (recipients.length > MAX_RECIPIENTS) {
    showToast(`Maximum ${MAX_RECIPIENTS} recipients allowed.`, 'error'); return;
  }

  // Scheduled blast
  const scheduleInput = document.getElementById('scheduleTime').value;
  if (scheduleInput) {
    const scheduledTime = new Date(scheduleInput).getTime();
    if (scheduledTime > Date.now()) {
      await scheduleBlast({ message, recipients, scheduledTime });
      return;
    }
  }

  runBlast({ message, recipients });
}

function runBlast({ message, recipients }) {
  const progressCard = document.getElementById('progressCard');
  const blastBtn     = document.getElementById('blastBtn');

  progressCard.classList.remove('hidden');
  blastBtn.disabled = true;

  blastSender = new BlastSender({
    channel:      getActiveChannel(),
    message,
    recipients,
    delaySeconds: parseInt(document.getElementById('delaySlider').value, 10),
    randomDelay:  settings.randomDelay ?? DEFAULTS.randomDelay,
    failSafe:     settings.failSafe    ?? DEFAULTS.failSafe,

    onProgress(current, total, label) {
      const pct = Math.round((current / total) * 100);
      document.getElementById('progressFill').style.width     = `${pct}%`;
      document.getElementById('progressFraction').textContent = `${current}/${total}`;
      if (label) document.getElementById('progressLabel').textContent = label;

      document.getElementById('sentCount').textContent   = blastSender._sent;
      document.getElementById('failedCount').textContent = blastSender._failed;
    },

    onComplete(summary) {
      blastBtn.disabled = false;
      showToast(`Blast complete! ✓ ${summary.sent} sent, ✗ ${summary.failed} failed`, 'success', 5000);

      if (settings.notifications) {
        chrome.notifications?.create({
          type:    'basic',
          iconUrl: '../assets/icons/icon48.png',
          title:   'BlastWave Complete',
          message: `✓ ${summary.sent} sent · ✗ ${summary.failed} failed`,
        });
      }
    },

    onCancel({ sent, failed }) {
      blastBtn.disabled = false;
      showToast(`Blast cancelled. ✓ ${sent} sent so far.`, 'warning');
    },
  });

  blastSender.run();
}

async function scheduleBlast({ message, recipients, scheduledTime }) {
  const pending = {
    message,
    recipientIds: recipients.map((c) => c.id),
    scheduledTime,
    channel: getActiveChannel(),
    delaySeconds: parseInt(document.getElementById('delaySlider').value, 10),
  };
  await Storage.set('scheduledBlast', pending);
  chrome.alarms.create('scheduledBlast', { when: scheduledTime });
  showToast(`Blast scheduled for ${new Date(scheduledTime).toLocaleString()}`, 'success');
}

function renderRecipientBox() {
  const box  = document.getElementById('recipientBox');
  const count = document.getElementById('recipientCount');
  const recipients = allContacts.filter((c) => selectedIds.has(c.id));

  count.textContent = recipients.length;

  // Update limits bar
  const pct = Math.min(100, ((recipients.length - MIN_RECIPIENTS) / (MAX_RECIPIENTS - MIN_RECIPIENTS)) * 100);
  document.getElementById('limitFill').style.width = `${Math.max(0, pct)}%`;

  if (recipients.length === 0) {
    box.innerHTML = `
      <div class="empty-state-mini">
        <svg viewBox="0 0 40 40"><circle cx="20" cy="15" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 35c0-6.627 5.373-12 12-12s12 5.373 12 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        <p>No recipients yet</p><small>Go to Contacts tab to add</small>
      </div>`;
    return;
  }

  box.innerHTML = recipients.map((c) => `
    <div class="recipient-pill">
      <span class="pill-name">${escHtml(c.name)}</span>
      <span class="pill-phone">${escHtml(c.phone)}</span>
      <span class="pill-remove" data-id="${c.id}">✕</span>
    </div>
  `).join('');

  box.querySelectorAll('.pill-remove').forEach((el) => {
    el.addEventListener('click', () => {
      selectedIds.delete(el.dataset.id);
      renderRecipientBox();
      updateBlastBtn();
      refreshContactsUI(); // sync checkboxes
    });
  });
}

function updateBlastBtn() {
  const count = selectedIds.size;
  const btn   = document.getElementById('blastBtn');
  btn.disabled = count < MIN_RECIPIENTS || count > MAX_RECIPIENTS;
}

// ─────────────────────────────────────────────────────────
// CONTACTS
// ─────────────────────────────────────────────────────────
function initContacts() {
  renderContactsUI();

  document.getElementById('contactSearch').addEventListener('input', (e) => {
    renderContactsUI(e.target.value);
  });

  // Import file
  document.getElementById('importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const cc       = settings.defaultCC || '+233';
      const imported = await importFile(file, cc);
      if (imported.length === 0) { showToast('No valid contacts found in file.', 'warning'); return; }

      const before  = allContacts.length;
      allContacts   = deduplicate([...allContacts, ...imported]);
      const added   = allContacts.length - before;

      await Storage.saveContacts(allContacts);
      renderContactsUI();
      renderGroupFilter();
      showToast(`Imported ${added} new contact${added !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      showToast(`Import failed: ${err.message}`, 'error');
    }
    e.target.value = '';
  });

  // Add contact button
  document.getElementById('addContactBtn').addEventListener('click', () => {
    openContactModal(null);
  });

  // Modal actions
  document.getElementById('closeModal').addEventListener('click',  closeContactModal);
  document.getElementById('cancelModal').addEventListener('click', closeContactModal);
  document.getElementById('modalOverlay').addEventListener('click', closeContactModal);
  document.getElementById('saveContact').addEventListener('click', saveContact);
}

function renderGroupFilter(activeGroup = 'all') {
  const groups  = getGroups(allContacts);
  const filter  = document.getElementById('groupFilter');
  filter.innerHTML = `<button class="group-chip ${activeGroup === 'all' ? 'active' : ''}" data-group="all">All</button>`;
  groups.forEach((g) => {
    const btn = document.createElement('button');
    btn.className = `group-chip ${activeGroup === g ? 'active' : ''}`;
    btn.dataset.group = g;
    btn.textContent = g;
    filter.appendChild(btn);
  });

  filter.querySelectorAll('.group-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      filter.querySelectorAll('.group-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      const query = document.getElementById('contactSearch').value;
      renderContactsUI(query, chip.dataset.group);
    });
  });
}

function renderContactsUI(query = '', group = 'all') {
  let visible = allContacts;
  if (group !== 'all') visible = visible.filter((c) => c.group === group);
  visible = filterContacts(visible, query);

  renderGroupFilter(group);

  const list = document.getElementById('contactsList');
  if (visible.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>No contacts found</h3>
        <p>${allContacts.length === 0 ? 'Import a file or add contacts manually.' : 'Try a different search or filter.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = visible.map((c) => {
    const checked = selectedIds.has(c.id) ? 'checked' : '';
    return `
      <div class="contact-card ${selectedIds.has(c.id) ? 'selected' : ''}" data-id="${c.id}">
        <input type="checkbox" class="contact-checkbox" data-id="${c.id}" ${checked} />
        <div class="contact-avatar">${escHtml(getInitials(c.name))}</div>
        <div class="contact-info">
          <div class="contact-name">${escHtml(c.name)}</div>
          <div class="contact-phone">${escHtml(c.phone)}</div>
          ${c.group ? `<div class="contact-group">${escHtml(c.group)}</div>` : ''}
        </div>
        <div class="contact-actions">
          <button class="icon-btn edit-btn" data-id="${c.id}" title="Edit">✎</button>
          <button class="icon-btn danger delete-btn" data-id="${c.id}" title="Delete">✕</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.contact-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.id;
      if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
      renderRecipientBox();
      updateBlastBtn();
      cb.closest('.contact-card').classList.toggle('selected', cb.checked);
    });
  });

  list.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const contact = allContacts.find((c) => c.id === btn.dataset.id);
      if (contact) openContactModal(contact);
    });
  });

  list.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      allContacts = allContacts.filter((c) => c.id !== btn.dataset.id);
      selectedIds.delete(btn.dataset.id);
      await Storage.saveContacts(allContacts);
      renderContactsUI(query, group);
      renderRecipientBox();
      updateBlastBtn();
      showToast('Contact deleted.', 'info');
    });
  });
}

function refreshContactsUI() {
  const query = document.getElementById('contactSearch').value;
  const activeGroup = document.querySelector('.group-chip.active')?.dataset.group || 'all';
  renderContactsUI(query, activeGroup);
}

function openContactModal(contact) {
  editContactId = contact?.id ?? null;
  document.getElementById('modalTitle').textContent = contact ? 'Edit Contact' : 'Add Contact';
  document.getElementById('contactName').value    = contact?.name    ?? '';
  document.getElementById('contactPhone').value   = contact?.phone?.replace(/^\+\d+/, '') ?? '';
  document.getElementById('contactGroup').value   = contact?.group   ?? '';
  document.getElementById('contactCustom').value  = contact?.custom  ?? '';

  // Try to pre-select country code
  if (contact?.phone) {
    const cc = matchCountryCode(contact.phone);
    if (cc) {
      const sel = document.getElementById('countryCode');
      const opt = [...sel.options].find((o) => o.value === cc);
      if (opt) sel.value = cc;
    }
  }

  document.getElementById('addContactModal').classList.remove('hidden');
}

function closeContactModal() {
  document.getElementById('addContactModal').classList.add('hidden');
  editContactId = null;
}

async function saveContact() {
  const cc     = document.getElementById('countryCode').value;
  const rawPhone = document.getElementById('contactPhone').value.trim();
  const name   = document.getElementById('contactName').value.trim();
  const group  = document.getElementById('contactGroup').value.trim();
  const custom = document.getElementById('contactCustom').value.trim();

  if (!rawPhone) { showToast('Phone number is required.', 'error'); return; }

  const contact = createContact({ name, phone: rawPhone, group, custom }, cc);
  if (!contact) { showToast('Invalid phone number.', 'error'); return; }

  if (editContactId) {
    // Update existing
    contact.id = editContactId;
    contact.createdAt = allContacts.find((c) => c.id === editContactId)?.createdAt ?? Date.now();
    allContacts = allContacts.map((c) => c.id === editContactId ? contact : c);
  } else {
    // Check duplicate
    if (allContacts.some((c) => c.phone === contact.phone)) {
      showToast('A contact with this number already exists.', 'warning'); return;
    }
    allContacts.unshift(contact);
  }

  await Storage.saveContacts(allContacts);
  closeContactModal();
  refreshContactsUI();
  showToast(editContactId ? 'Contact updated.' : 'Contact added.', 'success');
}

// ─────────────────────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────────────────────
function initTemplates() {
  renderTemplatesUI();

  document.getElementById('newTemplateBtn').addEventListener('click', () => openTemplateModal(null));
  document.getElementById('closeTemplateModal').addEventListener('click', closeTemplateModal);
  document.getElementById('cancelTemplateModal').addEventListener('click', closeTemplateModal);
  document.getElementById('templateOverlay').addEventListener('click', closeTemplateModal);
  document.getElementById('saveTemplate').addEventListener('click', saveTemplate);
}

function renderTemplatesUI() {
  const grid = document.getElementById('templatesGrid');
  if (templates.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">📝</div>
        <h3>No templates yet</h3>
        <p>Save reusable message templates here.</p>
      </div>`;
    return;
  }

  grid.innerHTML = templates.map((t) => `
    <div class="template-card" data-id="${t.id}">
      <div class="template-name">${escHtml(t.name)}</div>
      <div class="template-preview">${escHtml(t.body)}</div>
      <div class="template-footer">
        <span class="template-category">${escHtml(t.category)}</span>
        <div class="template-actions">
          <button class="icon-btn use-tpl" data-id="${t.id}" title="Use">↗</button>
          <button class="icon-btn edit-tpl" data-id="${t.id}" title="Edit">✎</button>
          <button class="icon-btn danger del-tpl" data-id="${t.id}" title="Delete">✕</button>
        </div>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.use-tpl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = templates.find((t) => t.id === btn.dataset.id);
      if (!tpl) return;
      document.getElementById('messageBody').value = tpl.body;
      document.getElementById('charCount').textContent = tpl.body.length;
      document.querySelector('[data-tab="compose"]').click();
      showToast(`Template "${tpl.name}" loaded.`, 'success');
    });
  });

  grid.querySelectorAll('.edit-tpl').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tpl = templates.find((t) => t.id === btn.dataset.id);
      if (tpl) openTemplateModal(tpl);
    });
  });

  grid.querySelectorAll('.del-tpl').forEach((btn) => {
    btn.addEventListener('click', async () => {
      templates = templates.filter((t) => t.id !== btn.dataset.id);
      await Storage.saveTemplates(templates);
      renderTemplatesUI();
      showToast('Template deleted.', 'info');
    });
  });
}

function openTemplateModal(tpl) {
  editTemplateId = tpl?.id ?? null;
  document.getElementById('templateModalTitle').textContent = tpl ? 'Edit Template' : 'New Template';
  document.getElementById('templateName').value     = tpl?.name     ?? '';
  document.getElementById('templateBody').value     = tpl?.body     ?? '';
  document.getElementById('templateCategory').value = tpl?.category ?? 'Promotion';
  document.getElementById('templateModal').classList.remove('hidden');
}

function closeTemplateModal() {
  document.getElementById('templateModal').classList.add('hidden');
  editTemplateId = null;
}

async function saveTemplate() {
  const name     = document.getElementById('templateName').value.trim();
  const body     = document.getElementById('templateBody').value.trim();
  const category = document.getElementById('templateCategory').value;

  if (!name || !body) { showToast('Name and message are required.', 'error'); return; }

  const tpl = { id: editTemplateId || crypto.randomUUID(), name, body, category, updatedAt: Date.now() };

  if (editTemplateId) {
    templates = templates.map((t) => t.id === editTemplateId ? tpl : t);
  } else {
    templates.unshift(tpl);
  }

  await Storage.saveTemplates(templates);
  closeTemplateModal();
  renderTemplatesUI();
  showToast(editTemplateId ? 'Template updated.' : 'Template saved.', 'success');
}

// ─────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────
function initAnalytics() {
  document.getElementById('clearAnalytics').addEventListener('click', async () => {
    await Storage.clearHistory();
    renderAnalytics();
    showToast('History cleared.', 'info');
  });
}

async function renderAnalytics() {
  const history = await Storage.getHistory();

  const totalSent    = history.reduce((s, h) => s + (h.sent   || 0), 0);
  const totalFailed  = history.reduce((s, h) => s + (h.failed || 0), 0);
  const totalBlasts  = history.length;
  const totalMsgs    = totalSent + totalFailed;

  document.getElementById('statTotal').textContent   = totalMsgs;
  document.getElementById('statSuccess').textContent = totalSent;
  document.getElementById('statFailed').textContent  = totalFailed;
  document.getElementById('statBlasts').textContent  = totalBlasts;

  const list = document.getElementById('historyList');
  if (history.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📊</div>
        <h3>No history yet</h3>
        <p>Your blast history will appear here after sending.</p>
      </div>`;
    return;
  }

  list.innerHTML = history.map((h) => {
    const date     = new Date(h.date).toLocaleString();
    const chIcon   = h.channel === 'whatsapp' ? '💬' : '📱';
    return `
      <div class="history-card">
        <div class="history-top">
          <span class="history-channel">${chIcon} ${escHtml(h.channel || 'WhatsApp')}</span>
          <span class="history-date">${date}</span>
        </div>
        <div class="history-meta">✓ ${h.sent} sent &nbsp; ✗ ${h.failed} failed &nbsp; (${h.total} total)</div>
        <div class="history-msg">${escHtml(h.message || '')}…</div>
      </div>`;
  }).join('');
}

// ─────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────
function initSettings() {
  // Populate fields from saved settings
  if (settings.myPhone) {
    const parts = splitCountryCode(settings.myPhone);
    document.getElementById('myCountryCode').value = parts.cc;
    document.getElementById('myPhone').value       = parts.local;
  }

  document.getElementById('defaultDelay').value = settings.delaySeconds ?? DEFAULTS.delaySeconds;
  document.getElementById('defaultDelayVal').textContent = `${settings.delaySeconds ?? DEFAULTS.delaySeconds}s`;

  document.getElementById('notificationsToggle').checked = settings.notifications ?? DEFAULTS.notifications;
  document.getElementById('randomDelayToggle').checked   = settings.randomDelay   ?? DEFAULTS.randomDelay;
  document.getElementById('failSafeToggle').checked      = settings.failSafe      ?? DEFAULTS.failSafe;

  document.getElementById('defaultDelay').addEventListener('input', (e) => {
    document.getElementById('defaultDelayVal').textContent = `${e.target.value}s`;
  });

  document.getElementById('saveAccountBtn').addEventListener('click', saveAccount);
  document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsData);

  document.getElementById('resetAllBtn').addEventListener('click', async () => {
    if (!confirm('This will delete all contacts, templates, and history. Continue?')) return;
    await Storage.clear();
    allContacts = []; templates = []; settings = {}; selectedIds.clear();
    renderContactsUI(); renderTemplatesUI(); renderRecipientBox(); updateBlastBtn();
    applySettings(); renderAccountChip();
    showToast('All data reset.', 'warning');
  });
}

async function saveAccount() {
  const cc    = document.getElementById('myCountryCode').value;
  const local = document.getElementById('myPhone').value.trim();
  if (!local) { showToast('Please enter your phone number.', 'error'); return; }
  const fullPhone = cc + local.replace(/^0/, '');
  settings.myPhone     = fullPhone;
  settings.defaultCC   = cc;
  await Storage.saveSettings(settings);
  renderAccountChip();
  showToast('Account saved!', 'success');
}

async function saveSettingsData() {
  settings.delaySeconds = parseInt(document.getElementById('defaultDelay').value, 10);
  settings.notifications = document.getElementById('notificationsToggle').checked;
  settings.randomDelay   = document.getElementById('randomDelayToggle').checked;
  settings.failSafe      = document.getElementById('failSafeToggle').checked;
  await Storage.saveSettings(settings);
  // Sync compose slider
  document.getElementById('delaySlider').value = settings.delaySeconds;
  document.getElementById('delayVal').textContent = `${settings.delaySeconds}s`;
  showToast('Settings saved!', 'success');
}

function applySettings() {
  const delay = settings.delaySeconds ?? DEFAULTS.delaySeconds;
  document.getElementById('delaySlider').value   = delay;
  document.getElementById('delayVal').textContent = `${delay}s`;
}

function renderAccountChip() {
  const phone  = settings.myPhone || '';
  const avatar = document.getElementById('accountAvatar');
  const chip   = document.getElementById('accountPhone');

  chip.textContent   = phone || 'Not set';
  avatar.textContent = phone ? phone.slice(-2) : '?';
}

// ─────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────

/** @param {string} str */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Try to match a leading country code in an E.164 number. */
function matchCountryCode(phone) {
  const codes = ['+233', '+234', '+254', '+27', '+1', '+44', '+91', '+971', '+49', '+33', '+55', '+86'];
  return codes.find((cc) => phone.startsWith(cc)) || null;
}

/** Split an E.164 number into CC and local parts. */
function splitCountryCode(phone) {
  const cc = matchCountryCode(phone);
  if (!cc) return { cc: '+1', local: phone };
  return { cc, local: phone.slice(cc.length) };
}

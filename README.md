# 🚀 BlastWave — Bulk WhatsApp & SMS Chrome Extension

> Send 20–150 personalised WhatsApp or SMS messages with smart scheduling, contact management, templates, and analytics — all from a sleek Chrome extension.

---

## ✨ Features

| Feature | Description |
|---|---|
| **Dual Channel** | Send via WhatsApp Web automation or SMS API |
| **Bulk Messaging** | 20 minimum / 150 maximum recipients per blast |
| **Contact Manager** | Add, edit, delete, search, and group contacts |
| **Smart Import** | Import contacts from **.xlsx, .xls, .csv, .txt, .pdf** |
| **Phone Normalisation** | Handles `0`, `+`, `00`, and country-code prefixes automatically |
| **Personalisation** | Use `{{name}}`, `{{phone}}`, `{{date}}`, `{{custom}}` variables |
| **Templates** | Save and reuse message templates with categories |
| **Scheduled Blasts** | Schedule a blast for a future date/time (Chrome Alarms API) |
| **Smart Delay** | Configurable delay (2–30s) with optional ±2s randomisation |
| **Fail-Safe** | Auto-stop after 5 consecutive failures |
| **Analytics** | Per-blast history with sent/failed counts |
| **Dark UI** | Electric-green dark theme, 760×600px popup |

---

## 📁 File Structure

```
blastwave-extension/
├── manifest.json                  # Chrome Manifest V3
│
├── popup/
│   ├── popup.html                 # Main UI (5 tabs)
│   ├── popup.css                  # Dark theme stylesheet
│   └── popup.js                   # Main controller (ES module)
│
├── background/
│   └── service-worker.js          # Alarm handler, install seeding
│
├── content/
│   └── whatsapp-injector.js       # WhatsApp Web DOM automator
│
├── utils/
│   ├── storage.js                 # chrome.storage.local wrapper
│   ├── contacts.js                # Contact model + phone normalisation
│   ├── importer.js                # Excel / CSV / PDF file parser
│   ├── sender.js                  # BlastSender class (WhatsApp + SMS)
│   └── toast.js                   # In-popup toast notifications
│
├── lib/
│   └── xlsx.full.min.js           # SheetJS (copy from CDN — see setup)
│
└── assets/
    ├── generate-icons.js          # Dev helper to generate PNG icons
    └── icons/
        ├── icon16.png
        ├── icon32.png
        ├── icon48.png
        └── icon128.png
```

---

## 🛠 Setup

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/blastwave-extension.git
cd blastwave-extension
```

### 2. Add SheetJS (required for Excel import)

Download `xlsx.full.min.js` from the [SheetJS CDN](https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js) and place it in `lib/`:

```bash
curl -o lib/xlsx.full.min.js \
  "https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"
```

### 3. Generate Icons

```bash
cd assets
npm install sharp
node generate-icons.js
```

Or replace `assets/icons/` with your own 16×16, 32×32, 48×48, and 128×128 PNG files.

### 4. Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `blastwave-extension/` folder

---

## ⚙ Configuration

### Settings Tab
- Enter your phone number (used as sender ID for SMS)
- Configure default delay, randomisation, and notifications

### SMS API (optional)
For real SMS sending, set `smsApiKey` and `smsUsername` in the Settings storage. The default implementation targets the **Africa's Talking** API. Swap `utils/sender.js → _sendSMS()` for any other provider (Twilio, Vonage, etc.).

### WhatsApp
BlastWave automates **WhatsApp Web** — you must be logged in at [web.whatsapp.com](https://web.whatsapp.com) before firing a blast. The extension opens tabs, auto-sends, and closes them.

---

## 📱 Contact Import Format

### Excel / CSV
Columns are auto-detected (case-insensitive). Recognised headers:

| Field | Accepted headers |
|---|---|
| Phone | `phone`, `number`, `mobile`, `cell`, `tel`, `whatsapp`, `sms` |
| Name | `name`, `full name`, `contact`, `first name` |
| Group | `group`, `category`, `tag`, `segment` |
| Custom | `custom`, `extra`, `note`, `variable` |

### PDF
Phone numbers are extracted via regex — useful for scanned contact lists.

### Phone Formats Accepted
- `+233244123456` (E.164)
- `00233244123456`
- `0244123456` (local — country code auto-prepended)
- `244123456` (raw digits — country code prepended)

---

## 🔒 Permissions

| Permission | Reason |
|---|---|
| `storage` | Save contacts, templates, settings locally |
| `tabs` | Open WhatsApp Web tabs for sending |
| `scripting` | Inject content script into WhatsApp Web |
| `notifications` | Desktop notification on blast complete |
| `alarms` | Scheduled blast support |
| `https://web.whatsapp.com/*` | WhatsApp Web automation |

---

## 🗺 Roadmap

- [ ] Multi-account sender rotation
- [ ] Message delivery receipts (WhatsApp read-tick detection)
- [ ] Contact deduplication across imports
- [ ] Export analytics to CSV
- [ ] Google Sheets import connector
- [ ] Dark/light theme toggle

---

## ⚠ Disclaimer

This tool is for **legitimate business communication** only — newsletters, appointment reminders, promotional messages to opted-in contacts. Do not use it for spam. Comply with WhatsApp's Terms of Service and local telecommunications laws.

---

## 📄 License

MIT — free to use, modify, and distribute.

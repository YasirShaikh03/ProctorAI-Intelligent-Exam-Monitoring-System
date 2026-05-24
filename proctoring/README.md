# 🛡️ ProctorAI — Intelligent Exam Monitoring System

A **fully browser-based, AI-powered exam proctoring system** built with pure HTML, CSS, and Vanilla JavaScript. No backend, no paid APIs, no frameworks.

---

## 🚀 Features

| Feature | Technology |
|---|---|
| Live Webcam Feed | WebRTC / getUserMedia |
| AI Face Detection | Face-API.js (TinyFaceDetector) |
| Noise Monitoring | Web Audio API |
| Screen Recording | MediaRecorder API |
| Periodic Snapshots | Canvas API |
| Activity Logs | LocalStorage |
| Anti-Cheat Engine | DOM event listeners |
| Risk Scoring | Custom JS engine |
| Animated UI | CSS animations + Canvas particles |

---

## 📁 Project Structure

```
proctoring/
├── index.html          # Main HTML with all 4 screens
├── css/
│   └── style.css       # Full futuristic dark theme
├── js/
│   └── script.js       # All logic, monitoring, AI
└── README.md
```

---

## 🔧 How to Run

### Option A — Local HTTP Server (Recommended for full AI)
Face-API.js models require HTTP to load properly.

```bash
# Python 3
python3 -m http.server 8080

# Node.js
npx serve .

# Then open: http://localhost:8080
```

### Option B — Direct file open
Open `index.html` directly in Chrome/Edge. Face detection will fall back to simulation mode — all other features work fully.

---

## 🧠 AI Risk Score System

| Event | Risk Penalty |
|---|---|
| Tab switch | +15 |
| No face detected | +20 |
| Multiple faces | +30 |
| Fullscreen exit | +10 |
| Loud noise | +10 |
| Inactivity (2 min) | +5 |
| Window resize | +5 |

**Score Levels:**
- 🟢 0–29 → **SAFE**
- 🟡 30–59 → **SUSPICIOUS**
- 🔴 60–100 → **HIGH RISK**

---

## 🖥️ Screens

1. **Loading Screen** — AI model loading + media permissions
2. **Login Screen** — Student name, exam code, duration
3. **Exam Dashboard** — Live webcam, risk meter, logs, audio, exam questions
4. **Final Report** — Score, verdict, timeline, evidence gallery, downloads

---

## 🛡️ Anti-Cheat Protections

- Right-click disabled
- Copy/Paste (Ctrl+C/V) disabled
- View Source (Ctrl+U) disabled
- DevTools (F12, Ctrl+Shift+I/J/C) blocked
- Text selection disabled
- Auto fullscreen on exam start
- Fullscreen exit triggers warning

---

## 📸 Evidence Collection

- Webcam snapshot every **30 seconds**
- Each image timestamped with student name
- Download all as individual JPEGs
- Displayed in evidence gallery on report

---

## 🎨 Design

- **Theme:** Futuristic cybersecurity dark
- **Fonts:** Orbitron (HUD), Share Tech Mono (data), Rajdhani (body)
- **Colors:** Cyan `#00c8ff`, Purple `#8b5cf6`, Neon Green `#00f5a0`
- **Effects:** Particle network background, scan line animation, glassmorphism panels, neon glows

---

## ⚠️ Browser Compatibility

| Browser | Support |
|---|---|
| Chrome 90+ | ✅ Full |
| Edge 90+ | ✅ Full |
| Firefox 88+ | ✅ Full |
| Safari 15+ | ⚠️ Partial (MediaRecorder limited) |

---

## 🔐 Privacy Note

All data stays **100% in your browser**:
- No data is sent to any server
- Recordings are saved locally only
- Snapshots are Base64 in memory
- Logs stored in LocalStorage (optional)

---

Built with ❤️ using only browser APIs.

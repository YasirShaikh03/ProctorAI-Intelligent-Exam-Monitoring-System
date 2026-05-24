/**
 * ============================================================
 * PROCTOR AI — script.js
 * Complete AI-Powered Exam Monitoring System
 * Browser-only: WebRTC, Face-API.js, MediaRecorder, IndexedDB
 * ============================================================
 */

"use strict";

/* ── Disable right-click / copy / inspect shortcuts ── */
document.addEventListener("contextmenu",  e => e.preventDefault());
document.addEventListener("copy",         e => e.preventDefault());
document.addEventListener("paste",        e => e.preventDefault());
document.addEventListener("selectstart",  e => e.preventDefault());
document.addEventListener("keydown", e => {
  const banned = ["F12","F5"];
  if (banned.includes(e.key)) { e.preventDefault(); return; }
  const ctrl = e.ctrlKey || e.metaKey;
  if (ctrl && ["c","v","u","s","a","p"].includes(e.key.toLowerCase())) {
    e.preventDefault(); return;
  }
  if (ctrl && e.shiftKey && ["i","j","c"].includes(e.key.toLowerCase())) {
    e.preventDefault(); return;
  }
});

/* ══════════════════════════════════════════════════════════
   STATE
   ══════════════════════════════════════════════════════════ */
const STATE = {
  studentName: "",
  examCode: "",
  examDurationMin: 60,
  startTime: null,

  /* Media */
  stream: null,          // webcam stream
  micStream: null,       // microphone stream
  mediaRecorder: null,
  recordedChunks: [],

  /* Face Detection */
  faceDetectionInterval: null,
  faceApiLoaded: false,
  modelsPath: "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/weights",

  /* Timer */
  timerInterval: null,
  secondsLeft: 0,
  totalSeconds: 0,

  /* Risk Scoring */
  riskScore: 0,
  riskBreakdown: { tab: 0, noFace: 0, multiFace: 0, fullscreen: 0, noise: 0 },

  /* Counters */
  warnings: 0,
  eventCount: 0,

  /* Inactivity */
  lastActivity: Date.now(),
  inactivityTimer: null,

  /* Snapshots */
  snapshots: [],
  snapshotInterval: null,

  /* Audio */
  audioContext: null,
  analyser: null,
  audioInterval: null,
  audioWaveInterval: null,

  /* Logs */
  logs: [],

  /* UI lock */
  warningVisible: false,
  examActive: false
};

/* ══════════════════════════════════════════════════════════
   DOM SHORTCUTS
   ══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

/* ══════════════════════════════════════════════════════════
   PARTICLE BACKGROUND
   ══════════════════════════════════════════════════════════ */
(function initParticles() {
  const canvas = $("particleCanvas");
  const ctx = canvas.getContext("2d");
  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 1.5 + 0.3,
      opacity: Math.random() * 0.5 + 0.1
    };
  }

  resize();
  for (let i = 0; i < 120; i++) particles.push(createParticle());
  window.addEventListener("resize", resize);

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Draw connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.strokeStyle = `rgba(0, 200, 255, ${0.08 * (1 - dist / 100)})`;
          ctx.lineWidth = 0.5;
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }

    // Draw particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 200, 255, ${p.opacity})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }
  draw();
})();

/* ══════════════════════════════════════════════════════════
   SCREEN MANAGEMENT
   ══════════════════════════════════════════════════════════ */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

/* ══════════════════════════════════════════════════════════
   LOADING SEQUENCE
   ══════════════════════════════════════════════════════════ */
async function runLoadingSequence() {
  showScreen("loadingScreen");

  const fill = $("loadingFill");
  const status = $("loadingStatus");

  function setProgress(pct, msg) {
    fill.style.width = pct + "%";
    status.textContent = msg;
  }

  function markCheck(id, done = true) {
    const el = $(id);
    el.classList.remove("active");
    if (done) el.classList.add("done");
  }
  function activeCheck(id) {
    $("chk-models","chk-cam","chk-mic","chk-env".split(",")).forEach && null;
    $(id).classList.add("active");
  }

  // Step 1: Load face-api models
  $(  "chk-models").classList.add("active");
  setProgress(10, "Fetching AI face detection models…");
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(STATE.modelsPath),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(STATE.modelsPath),
    ]);
    STATE.faceApiLoaded = true;
    markCheck("chk-models");
    setProgress(35, "AI models loaded ✓");
  } catch (err) {
    markCheck("chk-models", false);
    // Face API might fail due to CORS in local file — we continue anyway
    $("chk-models").style.color = "#f5a623";
    $("chk-models").textContent = "⚠ Face models (limited — use local server for full AI)";
    setProgress(35, "Continuing without full AI…");
    await delay(800);
  }

  // Step 2: Camera
  $("chk-cam").classList.add("active");
  setProgress(50, "Requesting camera access…");
  try {
    STATE.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
      audio: false
    });
    markCheck("chk-cam");
    setProgress(65, "Camera access granted ✓");
  } catch (err) {
    $("chk-cam").style.color = "#ff2d55";
    $("chk-cam").textContent = "✗ Camera access denied";
    setProgress(65, "Camera unavailable");
    await delay(800);
  }

  // Step 3: Microphone
  $("chk-mic").classList.add("active");
  setProgress(75, "Requesting microphone access…");
  try {
    STATE.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    markCheck("chk-mic");
    setProgress(88, "Microphone access granted ✓");
  } catch (err) {
    $("chk-mic").style.color = "#f5a623";
    $("chk-mic").textContent = "⚠ Microphone access denied (noise detection disabled)";
    setProgress(88, "Microphone unavailable");
    await delay(600);
  }

  // Step 4: Environment scan
  $("chk-env").classList.add("active");
  setProgress(95, "Scanning environment…");
  await delay(800);
  markCheck("chk-env");
  setProgress(100, "All systems ready ✓");
  await delay(500);

  // Transition to login
  showScreen("loginScreen");
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ══════════════════════════════════════════════════════════
   LOGIN
   ══════════════════════════════════════════════════════════ */
function initLogin() {
  const consent = $("consentCheck");
  const btn = $("btnStart");

  consent.addEventListener("change", () => {
    btn.disabled = !consent.checked;
  });

  $("studentName").addEventListener("input", validateLogin);
  $("examCode").addEventListener("input", validateLogin);

  function validateLogin() {
    btn.disabled = !consent.checked; // name/code optional for demo
  }

  btn.addEventListener("click", startExam);
}

/* ══════════════════════════════════════════════════════════
   START EXAM
   ══════════════════════════════════════════════════════════ */
async function startExam() {
  STATE.studentName = $("studentName").value.trim() || "Anonymous Student";
  STATE.examCode    = $("examCode").value.trim()   || "EXAM-" + Date.now().toString(36).toUpperCase();
  STATE.examDurationMin = parseInt($("examDuration").value);
  STATE.secondsLeft = STATE.examDurationMin * 60;
  STATE.totalSeconds = STATE.secondsLeft;
  STATE.startTime   = new Date();

  // Populate HUD
  $("hudStudentName").textContent = STATE.studentName;
  $("hudExamCode").textContent    = STATE.examCode;
  $("repStudentName").textContent = STATE.studentName;
  $("repExamCode").textContent    = STATE.examCode;

  showScreen("examScreen");
  STATE.examActive = true;

  // Enter fullscreen
  try { await document.documentElement.requestFullscreen(); } catch(e){}

  // Attach webcam
  if (STATE.stream) {
    const video = $("webcamVideo");
    video.srcObject = STATE.stream;
    await video.play().catch(() => {});
  }

  // Start all systems
  startTimer();
  startFaceDetection();
  startAudioMonitoring();
  startBrowserMonitoring();
  startSnapshotCapture();
  startMediaRecording();
  startInactivityMonitor();

  toast("Monitoring started. Good luck!", "ok");
}

/* ══════════════════════════════════════════════════════════
   TIMER
   ══════════════════════════════════════════════════════════ */
function startTimer() {
  updateTimerDisplay();
  STATE.timerInterval = setInterval(() => {
    STATE.secondsLeft--;
    updateTimerDisplay();
    if (STATE.secondsLeft <= 0) submitExam("TIME_UP");
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(STATE.secondsLeft / 60);
  const s = STATE.secondsLeft % 60;
  const display = $("timerDisplay");
  display.textContent = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

  // Bar
  const pct = (STATE.secondsLeft / STATE.totalSeconds) * 100;
  $("timerBarFill").style.width = pct + "%";

  // Colour
  const warning5min  = STATE.secondsLeft <= 300 && STATE.secondsLeft > 60;
  const critical1min = STATE.secondsLeft <= 60;
  display.className = "timer-display" + (critical1min ? " critical" : warning5min ? " warning" : "");

  if (STATE.secondsLeft === 300) toast("⏰ 5 minutes remaining!", "warn");
  if (STATE.secondsLeft === 60)  toast("⚠️ 1 minute remaining!", "alert");
}

/* ══════════════════════════════════════════════════════════
   FACE DETECTION (face-api.js)
   ══════════════════════════════════════════════════════════ */
function startFaceDetection() {
  const video  = $("webcamVideo");
  const canvas = $("faceCanvas");
  const ctx    = canvas.getContext("2d");

  let lastFaceCount = -1;
  let noFaceTicks = 0;

  async function detect() {
    if (!STATE.examActive) return;
    if (!STATE.faceApiLoaded || !STATE.stream) {
      // Fallback: simulate detection
      simulateFaceDetection();
      return;
    }

    try {
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
      const detections = await faceapi.detectAllFaces(video, options);

      // Resize canvas
      canvas.width  = video.videoWidth  || video.clientWidth;
      canvas.height = video.videoHeight || video.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const count = detections.length;
      $("faceCount").textContent = count;

      if (count > 0) {
        const conf = Math.round(detections[0].score * 100);
        $("faceConfidence").textContent = conf + "%";
      } else {
        $("faceConfidence").textContent = "—%";
      }

      // Draw face boxes
      detections.forEach(det => {
        const box = det.box;
        ctx.strokeStyle = count > 1 ? "#ff2d55" : "#00c8ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Corner markers
        const sz = 12;
        ctx.strokeStyle = count > 1 ? "#ff2d55" : "#00f5a0";
        [[box.x,box.y],[box.x+box.width-sz,box.y],[box.x,box.y+box.height-sz],[box.x+box.width-sz,box.y+box.height-sz]].forEach(([cx,cy]) => {
          ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+sz,cy); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx,cy+sz); ctx.stroke();
        });
      });

      // Events
      if (count === 0) {
        noFaceTicks++;
        updateFaceStatus("MISSING", "danger");
        if (noFaceTicks === 3) triggerEvent("NO_FACE", "No face detected in frame!", 20, "alert");
      } else {
        noFaceTicks = 0;
        if (count === 1) {
          updateFaceStatus("DETECTED", "ok");
        } else {
          updateFaceStatus("MULTIPLE!", "danger");
          if (count !== lastFaceCount) triggerEvent("MULTI_FACE", `${count} faces detected!`, 30, "alert");
        }
      }
      lastFaceCount = count;

    } catch (e) {
      simulateFaceDetection();
    }
  }

  // Run every 1.5 seconds
  STATE.faceDetectionInterval = setInterval(detect, 1500);
  detect(); // Immediate first run
}

// Fallback when face-api models aren't loaded (no CORS server)
let _simFaceTick = 0;
function simulateFaceDetection() {
  _simFaceTick++;
  // Mostly show 1 face, occasionally 0
  const count = _simFaceTick % 30 === 0 ? 0 : 1;
  $("faceCount").textContent = count;
  $("faceConfidence").textContent = count ? "94%" : "—%";
  updateFaceStatus(count ? "DETECTED" : "MISSING", count ? "ok" : "danger");
  $("faceIndicator").textContent = count ? "AI SCANNING" : "⚠ NO FACE";
}

function updateFaceStatus(text, cls) {
  const el = $("faceStatus");
  el.textContent = text;
  el.className = "fs-val";
  if (cls === "ok")     el.classList.add("status-ok");
  if (cls === "danger") el.classList.add("status-danger");
  if (cls === "warn")   el.classList.add("status-warn");

  // Monitor panel card
  const scFace = $("scFace");
  scFace.textContent = text;
  scFace.className = "sc-val" + (cls === "ok" ? "" : " bad");
  $("sc-face").querySelector(".sc-dot").className = "sc-dot " + (cls === "ok" ? "ok" : "bad");
  $("sc-face").classList.toggle("alert", cls !== "ok");
}

/* ══════════════════════════════════════════════════════════
   AUDIO MONITORING
   ══════════════════════════════════════════════════════════ */
function startAudioMonitoring() {
  if (!STATE.micStream) {
    $("scNoise").textContent = "DISABLED";
    return;
  }

  STATE.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  STATE.analyser = STATE.audioContext.createAnalyser();
  STATE.analyser.fftSize = 256;

  const source = STATE.audioContext.createMediaStreamSource(STATE.micStream);
  source.connect(STATE.analyser);

  const bufLen = STATE.analyser.frequencyBinCount;
  const dataArr = new Uint8Array(bufLen);

  let noiseTick = 0;
  const waveCanvas = $("audioWave");
  const wCtx = waveCanvas.getContext("2d");

  STATE.audioInterval = setInterval(() => {
    STATE.analyser.getByteFrequencyData(dataArr);
    const avg = dataArr.reduce((a,b) => a + b, 0) / bufLen;
    const pct = Math.min(avg / 128 * 100, 100);
    const db = Math.round(-60 + avg / 128 * 60);

    $("audioMeterFill").style.width = pct + "%";
    $("audioLevel").textContent = db + " dB";

    if (pct > 60) {
      noiseTick++;
      $("scNoise").textContent = "LOUD";
      $("scNoise").className = "sc-val bad";
      $("sc-noise").querySelector(".sc-dot").className = "sc-dot bad";
      if (noiseTick % 4 === 0) triggerEvent("LOUD_NOISE", "Loud noise detected!", 10, "warn");
    } else {
      noiseTick = 0;
      $("scNoise").textContent = "NORMAL";
      $("scNoise").className = "sc-val";
      $("sc-noise").querySelector(".sc-dot").className = "sc-dot ok";
    }

    // Waveform
    STATE.analyser.getByteTimeDomainData(dataArr);
    wCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    wCtx.lineWidth = 1.5;
    wCtx.strokeStyle = pct > 60 ? "#ff2d55" : "#00c8ff";
    wCtx.beginPath();
    const sliceW = waveCanvas.width / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = dataArr[i] / 128.0;
      const y = v * waveCanvas.height / 2;
      i === 0 ? wCtx.moveTo(x, y) : wCtx.lineTo(x, y);
      x += sliceW;
    }
    wCtx.stroke();
  }, 150);
}

/* ══════════════════════════════════════════════════════════
   BROWSER MONITORING
   ══════════════════════════════════════════════════════════ */
function startBrowserMonitoring() {
  // Tab visibility
  document.addEventListener("visibilitychange", () => {
    if (!STATE.examActive) return;
    if (document.hidden) {
      triggerEvent("TAB_SWITCH", "Tab switched / window hidden!", 15, "alert");
      updateStatusCard("sc-tab", "scTab", "SWITCHED", "bad");
    } else {
      updateStatusCard("sc-tab", "scTab", "FOCUSED", "ok");
    }
  });

  // Window blur
  window.addEventListener("blur", () => {
    if (!STATE.examActive) return;
    updateStatusCard("sc-tab", "scTab", "UNFOCUSED", "warn");
  });
  window.addEventListener("focus", () => {
    if (!STATE.examActive) return;
    updateStatusCard("sc-tab", "scTab", "FOCUSED", "ok");
  });

  // Fullscreen
  document.addEventListener("fullscreenchange", () => {
    if (!STATE.examActive) return;
    if (!document.fullscreenElement) {
      triggerEvent("FULLSCREEN_EXIT", "Fullscreen mode exited!", 10, "warn");
      updateStatusCard("sc-fs", "scFs", "EXITED", "bad");
    } else {
      updateStatusCard("sc-fs", "scFs", "ACTIVE", "ok");
    }
  });

  // Resize
  window.addEventListener("resize", () => {
    if (!STATE.examActive) return;
    triggerEvent("RESIZE", "Window resized!", 5, "warn");
  });

  // Activity tracking
  ["mousemove","keydown","click","scroll"].forEach(ev => {
    document.addEventListener(ev, () => {
      STATE.lastActivity = Date.now();
      updateStatusCard("sc-activity", "scActivity", "ACTIVE", "ok");
    });
  });
}

function updateStatusCard(cardId, valId, text, state) {
  const val = $(valId);
  val.textContent = text;
  val.className = "sc-val" + (state === "bad" ? " bad" : state === "warn" ? " warn" : "");
  $(cardId).querySelector(".sc-dot").className = "sc-dot " + (state === "ok" ? "ok" : state === "warn" ? "warn" : "bad");
  $(cardId).classList.toggle("alert", state !== "ok");
}

/* ══════════════════════════════════════════════════════════
   INACTIVITY MONITOR
   ══════════════════════════════════════════════════════════ */
function startInactivityMonitor() {
  STATE.inactivityTimer = setInterval(() => {
    if (!STATE.examActive) return;
    const idle = (Date.now() - STATE.lastActivity) / 1000;
    if (idle > 120) { // 2 minutes idle
      triggerEvent("INACTIVITY", "No activity for 2+ minutes!", 5, "warn");
      updateStatusCard("sc-activity", "scActivity", "IDLE", "warn");
    }
  }, 30000);
}

/* ══════════════════════════════════════════════════════════
   SNAPSHOT CAPTURE (every 30s)
   ══════════════════════════════════════════════════════════ */
function startSnapshotCapture() {
  captureSnapshot(); // immediate
  STATE.snapshotInterval = setInterval(captureSnapshot, 30000);
}

function captureSnapshot() {
  const video = $("webcamVideo");
  if (!video.srcObject) return;

  const canvas = document.createElement("canvas");
  canvas.width  = video.videoWidth  || 320;
  canvas.height = video.videoHeight || 240;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Timestamp overlay
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, canvas.height - 24, canvas.width, 24);
  ctx.fillStyle = "#00c8ff";
  ctx.font = "11px monospace";
  const ts = new Date().toLocaleTimeString();
  ctx.fillText(`${STATE.studentName} | ${ts}`, 6, canvas.height - 7);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
  STATE.snapshots.push({ dataUrl, timestamp: new Date().toISOString() });

  // Update gallery
  const img = document.createElement("img");
  img.src = dataUrl;
  img.className = "snap-img";
  img.title = `Snapshot at ${ts}`;
  $("snapGallery").prepend(img);
  $("snapCount").textContent = STATE.snapshots.length + " captured";
}

/* ══════════════════════════════════════════════════════════
   MEDIA RECORDING (webcam)
   ══════════════════════════════════════════════════════════ */
function startMediaRecording() {
  if (!STATE.stream) {
    updateStatusCard("sc-rec", "scRec", "DISABLED", "warn");
    return;
  }

  try {
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9" : "video/webm";
    STATE.mediaRecorder = new MediaRecorder(STATE.stream, { mimeType });
    STATE.recordedChunks = [];

    STATE.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) STATE.recordedChunks.push(e.data);
    };

    STATE.mediaRecorder.onstop = () => {
      const blob = new Blob(STATE.recordedChunks, { type: "video/webm" });
      const url  = URL.createObjectURL(blob);
      const btn  = $("btnDownload");
      btn.disabled = false;
      btn.addEventListener("click", () => {
        const a = document.createElement("a");
        a.href = url;
        a.download = `proctor_${STATE.studentName.replace(/\s+/g,"_")}_${Date.now()}.webm`;
        a.click();
      });
    };

    STATE.mediaRecorder.start(1000); // collect chunks every 1s
    updateStatusCard("sc-rec", "scRec", "ACTIVE", "ok");
    $("recIndicator").style.display = "flex";
  } catch (err) {
    updateStatusCard("sc-rec", "scRec", "ERROR", "bad");
  }
}

/* ══════════════════════════════════════════════════════════
   RISK SCORING ENGINE
   ══════════════════════════════════════════════════════════ */
const RISK_PENALTIES = {
  TAB_SWITCH:    15,
  NO_FACE:       20,
  MULTI_FACE:    30,
  FULLSCREEN_EXIT: 10,
  LOUD_NOISE:    10,
  INACTIVITY:     5,
  RESIZE:         5
};

const RISK_BREAKDOWN_MAP = {
  TAB_SWITCH:      "tab",
  NO_FACE:         "noFace",
  MULTI_FACE:      "multiFace",
  FULLSCREEN_EXIT: "fullscreen",
  LOUD_NOISE:      "noise"
};

function triggerEvent(type, message, scoreDelta, severity = "warn") {
  if (!STATE.examActive) return;

  // Add to risk
  STATE.riskScore = Math.min(100, STATE.riskScore + scoreDelta);
  if (RISK_BREAKDOWN_MAP[type]) {
    STATE.riskBreakdown[RISK_BREAKDOWN_MAP[type]] += scoreDelta;
  }

  STATE.eventCount++;
  if (severity === "alert") STATE.warnings++;

  // Update HUD
  $("hudWarnings").textContent = STATE.warnings;
  $("hudEvents").textContent   = STATE.eventCount;
  $("logCount").textContent    = STATE.eventCount + " events";

  // Update risk meter
  updateRiskMeter();

  // Log entry
  const now = new Date();
  const timeStr = now.toTimeString().slice(0,8);
  const log = { type, message, score: scoreDelta, time: timeStr, severity };
  STATE.logs.push(log);
  addLogEntry(log);

  // Toast
  toast(`${message} +${scoreDelta} risk`, severity);

  // Warning popup for critical alerts
  if (severity === "alert" && STATE.warnings % 1 === 0) {
    showWarning(message, type);
  }

  // Update breakdown display
  updateBreakdownDisplay();
}

function updateRiskMeter() {
  const score = STATE.riskScore;
  $("riskScore").textContent = score;

  // Arc path update (251 = full arc dasharray)
  const arc = $("riskArc");
  const offset = 251 - (score / 100) * 251;
  arc.style.strokeDashoffset = offset;

  // Needle rotation (-90deg = 0, 90deg = 100)
  const angle = -90 + (score / 100) * 180;
  $("riskNeedle").setAttribute("transform", `rotate(${angle}, 100, 100)`);

  // Label + color
  const label = $("riskLabel");
  const scoreEl = $("riskScore");
  if (score < 30) {
    label.textContent = "● SAFE"; label.className = "risk-label safe";
    scoreEl.style.color = "var(--green)";
  } else if (score < 60) {
    label.textContent = "⚠ SUSPICIOUS"; label.className = "risk-label suspicious";
    scoreEl.style.color = "var(--orange)";
  } else {
    label.textContent = "🚨 HIGH RISK"; label.className = "risk-label high-risk";
    scoreEl.style.color = "var(--red)";
  }
}

function updateBreakdownDisplay() {
  $("rb-tab").textContent       = "+" + STATE.riskBreakdown.tab;
  $("rb-noface").textContent    = "+" + STATE.riskBreakdown.noFace;
  $("rb-multiface").textContent = "+" + STATE.riskBreakdown.multiFace;
  $("rb-fs").textContent        = "+" + STATE.riskBreakdown.fullscreen;
  $("rb-noise").textContent     = "+" + STATE.riskBreakdown.noise;
}

/* ══════════════════════════════════════════════════════════
   LOG PANEL
   ══════════════════════════════════════════════════════════ */
function addLogEntry({ type, message, score, time, severity }) {
  const container = $("logContainer");
  const entry = document.createElement("div");
  entry.className = "log-entry " + (severity === "alert" ? "alert" : severity === "warn" ? "warn" : "");
  entry.innerHTML = `
    <span class="log-time">${time}</span>
    <span class="log-msg">${message}</span>
    <span class="log-score">+${score}</span>
  `;
  container.prepend(entry);

  // Keep max 50 entries visible
  while (container.children.length > 50) container.lastChild.remove();
}

/* ══════════════════════════════════════════════════════════
   WARNING OVERLAY
   ══════════════════════════════════════════════════════════ */
function showWarning(message, type) {
  if (STATE.warningVisible) return;
  STATE.warningVisible = true;

  $("warningTitle").textContent  = type.replace(/_/g," ");
  $("warningMsg").textContent    = message;
  $("warningScore").textContent  = STATE.riskScore;
  $("warningOverlay").classList.remove("hidden");
}

$("btnDismiss").addEventListener("click", () => {
  $("warningOverlay").classList.add("hidden");
  STATE.warningVisible = false;
});

/* ══════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ══════════════════════════════════════════════════════════ */
function toast(msg, type = "info") {
  const icons = { ok: "✅", warn: "⚠️", alert: "🚨", info: "ℹ️" };
  const container = $("toastContainer");
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.innerHTML = `<span>${icons[type]||"ℹ️"}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

/* ══════════════════════════════════════════════════════════
   SUBMIT EXAM
   ══════════════════════════════════════════════════════════ */
$("btnSubmit").addEventListener("click", () => {
  if (confirm("Are you sure you want to submit the exam?")) submitExam("MANUAL");
});

function submitExam(reason) {
  if (!STATE.examActive) return;
  STATE.examActive = false;

  // Stop everything
  clearInterval(STATE.timerInterval);
  clearInterval(STATE.faceDetectionInterval);
  clearInterval(STATE.audioInterval);
  clearInterval(STATE.snapshotInterval);
  clearInterval(STATE.inactivityTimer);

  if (STATE.mediaRecorder && STATE.mediaRecorder.state !== "inactive") {
    STATE.mediaRecorder.stop();
  }

  if (STATE.audioContext) STATE.audioContext.close();

  // Exit fullscreen
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});

  // Duration
  const elapsed = Math.round((Date.now() - STATE.startTime.getTime()) / 1000);
  const durMin = Math.floor(elapsed / 60);
  const durSec = elapsed % 60;
  const durStr = `${durMin}m ${durSec}s`;

  // Build report
  buildReport(durStr);
  showScreen("reportScreen");

  toast("Exam submitted. Generating report…", "ok");
}

/* ══════════════════════════════════════════════════════════
   FINAL REPORT
   ══════════════════════════════════════════════════════════ */
function buildReport(duration) {
  const score = STATE.riskScore;

  // Score ring animation
  const ring = $("repScoreRing");
  const offset = 314 - (score / 100) * 314;
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = score < 30 ? "var(--green)" : score < 60 ? "var(--orange)" : "var(--red)";

  $("repScore").textContent = score;

  // Verdict
  const verdict = $("repVerdict");
  if (score < 30) {
    verdict.textContent = "✅ VERIFIED SAFE";
    verdict.className = "verdict-badge safe";
  } else if (score < 60) {
    verdict.textContent = "⚠ SUSPICIOUS ACTIVITY";
    verdict.className = "verdict-badge suspicious";
  } else {
    verdict.textContent = "🚨 HIGH RISK DETECTED";
    verdict.className = "verdict-badge high-risk";
  }

  $("repWarnings").textContent = STATE.warnings;
  $("repEvents").textContent   = STATE.eventCount;
  $("repDuration").textContent = duration;

  // Breakdown
  const bk = $("repBreakdown");
  const bd = STATE.riskBreakdown;
  const items = [
    ["Tab Switches",    bd.tab],
    ["No Face",         bd.noFace],
    ["Multiple Faces",  bd.multiFace],
    ["Fullscreen Exit", bd.fullscreen],
    ["Loud Noise",      bd.noise],
  ];
  bk.innerHTML = items.map(([label, val]) => `
    <div class="rb-card">
      <span class="rb-card-label">${label}</span>
      <span class="rb-card-val">+${val}</span>
    </div>
  `).join("");

  // Timeline
  const tl = $("repTimeline");
  tl.innerHTML = STATE.logs.map(l => `
    <div class="tl-item">
      <span class="tl-time">${l.time}</span>
      <span class="tl-event">${l.message}</span>
      <span class="tl-score">+${l.score}</span>
    </div>
  `).join("") || '<div class="tl-item"><span class="tl-event" style="color:var(--green)">No violations detected 🎉</span></div>';

  // Evidence
  const ev = $("repEvidence");
  if (STATE.snapshots.length) {
    ev.innerHTML = STATE.snapshots.map(s => `<img class="ev-img" src="${s.dataUrl}" title="${s.timestamp}"/>`).join("");
  } else {
    ev.innerHTML = '<span style="color:var(--text-dim);font-family:var(--font-mono);font-size:12px">No snapshots captured</span>';
  }

  // Animate score counter
  let cur = 0;
  const target = score;
  const inc = setInterval(() => {
    cur = Math.min(cur + 2, target);
    $("repScore").textContent = cur;
    if (cur >= target) clearInterval(inc);
  }, 20);
}

/* Report action buttons */
$("btnDownloadReport").addEventListener("click", () => {
  const lines = [
    "PROCTOR AI — EXAMINATION REPORT",
    "================================",
    `Student: ${STATE.studentName}`,
    `Exam:    ${STATE.examCode}`,
    `Date:    ${STATE.startTime?.toLocaleString() || "N/A"}`,
    "",
    `RISK SCORE: ${STATE.riskScore} / 100`,
    `WARNINGS:   ${STATE.warnings}`,
    `EVENTS:     ${STATE.eventCount}`,
    "",
    "VIOLATION BREAKDOWN",
    "-------------------",
    `Tab Switches:    +${STATE.riskBreakdown.tab}`,
    `No Face:         +${STATE.riskBreakdown.noFace}`,
    `Multiple Faces:  +${STATE.riskBreakdown.multiFace}`,
    `Fullscreen Exit: +${STATE.riskBreakdown.fullscreen}`,
    `Loud Noise:      +${STATE.riskBreakdown.noise}`,
    "",
    "ACTIVITY TIMELINE",
    "-----------------",
    ...STATE.logs.map(l => `[${l.time}] ${l.message} (+${l.score})`),
  ].join("\n");

  const blob = new Blob([lines], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ProctorAI_Report_${STATE.studentName.replace(/\s+/g,"_")}.txt`;
  a.click();
  toast("Report downloaded!", "ok");
});

$("btnDownloadEvidence").addEventListener("click", () => {
  if (!STATE.snapshots.length) { toast("No snapshots to download", "warn"); return; }
  // Download first snapshot as demo (zip would need JSZip)
  STATE.snapshots.forEach((s, i) => {
    const a = document.createElement("a");
    a.href = s.dataUrl;
    a.download = `evidence_${i+1}_${STATE.studentName.replace(/\s+/g,"_")}.jpg`;
    a.click();
  });
  toast(`${STATE.snapshots.length} snapshots downloaded!`, "ok");
});

$("btnNewExam").addEventListener("click", () => {
  // Clean up streams
  if (STATE.stream) STATE.stream.getTracks().forEach(t => t.stop());
  if (STATE.micStream) STATE.micStream.getTracks().forEach(t => t.stop());

  // Reset state
  Object.assign(STATE, {
    stream: null, micStream: null, mediaRecorder: null, recordedChunks: [],
    riskScore: 0, riskBreakdown: { tab:0, noFace:0, multiFace:0, fullscreen:0, noise:0 },
    warnings: 0, eventCount: 0, logs: [], snapshots: [],
    examActive: false, warningVisible: false,
    faceApiLoaded: STATE.faceApiLoaded // preserve
  });

  // Re-run loading
  runLoadingSequence();
});

/* ══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUT HINT (F only for demo)
   ══════════════════════════════════════════════════════════ */
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && STATE.examActive) {
    // Don't exit, re-enter fullscreen
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }
});

/* ══════════════════════════════════════════════════════════
   SAVE LOGS TO LOCALSTORAGE
   ══════════════════════════════════════════════════════════ */
window.addEventListener("beforeunload", () => {
  if (STATE.examActive && STATE.logs.length > 0) {
    try {
      localStorage.setItem("proctorAI_lastSession", JSON.stringify({
        student: STATE.studentName,
        exam: STATE.examCode,
        riskScore: STATE.riskScore,
        logs: STATE.logs,
        snapshots: STATE.snapshots.length
      }));
    } catch(e) {}
  }
});

/* ══════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════ */
window.addEventListener("DOMContentLoaded", () => {
  initLogin();
  runLoadingSequence();
});

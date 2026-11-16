# 🏋️‍♂️ AICoaching — Personal AI Fitness, Nutrition & Daily Routine Coach

**AICoaching** is a full-stack, cross-platform AI fitness, nutrition, progressive overload, and daily routine coaching application powered by **Google Gemini** and a **Hybrid SQLite + Offline LocalStorage Engine**.

It runs seamlessly as a local web server (`FastAPI` / `ThreadingHTTPServer` + `SQLite`), an installable **Progressive Web App (PWA)**, or a **zero-dependency standalone single-file application** across **Windows, Android, iOS, and macOS**.

---

## 📥 Direct Downloads (Windows / Android / iOS / macOS)

You can download and run **AICoaching** directly on any device:

| Platform | Package Type | Download Link |
| :--- | :--- | :--- |
| 🪟 **Windows (10/11)** | Native Desktop App Launcher (`.bat`) | [Download `AICoaching_Windows_App.bat`](https://raw.githubusercontent.com/EmreOuzouns/AICoaching/main/downloads/AICoaching_Windows_App.bat) |
| 🤖 **Android** | Standalone Offline-Capable App (`.html` / PWA) | [Download `AICoaching_Portable_App.html`](https://raw.githubusercontent.com/EmreOuzouns/AICoaching/main/downloads/AICoaching_Portable_App.html) |
| 🍎 **iOS (iPhone & iPad)** | iOS Full-Screen Home Screen Profile (`.mobileconfig`) | [Download `AICoaching_iOS.mobileconfig`](https://raw.githubusercontent.com/EmreOuzouns/AICoaching/main/downloads/AICoaching_iOS.mobileconfig) |
| 💻 **macOS (Apple Silicon & Intel)** | macOS App Launcher (`.command`) | [Download `AICoaching_Mac_App.command`](https://raw.githubusercontent.com/EmreOuzouns/AICoaching/main/downloads/AICoaching_Mac_App.command) |
| 📦 **Universal Portable App** | Single-File Offline App (All Platforms) | [Download `AICoaching_Portable_App.html`](https://raw.githubusercontent.com/EmreOuzouns/AICoaching/main/downloads/AICoaching_Portable_App.html) |

> **Tip:** When the local server is running, visit **`http://localhost:8090/indir`** (or open the in-app **Download Center**) for one-click installation on any device connected to your network.

---

## ✨ Key Features

- 🧠 **AI-Powered Onboarding & Program Generation:**
  - Multi-step interactive onboarding quiz that calculates BMR, TDEE, daily calorie targets, and macro splits (Protein, Carbs, Fat) tailored to your body metrics and goal pace.
  - Automatically generates personalized workout splits and chronological daily routines using **Google Gemini** (with built-in offline template fallbacks).
- 📈 **Progressive Overload Advisor & Live Workout Session:**
  - Tracks sets, reps, weight (`kg`), and **RIR (Reps in Reserve: 0–4)**.
  - Analyzes past workout logs to recommend set-by-set weight and rep targets (Set 1: RIR 2, Set 2: RIR 1, Final Set: RIR 0 failure).
  - Interactive **Live Workout Session** mode with automatic rest timers (90s for compound lifts, 60s for isolation) and automatic Personal Record (PR) detection for Squat, Bench Press, and Deadlift.
- 🍎 **AI Vision & Natural Language Nutrition Tracker:**
  - **AI Text Parser:** Log meals in natural language (e.g., *"100g oats and 3 eggs"*) and let Gemini automatically calculate calories and macros.
  - **AI Photo Vision Parser:** Upload or snap a photo of your meal for automatic visual macro estimation via `gemini-2.5-flash`.
  - **Meal Favorites & Copy Yesterday's Meals:** Save frequent meals with one click (`⭐`) and copy previous day logs effortlessly.
  - **Interactive Water Tracker:** Visual glass fill animation with `±0.25L` quick controls.
- 🗓️ **Daily Routine Timeline & Smart Sleep Lock:**
  - Interactive chronological schedule with AI day-planning support.
  - End-of-day report generator with AI Coach feedback and optional unlock/edit controls.
- 🎮 **Gamification & Social Leaderboard:**
  - Earn XP and level up (`Lv 1+`) as you complete workouts and log meals.
  - Compare Squat, Bench Press, and Deadlift PRs and inspect active training programs on the **Social Leaderboard**.
- 💾 **Hybrid Storage Architecture (SQLite + LocalStorage Fallback):**
  - Persists all data in `data/aicoaching.db` (SQLite) when connected to the Python backend.
  - Automatically falls back to an embedded `LocalStorage` database engine when opened as a standalone portable file (`file://`) or offline on mobile/desktop devices.

---

## 🛠️ Tech Stack

- **Backend:** Python 3 (`FastAPI` + `Uvicorn` with automatic zero-dependency `ThreadingHTTPServer` fallback for Python 3.15+ compatibility)
- **Database:** `SQLite3` (server mode) + `LocalStorage` Hybrid Engine (standalone/offline mode)
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, Modern Light-Mode Glassmorphism CSS3, Chart.js, FontAwesome 6
- **AI Integration:** Google Gemini API (`gemini-2.5-flash` & `gemini-2.5-flash-lite`)
- **Cross-Platform Packaging:** Progressive Web App (`manifest.json` + Service Worker `sw.js`), iOS WebClip (`.mobileconfig`), Windows/macOS Native App Mode Launchers, and Self-Contained Single-File HTML bundler

---

## 🚀 Quick Start

### Option 1: Run with Python Backend (Recommended for Desktop)

1. Clone the repository:
   ```bash
   git clone https://github.com/EmreOuzouns/AICoaching.git
   cd AICoaching
   ```
2. Start the server:
   - **Windows:** Double-click `run.bat` or run:
     ```bash
     python server.py
     ```
   - **macOS / Linux:**
     ```bash
     python3 server.py
     ```
3. Open your browser at:
   - **Main App:** `http://localhost:8090`
   - **Download Center:** `http://localhost:8090/indir`

### Option 2: Run Standalone (Zero Installation)

Simply download and open [`downloads/AICoaching_Portable_App.html`](./downloads/AICoaching_Portable_App.html) in any browser on **Windows, Android, iOS, or macOS**. All features work offline out of the box using the built-in hybrid storage engine.

---

## 📁 Project Structure

```text
AICoaching/
├── index.html          # Main application UI (Dashboard, Routine, Workout, Nutrition, Recovery, AI Coach, Social, Settings)
├── download.html       # Cross-platform Download Center page (/indir)
├── style.css           # Glassmorphism design system & responsive layout
├── app.js              # Frontend application logic + Hybrid Offline LocalStorage Engine
├── server.py           # SQLite backend server (FastAPI / ThreadingHTTPServer) + Multi-platform app bundler
├── sw.js               # Service Worker for PWA offline caching
├── manifest.json       # Web App Manifest for Android/Desktop PWA installation
├── generate_icons.py   # Utility script to generate 192x192 and 512x512 app icons
├── requirements.txt    # Optional Python dependencies (FastAPI, Uvicorn)
├── run.bat             # One-click Windows server launcher
├── icons/              # PWA & iOS WebClip application icons
├── downloads/          # Pre-built multi-platform launchers & standalone portable app
└── data/               # Local SQLite database directory (ignored in Git for privacy)
```

---

## 🔌 REST API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET / POST` | `/api/profile` | Retrieve or update user profile, targets, and obfuscated Gemini API key |
| `GET / POST` | `/api/logs` | Retrieve or save daily workout, nutrition, water, recovery, and routine logs |
| `GET` | `/api/logs/list` | List all recorded log dates for the active user |
| `GET` | `/api/logs/copy-yesterday-meals` | Fetch previous day's logged meals and macros |
| `GET` | `/api/users/list` | List all registered profiles |
| `GET` | `/api/social/users` | Retrieve public profiles, PRs, and active workout templates for the leaderboard |
| `GET / POST / DELETE` | `/api/chat` | Load, append, or clear daily AI Coach chat history |
| `GET / POST / DELETE` | `/api/favorites` | Manage favorite meals for one-click logging |
| `GET / POST` | `/api/pr-history` | Track historical Personal Records (Squat, Bench Press, Deadlift) |
| `GET` | `/api/stats/streak` | Calculate current active logging streak and total logged days |
| `GET` | `/api/stats/trends` | Aggregate 14-day calorie, protein, water, sleep, and workout volume trends |
| `GET` | `/api/download/{platform}` | Dynamically package & download app for `windows`, `android`, `ios`, `mac`, or `standalone` |

---

## 📄 License

This project is open-source and available under the MIT License.

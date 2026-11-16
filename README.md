<div align="center">

# 🏋️‍♂️ AICoaching

### Personal AI Fitness, Progressive Overload, Nutrition & Daily Routine Coach

[![License: MIT](https://img.shields.io/badge/License-MIT-orange.svg)](./LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-3776AB?logo=python&logoColor=white)](./server.py)
[![SQLite3](https://img.shields.io/badge/Database-SQLite3%20%2B%20LocalStorage-003B57?logo=sqlite&logoColor=white)](./server.py)
[![Gemini AI](https://img.shields.io/badge/AI-Google%20Gemini%202.5-8E75B2?logo=googlegemini&logoColor=white)](./app.js)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Android%20%7C%20iOS%20%7C%20macOS-10b981)](#direct-downloads-windows--android--ios--macos)

**AICoaching** is a full-stack, cross-platform AI coaching application designed to manage strength training, progressive overload (`RIR`), nutrition & macro tracking, daily time-blocking routines, and recovery metrics. Powered by **Google Gemini** and a **Hybrid SQLite + Offline LocalStorage Engine**, it operates seamlessly both with a local Python server and as a zero-dependency standalone application across desktop and mobile devices.

</div>

---

## 📑 Table of Contents

1. [Direct Downloads (Windows / Android / iOS / macOS)](#-direct-downloads-windows--android--ios--macos)
2. [Core Features](#-core-features)
3. [System Architecture & Codebase Reference](#-system-architecture--codebase-reference)
4. [Database Schema (SQLite & Hybrid Offline Store)](#-database-schema-sqlite--hybrid-offline-store)
5. [Quick Start & Installation](#-quick-start--installation)
6. [REST API Reference](#-rest-api-reference)
7. [License](#-license)

---

## 📥 Direct Downloads (Windows / Android / iOS / macOS)

Click any link below to directly download the pre-built binary/archive package for your operating system (no raw script text — direct file download):

| Operating System | Package Format | Direct Download | Description |
| :--- | :--- | :--- | :--- |
| 🪟 **Windows 10 / 11** | `.exe` Native App | [**Download `AICoaching_Windows.exe`**](https://github.com/EmreOuzouns/AICoaching/raw/main/downloads/AICoaching_Windows.exe) | Standalone native Windows desktop executable (314 KB) with embedded offline app & auto-server detection. |
| 🪟 **Windows (Archive)** | `.zip` Bundle | [**Download `AICoaching_Windows.zip`**](https://github.com/EmreOuzouns/AICoaching/raw/main/downloads/AICoaching_Windows.zip) | ZIP archive containing `AICoaching_Windows.exe` and the portable offline HTML app. |
| 🤖 **Android** | `.zip` Package | [**Download `AICoaching_Android.zip`**](https://github.com/EmreOuzouns/AICoaching/raw/main/downloads/AICoaching_Android.zip) | Offline-capable Android package + PWA full-screen installation support. |
| 🍎 **iOS (iPhone & iPad)** | `.zip` Package | [**Download `AICoaching_iOS.zip`**](https://github.com/EmreOuzouns/AICoaching/raw/main/downloads/AICoaching_iOS.zip) | Includes `AICoaching_iOS.mobileconfig` (Home Screen WebClip profile) + standalone iOS app. |
| 💻 **macOS** | `.zip` App Bundle | [**Download `AICoaching_macOS.zip`**](https://github.com/EmreOuzouns/AICoaching/raw/main/downloads/AICoaching_macOS.zip) | Includes `AICoaching.app` macOS bundle and the portable offline application. |

---

## ✨ Core Features

### 1. 🧠 Smart Onboarding & Dynamic Target Calculation
- **6-Step Interactive Quiz:** Captures biometrics (age, gender, height, current weight, target weight), fitness goal (*Hypertrophy, Fat Loss, Strength, Health*), experience level, training equipment (*Gym, Home Dumbbell, Calisthenics*), session duration limit, dietary preference, and AI Coach persona.
- **Mifflin-St Jeor TDEE & Macro Engine:** Automatically computes Basal Metabolic Rate (BMR), Total Daily Energy Expenditure (TDEE), daily calorie adjustments based on weekly pace (`0.25`, `0.50`, or `0.75 kg/week`), and optimal macro splits (`2.0g/kg` protein, `0.9g/kg` fat, remaining calories allocated to carbohydrates).

### 2. 🏋️‍♂️ Progressive Overload Advisor & Live Workout Session
- **RIR-Based Overload Algorithm:** Evaluates historical sets across past workout logs and calculates exact weight (`kg`) and repetition targets for today's session:
  - **Set 1 (Warm-up Transition):** Targets `RIR 2` (2 reps in reserve) to preserve central nervous system (CNS) readiness.
  - **Set 2 (Working Intensity):** Targets `RIR 1` (1 rep in reserve).
  - **Final Set (Peak Hypertrophy Stimulus):** Targets `RIR 0` (muscular failure) with `+1 rep` or `+2.5 kg` progression.
- **Interactive Live Session Overlay:** Guides the athlete set-by-set with automated rest countdown timers (`90s` for compound lifts like Squat/Bench/Deadlift/Press, `60s` for isolation movements) and automatic Personal Record (`PR`) tracking.

### 3. 🍎 AI Vision & Natural Language Nutrition Logger
- **Natural Language Meal Parsing:** Type meals in plain text (e.g., *"150g grilled chicken breast, 200g cooked rice"*) and let Gemini automatically extract structured calorie and macro values.
- **AI Photo Vision Analysis:** Upload or capture a photo of any meal to estimate calories, protein, carbs, and fat using `gemini-2.5-flash` multimodal vision.
- **One-Click Favorites & Day Cloning:** Star (`⭐`) frequent meals to save them to your favorites list, or copy yesterday's entire meal log with a single click.

### 4. 🗓️ Chronological Routine Planner & End-of-Day Report
- **AI Time-Blocking:** Describe your workday tasks, meetings, and training schedule in natural language to generate a chronological daily timeline.
- **Automated End-of-Day Lock & Evaluation:** Generates a comprehensive daily report card comparing actual vs. target macros, hydration, routine completion percentage, and AI Coach feedback. Includes a manual **Unlock / Edit** toggle whenever adjustments are needed.

### 5. 🎮 Gamification (XP / Levels) & Social Leaderboard
- **XP Progression:** Earn XP for logging meals (`+5 XP`), photo meals (`+10 XP`), and completing workouts (`+50 XP`) to level up your profile.
- **Social Leaderboard:** Compare Squat, Bench Press, and Deadlift PRs across public profiles and inspect other athletes' active training splits.

---

## 🏗️ System Architecture & Codebase Reference

```text
AICoaching/
├── server.py               # Backend Server, SQLite ORM layer & Multi-Platform App Packager
├── app.js                  # Frontend SPA Controller, AI Integration & Hybrid Offline DB Engine
├── index.html              # Single-Page Application (SPA) Views, Modals & Onboarding Quiz
├── download.html           # Dedicated Cross-Platform Download Center (/indir)
├── style.css               # Light-Mode Glassmorphism Design System & Responsive Grid
├── sw.js                   # Service Worker (Network-First strategy with offline cache fallback)
├── manifest.json           # PWA Web App Manifest
├── generate_icons.py       # Canvas/PNG Icon Generator (192x192 & 512x512)
├── requirements.txt        # Optional Python dependencies (FastAPI, Uvicorn)
├── run.bat                 # Windows Server Launcher
├── LICENSE                 # MIT License
├── icons/                  # Application Icons (icon-192.png, icon-512.png)
├── downloads/              # Compiled Windows .exe & Multi-Platform .zip Release Packages
└── data/                   # Local SQLite Database Storage (git-ignored for user privacy)
```

### Detailed Module Breakdown

#### 1. Backend Layer ([`server.py`](./server.py))
- **Dual-Engine HTTP Server (`USE_FASTAPI`):** Attempts to initialize `FastAPI` + `Uvicorn`. If running on pre-release Python versions (such as Python 3.15) where binary C-extensions (`pydantic_core`) are unavailable, it transparently falls back to a multi-threaded standard library `ThreadingHTTPServer` (`AICoachingHTTPHandler`) exposing the exact same REST API routes.
- **API Key Obfuscation (`encode_api_key` / `decode_api_key`):** Applies XOR + Base64 encoding before storing the user's Gemini API key in the `users.api_key_enc` column.
- **Legacy JSON Migration (`migrate_json_to_sqlite`):** Automatically detects legacy `data/profile.json` and `data/logs/*.json` files on startup, imports them into `data/aicoaching.db`, and creates a safe backup under `data/json_backup/`.
- **Cross-Platform Packager (`build_platform_package` & `build_standalone_html`):** Dynamically bundles `index.html`, `style.css`, `app.js`, and Base64-encoded icons into standalone executables and `.zip` archives for Windows, Android, iOS, and macOS.

#### 2. Frontend & Hybrid Storage Layer ([`app.js`](./app.js))
- **`initHybridLocalDB()` (Lines 4–230):** Wraps `window.fetch` to intercept all `/api/*` requests.
  - **Connected Mode:** Forwards requests to the Python SQLite server and mirrors `GET`/`POST` payloads into `localStorage` (`eocoach_offline_db_v2`).
  - **Standalone / Offline Mode:** When opened directly from disk (`file://`, `AICoaching_Windows.exe` standalone mode, or mobile offline mode), serves all CRUD operations directly from `localStorage` with zero server dependency.
- **`calculateNutritionTargets(p)` (Lines 375–425):** Implements the Mifflin-St Jeor equation, activity multipliers (`1.2` to `1.725`), caloric surplus/deficit pacing, and macro gram allocation.
- **`renderOverloadTips()` & `renderSessionStep()` (Lines 1340–1425, 2500–2620):** Queries historical workout logs, finds the highest-weight working set for each exercise, and computes set-specific RIR progression targets.
- **`renderInsights()` (Lines 1090–1170):** Analyzes weight trajectory, caloric adherence percentage, workout completion, and remaining daily protein requirements to populate the AI Coach Insights panel in real time.

#### 3. User Interface & Styling ([`index.html`](./index.html) & [`style.css`](./style.css))
- Built with CSS custom properties (`--neon-orange`, `--neon-purple`, `--neon-cyan`, `--neon-green`), `backdrop-filter: blur(20px)` glassmorphic cards, SVG/CSS conic-gradient progress rings, and `Chart.js` weight trajectory visualizations.
- Fully responsive layout adapting from a 3-column desktop dashboard to a touch-friendly mobile navigation bar on screens `< 768px`.

---

## 🗄️ Database Schema (SQLite & Hybrid Offline Store)

The SQLite database (`data/aicoaching.db`) initializes the following 5 tables automatically on startup:

| Table Name | Primary Key / Unique Constraint | Purpose |
| :--- | :--- | :--- |
| `users` | `username TEXT PRIMARY KEY` | Stores user biometrics, nutrition targets, PRs, active templates (`profile_json`), and obfuscated API key (`api_key_enc`). |
| `daily_logs` | `UNIQUE(username, log_date)` | Stores daily macros/hydration (`nutrition_json`), exercises/sets (`workout_json`), sleep/DOMS (`recovery_json`), timeline (`routine_json`), logged meals (`meals_json`), body weight, and lock state (`day_closed`). |
| `chat_history` | `id INTEGER PRIMARY KEY` | Stores chronological user and AI Coach messages indexed by `(username, chat_date)`. |
| `meal_favorites` | `id INTEGER PRIMARY KEY` | Stores starred (`⭐`) meals (`name`, `calories`, `protein`, `carbs`, `fat`) for one-click logging. |
| `pr_history` | `id INTEGER PRIMARY KEY` | Tracks historical Personal Record progression (`exercise`, `weight_kg`, `pr_date`) indexed by `(username, exercise)`. |

---

## 🚀 Quick Start & Installation

### Option A: Instant Standalone Launch (No Python Required)
1. Download [**`AICoaching_Windows.exe`**](https://github.com/EmreOuzouns/AICoaching/raw/main/downloads/AICoaching_Windows.exe) (Windows) or extract the `.zip` archive for your platform from the [`downloads/`](./downloads) folder.
2. Double-click to launch directly in a native application window.

### Option B: Run Local Python Server (SQLite Backend)
1. Clone the repository:
   ```bash
   git clone https://github.com/EmreOuzouns/AICoaching.git
   cd AICoaching
   ```
2. (Optional) Install FastAPI & Uvicorn — *Note: `server.py` also runs out-of-the-box using Python's built-in standard library if FastAPI is not installed*:
   ```bash
   pip install -r requirements.txt
   ```
3. Launch the server:
   ```bash
   python server.py
   ```
   *(On Windows, you can also double-click `run.bat`)*
4. Open in your browser:
   - **Application:** `http://localhost:8090`
   - **Download Center:** `http://localhost:8090/indir`

---

## 🔌 REST API Reference

| Method | Endpoint | Query / Body Parameters | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/profile` | `?user=<username>` | Fetch user profile and decoded Gemini API key |
| `POST` | `/api/profile` | `?user=<username>` + JSON Body | Create or update user profile & nutrition targets |
| `GET` | `/api/logs` | `?date=YYYY-MM-DD&user=<username>` | Retrieve daily log (or default empty template) |
| `POST` | `/api/logs` | `?user=<username>` + JSON Body | Upsert daily workout, nutrition, water, and routine log |
| `GET` | `/api/logs/list` | `?user=<username>` | List all recorded dates for the user |
| `GET` | `/api/logs/copy-yesterday-meals` | `?target_date=YYYY-MM-DD&user=<username>` | Retrieve previous day's logged meals |
| `GET` | `/api/users/list` | — | List all registered usernames |
| `GET` | `/api/social/users` | — | Fetch public user profiles, PRs, and active workouts |
| `GET / POST / DELETE` | `/api/chat` | `?user=<username>&chat_date=YYYY-MM-DD` | Retrieve, append, or clear daily AI Coach chat history |
| `GET / POST` | `/api/favorites` | `?user=<username>` | List or add favorite meals |
| `DELETE` | `/api/favorites/{fav_id}` | `?user=<username>` | Remove a meal from favorites |
| `GET / POST` | `/api/pr-history` | `?user=<username>&exercise=<name>` | Retrieve or record new Personal Records |
| `GET` | `/api/stats/streak` | `?user=<username>` | Calculate consecutive active logging streak |
| `GET` | `/api/stats/trends` | `?user=<username>&days=14` | Fetch 14-day aggregated nutrition, sleep & volume trends |
| `GET` | `/api/download/{platform}` | `windows`, `android`, `ios`, `mac`, `standalone` | Download platform-specific application binary/archive |

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](./LICENSE) for full license text.

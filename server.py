"""
AICoaching Backend — FastAPI / ThreadingHTTPServer + SQLite
All persistent user data is stored in the local SQLite database (data/aicoaching.db).
Includes automatic migration from legacy JSON files and a built-in ThreadingHTTPServer
fallback for Python 3.15+ environments where binary wheels (e.g., pydantic_core) may not load.
"""

import os
import sys
import json
import sqlite3
import base64
import shutil
import builtins
import mimetypes
import socket
import uuid
from datetime import datetime, date, timedelta
from contextlib import contextmanager
from urllib.parse import urlparse, parse_qs
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

# Python 3.15 compatibility shim for anyio sentinel
try:
    from typing_extensions import sentinel as _sentinel
    if not hasattr(builtins, "sentinel"):
        builtins.sentinel = _sentinel
except Exception:
    pass

# Optional FastAPI import (falls back to stdlib ThreadingHTTPServer if binary dependencies fail)
USE_FASTAPI = False
try:
    from fastapi import FastAPI, HTTPException, Request, Response, Query
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    USE_FASTAPI = True
except Exception as _fastapi_err:
    USE_FASTAPI = False

# ─────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────
PORT = 8090
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "aicoaching.db")
_LEGACY_DB_PATH = os.path.join(DATA_DIR, "auracoach.db")
if os.path.exists(_LEGACY_DB_PATH) and not os.path.exists(DB_PATH):
    try:
        shutil.copy2(_LEGACY_DB_PATH, DB_PATH)
    except Exception:
        DB_PATH = _LEGACY_DB_PATH

# ─────────────────────────────────────────────
# API Key Obfuscation (Base64 XOR)
# ─────────────────────────────────────────────
_XOR_KEY = b"AuraCoach2026"

def _xor(data: bytes, key: bytes) -> bytes:
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))

def encode_api_key(plain: str) -> str:
    if not plain:
        return ""
    return base64.b64encode(_xor(plain.encode(), _XOR_KEY)).decode()

def decode_api_key(enc: str) -> str:
    if not enc:
        return ""
    try:
        return _xor(base64.b64decode(enc), _XOR_KEY).decode()
    except Exception:
        return enc  # eskiden düz metin olabilir

# ─────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            username        TEXT PRIMARY KEY,
            profile_json    TEXT NOT NULL DEFAULT '{}',
            api_key_enc     TEXT DEFAULT '',
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS daily_logs (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            username        TEXT NOT NULL,
            log_date        TEXT NOT NULL,
            nutrition_json  TEXT DEFAULT '{}',
            workout_json    TEXT,
            recovery_json   TEXT DEFAULT '{}',
            routine_json    TEXT DEFAULT '[]',
            meals_json      TEXT DEFAULT '[]',
            weight          REAL,
            notes           TEXT DEFAULT '',
            day_closed      INTEGER DEFAULT 0,
            updated_at      TEXT DEFAULT (datetime('now')),
            UNIQUE(username, log_date)
        );

        CREATE TABLE IF NOT EXISTS chat_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT NOT NULL,
            chat_date   TEXT NOT NULL,
            sender      TEXT NOT NULL,
            message     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_chat_user_date ON chat_history(username, chat_date);

        CREATE TABLE IF NOT EXISTS meal_favorites (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT NOT NULL,
            name        TEXT NOT NULL,
            calories    INTEGER DEFAULT 0,
            protein     INTEGER DEFAULT 0,
            carbs       INTEGER DEFAULT 0,
            fat         INTEGER DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pr_history (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT NOT NULL,
            exercise    TEXT NOT NULL,
            weight_kg   REAL NOT NULL,
            pr_date     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_pr_user ON pr_history(username, exercise);
        """)
    print("[OK] SQLite veritabani hazir:", DB_PATH)

# ─────────────────────────────────────────────
# Migration: JSON → SQLite
# ─────────────────────────────────────────────
def migrate_json_to_sqlite():
    """Eski data/ klasöründeki JSON dosyalarını SQLite'a aktarır."""
    users_dir = os.path.join(DATA_DIR, "users")
    migrated = []

    def migrate_user(username: str, profile_path: str, logs_dir: str):
        if not os.path.exists(profile_path):
            return

        with open(profile_path, "r", encoding="utf-8") as f:
            profile = json.load(f)

        raw_key = profile.pop("apiKey", "") or ""
        enc_key = encode_api_key(raw_key) if raw_key and not raw_key.startswith("AQ.") else raw_key

        with get_db() as conn:
            existing = conn.execute("SELECT username FROM users WHERE username=?", (username,)).fetchone()
            if existing:
                return

            conn.execute(
                "INSERT OR IGNORE INTO users (username, profile_json, api_key_enc) VALUES (?,?,?)",
                (username, json.dumps(profile, ensure_ascii=False), enc_key)
            )

            if os.path.exists(logs_dir):
                for fname in os.listdir(logs_dir):
                    if not fname.endswith(".json"):
                        continue
                    log_date = fname.replace(".json", "")
                    try:
                        with open(os.path.join(logs_dir, fname), "r", encoding="utf-8") as f:
                            log = json.load(f)
                        conn.execute("""
                            INSERT OR IGNORE INTO daily_logs
                            (username, log_date, nutrition_json, workout_json, recovery_json,
                             routine_json, meals_json, weight, notes, day_closed)
                            VALUES (?,?,?,?,?,?,?,?,?,?)
                        """, (
                            username, log_date,
                            json.dumps(log.get("nutrition", {}), ensure_ascii=False),
                            json.dumps(log.get("workout"), ensure_ascii=False) if log.get("workout") else None,
                            json.dumps(log.get("recovery", {}), ensure_ascii=False),
                            json.dumps(log.get("routine", []), ensure_ascii=False),
                            json.dumps(log.get("meals", []), ensure_ascii=False),
                            log.get("weight"),
                            log.get("notes", ""),
                            1 if log.get("dayClosed") else 0
                        ))
                    except Exception as e:
                        print(f"    [WARN] Log {fname} aktarilamadi: {e}")

        migrated.append(username)
        print(f"  [OK] {username} aktarildi.")

    default_profile = os.path.join(DATA_DIR, "profile.json")
    default_logs    = os.path.join(DATA_DIR, "logs")
    if os.path.exists(default_profile):
        migrate_user("default", default_profile, default_logs)

    if os.path.exists(users_dir):
        for uname in os.listdir(users_dir):
            udir = os.path.join(users_dir, uname)
            if os.path.isdir(udir):
                migrate_user(
                    uname,
                    os.path.join(udir, "profile.json"),
                    os.path.join(udir, "logs")
                )

    if migrated:
        print(f"[OK] Migration tamamlandi. Aktarilan kullanicilar: {migrated}")
        backup_dir = os.path.join(DATA_DIR, "json_backup")
        if not os.path.exists(backup_dir):
            os.makedirs(backup_dir, exist_ok=True)
            for item in ["profile.json", "logs", "users"]:
                src = os.path.join(DATA_DIR, item)
                if os.path.exists(src):
                    dst = os.path.join(backup_dir, item)
                    if os.path.isdir(src):
                        shutil.copytree(src, dst, dirs_exist_ok=True)
                    else:
                        shutil.copy2(src, dst)
            print(f"  [BACKUP] JSON yedekler {backup_dir} klasorune kopyalandi.")

# ─────────────────────────────────────────────
# Helpers & Core Business Logic
# ─────────────────────────────────────────────
def safe_username(username: str) -> str:
    if not username:
        return "default"
    return "".join(c for c in str(username) if c.isalnum() or c in "_-") or "default"

def row_to_profile(row) -> dict:
    if not row:
        return {}
    profile = json.loads(row["profile_json"]) if row["profile_json"] else {}
    enc = row["api_key_enc"] or ""
    profile["apiKey"] = decode_api_key(enc)
    return profile

def _empty_log(log_date: str) -> dict:
    return {
        "date": log_date,
        "nutrition": {"calories":0,"protein":0,"carbs":0,"fat":0,"water":0},
        "workout": None,
        "recovery": {"sleep_hours":0,"sleep_quality":3,"stress":3,"energy":3,"doms":[],"wake_feeling":3,"focus_feeling":3},
        "routine": [],
        "meals": [],
        "weight": None,
        "notes": "",
        "dayClosed": False
    }

def row_to_log(row, username: str, log_date: str) -> dict:
    if not row:
        return _empty_log(log_date)
    return {
        "date": row["log_date"],
        "nutrition": json.loads(row["nutrition_json"]) if row["nutrition_json"] else {"calories":0,"protein":0,"carbs":0,"fat":0,"water":0},
        "workout": json.loads(row["workout_json"]) if row["workout_json"] else None,
        "recovery": json.loads(row["recovery_json"]) if row["recovery_json"] else {"sleep_hours":0,"sleep_quality":3,"stress":3,"energy":3,"doms":[],"wake_feeling":3,"focus_feeling":3},
        "routine": json.loads(row["routine_json"]) if row["routine_json"] else [],
        "meals": json.loads(row["meals_json"]) if row["meals_json"] else [],
        "weight": row["weight"],
        "notes": row["notes"] or "",
        "dayClosed": bool(row["day_closed"])
    }

def db_get_profile(user: str):
    username = safe_username(user)
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    if not row:
        return None
    return row_to_profile(row)

def db_save_profile(data: dict, user: str = None):
    data = dict(data)
    username = safe_username(user or data.get("username") or data.get("user") or "default")
    raw_key = data.pop("apiKey", "") or ""
    enc_key = encode_api_key(raw_key)
    with get_db() as conn:
        conn.execute("""
            INSERT INTO users (username, profile_json, api_key_enc, updated_at)
            VALUES (?,?,?,datetime('now'))
            ON CONFLICT(username) DO UPDATE SET
                profile_json = excluded.profile_json,
                api_key_enc  = excluded.api_key_enc,
                updated_at   = excluded.updated_at
        """, (username, json.dumps(data, ensure_ascii=False), enc_key))
    return {"status": "success", "message": "Profile saved"}

def db_get_log(log_date: str, user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM daily_logs WHERE username=? AND log_date=?",
            (username, log_date)
        ).fetchone()
    return row_to_log(row, username, log_date)

def db_save_log(data: dict, user: str = None):
    username = safe_username(user or data.get("username") or data.get("user") or "default")
    log_date = data.get("date", str(date.today()))
    with get_db() as conn:
        conn.execute("""
            INSERT INTO daily_logs
                (username, log_date, nutrition_json, workout_json, recovery_json,
                 routine_json, meals_json, weight, notes, day_closed, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now'))
            ON CONFLICT(username, log_date) DO UPDATE SET
                nutrition_json = excluded.nutrition_json,
                workout_json   = excluded.workout_json,
                recovery_json  = excluded.recovery_json,
                routine_json   = excluded.routine_json,
                meals_json     = excluded.meals_json,
                weight         = excluded.weight,
                notes          = excluded.notes,
                day_closed     = excluded.day_closed,
                updated_at     = excluded.updated_at
        """, (
            username, log_date,
            json.dumps(data.get("nutrition", {}), ensure_ascii=False),
            json.dumps(data.get("workout"), ensure_ascii=False) if data.get("workout") else None,
            json.dumps(data.get("recovery", {}), ensure_ascii=False),
            json.dumps(data.get("routine", []), ensure_ascii=False),
            json.dumps(data.get("meals", []), ensure_ascii=False),
            data.get("weight"),
            data.get("notes", ""),
            1 if data.get("dayClosed") else 0
        ))
    return {"status": "success", "message": f"Log saved for {log_date}"}

def db_list_logs(user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT log_date FROM daily_logs WHERE username=? ORDER BY log_date",
            (username,)
        ).fetchall()
    return [r["log_date"] for r in rows]

def db_list_users():
    with get_db() as conn:
        rows = conn.execute("SELECT username FROM users").fetchall()
    return [r["username"] for r in rows]

def db_social_users():
    with get_db() as conn:
        rows = conn.execute("SELECT username, profile_json FROM users").fetchall()
    result = []
    for row in rows:
        try:
            profile = json.loads(row["profile_json"])
            if profile.get("privacy") == "private":
                continue
            result.append({
                "username": row["username"],
                "name": profile.get("name", row["username"]),
                "gender": profile.get("gender", "male"),
                "weight": profile.get("weight", 70),
                "height": profile.get("height", 170),
                "age": profile.get("age", 23),
                "tone": profile.get("tone", "brom"),
                "privacy": profile.get("privacy", "public"),
                "prs": profile.get("prs", {}),
                "workout": profile.get("workoutTemplate")
            })
        except Exception:
            continue
    return result

def db_get_chat(user: str = "default", chat_date: str = None):
    username = safe_username(user)
    today = chat_date or str(date.today())
    with get_db() as conn:
        rows = conn.execute("""
            SELECT sender, message, created_at FROM chat_history
            WHERE username=? AND chat_date=?
            ORDER BY id ASC LIMIT 100
        """, (username, today)).fetchall()
    return [{"sender": r["sender"], "message": r["message"], "created_at": r["created_at"]} for r in rows]

def db_save_chat(data: dict, user: str = "default"):
    username = safe_username(user)
    sender  = data.get("sender", "user")
    message = data.get("message", "")
    chat_date = data.get("date", str(date.today()))
    with get_db() as conn:
        conn.execute(
            "INSERT INTO chat_history (username, chat_date, sender, message) VALUES (?,?,?,?)",
            (username, chat_date, sender, message)
        )
    return {"status": "success"}

def db_clear_chat(user: str = "default", chat_date: str = None):
    username = safe_username(user)
    today = chat_date or str(date.today())
    with get_db() as conn:
        conn.execute("DELETE FROM chat_history WHERE username=? AND chat_date=?", (username, today))
    return {"status": "success", "message": "Chat cleared"}

def db_get_favorites(user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, calories, protein, carbs, fat FROM meal_favorites WHERE username=? ORDER BY name",
            (username,)
        ).fetchall()
    return [dict(r) for r in rows]

def db_add_favorite(data: dict, user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        conn.execute("""
            INSERT INTO meal_favorites (username, name, calories, protein, carbs, fat)
            VALUES (?,?,?,?,?,?)
        """, (
            username,
            data.get("name", "Öğün"),
            int(data.get("calories", 0)),
            int(data.get("protein", 0)),
            int(data.get("carbs", 0)),
            int(data.get("fat", 0))
        ))
    return {"status": "success", "message": "Favorite added"}

def db_delete_favorite(fav_id: int, user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        conn.execute("DELETE FROM meal_favorites WHERE id=? AND username=?", (fav_id, username))
    return {"status": "success"}

def db_get_pr_history(user: str = "default", exercise: str = None):
    username = safe_username(user)
    with get_db() as conn:
        if exercise:
            rows = conn.execute("""
                SELECT exercise, weight_kg, pr_date FROM pr_history
                WHERE username=? AND exercise=?
                ORDER BY pr_date ASC
            """, (username, exercise)).fetchall()
        else:
            rows = conn.execute("""
                SELECT exercise, weight_kg, pr_date FROM pr_history
                WHERE username=?
                ORDER BY exercise, pr_date ASC
            """, (username,)).fetchall()
    return [dict(r) for r in rows]

def db_save_pr(data: dict, user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        conn.execute("""
            INSERT INTO pr_history (username, exercise, weight_kg, pr_date)
            VALUES (?,?,?,?)
        """, (
            username,
            data.get("exercise", ""),
            float(data.get("weight_kg", 0)),
            data.get("pr_date", str(date.today()))
        ))
    return {"status": "success"}

def db_get_trends(user: str = "default", days: int = 14):
    username = safe_username(user)
    since = str(date.today() - timedelta(days=int(days)))
    with get_db() as conn:
        rows = conn.execute("""
            SELECT log_date, nutrition_json, workout_json, recovery_json, weight
            FROM daily_logs
            WHERE username=? AND log_date >= ?
            ORDER BY log_date ASC
        """, (username, since)).fetchall()

    result = []
    for r in rows:
        nutrition = json.loads(r["nutrition_json"]) if r["nutrition_json"] else {}
        recovery  = json.loads(r["recovery_json"])  if r["recovery_json"]  else {}
        workout   = json.loads(r["workout_json"])   if r["workout_json"]   else None

        volume = 0
        if workout and workout.get("exercises"):
            for ex in workout["exercises"]:
                for s in ex.get("sets", []):
                    volume += s.get("kg", 0) * s.get("reps", 0)

        result.append({
            "date": r["log_date"],
            "calories": nutrition.get("calories", 0),
            "protein":  nutrition.get("protein", 0),
            "water":    nutrition.get("water", 0),
            "sleep_hours":    recovery.get("sleep_hours", 0),
            "energy":         recovery.get("energy", 0),
            "workout_done":   bool(workout and workout.get("completed")),
            "volume":         volume,
            "weight":         r["weight"]
        })
    return result

def db_get_streak(user: str = "default"):
    username = safe_username(user)
    with get_db() as conn:
        rows = conn.execute("""
            SELECT log_date FROM daily_logs
            WHERE username=? AND (nutrition_json != '{}' OR workout_json IS NOT NULL OR weight IS NOT NULL)
            ORDER BY log_date DESC
        """, (username,)).fetchall()

    dates = []
    for r in rows:
        try:
            d = date.fromisoformat(r["log_date"])
            if d not in dates:
                dates.append(d)
        except Exception:
            continue

    if not dates:
        return {"streak": 0, "total_days": 0}

    streak = 0
    today = date.today()
    # Eğer bugün henüz kayıt yoksa ama dün varsa seri devam ediyor kabul et
    start_day = today
    if dates[0] == today - timedelta(days=1):
        start_day = today - timedelta(days=1)

    for i, d in enumerate(dates):
        expected = start_day - timedelta(days=i)
        if d == expected:
            streak += 1
        else:
            break

    return {"streak": streak, "total_days": len(dates)}

def db_copy_yesterday_meals(user: str = "default", target_date: str = None):
    username = safe_username(user)
    today_str = target_date or str(date.today())
    yesterday = str(date.fromisoformat(today_str) - timedelta(days=1))

    with get_db() as conn:
        prev = conn.execute(
            "SELECT meals_json, nutrition_json FROM daily_logs WHERE username=? AND log_date=?",
            (username, yesterday)
        ).fetchone()

    if not prev or not prev["meals_json"]:
        return {"meals": [], "nutrition": {}}

    meals = json.loads(prev["meals_json"])
    nutrition = json.loads(prev["nutrition_json"])
    return {"meals": meals, "nutrition": nutrition, "from_date": yesterday}

def db_save_icon(payload: bytes, size: str = "192"):
    icons_dir = os.path.join(BASE_DIR, "icons")
    os.makedirs(icons_dir, exist_ok=True)
    icon_path = os.path.join(icons_dir, f"icon-{size}.png")

    if b"," in payload:
        payload = payload.split(b",", 1)[1]
    binary_data = base64.b64decode(payload)
    with open(icon_path, "wb") as f:
        f.write(binary_data)
    return {"status": "success", "message": f"icon-{size}.png saved"}


# ─────────────────────────────────────────────
# Multi-Platform App Builders (Win / Mac / Android / iOS)
# ─────────────────────────────────────────────
def get_lan_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def get_icon_base64(size: str = "192") -> str:
    icon_path = os.path.join(BASE_DIR, "icons", f"icon-{size}.png")
    if os.path.exists(icon_path):
        with open(icon_path, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")
    return ""

def build_standalone_html() -> bytes:
    """Tüm CSS, JS ve ikonları tek bir bağımsız (offline çalışabilen) HTML uygulama dosyasında birleştirir."""
    index_path = os.path.join(BASE_DIR, "index.html")
    css_path   = os.path.join(BASE_DIR, "style.css")
    js_path    = os.path.join(BASE_DIR, "app.js")

    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    icon192_b64 = get_icon_base64("192")
    if icon192_b64:
        html = html.replace('href="/icons/icon-192.png"', f'href="data:image/png;base64,{icon192_b64}"')
    html = html.replace('<link rel="manifest" href="manifest.json">', '')
    html = html.replace('<link rel="stylesheet" href="style.css">', f'<style>\n{css}\n</style>')
    html = html.replace('<script src="app.js"></script>', f'<script>\nwindow.AICOACHING_STANDALONE_MODE = true;\n{js}\n</script>')
    return html.encode("utf-8")

def build_windows_launcher(host_url: str) -> bytes:
    bat = f"""@echo off
chcp 65001 >NUL
title AICoaching - Windows Desktop Application
echo ========================================================
echo   AICoaching Desktop App Starting...
echo ========================================================

set APP_URL={host_url}
set LOCAL_SERVER="%~dp0server.py"
set USER_PYTHON="C:\\Users\\emreo\\AppData\\Local\\Programs\\Python\\Python315\\python.exe"

:: Start background server if server.py exists and port 8090 is not listening
netstat -ano | findstr :8090 >NUL 2>&1
if errorlevel 1 (
    if exist %LOCAL_SERVER% (
        if exist %USER_PYTHON% (
            start "" /b %USER_PYTHON% %LOCAL_SERVER% >NUL 2>&1
        ) else (
            start "" /b python %LOCAL_SERVER% >NUL 2>&1
        )
        timeout /t 2 /nobreak >NUL
    )
)

:: Launch in native borderless desktop app mode (Edge or Chrome)
where msedge >NUL 2>&1
if not errorlevel 1 (
    start "" msedge --app=%APP_URL%
    exit /b 0
)

if exist "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" (
    start "" "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --app=%APP_URL%
    exit /b 0
)

if exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    start "" "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --app=%APP_URL%
    exit /b 0
)

start "" %APP_URL%
"""
    return bat.replace("\n", "\r\n").encode("utf-8")

def build_mac_launcher(host_url: str) -> bytes:
    script = f"""#!/bin/bash
# AICoaching - macOS Desktop Application Launcher
APP_URL="{host_url}"
DIR="$( cd "$( dirname "${{BASH_SOURCE[0]}}" )" && pwd )"

if [ -f "$DIR/server.py" ]; then
    if ! lsof -i :8090 >/dev/null 2>&1; then
        python3 "$DIR/server.py" >/dev/null 2>&1 &
        sleep 2
    fi
fi

if [ -d "/Applications/Google Chrome.app" ]; then
    open -n -a "Google Chrome" --args --app="$APP_URL"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    open -n -a "Microsoft Edge" --args --app="$APP_URL"
else
    open "$APP_URL"
fi
"""
    return script.encode("utf-8")

def build_ios_mobileconfig(host_url: str) -> bytes:
    icon_b64 = get_icon_base64("192")
    icon_block = f"""
            <key>Icon</key>
            <data>{icon_b64}</data>""" if icon_b64 else ""

    profile_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>PayloadContent</key>
    <array>
        <dict>
            <key>FullScreen</key>
            <true/>{icon_block}
            <key>IsRemovable</key>
            <true/>
            <key>Label</key>
            <string>AICoaching</string>
            <key>PayloadDescription</key>
            <string>AICoaching Home Screen Web Application</string>
            <key>PayloadDisplayName</key>
            <string>AICoaching</string>
            <key>PayloadIdentifier</key>
            <string>com.emreouzoun.aicoaching.webclip</string>
            <key>PayloadType</key>
            <string>com.apple.webClip.managed</string>
            <key>PayloadUUID</key>
            <string>{uuid.uuid4()}</string>
            <key>PayloadVersion</key>
            <integer>1</integer>
            <key>Precomposed</key>
            <true/>
            <key>URL</key>
            <string>{host_url}</string>
        </dict>
    </array>
    <key>PayloadDescription</key>
    <string>Installs AICoaching as a full-screen application on your iOS Home Screen.</string>
    <key>PayloadDisplayName</key>
    <string>AICoaching (iOS App)</string>
    <key>PayloadIdentifier</key>
    <string>com.emreouzoun.aicoaching.profile</string>
    <key>PayloadOrganization</key>
    <string>AICoaching</string>
    <key>PayloadRemovalDisallowed</key>
    <false/>
    <key>PayloadType</key>
    <string>Configuration</string>
    <key>PayloadUUID</key>
    <string>{uuid.uuid4()}</string>
    <key>PayloadVersion</key>
    <integer>1</integer>
</dict>
</plist>
"""
    return profile_xml.encode("utf-8")


# ─────────────────────────────────────────────
# FastAPI Mode (when available)
# ─────────────────────────────────────────────
if USE_FASTAPI:
    app = FastAPI(title="AICoaching API", version="2.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/profile")
    def get_profile(user: str = Query("default")):
        profile = db_get_profile(user)
        if profile is None:
            raise HTTPException(status_code=404, detail="Profile not found")
        return JSONResponse(profile)

    @app.post("/api/profile")
    async def save_profile(request: Request, user: str = Query(None)):
        data = await request.json()
        return db_save_profile(data, user)

    @app.get("/api/logs")
    def get_log(date: str = Query(...), user: str = Query("default")):
        return JSONResponse(db_get_log(date, user))

    @app.post("/api/logs")
    async def save_log(request: Request, user: str = Query(None)):
        data = await request.json()
        return db_save_log(data, user)

    @app.get("/api/logs/list")
    def list_logs(user: str = Query("default")):
        return db_list_logs(user)

    @app.get("/api/users/list")
    def list_users():
        return db_list_users()

    @app.get("/api/social/users")
    def social_users():
        return db_social_users()

    @app.get("/api/chat")
    def get_chat(user: str = Query("default"), chat_date: str = Query(None)):
        return db_get_chat(user, chat_date)

    @app.post("/api/chat")
    async def save_chat(request: Request, user: str = Query("default")):
        data = await request.json()
        return db_save_chat(data, user)

    @app.delete("/api/chat")
    def clear_chat(user: str = Query("default"), chat_date: str = Query(None)):
        return db_clear_chat(user, chat_date)

    @app.get("/api/favorites")
    def get_favorites(user: str = Query("default")):
        return db_get_favorites(user)

    @app.post("/api/favorites")
    async def add_favorite(request: Request, user: str = Query("default")):
        data = await request.json()
        return db_add_favorite(data, user)

    @app.delete("/api/favorites/{fav_id}")
    def delete_favorite(fav_id: int, user: str = Query("default")):
        return db_delete_favorite(fav_id, user)

    @app.get("/api/pr-history")
    def get_pr_history(user: str = Query("default"), exercise: str = Query(None)):
        return db_get_pr_history(user, exercise)

    @app.post("/api/pr-history")
    async def save_pr(request: Request, user: str = Query("default")):
        data = await request.json()
        return db_save_pr(data, user)

    @app.get("/api/stats/trends")
    def get_trends(user: str = Query("default"), days: int = Query(14)):
        return db_get_trends(user, days)

    @app.get("/api/stats/streak")
    def get_streak(user: str = Query("default")):
        return db_get_streak(user)

    @app.get("/api/logs/copy-yesterday-meals")
    def copy_yesterday_meals(user: str = Query("default"), target_date: str = Query(None)):
        return db_copy_yesterday_meals(user, target_date)

    @app.post("/api/save-icon")
    async def save_icon(request: Request, size: str = Query("192")):
        payload = await request.body()
        try:
            return db_save_icon(payload, size)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/api/network-info")
    def network_info():
        ip = get_lan_ip()
        return {
            "lan_ip": ip,
            "port": PORT,
            "url": f"http://{ip}:{PORT}",
            "download_url": f"http://{ip}:{PORT}/indir"
        }

    @app.get("/api/download/{platform}")
    def download_app(platform: str):
        ip = get_lan_ip()
        host_url = f"http://{ip}:{PORT}"
        if platform == "windows":
            data = build_windows_launcher(f"http://localhost:{PORT}")
            return Response(content=data, media_type="application/octet-stream",
                            headers={"Content-Disposition": 'attachment; filename="AICoaching_Windows_App.bat"'})
        elif platform == "mac":
            data = build_mac_launcher(host_url)
            return Response(content=data, media_type="application/octet-stream",
                            headers={"Content-Disposition": 'attachment; filename="AICoaching_Mac_App.command"'})
        elif platform == "ios":
            data = build_ios_mobileconfig(host_url)
            return Response(content=data, media_type="application/x-apple-aspen-config",
                            headers={"Content-Disposition": 'attachment; filename="AICoaching_iOS.mobileconfig"'})
        else:
            data = build_standalone_html()
            fname = "AICoaching_Android_App.html" if platform == "android" else "AICoaching_Portable_App.html"
            return Response(content=data, media_type="text/html; charset=utf-8",
                            headers={"Content-Disposition": f'attachment; filename="{fname}"'})

    app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")


# ─────────────────────────────────────────────
# Stdlib ThreadingHTTPServer Fallback (Python 3.15+)
# ─────────────────────────────────────────────
class AICoachingHTTPHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Sessiz loglama
        pass

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_download(self, data: bytes, filename: str, content_type: str = "application/octet-stream"):
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def _read_body_bytes(self) -> bytes:
        length = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(length) if length > 0 else b""

    def _read_json(self) -> dict:
        raw = self._read_body_bytes()
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        user = qs.get("user", ["default"])[0]

        if path in ("/indir", "/indir/", "/download"):
            self.path = "/download.html"
            return super().do_GET()

        if not path.startswith("/api/"):
            return super().do_GET()

        try:
            if path == "/api/profile":
                prof = db_get_profile(user)
                if prof is None:
                    return self._send_json({"detail": "Profile not found"}, 404)
                return self._send_json(prof)

            elif path == "/api/logs":
                log_date = qs.get("date", [str(date.today())])[0]
                return self._send_json(db_get_log(log_date, user))

            elif path == "/api/logs/list":
                return self._send_json(db_list_logs(user))

            elif path == "/api/logs/copy-yesterday-meals":
                target_date = qs.get("target_date", [None])[0]
                return self._send_json(db_copy_yesterday_meals(user, target_date))

            elif path == "/api/users/list":
                return self._send_json(db_list_users())

            elif path == "/api/social/users":
                return self._send_json(db_social_users())

            elif path == "/api/chat":
                chat_date = qs.get("chat_date", [None])[0]
                return self._send_json(db_get_chat(user, chat_date))

            elif path == "/api/favorites":
                return self._send_json(db_get_favorites(user))

            elif path == "/api/pr-history":
                exercise = qs.get("exercise", [None])[0]
                return self._send_json(db_get_pr_history(user, exercise))

            elif path == "/api/stats/trends":
                days = int(qs.get("days", [14])[0])
                return self._send_json(db_get_trends(user, days))

            elif path == "/api/stats/streak":
                return self._send_json(db_get_streak(user))

            elif path == "/api/network-info":
                ip = get_lan_ip()
                return self._send_json({
                    "lan_ip": ip,
                    "port": PORT,
                    "url": f"http://{ip}:{PORT}",
                    "download_url": f"http://{ip}:{PORT}/indir"
                })

            elif path.startswith("/api/download/"):
                platform = path.split("/api/download/")[1].split("/")[0].lower()
                ip = get_lan_ip()
                host_url = f"http://{ip}:{PORT}"
                if platform == "windows":
                    return self._send_download(build_windows_launcher(f"http://localhost:{PORT}"), "AICoaching_Windows_App.bat")
                elif platform == "mac":
                    return self._send_download(build_mac_launcher(host_url), "AICoaching_Mac_App.command")
                elif platform == "ios":
                    return self._send_download(build_ios_mobileconfig(host_url), "AICoaching_iOS.mobileconfig", "application/x-apple-aspen-config")
                elif platform == "android":
                    return self._send_download(build_standalone_html(), "AICoaching_Android_App.html", "text/html; charset=utf-8")
                else:
                    return self._send_download(build_standalone_html(), "AICoaching_Portable_App.html", "text/html; charset=utf-8")

            else:
                return self._send_json({"detail": "Not found"}, 404)
        except Exception as e:
            return self._send_json({"detail": str(e)}, 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        user = qs.get("user", [None])[0]

        try:
            if path == "/api/profile":
                data = self._read_json()
                return self._send_json(db_save_profile(data, user))

            elif path == "/api/logs":
                data = self._read_json()
                return self._send_json(db_save_log(data, user))

            elif path == "/api/chat":
                data = self._read_json()
                return self._send_json(db_save_chat(data, user or "default"))

            elif path == "/api/favorites":
                data = self._read_json()
                return self._send_json(db_add_favorite(data, user or "default"))

            elif path == "/api/pr-history":
                data = self._read_json()
                return self._send_json(db_save_pr(data, user or "default"))

            elif path == "/api/save-icon":
                size = qs.get("size", ["192"])[0]
                payload = self._read_body_bytes()
                return self._send_json(db_save_icon(payload, size))

            else:
                return self._send_json({"detail": "Not found"}, 404)
        except Exception as e:
            return self._send_json({"detail": str(e)}, 500)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        user = qs.get("user", ["default"])[0]

        try:
            if path == "/api/chat":
                chat_date = qs.get("chat_date", [None])[0]
                return self._send_json(db_clear_chat(user, chat_date))

            elif path.startswith("/api/favorites/"):
                fav_id = int(path.split("/api/favorites/")[1].split("/")[0])
                return self._send_json(db_delete_favorite(fav_id, user))

            else:
                return self._send_json({"detail": "Not found"}, 404)
        except Exception as e:
            return self._send_json({"detail": str(e)}, 500)


# ─────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 54)
    print("  AICOACHING v2.0 - SQLite Server")
    print(f"  Address : http://localhost:{PORT}")
    print(f"  Database: {DB_PATH}")
    print(f"  Engine  : {'FastAPI + Uvicorn' if USE_FASTAPI else 'ThreadingHTTPServer (SQLite)'}")
    print("=" * 54)

    init_db()
    migrate_json_to_sqlite()

    print(f"\n>> Starting server at: http://localhost:{PORT}\n")
    if USE_FASTAPI:
        uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
    else:
        server = ThreadingHTTPServer(("0.0.0.0", PORT), AICoachingHTTPHandler)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
            server.server_close()

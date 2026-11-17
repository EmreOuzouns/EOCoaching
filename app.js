// EO Coach - Application Logic v2.0 (FastAPI / SQLite + Offline LocalStorage Hybrid Engine)

// ─── Hybrid Offline / Standalone LocalStorage API Fallback ──────────────────
(function initHybridLocalDB() {
    const nativeFetch = window.fetch.bind(window);
    const DB_KEY = "eocoach_offline_db_v2";

    function loadLocalDB() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return { users: {}, logs: {}, chats: {}, favorites: {}, prs: {} };
    }

    function saveLocalDB(db) {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(db));
        } catch (e) { }
    }

    function jsonResponse(obj, status = 200) {
        return new Response(JSON.stringify(obj), {
            status,
            headers: { "Content-Type": "application/json" }
        });
    }

    function emptyLog(logDate) {
        return {
            date: logDate,
            nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
            workout: null,
            recovery: { sleep_hours: 0, sleep_quality: 3, stress: 3, energy: 3, doms: [], wake_feeling: 3, focus_feeling: 3 },
            routine: [],
            meals: [],
            weight: null,
            notes: "",
            dayClosed: false
        };
    }

    async function handleOfflineAPI(urlStr, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const dummyBase = "http://localhost";
        const u = new URL(urlStr, dummyBase);
        const path = u.pathname;
        const user = u.searchParams.get("user") || localStorage.getItem("active_username") || "default";
        const db = loadLocalDB();

        let bodyData = {};
        if (options.body && typeof options.body === "string") {
            try { bodyData = JSON.parse(options.body); } catch (e) { }
        }

        if (path === "/api/profile") {
            if (method === "GET") {
                const prof = db.users[user];
                if (!prof) return jsonResponse({ detail: "Profile not found" }, 404);
                return jsonResponse(prof);
            } else if (method === "POST") {
                db.users[user] = bodyData;
                saveLocalDB(db);
                return jsonResponse({ status: "success", message: "Profile saved (offline)" });
            }
        }

        if (path === "/api/logs") {
            if (method === "GET") {
                const d = u.searchParams.get("date") || getLocalDateString(new Date());
                const userLogs = db.logs[user] || {};
                return jsonResponse(userLogs[d] || emptyLog(d));
            } else if (method === "POST") {
                const d = bodyData.date || getLocalDateString(new Date());
                if (!db.logs[user]) db.logs[user] = {};
                db.logs[user][d] = bodyData;
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path === "/api/logs/list") {
            const userLogs = db.logs[user] || {};
            return jsonResponse(Object.keys(userLogs).sort());
        }

        if (path === "/api/logs/copy-yesterday-meals") {
            const targetDate = u.searchParams.get("target_date") || getLocalDateString(new Date());
            const dt = new Date(targetDate);
            dt.setDate(dt.getDate() - 1);
            const yestStr = getLocalDateString(dt);
            const prev = db.logs[user]?.[yestStr];
            if (!prev || !prev.meals) return jsonResponse({ meals: [], nutrition: {} });
            return jsonResponse({ meals: prev.meals, nutrition: prev.nutrition || {}, from_date: yestStr });
        }

        if (path === "/api/users/list") {
            return jsonResponse(Object.keys(db.users));
        }

        if (path === "/api/social/users") {
            const list = [];
            for (const [uname, prof] of Object.entries(db.users)) {
                if (prof.privacy === "private") continue;
                list.push({
                    username: uname,
                    name: prof.name || uname,
                    gender: prof.gender || "male",
                    weight: prof.weight || 70,
                    height: prof.height || 170,
                    age: prof.age || 23,
                    tone: prof.tone || "brom",
                    privacy: prof.privacy || "public",
                    prs: prof.prs || {},
                    workout: prof.workoutTemplate
                });
            }
            return jsonResponse(list);
        }

        if (path === "/api/chat") {
            const chatDate = u.searchParams.get("chat_date") || bodyData.date || getLocalDateString(new Date());
            const key = `${user}_${chatDate}`;
            if (method === "GET") {
                return jsonResponse(db.chats[key] || []);
            } else if (method === "POST") {
                if (!db.chats[key]) db.chats[key] = [];
                db.chats[key].push({ sender: bodyData.sender, message: bodyData.message, created_at: new Date().toISOString() });
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            } else if (method === "DELETE") {
                db.chats[key] = [];
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path === "/api/favorites") {
            if (!db.favorites[user]) db.favorites[user] = [];
            if (method === "GET") {
                return jsonResponse(db.favorites[user]);
            } else if (method === "POST") {
                db.favorites[user].push({
                    id: Date.now(),
                    name: bodyData.name || "Öğün",
                    calories: parseInt(bodyData.calories) || 0,
                    protein: parseInt(bodyData.protein) || 0,
                    carbs: parseInt(bodyData.carbs) || 0,
                    fat: parseInt(bodyData.fat) || 0
                });
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path.startsWith("/api/favorites/") && method === "DELETE") {
            const favId = parseInt(path.split("/api/favorites/")[1]);
            if (db.favorites[user]) {
                db.favorites[user] = db.favorites[user].filter(f => f.id !== favId);
                saveLocalDB(db);
            }
            return jsonResponse({ status: "success" });
        }

        if (path === "/api/pr-history") {
            if (!db.prs[user]) db.prs[user] = [];
            if (method === "GET") return jsonResponse(db.prs[user]);
            if (method === "POST") {
                db.prs[user].push(bodyData);
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path === "/api/stats/streak") {
            const dates = Object.keys(db.logs[user] || {}).sort().reverse();
            return jsonResponse({ streak: dates.length > 0 ? 1 : 0, total_days: dates.length });
        }

        if (path === "/api/network-info") {
            return jsonResponse({
                lan_ip: "localhost",
                port: 8090,
                url: window.location.origin,
                download_url: window.location.origin + "/indir"
            });
        }

        return jsonResponse({ status: "ok" });
    }

    window.fetch = async function (input, init) {
        const urlStr = typeof input === "string" ? input : (input.url || "");
        const isLocalAPI = urlStr.startsWith("/api/") || urlStr.includes("/api/");

        if (!isLocalAPI) {
            return nativeFetch(input, init);
        }

        // Use local storage DB directly when running as a standalone portable app (file:// or AICOACHING_STANDALONE_MODE)
        if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
            return handleOfflineAPI(urlStr, init);
        }

        try {
            const res = await nativeFetch(input, init);
            // Sunucu yanıtlarını çevrimdışı kullanım için yerel önbelleğe yansıt
            if (res.ok) {
                const clone = res.clone();
                clone.json().then(data => {
                    const u = new URL(urlStr, window.location.origin);
                    const user = u.searchParams.get("user") || localStorage.getItem("active_username") || "default";
                    const db = loadLocalDB();
                    if (u.pathname === "/api/profile" && (!init || !init.method || init.method === "GET")) {
                        db.users[user] = data;
                        saveLocalDB(db);
                    } else if (u.pathname === "/api/logs" && (!init || !init.method || init.method === "GET")) {
                        if (!db.logs[user]) db.logs[user] = {};
                        if (data && data.date) db.logs[user][data.date] = data;
                        saveLocalDB(db);
                    }
                }).catch(() => { });
            }
            return res;
        } catch (err) {
            // Sunucu kapalıysa kesintisiz olarak yerel veritabanına (LocalStorage) geç
            return handleOfflineAPI(urlStr, init);
        }
    };
})();

// ─── Hybrid Offline / Standalone LocalStorage API Fallback ──────────────────
(function initHybridLocalDB() {
    const nativeFetch = window.fetch.bind(window);
    const DB_KEY = "eocoach_offline_db_v2";

    function loadLocalDB() {
        try {
            const raw = localStorage.getItem(DB_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) { }
        return { users: {}, logs: {}, chats: {}, favorites: {}, prs: {} };
    }

    function saveLocalDB(db) {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(db));
        } catch (e) { }
    }

    function jsonResponse(obj, status = 200) {
        return new Response(JSON.stringify(obj), {
            status,
            headers: { "Content-Type": "application/json" }
        });
    }

    function emptyLog(logDate) {
        return {
            date: logDate,
            nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
            workout: null,
            recovery: { sleep_hours: 0, sleep_quality: 3, stress: 3, energy: 3, doms: [], wake_feeling: 3, focus_feeling: 3 },
            routine: [],
            meals: [],
            weight: null,
            notes: "",
            dayClosed: false
        };
    }

    async function handleOfflineAPI(urlStr, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const dummyBase = "http://localhost";
        const u = new URL(urlStr, dummyBase);
        const path = u.pathname;
        const user = u.searchParams.get("user") || localStorage.getItem("active_username") || "default";
        const db = loadLocalDB();

        let bodyData = {};
        if (options.body && typeof options.body === "string") {
            try { bodyData = JSON.parse(options.body); } catch (e) { }
        }

        if (path === "/api/profile") {
            if (method === "GET") {
                const prof = db.users[user];
                if (!prof) return jsonResponse({ detail: "Profile not found" }, 404);
                return jsonResponse(prof);
            } else if (method === "POST") {
                db.users[user] = bodyData;
                saveLocalDB(db);
                return jsonResponse({ status: "success", message: "Profile saved (offline)" });
            }
        }

        if (path === "/api/logs") {
            if (method === "GET") {
                const d = u.searchParams.get("date") || getLocalDateString(new Date());
                const userLogs = db.logs[user] || {};
                return jsonResponse(userLogs[d] || emptyLog(d));
            } else if (method === "POST") {
                const d = bodyData.date || getLocalDateString(new Date());
                if (!db.logs[user]) db.logs[user] = {};
                db.logs[user][d] = bodyData;
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path === "/api/logs/list") {
            const userLogs = db.logs[user] || {};
            return jsonResponse(Object.keys(userLogs).sort());
        }

        if (path === "/api/logs/copy-yesterday-meals") {
            const targetDate = u.searchParams.get("target_date") || getLocalDateString(new Date());
            const dt = new Date(targetDate);
            dt.setDate(dt.getDate() - 1);
            const yestStr = getLocalDateString(dt);
            const prev = db.logs[user]?.[yestStr];
            if (!prev || !prev.meals) return jsonResponse({ meals: [], nutrition: {} });
            return jsonResponse({ meals: prev.meals, nutrition: prev.nutrition || {}, from_date: yestStr });
        }

        if (path === "/api/users/list") {
            return jsonResponse(Object.keys(db.users));
        }

        if (path === "/api/social/users") {
            const list = [];
            for (const [uname, prof] of Object.entries(db.users)) {
                if (prof.privacy === "private") continue;
                list.push({
                    username: uname,
                    name: prof.name || uname,
                    gender: prof.gender || "male",
                    weight: prof.weight || 70,
                    height: prof.height || 170,
                    age: prof.age || 23,
                    tone: prof.tone || "brom",
                    privacy: prof.privacy || "public",
                    prs: prof.prs || {},
                    workout: prof.workoutTemplate
                });
            }
            return jsonResponse(list);
        }

        if (path === "/api/chat") {
            const chatDate = u.searchParams.get("chat_date") || bodyData.date || getLocalDateString(new Date());
            const key = `${user}_${chatDate}`;
            if (method === "GET") {
                return jsonResponse(db.chats[key] || []);
            } else if (method === "POST") {
                if (!db.chats[key]) db.chats[key] = [];
                db.chats[key].push({ sender: bodyData.sender, message: bodyData.message, created_at: new Date().toISOString() });
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            } else if (method === "DELETE") {
                db.chats[key] = [];
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path === "/api/favorites") {
            if (!db.favorites[user]) db.favorites[user] = [];
            if (method === "GET") {
                return jsonResponse(db.favorites[user]);
            } else if (method === "POST") {
                db.favorites[user].push({
                    id: Date.now(),
                    name: bodyData.name || "Öğün",
                    calories: parseInt(bodyData.calories) || 0,
                    protein: parseInt(bodyData.protein) || 0,
                    carbs: parseInt(bodyData.carbs) || 0,
                    fat: parseInt(bodyData.fat) || 0
                });
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path.startsWith("/api/favorites/") && method === "DELETE") {
            const favId = parseInt(path.split("/api/favorites/")[1]);
            if (db.favorites[user]) {
                db.favorites[user] = db.favorites[user].filter(f => f.id !== favId);
                saveLocalDB(db);
            }
            return jsonResponse({ status: "success" });
        }

        if (path === "/api/pr-history") {
            if (!db.prs[user]) db.prs[user] = [];
            if (method === "GET") return jsonResponse(db.prs[user]);
            if (method === "POST") {
                db.prs[user].push(bodyData);
                saveLocalDB(db);
                return jsonResponse({ status: "success" });
            }
        }

        if (path === "/api/stats/streak") {
            const dates = Object.keys(db.logs[user] || {}).sort().reverse();
            return jsonResponse({ streak: dates.length > 0 ? 1 : 0, total_days: dates.length });
        }

        if (path === "/api/network-info") {
            return jsonResponse({
                lan_ip: "localhost",
                port: 8090,
                url: window.location.origin,
                download_url: window.location.origin + "/indir"
            });
        }

        return jsonResponse({ status: "ok" });
    }

    window.fetch = async function (input, init) {
        const urlStr = typeof input === "string" ? input : (input.url || "");
        const isLocalAPI = urlStr.startsWith("/api/") || urlStr.includes("/api/");

        if (!isLocalAPI) {
            return nativeFetch(input, init);
        }

        // Use local storage DB directly when running as a standalone portable app (file:// or AICOACHING_STANDALONE_MODE)
        if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
            return handleOfflineAPI(urlStr, init);
        }

        try {
            const res = await nativeFetch(input, init);
            // Sunucu yanıtlarını çevrimdışı kullanım için yerel önbelleğe yansıt
            if (res.ok) {
                const clone = res.clone();
                clone.json().then(data => {
                    const u = new URL(urlStr, window.location.origin);
                    const user = u.searchParams.get("user") || localStorage.getItem("active_username") || "default";
                    const db = loadLocalDB();
                    if (u.pathname === "/api/profile" && (!init || !init.method || init.method === "GET")) {
                        db.users[user] = data;
                        saveLocalDB(db);
                    } else if (u.pathname === "/api/logs" && (!init || !init.method || init.method === "GET")) {
                        if (!db.logs[user]) db.logs[user] = {};
                        if (data && data.date) db.logs[user][data.date] = data;
                        saveLocalDB(db);
                    }
                }).catch(() => { });
            }
            return res;
        } catch (err) {
            // Sunucu kapalıysa kesintisiz olarak yerel veritabanına (LocalStorage) geç
            return handleOfflineAPI(urlStr, init);
        }
    };
})();

// Application State
let state = {
    currentDate: getLocalDateString(new Date()),
    profile: null,
    dailyLog: null,
    weightHistory: [],
    streak: 0
};

let weightChartInstance = null;
let trendChartInstance = null;

// ─── Egzersiz Autocomplete Listesi ───────────────────────────────────────────
const EXERCISE_LIST = [
    // Göğüs
    "Bench Press", "Incline Bench Press", "Decline Bench Press",
    "Flat Dumbbell Press", "Incline Dumbbell Press", "Cable Flye",
    "Dumbbell Flye", "Push-Up", "Şınav", "Dips",
    // Sırt
    "Deadlift", "Barbell Row", "Dumbbell One-Arm Row", "Lat Pulldown",
    "Pull-Up", "Barfiks", "Seated Row", "T-Bar Row", "Face Pull",
    "Hyperextension",
    // Bacak
    "Squat", "Front Squat", "Leg Press", "Romanian Deadlift",
    "Leg Curl", "Leg Extension", "Bulgarian Split Squat",
    "Hip Thrust", "Calf Raise", "Hack Squat",
    // Omuz
    "Overhead Press", "Dumbbell Shoulder Press", "Arnold Press",
    "Lateral Raise", "Front Raise", "Reverse Flye", "Upright Row",
    // Kol
    "Biceps Curl", "Hammer Curl", "Preacher Curl", "Cable Curl",
    "Triceps Pushdown", "Skull Crusher", "Close Grip Bench Press",
    "Overhead Triceps Extension", "Dips (Triceps)",
    // Karın
    "Crunch", "Plank", "Leg Raise", "Russian Twist", "Ab Wheel",
    // Kardio
    "Treadmill Run", "Yürüyüş", "Bisiklet", "Rowing Machine",
    "Jump Rope", "HIIT Interval", "Koşu"
];

// DOM Elements
const onboardingOverlay = document.getElementById("onboarding-overlay");
const onboardingForm = document.getElementById("onboarding-form");
const navLinks = document.querySelectorAll(".nav-link");
const tabContents = document.querySelectorAll(".tab-content");
const currentDateDisplay = document.getElementById("current-date-display");
const prevDateBtn = document.getElementById("prev-date");
const nextDateBtn = document.getElementById("next-date");

// Header Stats
const headerWeight = document.getElementById("header-weight");
const headerTargetWeight = document.getElementById("header-target-weight");
const headerMealsCount = document.getElementById("header-meals-count");
const headerCalories = document.getElementById("header-calories");
const sidebarName = document.getElementById("user-display-name");
const sidebarStatus = document.getElementById("user-display-status");

// App Launch
document.addEventListener("DOMContentLoaded", async () => {
    initTabNavigation();
    initDateControls();
    initDomsSelector();
    await initLoginSession();
    initNutritionForm();
    initWaterControls();
    initRecoveryForm();
    initChatControls();
    initSettingsForm();
    initWeightModal();
    initExerciseModal();
    initRoutineControls();
    initWorkoutCritique();
    initWorkoutSession();
    initExerciseAutocomplete();
    initMealFavorites();

    // PWA & Onboarding Init
    registerServiceWorker();
    initPWAInstall();
    checkAndGeneratePWAIcons();
    initOnboardingQuiz();
});

// Helper: Get local date string YYYY-MM-DD
function getLocalDateString(date) {
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
}

// Helper: Append active username to API calls
function apiURL(endpoint) {
    const user = state.username || localStorage.getItem("active_username") || "default";
    const separator = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${separator}user=${encodeURIComponent(user)}`;
}

// Helper: Format date for display
function formatDateDisplay(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("tr-TR", {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Helper: Parse JSON safely from Gemini (removes markdown backticks)
function parseGeminiJSON(text) {
    let clean = text.trim();
    if (clean.startsWith("```")) {
        clean = clean.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    }
    // Ekranda kaybolan bazı gizli karakterleri temizle
    clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, "");
    return JSON.parse(clean);
}

// 1. Profile & Onboarding Management
async function checkProfile() {
    try {
        const response = await fetch(apiURL("/api/profile"));
        if (response.ok) {
            state.profile = await response.json();
            onboardingOverlay.classList.add("hidden");
            updateUserInfoUI();
            await loadDailyData();
            await loadWeightHistory();
            await loadAndDisplayStreak(); // v2.0: streak yükle
            await renderMealFavorites();
            await loadChatHistory();
        } else {
            onboardingOverlay.classList.remove("hidden");
            document.getElementById("ob-city").value = "Istanbul";
            document.getElementById("ob-sleep-time").value = "23:00";
            document.getElementById("ob-privacy").value = "public";
        }
    } catch (e) {
        console.error("Profil yüklenemedi:", e);
        onboardingOverlay.classList.remove("hidden");
    }
}

// Calculate Targets
function calculateNutritionTargets(p) {
    let bmr = 0;
    if (p.gender === "female") {
        bmr = (10 * p.weight) + (6.25 * p.height) - (5 * p.age) - 161;
    } else {
        bmr = (10 * p.weight) + (6.25 * p.height) - (5 * p.age) + 5;
    }

    let multiplier = 1.2;
    if (p.activity === "light") multiplier = 1.375;
    else if (p.activity === "moderate") multiplier = 1.55;
    else if (p.activity === "active") multiplier = 1.725;

    const tdee = Math.round(bmr * multiplier);

    let targetKcal = tdee;
    const diff = p.targetWeight - p.weight;
    const pace = parseFloat(p.goalPace || 0.5);

    if (diff < -0.5) {
        targetKcal = Math.round(tdee - (pace * 1000));
    } else if (diff > 0.5) {
        targetKcal = Math.round(tdee + (pace * 1000));
    }

    if (targetKcal < 1200) targetKcal = 1200;

    const proteinG = Math.round(p.weight * 2.0);
    const fatG = Math.round(p.weight * 0.9);
    const proteinKcal = proteinG * 4;
    const fatKcal = fatG * 9;
    const remainingKcal = targetKcal - (proteinKcal + fatKcal);
    const carbsG = Math.max(0, Math.round(remainingKcal / 4));

    // Dynamic meals target based on calorie magnitude and activity
    let mealsCount = 3;
    if (targetKcal > 2800 || p.activity === "active") {
        mealsCount = 4;
    } else if (targetKcal > 3500) {
        mealsCount = 5;
    }

    return {
        calories: targetKcal,
        protein: proteinG,
        carbs: carbsG,
        fat: fatG,
        water: 3.0,
        mealsCount: mealsCount
    };
}

// Onboarding Quiz Management
function initOnboardingQuiz() {
    const quizSteps = document.querySelectorAll(".quiz-step");
    const nextBtn = document.getElementById("btn-quiz-next");
    const prevBtn = document.getElementById("btn-quiz-prev");
    const submitBtn = document.getElementById("btn-quiz-submit");
    const fill = document.getElementById("quiz-progress-fill");
    const stepText = document.getElementById("quiz-step-text");
    const stepDesc = document.getElementById("quiz-step-desc");

    let currentStep = 1;
    const totalSteps = 7;

    const stepDescs = {
        1: "Profil Bilgileri",
        2: "Hedef Tanımı",
        3: "Spor Seviyesi & Sıklığı",
        4: "Antrenman Mekanı & Süresi",
        5: "Beslenme Alışkanlığı",
        6: "AI Koç Tarzı",
        7: "Kendi Gemini API Anahtarınız"
    };

    // Step 7 API key visibility & test controls
    const obKeyInput = document.getElementById("ob-api-key");
    const toggleObKeyBtn = document.getElementById("btn-toggle-ob-key");
    const testObKeyBtn = document.getElementById("btn-test-ob-key");
    const obKeyStatus = document.getElementById("ob-api-key-status");

    if (toggleObKeyBtn && obKeyInput) {
        toggleObKeyBtn.addEventListener("click", () => {
            const type = obKeyInput.type === "password" ? "text" : "password";
            obKeyInput.type = type;
            toggleObKeyBtn.innerHTML = type === "password" ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
        });
    }

    if (testObKeyBtn && obKeyInput && obKeyStatus) {
        testObKeyBtn.addEventListener("click", async () => {
            const key = obKeyInput.value.trim();
            if (!key) {
                obKeyStatus.style.color = "var(--neon-orange)";
                obKeyStatus.textContent = "Lütfen test etmek için bir Gemini API anahtarı girin.";
                return;
            }
            testObKeyBtn.disabled = true;
            obKeyStatus.style.color = "var(--text-secondary)";
            obKeyStatus.textContent = "API anahtarı kontrol ediliyor...";
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(key)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: "Merhaba" }] }] })
                });
                if (res.ok) {
                    obKeyStatus.style.color = "var(--neon-green)";
                    obKeyStatus.textContent = "✅ API anahtarı doğrulandı! Yapay zeka özellikleri aktif.";
                } else {
                    obKeyStatus.style.color = "var(--neon-red)";
                    obKeyStatus.textContent = "❌ API anahtarı geçersiz veya yetkisiz görünüyor.";
                }
            } catch (err) {
                obKeyStatus.style.color = "var(--neon-red)";
                obKeyStatus.textContent = "❌ Bağlantı hatası: " + err.message;
            } finally {
                testObKeyBtn.disabled = false;
            }
        });
    }

    // Option Cards click handlers
    document.querySelectorAll(".option-card").forEach(card => {
        card.addEventListener("click", () => {
            const inputId = card.getAttribute("data-input");
            const val = card.getAttribute("data-value");

            // Set hidden input value
            document.getElementById(inputId).value = val;

            // Toggle active class on option cards in same step with same data-input
            const parentStep = card.closest(".quiz-step");
            parentStep.querySelectorAll(`.option-card[data-input="${inputId}"]`).forEach(c => {
                c.classList.remove("active");
            });
            card.classList.add("active");
        });
    });

    function updateStep() {
        quizSteps.forEach(step => {
            if (parseInt(step.getAttribute("data-step")) === currentStep) {
                step.classList.remove("hidden");
            } else {
                step.classList.add("hidden");
            }
        });

        // Update progress bar
        const pct = (currentStep / totalSteps) * 100;
        fill.style.width = `${pct}%`;
        stepText.textContent = `Aşama ${currentStep} / ${totalSteps}`;
        stepDesc.textContent = stepDescs[currentStep];

        // Button visibility
        if (currentStep === 1) {
            prevBtn.style.visibility = "hidden";
        } else {
            prevBtn.style.visibility = "visible";
        }

        if (currentStep === totalSteps) {
            nextBtn.classList.add("hidden");
            submitBtn.classList.remove("hidden");
        } else {
            nextBtn.classList.remove("hidden");
            submitBtn.classList.add("hidden");
        }

        const quizCard = document.querySelector("#onboarding-overlay .onboarding-card");
        if (quizCard) quizCard.scrollTop = 0;
    }

    nextBtn.addEventListener("click", () => {
        // Validation check for Step 1
        if (currentStep === 1) {
            const name = document.getElementById("ob-name").value.trim();
            const age = document.getElementById("ob-age").value;
            const height = document.getElementById("ob-height").value;
            const weight = document.getElementById("ob-weight").value;
            const targetWeight = document.getElementById("ob-target-weight").value;
            const city = document.getElementById("ob-city").value.trim();
            const sleepTime = document.getElementById("ob-sleep-time").value;

            if (!name || !age || !height || !weight || !targetWeight || !city || !sleepTime) {
                alert("Lütfen tüm profil bilgilerini doldurun.");
                return;
            }
        }

        if (currentStep < totalSteps) {
            currentStep++;
            updateStep();
        }
    });

    prevBtn.addEventListener("click", () => {
        if (currentStep > 1) {
            currentStep--;
            updateStep();
        }
    });
}

// Fallback Template Generator (when API key is missing)
function getFallbackWorkoutAndRoutine(goal, level, location, timeLimit, sleepTime, workoutDays) {
    let workoutName = "EO Başlangıç Programı";
    let exercises = [];

    if (location === "gym") {
        if (goal === "hypertrophy" || goal === "health") {
            workoutName = "Kas Geliştirme (Hipertrofi) Şablonu";
            exercises = [
                { name: "Incline Bench Press", sets: [{ kg: 40, reps: 10, rir: 2 }, { kg: 40, reps: 10, rir: 1 }, { kg: 45, reps: 8, rir: 0 }] },
                { name: "Lat Pulldown (Sırt)", sets: [{ kg: 35, reps: 10, rir: 2 }, { kg: 40, reps: 10, rir: 1 }] },
                { name: "Lateral Raise (Omuz)", sets: [{ kg: 7.5, reps: 12, rir: 2 }, { kg: 7.5, reps: 12, rir: 0 }] },
                { name: "Biceps Curl", sets: [{ kg: 10, reps: 12, rir: 2 }, { kg: 10, reps: 10, rir: 1 }] }
            ];
        } else if (goal === "strength") {
            workoutName = "Güç Geliştirme Şablonu";
            exercises = [
                { name: "Squat", sets: [{ kg: 60, reps: 5, rir: 2 }, { kg: 60, reps: 5, rir: 2 }, { kg: 65, reps: 5, rir: 1 }] },
                { name: "Bench Press", sets: [{ kg: 45, reps: 5, rir: 2 }, { kg: 45, reps: 5, rir: 2 }, { kg: 50, reps: 5, rir: 1 }] },
                { name: "Deadlift", sets: [{ kg: 80, reps: 5, rir: 2 }, { kg: 90, reps: 3, rir: 1 }] }
            ];
        } else { // fat_loss
            workoutName = "Yağ Yakımı / Kondisyon Şablonu";
            exercises = [
                { name: "Leg Press", sets: [{ kg: 60, reps: 12, rir: 2 }, { kg: 70, reps: 12, rir: 1 }] },
                { name: "Dumbbell Shoulder Press", sets: [{ kg: 10, reps: 12, rir: 2 }, { kg: 12, reps: 10, rir: 1 }] },
                { name: "Seated Row", sets: [{ kg: 30, reps: 12, rir: 2 }, { kg: 35, reps: 12, rir: 1 }] },
                { name: "Treadmill Run (Interval)", sets: [{ kg: 0, reps: 15, rir: 1 }] }
            ];
        }
    } else if (location === "home_dumbbell") {
        workoutName = "Evde Dambıl Programı";
        exercises = [
            { name: "Dumbbell Goblet Squat", sets: [{ kg: 15, reps: 12, rir: 2 }, { kg: 15, reps: 12, rir: 1 }, { kg: 20, reps: 10, rir: 0 }] },
            { name: "Dumbbell Floor Press", sets: [{ kg: 12.5, reps: 12, rir: 2 }, { kg: 15, reps: 10, rir: 1 }] },
            { name: "Dumbbell One-Arm Row", sets: [{ kg: 12.5, reps: 12, rir: 2 }, { kg: 12.5, reps: 12, rir: 1 }] },
            { name: "Dumbbell Lateral Raise", sets: [{ kg: 5, reps: 15, rir: 2 }, { kg: 5, reps: 12, rir: 0 }] }
        ];
    } else { // calisthenics
        workoutName = "Vücut Ağırlığı (Calisthenics) Programı";
        exercises = [
            { name: "Şınav (Push-Ups)", sets: [{ kg: 0, reps: 15, rir: 2 }, { kg: 0, reps: 15, rir: 1 }, { kg: 0, reps: 12, rir: 0 }] },
            { name: "Barfiks (Pull-Ups)", sets: [{ kg: 0, reps: 8, rir: 2 }, { kg: 0, reps: 6, rir: 1 }] },
            { name: "Dips", sets: [{ kg: 0, reps: 10, rir: 2 }, { kg: 0, reps: 10, rir: 1 }] },
            { name: "Vücut Ağırlığı Squat", sets: [{ kg: 0, reps: 20, rir: 2 }, { kg: 0, reps: 20, rir: 1 }] }
        ];
    }

    let [sleepH, sleepM] = sleepTime.split(":").map(Number);
    let wakeH = (sleepH - 7 + 24) % 24;
    let wakeTimeStr = `${String(wakeH).padStart(2, '0')}:${String(sleepM).padStart(2, '0')}`;

    let routine = [
        { time: wakeTimeStr, title: "Uyanış, Hidrasyon & Esnetme", completed: false }
    ];

    let breakfastH = (wakeH + 1) % 24;
    routine.push({ time: `${String(breakfastH).padStart(2, '0')}:00`, title: "Sağlıklı Kahvaltı (Protein & Karbonhidrat)", completed: false });

    let workH1 = (breakfastH + 1) % 24;
    routine.push({ time: `${String(workH1).padStart(2, '0')}:00`, title: "Odaklanmış Çalışma / Eğitim Bloğu 1", completed: false });

    let lunchH = (workH1 + 4) % 24;
    routine.push({ time: `${String(lunchH).padStart(2, '0')}:00`, title: "Öğle Yemeği & Sosyal Dinlenme", completed: false });

    let workH2 = (lunchH + 1) % 24;
    routine.push({ time: `${String(workH2).padStart(2, '0')}:00`, title: "Çalışma / Okuma / Proje Bloğu 2", completed: false });

    let preWorkoutH = (workH2 + 4) % 24;
    routine.push({ time: `${String(preWorkoutH).padStart(2, '0')}:00`, title: "Antrenman Öncesi Ara Öğün", completed: false });

    let workoutH = (preWorkoutH + 1) % 24;
    let durText = timeLimit === "short" ? "30-45 dk" : timeLimit === "normal" ? "60-90 dk" : "90+ dk";
    routine.push({ time: `${String(workoutH).padStart(2, '0')}:00`, title: `Antrenman Seansı (${workoutName} - ${durText})`, completed: false });

    let dinnerH = (workoutH + 2) % 24;
    routine.push({ time: `${String(dinnerH).padStart(2, '0')}:00`, title: "Akşam Yemeği (Yüksek Protein)", completed: false });

    let prepSleepH = (sleepH - 1 + 24) % 24;
    routine.push({ time: `${String(prepSleepH).padStart(2, '0')}:30`, title: "Ekran Kapatma & Uyku Öncesi Rahatlama", completed: false });
    routine.push({ time: sleepTime, title: "Uyku ve Toparlanma", completed: false });

    return {
        workout: {
            name: workoutName,
            completed: false,
            exercises: exercises
        },
        routine: routine.sort((a, b) => a.time.localeCompare(b.time))
    };
}

// AI-based Onboarding Generator (via Gemini API)
async function generateAIWorkoutAndRoutine(apiKey, profile, goal, level, location, diet, timeLimit) {
    const goalText = goal === "hypertrophy" ? "Kas kütlesi kazanmak (Hacim)" : goal === "fat_loss" ? "Yağ yakmak ve Kilo vermek" : goal === "strength" ? "Güçlenmek" : "Kondisyon ve Sağlık";
    const levelText = level === "beginner" ? "Başlangıç" : level === "intermediate" ? "Orta" : "İleri";
    const locationText = location === "gym" ? "Spor Salonu (Tam ekipman)" : location === "home_dumbbell" ? "Ev (Sadece dambıl)" : "Calisthenics (Vücut ağırlığı)";
    const dietText = diet === "anything" ? "Serbest beslenme" : diet === "high_protein" ? "Yüksek protein ağırlıklı" : diet === "vegan_veg" ? "Vejetaryen/Vegan" : "Ev yemekleri ağırlıklı";
    const timeLimitText = timeLimit === "short" ? "30-45 dakika" : timeLimit === "normal" ? "60-90 dakika" : "Serbest / 90+ dakika";

    const prompt = `
Yeni bir fitness kullanıcısı için tamamen özelleştirilmiş bir başlangıç antrenman programı ve günlük zaman çizelgesi (rutin) oluştur.
Kullanıcı Profili:
- İsim: ${profile.name}
- Yaş: ${profile.age}, Boy: ${profile.height} cm, Kilo: ${profile.weight} kg, Cinsiyet: ${profile.gender === 'male' ? 'Erkek' : 'Kadın'}
- Ana Hedef: ${goalText}
- Spor Seviyesi: ${levelText}
- Antrenman Mekanı: ${locationText}
- Beslenme Tercihi: ${dietText}
- Günlük Egzersiz Süre Sınırı: ${timeLimitText}
- Hedef Uyku Saati: ${profile.sleepTime}
- Haftalık Antrenman Sıklığı: Haftada ${profile.workoutDays} gün

Aşağıdaki JSON şablonuna tamamen uygun bir JSON nesnesi döndür:
{
  "workout": {
    "name": "Egzersiz Programı Adı (örn: Evde Dambıl İtme/Çekme)",
    "exercises": [
      {
        "name": "Egzersiz Adı (Squat, Push-up, Bench Press vb.)",
        "sets": [
          {"kg": 20, "reps": 10, "rir": 2},
          {"kg": 20, "reps": 10, "rir": 2}
        ]
      }
    ]
  },
  "routine": [
    { "time": "08:00", "title": "Uyanış ve Kahve", "completed": false },
    { "time": "09:00", "title": "Yazılım Çalışması", "completed": false },
    { "time": "23:00", "title": "Uyku ve Toparlanma", "completed": false }
  ]
}

Kurallar:
1. Yalnızca geçerli bir JSON döndür. Başka açıklama, kod bloğu veya yazı ekleme.
2. Rutin listesi kronolojik sıraya göre dizilmiş olmalı ve kullanıcının uyku saatine uygun olarak günü kapatmalıdır.
3. Ağırlıkları (kg) kullanıcının kilosunu, cinsiyetini ve seviyesini hesaba katarak gerçekçi ve güvenli değerler olarak belirle (Vücut ağırlığı egzersizleri için kg: 0 girin).
4. Çıktı geçerli bir JSON nesnesi olmalı, markdown kod blokları arasına alabilirsin.
`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            const data = parseGeminiJSON(text);
            if (data.workout && data.routine) {
                data.routine = data.routine.sort((a, b) => a.time.localeCompare(b.time));
                return data;
            }
        }
    } catch (e) {
        console.error("Gemini program generator error, falling back to templates:", e);
    }
    return null;
}

onboardingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("ob-name").value;
    const gender = document.getElementById("ob-gender").value;
    const tone = document.getElementById("ob-tone").value;
    const age = parseInt(document.getElementById("ob-age").value);
    const height = parseInt(document.getElementById("ob-height").value);
    const weight = parseFloat(document.getElementById("ob-weight").value);
    const targetWeight = parseFloat(document.getElementById("ob-target-weight").value);
    const activity = document.getElementById("ob-activity").value;
    const goalPace = document.getElementById("ob-goal-pace").value;
    const workoutDays = parseInt(document.getElementById("ob-workout-days").value);

    const city = document.getElementById("ob-city").value || "Istanbul";
    const sleepTime = document.getElementById("ob-sleep-time").value || "23:00";
    const privacy = document.getElementById("ob-privacy").value || "public";

    // New Quiz inputs
    const fitnessGoal = document.getElementById("ob-fitness-goal").value;
    const fitnessLevel = document.getElementById("ob-fitness-level").value;
    const workoutLocation = document.getElementById("ob-workout-location").value;
    const dietPref = document.getElementById("ob-diet-pref").value;
    const dailyTimeLimit = document.getElementById("ob-daily-time-limit").value;
    const apiKey = document.getElementById("ob-api-key").value.trim();

    const newProfile = {
        name, gender, tone, age, height, weight, targetWeight, activity, goalPace, workoutDays,
        city, sleepTime, privacy,
        apiKey: apiKey,
        fitnessGoal, fitnessLevel, workoutLocation, dietPref, dailyTimeLimit,
        prs: { squat: 0, bench_press: 0, deadlift: 0 }
    };

    const targets = calculateNutritionTargets(newProfile);
    newProfile.targets = targets;

    // Show loading indicator
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.style.zIndex = "9999";
    overlay.innerHTML = `<div class="glass-card text-center" style="max-width:300px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2.5rem;color:var(--neon-orange);"></i><p class="mt-15" style="font-weight:700;">AI Koçunuz Programınızı Yazıyor...</p><p class="subtitle" style="font-size:0.75rem;margin-top:5px;">Lütfen bekleyin...</p></div>`;
    document.body.appendChild(overlay);

    let setupData = null;
    if (apiKey) {
        setupData = await generateAIWorkoutAndRoutine(apiKey, newProfile, fitnessGoal, fitnessLevel, workoutLocation, dietPref, dailyTimeLimit);
    }

    if (!setupData) {
        // Fallback to local templates
        setupData = getFallbackWorkoutAndRoutine(fitnessGoal, fitnessLevel, workoutLocation, dailyTimeLimit, sleepTime, workoutDays);
    }

    // Assign templates
    newProfile.workoutTemplate = setupData.workout;
    newProfile.routineTemplate = setupData.routine;

    try {
        const response = await fetch(apiURL("/api/profile"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newProfile)
        });

        if (response.ok) {
            state.profile = newProfile;

            // Set today's daily log with the setup data
            const todayStr = getLocalDateString(new Date());
            const todayLog = {
                date: todayStr,
                nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
                workout: setupData.workout,
                recovery: { sleep_hours: 8, sleep_quality: 4, stress: 3, energy: 3, doms: [], wake_feeling: 3, focus_feeling: 3 },
                routine: setupData.routine,
                weight: weight,
                notes: ""
            };

            await fetch(apiURL("/api/logs"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(todayLog)
            });

            overlay.remove();
            onboardingOverlay.classList.add("hidden");
            updateUserInfoUI();
            await checkProfile();
        } else {
            overlay.remove();
            alert("Profil kaydedilemedi. Sunucu hatası.");
        }
    } catch (err) {
        overlay.remove();
        alert("Profil kaydedilemedi: " + err);
    }
});

function updateUserInfoUI() {
    if (!state.profile) return;
    sidebarName.textContent = state.profile.name;

    const diff = state.profile.targetWeight - state.profile.weight;
    let goalText = "Kilo Koruma";
    if (diff < -0.5) goalText = "Definisyon (Kilo Verme)";
    else if (diff > 0.5) goalText = "Bulking (Kilo Alma)";

    sidebarStatus.textContent = goalText;

    headerWeight.textContent = `${state.profile.weight.toFixed(1)} kg`;
    headerTargetWeight.textContent = `${state.profile.targetWeight.toFixed(1)} kg`;
    headerCalories.textContent = `${state.profile.targets.calories} kcal`;
    headerMealsCount.textContent = `${state.profile.targets.mealsCount || 3} Öğün`;

    // Gamification Init & Update
    if (state.profile.level === undefined) state.profile.level = 1;
    if (state.profile.xp === undefined) state.profile.xp = 0;
    const headerLevel = document.getElementById("header-level");
    if (headerLevel) {
        headerLevel.textContent = `Lv ${state.profile.level} (${state.profile.xp} XP)`;
    }

    // Fill settings
    document.getElementById("set-name").value = state.profile.name;
    document.getElementById("set-gender").value = state.profile.gender || "male";
    document.getElementById("set-tone").value = state.profile.tone || "brom";
    document.getElementById("set-age").value = state.profile.age;
    document.getElementById("set-height").value = state.profile.height;
    document.getElementById("set-target-weight").value = state.profile.targetWeight;
    document.getElementById("set-activity").value = state.profile.activity;
    document.getElementById("set-goal-pace").value = state.profile.goalPace || "0.5";
    document.getElementById("setting-api-key").value = state.profile.apiKey || "";
    document.getElementById("set-city").value = state.profile.city || "Istanbul";
    document.getElementById("set-sleep-time").value = state.profile.sleepTime || "23:00";
    document.getElementById("set-privacy").value = state.profile.privacy || "public";

    // Welcome text update
    updateWelcomeMessage();
}

function updateLevelUI() {
    const headerLevel = document.getElementById("header-level");
    if (headerLevel) {
        headerLevel.textContent = `Lv ${state.profile.level} (${state.profile.xp} XP)`;
    }
}

async function addXP(amount, reason) {
    if (!state.profile) return;
    if (state.profile.level === undefined) state.profile.level = 1;
    if (state.profile.xp === undefined) state.profile.xp = 0;

    state.profile.xp += amount;
    showToast(`+${amount} XP kazanıldı! (${reason})`, "success");

    const xpNeeded = state.profile.level * 100;
    if (state.profile.xp >= xpNeeded) {
        state.profile.xp -= xpNeeded;
        state.profile.level++;
        const msg = `🎉 TEBRİKLER! LEVEL ATLANDI! Yeni seviye: Lv ${state.profile.level}`;
        showToast(msg, "success");
        alert(msg);
    }

    updateUserInfoUI();

    fetch(apiURL("/api/profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.profile)
    }).catch(e => console.error("XP kaydedilemedi", e));
}

function updateWelcomeMessage() {
    if (!state.profile) return;
    let welcomeText = document.getElementById("chat-welcome-msg");
    if (!welcomeText) {
        const container = document.getElementById("chat-messages-container");
        if (container) {
            const msgDiv = document.createElement("div");
            msgDiv.className = "message ai";
            msgDiv.innerHTML = `
                <div class="msg-avatar"><i class="fa-solid fa-user-astronaut"></i></div>
                <div class="msg-text" id="chat-welcome-msg"></div>
            `;
            container.prepend(msgDiv);
            welcomeText = document.getElementById("chat-welcome-msg");
        }
    }
    if (!welcomeText) return;
    const name = state.profile.name;
    const tone = state.profile.tone || "brom";

    if (tone === "brom") {
        welcomeText.innerHTML = `Selam ${name} kral! Ben senin koçun EmreOuzoun AI. Profilini okudum brom. Bugünden itibaren hem kod/yazılım hedeflerini hem de spor salonundaki ağırlıklarını beraber uçuracağız. Bugün durumlar nasıl, ne yedik ne bastık? Soruları sor, gerisini bana bırak!`;
    } else if (tone === "champ") {
        welcomeText.innerHTML = `Merhaba ${name} şampiyon! Ben senin koçun EmreOuzoun AI. Profilini inceledim kraliçe. Bugünden itibaren hedeflerini gerçekleştirmek için beraber harika adımlar atacağız. Bugün nasıl hissediyorsun, beslenme ve spor nasıl gidiyor? Anlat bakalım, yanındayım!`;
    } else {
        welcomeText.innerHTML = `Hoş geldiniz Sayın ${name}. Ben kişisel koçunuz EmreOuzoun AI. Profil detaylarınız ve günlük kalori/makro hedefleriniz başarıyla yüklenmiştir. Bugün gerçekleştirmek istediğiniz hedefleri belirleyebilir veya günlük raporunuzu talep edebilirsiniz.`;
    }
}

// 2. Tab Navigation
function initTabNavigation() {
    navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const tabName = link.getAttribute("data-tab");

            navLinks.forEach(l => l.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            link.classList.add("active");
            document.getElementById(`tab-${tabName}`).classList.add("active");

            if (tabName === "dashboard") {
                renderWeightChart();
            }
        });
    });
}

// 3. Date Controls
function initDateControls() {
    currentDateDisplay.textContent = formatDateDisplay(state.currentDate);
    prevDateBtn.addEventListener("click", () => changeDate(-1));
    nextDateBtn.addEventListener("click", () => changeDate(1));
}

async function changeDate(days) {
    const d = new Date(state.currentDate);
    d.setDate(d.getDate() + days);
    state.currentDate = getLocalDateString(d);
    currentDateDisplay.textContent = formatDateDisplay(state.currentDate);
    await loadDailyData();
    await loadChatHistory();
}

// 4. Data Sync
async function loadDailyData() {
    try {
        const response = await fetch(apiURL(`/api/logs?date=${state.currentDate}`));
        if (response.ok) {
            state.dailyLog = await response.json();

            // Yeni parametreler için koruma
            if (!state.dailyLog.routine) {
                state.dailyLog.routine = [];
            }
            if (!state.dailyLog.recovery.wake_feeling) {
                state.dailyLog.recovery.wake_feeling = 3;
            }
            if (!state.dailyLog.recovery.focus_feeling) {
                state.dailyLog.recovery.focus_feeling = 3;
            }

            renderDashboard();
            renderWorkout();
            renderNutrition();
            renderRecovery();
            renderRoutine();
            renderInsights();

            // Gün kilitli ise tüm girdileri devre dışı bırak
            disableAllInputs();
        }
    } catch (e) {
        console.error("Günlük veriler yüklenemedi:", e);
    }
}

async function saveDailyLog() {
    if (!state.dailyLog) return;
    try {
        await fetch(apiURL("/api/logs"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.dailyLog)
        });
    } catch (e) {
        console.error("Günlük log kaydedilemedi:", e);
    }
}

async function saveDailyWeightLog(w) {
    const todayStr = getLocalDateString(new Date());
    let logToSave = null;
    try {
        const response = await fetch(apiURL(`/api/logs?date=${state.currentDate}`));
        if (response.ok) logToSave = await response.json();
    } catch (e) { }

    if (!logToSave) {
        logToSave = {
            date: state.currentDate,
            nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0, water: 0 },
            workout: null,
            recovery: { sleep_hours: 8, sleep_quality: 4, stress: 3, energy: 3, doms: [], wake_feeling: 3, focus_feeling: 3 },
            routine: [],
            notes: ""
        };
    }

    logToSave.weight = w;

    await fetch(apiURL("/api/logs"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logToSave)
    });

    if (state.currentDate === todayStr && state.profile) {
        state.profile.weight = w;
        state.profile.targets = calculateNutritionTargets(state.profile);
        await fetch(apiURL("/api/profile"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.profile)
        });
        updateUserInfoUI();
    }

    await loadDailyData();
    await loadWeightHistory();
}

// 5. Dashboard Rendering
function renderDashboard() {
    if (!state.dailyLog || !state.profile) return;

    const targets = state.profile.targets;
    const log = state.dailyLog;

    const takenKcal = log.nutrition.calories || 0;
    const targetKcal = targets.calories;
    document.getElementById("dashboard-kcal-taken").textContent = takenKcal;
    document.getElementById("dashboard-kcal-target").textContent = targetKcal;

    const percent = Math.min(100, Math.round((takenKcal / targetKcal) * 100));
    const ring = document.getElementById("kcal-progress-ring");
    ring.style.background = `conic-gradient(var(--neon-orange) ${percent * 3.6}deg, var(--border-color) ${percent * 3.6}deg)`;

    const waterL = log.nutrition.water || 0;
    const targetWater = targets.water || 3.0;
    document.getElementById("dashboard-water-val").textContent = `${waterL.toFixed(1)} / ${targetWater.toFixed(1)} L`;
    const waterPercent = Math.min(100, (waterL / targetWater) * 100);
    document.getElementById("dashboard-water-bar").style.width = `${waterPercent}%`;

    const sleepH = log.recovery.sleep_hours || 0;
    document.getElementById("dashboard-sleep-val").textContent = `${sleepH.toFixed(1)} / 8 Saat`;
    const sleepPercent = Math.min(100, (sleepH / 8) * 100);
    document.getElementById("dashboard-sleep-bar").style.width = `${sleepPercent}%`;

    const workoutDone = log.workout && log.workout.completed;
    document.getElementById("dashboard-workout-status").textContent = workoutDone ? "Tamamlandı" : "Yapılmadı";
    document.getElementById("dashboard-workout-bar").style.width = workoutDone ? "100%" : "0%";

    const protG = log.nutrition.protein || 0;
    document.getElementById("macro-p-val").textContent = `${protG}g / ${targets.protein}g`;
    document.getElementById("macro-p-bar").style.width = `${Math.min(100, (protG / targets.protein) * 100)}%`;

    const carbG = log.nutrition.carbs || 0;
    document.getElementById("macro-c-val").textContent = `${carbG}g / ${targets.carbs}g`;
    document.getElementById("macro-c-bar").style.width = `${Math.min(100, (carbG / targets.carbs) * 100)}%`;

    const fatG = log.nutrition.fat || 0;
    document.getElementById("macro-f-val").textContent = `${fatG}g / ${targets.fat}g`;
    document.getElementById("macro-f-bar").style.width = `${Math.min(100, (fatG / targets.fat) * 100)}%`;

    if (log.weight) {
        document.getElementById("header-weight").textContent = `${log.weight.toFixed(1)} kg`;
    } else {
        document.getElementById("header-weight").textContent = `${state.profile.weight.toFixed(1)} kg`;
    }
}

// 6. Weight Tracking
async function loadWeightHistory() {
    try {
        const response = await fetch(apiURL("/api/logs/list"));
        if (response.ok) {
            const list = await response.json();
            const history = [];
            for (const file of list) {
                const logRes = await fetch(apiURL(`/api/logs?date=${file}`));
                if (logRes.ok) {
                    const log = await logRes.json();
                    if (log.weight) {
                        history.push({ date: file, weight: log.weight });
                    }
                }
            }
            state.weightHistory = history.sort((a, b) => new Date(a.date) - new Date(b.date));
            renderWeightChart();
            renderInsights();
        }
    } catch (e) {
        console.error("Kilo geçmişi yüklenemedi:", e);
    }
}

function renderInsights() {
    const weightTrendEl = document.getElementById("insight-weight-trend");
    const nutritionStatusEl = document.getElementById("insight-nutrition-status");
    const workoutStatusEl = document.getElementById("insight-workout-status");
    const coachTipEl = document.getElementById("insight-coach-tip");

    if (!state.profile || !state.dailyLog) return;

    // 1. Kilo Değişimi
    if (weightTrendEl) {
        if (state.weightHistory && state.weightHistory.length >= 2) {
            const first = state.weightHistory[0].weight;
            const last = state.weightHistory[state.weightHistory.length - 1].weight;
            const diff = (last - first).toFixed(1);
            if (diff > 0.2) weightTrendEl.textContent = `+${diff} kg (Artışta)`;
            else if (diff < -0.2) weightTrendEl.textContent = `${diff} kg (Düşüşte)`;
            else weightTrendEl.textContent = `Stabil (${last} kg)`;
        } else {
            weightTrendEl.textContent = `Stabil (${state.profile.weight} kg)`;
        }
    }

    // 2. Beslenme Durumu
    const takenKcal = state.dailyLog.nutrition?.calories || 0;
    const targetKcal = state.profile.targets?.calories || 2500;
    const takenProt = state.dailyLog.nutrition?.protein || 0;
    const targetProt = state.profile.targets?.protein || 150;

    if (nutritionStatusEl) {
        if (takenKcal === 0) {
            nutritionStatusEl.textContent = "Bugün Henüz Girilmedi";
        } else {
            const pct = Math.round((takenKcal / targetKcal) * 100);
            if (pct >= 90 && pct <= 110) nutritionStatusEl.textContent = `Hedefe Uygun (%${pct})`;
            else if (pct < 90) nutritionStatusEl.textContent = `Hedefin Altında (%${pct})`;
            else nutritionStatusEl.textContent = `Hedefin Üstünde (%${pct})`;
        }
    }

    // 3. Antrenman Yoğunluğu
    if (workoutStatusEl) {
        const w = state.dailyLog.workout;
        if (!w || !w.exercises || w.exercises.length === 0) {
            workoutStatusEl.textContent = "Planlanmadı / Dinlenme";
        } else if (w.completed) {
            workoutStatusEl.textContent = `Tamamlandı (${w.exercises.length} Egzersiz)`;
        } else {
            workoutStatusEl.textContent = `Bekliyor (${w.exercises.length} Egzersiz)`;
        }
    }

    // 4. Koç Tavsiyesi
    if (coachTipEl) {
        const remKcal = Math.max(0, targetKcal - takenKcal);
        const remProt = Math.max(0, targetProt - takenProt);
        const water = state.dailyLog.nutrition?.water || 0;
        const targetWater = state.profile.targets?.water || 3.0;
        const tips = [];

        if (remProt > 20) {
            tips.push(`Günlük protein hedefine ulaşmak için <strong>${remProt}g</strong> daha protein almalısın (${remKcal} kcal kaldı).`);
        } else if (takenKcal > 0) {
            tips.push(`Protein hedefine çok yakınsın veya ulaştın, harika gidiyorsun!`);
        }

        if (water < targetWater * 0.6) {
            tips.push(`Su tüketimin şu an <strong>${water.toFixed(1)}L</strong>; performans ve toparlanma için <strong>${targetWater.toFixed(1)}L</strong> hedefine odaklan.`);
        }

        if (state.dailyLog.workout && !state.dailyLog.workout.completed) {
            tips.push(`Bugünkü <strong>${state.dailyLog.workout.name || "Antrenman"}</strong> seansında ilk setlerde RIR 2, son sette RIR 0-1 hedefle!`);
        } else if (state.dailyLog.workout && state.dailyLog.workout.completed) {
            tips.push(`Bugünkü antrenmanı tamamladın! Kas onarımı için uyku saatine (${state.profile.sleepTime || "23:00"}) sadık kal.`);
        }

        if (tips.length > 0) {
            coachTipEl.innerHTML = tips.join(" ");
        }
    }
}

function renderWeightChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;
    if (weightChartInstance) weightChartInstance.destroy();

    const sortedHistory = [...state.weightHistory].slice(-10);
    if (sortedHistory.length === 0) {
        sortedHistory.push({ date: "Veri Yok", weight: state.profile ? state.profile.weight : 70 });
    }

    const labels = sortedHistory.map(h => h.date);
    const data = sortedHistory.map(h => h.weight);

    weightChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kilo (kg)',
                data: data,
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.05)',
                borderWidth: 3,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#f97316',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    grid: { color: 'rgba(15, 23, 42, 0.04)' },
                    ticks: { color: '#475569' }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#475569' }
                }
            }
        }
    });
}

function initWeightModal() {
    const modal = document.getElementById("weight-modal");
    const openBtn = document.getElementById("btn-log-weight-today");
    const closeBtn = document.getElementById("btn-close-weight-modal");
    const saveBtn = document.getElementById("btn-save-weight-modal");
    const input = document.getElementById("today-weight-input");

    openBtn.addEventListener("click", () => {
        input.value = state.dailyLog.weight || state.profile.weight;
        modal.classList.remove("hidden");
    });
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    saveBtn.addEventListener("click", async () => {
        const val = parseFloat(input.value);
        if (val > 30 && val < 250) {
            await saveDailyWeightLog(val);
            modal.classList.add("hidden");
        } else {
            alert("Geçersiz kilo.");
        }
    });
}

// 7. Workouts Logging
let defaultWorkoutTemplates = {
    hypertrophy: {
        name: "Kas Geliştirme (Hipertrofi)",
        exercises: [
            { name: "Incline Bench Press", sets: [{ kg: 50, reps: 10, rir: 2 }, { kg: 50, reps: 10, rir: 1 }, { kg: 55, reps: 8, rir: 0 }] },
            { name: "Flat Dumbbell Press", sets: [{ kg: 20, reps: 10, rir: 2 }, { kg: 22, reps: 10, rir: 1 }] },
            { name: "Lat Pulldown (Sırt)", sets: [{ kg: 45, reps: 10, rir: 2 }, { kg: 50, reps: 10, rir: 1 }] },
            { name: "Lateral Raise (Omuz)", sets: [{ kg: 10, reps: 12, rir: 2 }, { kg: 10, reps: 12, rir: 0 }] },
            { name: "Biceps Curl", sets: [{ kg: 12, reps: 12, rir: 2 }, { kg: 12, reps: 12, rir: 1 }] }
        ]
    },
    strength: {
        name: "Güç/Kuvvet Şablonu (Strength)",
        exercises: [
            { name: "Squat", sets: [{ kg: 80, reps: 5, rir: 2 }, { kg: 85, reps: 5, rir: 2 }, { kg: 90, reps: 5, rir: 1 }] },
            { name: "Bench Press", sets: [{ kg: 60, reps: 5, rir: 2 }, { kg: 65, reps: 5, rir: 2 }, { kg: 70, reps: 5, rir: 1 }] },
            { name: "Deadlift", sets: [{ kg: 100, reps: 5, rir: 2 }, { kg: 110, reps: 3, rir: 1 }] }
        ]
    }
};

function renderWorkout() {
    const emptyState = document.getElementById("workout-empty-state");
    const exerciseList = document.getElementById("exercise-list");
    const footer = document.getElementById("workout-footer");

    if (!state.dailyLog || !state.dailyLog.workout) {
        emptyState.classList.remove("hidden");
        exerciseList.innerHTML = "";
        footer.classList.add("hidden");
        return;
    }

    emptyState.classList.add("hidden");
    footer.classList.remove("hidden");
    exerciseList.innerHTML = "";

    const workout = state.dailyLog.workout;
    workout.exercises.forEach((ex, exIdx) => {
        const card = document.createElement("div");
        card.className = "exercise-card fade-in";

        let setsHTML = "";
        ex.sets.forEach((set, setIdx) => {
            setsHTML += `
                <tr>
                    <td>${setIdx + 1}</td>
                    <td><input type="number" step="0.5" class="set-kg" data-ex="${exIdx}" data-set="${setIdx}" value="${set.kg}"> kg</td>
                    <td><input type="number" class="set-reps" data-ex="${exIdx}" data-set="${setIdx}" value="${set.reps}"></td>
                    <td><input type="number" min="0" max="4" class="set-rir" data-ex="${exIdx}" data-set="${setIdx}" value="${set.rir !== undefined ? set.rir : 2}"></td>
                    <td>
                        <button class="btn-icon btn-delete-set" data-ex="${exIdx}" data-set="${setIdx}">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        card.innerHTML = `
            <div class="exercise-header">
                <h4>${ex.name}</h4>
                <button class="btn-icon btn-delete-exercise" data-ex="${exIdx}">
                    <i class="fa-solid fa-trash-can"></i> Egzersizi Kaldır
                </button>
            </div>
            <table class="sets-table">
                <thead>
                    <tr>
                        <th>Set</th>
                        <th>Ağırlık</th>
                        <th>Tekrar</th>
                        <th>RIR (Kalan)</th>
                        <th>İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${setsHTML}
                </tbody>
            </table>
            <button class="btn-add-set" data-ex="${exIdx}">+ Set Ekle</button>
        `;
        exerciseList.appendChild(card);
    });

    bindWorkoutEvents();
    renderOverloadTips();
}

function bindWorkoutEvents() {
    document.querySelectorAll(".set-kg").forEach(input => {
        input.addEventListener("input", (e) => {
            const exIdx = parseInt(e.target.getAttribute("data-ex"));
            const setIdx = parseInt(e.target.getAttribute("data-set"));
            state.dailyLog.workout.exercises[exIdx].sets[setIdx].kg = parseFloat(e.target.value) || 0;
        });
    });
    document.querySelectorAll(".set-reps").forEach(input => {
        input.addEventListener("input", (e) => {
            const exIdx = parseInt(e.target.getAttribute("data-ex"));
            const setIdx = parseInt(e.target.getAttribute("data-set"));
            state.dailyLog.workout.exercises[exIdx].sets[setIdx].reps = parseInt(e.target.value) || 0;
        });
    });
    document.querySelectorAll(".set-rir").forEach(input => {
        input.addEventListener("input", (e) => {
            const exIdx = parseInt(e.target.getAttribute("data-ex"));
            const setIdx = parseInt(e.target.getAttribute("data-set"));
            const parsed = parseInt(e.target.value);
            state.dailyLog.workout.exercises[exIdx].sets[setIdx].rir = Number.isNaN(parsed) ? 2 : parsed;
        });
    });
    document.querySelectorAll(".btn-delete-set").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const btnEl = e.target.closest(".btn-delete-set");
            const exIdx = parseInt(btnEl.getAttribute("data-ex"));
            const setIdx = parseInt(btnEl.getAttribute("data-set"));
            state.dailyLog.workout.exercises[exIdx].sets.splice(setIdx, 1);
            renderWorkout();
        });
    });
    document.querySelectorAll(".btn-add-set").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const exIdx = parseInt(e.target.getAttribute("data-ex"));
            const sets = state.dailyLog.workout.exercises[exIdx].sets;
            const lastSet = sets[sets.length - 1] || { kg: 20, reps: 8, rir: 2 };
            sets.push({ ...lastSet });
            renderWorkout();
        });
    });
    document.querySelectorAll(".btn-delete-exercise").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const btnEl = e.target.closest(".btn-delete-exercise");
            const exIdx = parseInt(btnEl.getAttribute("data-ex"));
            state.dailyLog.workout.exercises.splice(exIdx, 1);
            if (state.dailyLog.workout.exercises.length === 0) {
                state.dailyLog.workout = null;
            }
            renderWorkout();
        });
    });
}

async function renderOverloadTips() {
    const container = document.getElementById("overload-tips");
    if (!state.dailyLog || !state.dailyLog.workout || state.dailyLog.workout.exercises.length === 0) {
        container.innerHTML = `<div class="empty-state-sm">Egzersiz eklediğinizde hedefleriniz burada görünecektir.</div>`;
        return;
    }

    container.innerHTML = `<div class="empty-state-sm"><i class="fa-solid fa-spinner fa-spin"></i> Geçmiş veriler analiz ediliyor...</div>`;

    try {
        const listRes = await fetch(apiURL("/api/logs/list"));
        if (!listRes.ok) throw new Error();
        const files = await listRes.json();

        const pastDates = files
            .filter(f => f < state.currentDate)
            .sort((a, b) => new Date(b) - new Date(a));

        const workoutExercises = state.dailyLog.workout.exercises;
        const historyMap = {};

        for (const date of pastDates) {
            const foundAll = workoutExercises.every(ex => historyMap[ex.name]);
            if (foundAll) break;

            const logRes = await fetch(apiURL(`/api/logs?date=${date}`));
            if (logRes.ok) {
                const log = await logRes.json();
                if (log.workout && log.workout.exercises) {
                    log.workout.exercises.forEach(oldEx => {
                        if (!historyMap[oldEx.name] && oldEx.sets && oldEx.sets.length > 0) {
                            const bestSet = oldEx.sets.reduce((max, s) => (s.kg > max.kg) ? s : max, oldEx.sets[0]);
                            historyMap[oldEx.name] = {
                                weight: bestSet.kg,
                                reps: bestSet.reps,
                                rir: bestSet.rir !== undefined ? bestSet.rir : 1,
                                date: date
                            };
                        }
                    });
                }
            }
        }

        container.innerHTML = "";

        workoutExercises.forEach(ex => {
            const tipEl = document.createElement("div");
            tipEl.className = "overload-tip-item fade-in";

            const prev = historyMap[ex.name];
            if (prev) {
                let targetWeight = prev.weight;
                let targetReps = prev.reps;
                let reason = "";

                if (prev.rir >= 2) {
                    targetWeight = prev.weight + 2.5;
                    reason = `Son antrenmanda tükenişe çok mesafe vardı (RIR ${prev.rir}). Ağırlığı +2.5kg arttır.`;
                } else if (prev.rir === 1) {
                    targetReps = prev.reps + 1;
                    reason = "Son antrenmanda iyi bir ağırlıktaydın (RIR 1). Aynı ağırlıkla +1 tekrar fazlasını hedefle.";
                } else {
                    reason = "Son antrenmanda tam tükenişe ulaştın (RIR 0). Aynı ağırlık ve tekrarı korumaya çalış, form kalitesine odaklan.";
                }

                tipEl.innerHTML = `
                    <div class="title">${ex.name}</div>
                    <div class="tip">
                        <strong>Geçen Sefer (${prev.date}):</strong> ${prev.weight}kg x ${prev.reps} tekrar (RIR ${prev.rir})<br>
                        <strong>Bugünkü Hedef (En İyi Set):</strong> ${targetWeight}kg x ${targetReps} tekrar<br>
                        <span style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-top:4px;">💡 ${reason}</span>
                    </div>
                `;
            } else {
                tipEl.innerHTML = `
                    <div class="title">${ex.name}</div>
                    <div class="tip">
                        <strong>İlk Defa Yapılıyor!</strong><br>
                        Isınma setlerinden sonra 1. set RIR 2 hedeflenmeli.
                    </div>
                `;
            }
            container.appendChild(tipEl);
        });

    } catch (err) {
        container.innerHTML = `<div class="empty-state-sm">Geçmiş yüklenirken hata oluştu.</div>`;
    }
}

function initWorkoutCritique() {
    const btn = document.getElementById("btn-ai-analyze-workout-prog");
    if (!btn) return;

    btn.addEventListener("click", async () => {
        const apiKey = state.profile ? state.profile.apiKey : "";
        if (!apiKey) {
            alert("API Anahtarınız bulunamadı. Lütfen Ayarlar sekmesinden Gemini API anahtarınızı girin.");
            return;
        }

        if (!state.dailyLog || !state.dailyLog.workout || state.dailyLog.workout.exercises.length === 0) {
            alert("Lütfen önce antrenman programınıza egzersiz ekleyin.");
            return;
        }

        const critiqueDiv = document.getElementById("ai-workout-critique-content");
        critiqueDiv.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> AI Koç programını inceliyor...`;

        try {
            const exercisesStr = state.dailyLog.workout.exercises.map(ex => {
                const setsStr = ex.sets.map(s => `${s.kg}kg x ${s.reps} (RIR ${s.rir !== undefined ? s.rir : 2})`).join(", ");
                return `- ${ex.name} : [${setsStr}]`;
            }).join("\n");

            const prompt = `Antrenman analizi yap. Kısa tut.
Kullanıcı: ${state.profile.name} | Hedef: ${state.profile.targetWeight > state.profile.weight ? 'Hacim' : 'Yakım'} | Ton: ${state.profile.tone || 'brom'}

Program:
${exercisesStr}

Analiz yap ve aşağıdaki formatı kullan:
✅ İyi yönler: (1-2 madde)
⚠️ Geliştirilebilir: (1-2 madde)
💡 Öneri: (1 somut öneri, hangi egzersiz eklenmeli/çıkarılmalı)

Maksimum 6-7 cümle. Türkçe.
`;


            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates[0].content.parts[0].text;
                critiqueDiv.innerHTML = text.replace(/\n/g, "<br>");
            } else {
                critiqueDiv.innerHTML = "Gemini API yanıt vermedi. Lütfen internetinizi ve anahtarınızı kontrol edin.";
            }

        } catch (e) {
            critiqueDiv.innerHTML = "Hata oluştu: " + e.message;
        }
    });
}

document.getElementById("btn-load-hypertrophy").addEventListener("click", () => {
    state.dailyLog.workout = JSON.parse(JSON.stringify(defaultWorkoutTemplates.hypertrophy));
    renderWorkout();
});
document.getElementById("btn-load-strength").addEventListener("click", () => {
    state.dailyLog.workout = JSON.parse(JSON.stringify(defaultWorkoutTemplates.strength));
    renderWorkout();
});

async function updatePRsFromWorkout(workout) {
    if (!workout || !workout.exercises || !state.profile) return;
    if (!state.profile.prs) state.profile.prs = { squat: 0, bench_press: 0, deadlift: 0 };

    for (const ex of workout.exercises) {
        const name = ex.name.toLowerCase();
        let maxW = 0;
        (ex.sets || []).forEach(s => {
            if (s.kg > maxW) maxW = s.kg;
        });
        if (maxW > 0) {
            if (name.includes("bench press") || name.includes("bench")) {
                if (maxW > (state.profile.prs.bench_press || 0)) {
                    state.profile.prs.bench_press = maxW;
                    await savePRHistory("Bench Press", maxW);
                }
            } else if (name.includes("squat")) {
                if (maxW > (state.profile.prs.squat || 0)) {
                    state.profile.prs.squat = maxW;
                    await savePRHistory("Squat", maxW);
                }
            } else if (name.includes("deadlift")) {
                if (maxW > (state.profile.prs.deadlift || 0)) {
                    state.profile.prs.deadlift = maxW;
                    await savePRHistory("Deadlift", maxW);
                }
            }
        }
    }

    state.profile.workoutTemplate = workout;
    try {
        await fetch(apiURL("/api/profile"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(state.profile)
        });
    } catch (e) {
        console.error("Profil PR güncellenemedi:", e);
    }
}

document.getElementById("btn-save-workout").addEventListener("click", async () => {
    if (state.dailyLog && state.dailyLog.workout) {
        state.dailyLog.workout.completed = true;
        await updatePRsFromWorkout(state.dailyLog.workout);
        await saveDailyLog();
        renderDashboard();
        renderInsights();
        alert("Antrenman başarıyla kaydedildi!");
        addXP(50, "Antrenman Tamamlandı 🏋️‍♂️");
    }
});

function initExerciseModal() {
    const modal = document.getElementById("exercise-modal");
    const openBtn = document.getElementById("btn-add-exercise");
    const closeBtn = document.getElementById("btn-close-exercise-modal");
    const saveBtn = document.getElementById("btn-save-exercise-modal");
    const input = document.getElementById("exercise-name-input");

    openBtn.addEventListener("click", () => {
        input.value = "";
        modal.classList.remove("hidden");
    });
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
    saveBtn.addEventListener("click", () => {
        const name = input.value.trim();
        if (name) {
            if (!state.dailyLog.workout) {
                state.dailyLog.workout = { name: "Özel Antrenman", completed: false, exercises: [] };
            }
            state.dailyLog.workout.exercises.push({ name: name, sets: [{ kg: 20, reps: 10, rir: 2 }] });
            renderWorkout();
            modal.classList.add("hidden");
        }
    });
}

// 8. Dynamic AI Workout Generator
document.getElementById("btn-ai-generate-workout").addEventListener("click", async () => {
    const apiKey = state.profile ? state.profile.apiKey : "";
    if (!apiKey) {
        alert("API Anahtarı bulunamadı. Lütfen Ayarlar sekmesinden Gemini API anahtarınızı girin.");
        return;
    }

    const goal = prompt("Antrenman amacını belirt (Örn: '3 günlük ev antrenmanı dambılla', 'Güç odaklı 4 günlük Upper/Lower', 'Göğüs ve Biceps odaklı hacim antrenmanı')");
    if (!goal) return;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `<div class="glass-card text-center" style="max-width:300px;"><i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;color:var(--neon-orange);"></i><p class="mt-10">AI Koç programı yazıyor...</p></div>`;
    document.body.appendChild(overlay);

    try {
        const prompt = `
Fiziksel profil ve hedefe uygun bir antrenman programı oluştur.
Profil:
- Ağırlık: ${state.profile.weight} kg, Boy: ${state.profile.height} cm, Yaş: ${state.profile.age}
- Antrenman Amacı: ${goal}

Aşağıdaki JSON şablonuna tamamen uygun bir JSON dizi nesnesi döndür:
{
  "name": "Antrenman Programı Adı (örn: Üst Vücut)",
  "exercises": [
    {
      "name": "Egzersiz Adı",
      "sets": [
        {"kg": 20, "reps": 10, "rir": 2},
        {"kg": 20, "reps": 10, "rir": 2}
      ]
    }
  ]
}

Kurallar:
1. Yalnızca geçerli bir JSON döndür. Başka açıklama, kod bloğu veya yazı ekleme.
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        overlay.remove();

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            const workout = parseGeminiJSON(text);

            state.dailyLog.workout = {
                name: workout.name || "AI Özel Antrenman",
                completed: false,
                exercises: workout.exercises
            };

            renderWorkout();
            await saveDailyLog();
            alert("AI Koç antrenman programını başarıyla yazdı ve kaydetti!");
        } else {
            alert("AI Program üretirken bir hata oluştu.");
        }
    } catch (e) {
        overlay.remove();
        alert("Bağlantı veya JSON ayrıştırma hatası: " + e.message);
    }
});

// 9. AI Food Parser (Premium feature)
document.getElementById("btn-parse-ai-vision").addEventListener("click", () => {
    document.getElementById("ai-food-image-input").click();
});

document.getElementById("ai-food-image-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const apiKey = state.profile ? state.profile.apiKey : "";
    if (!apiKey) {
        alert("Besin analizi yapmak için lütfen Ayarlar sekmesinden Gemini API anahtarınızı girin.");
        return;
    }

    const btn = document.getElementById("btn-parse-ai-vision");
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Taranıyor...`;
    btn.disabled = true;

    try {
        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64Data = event.target.result.split(',')[1];

            const prompt = `
Görseldeki yemeği analiz et. İnternet verilerine dayanarak kalori ve makro değerlerini (gram cinsinden protein, karbonhidrat, yağ) hesapla.
Bize sadece aşağıdaki formatta bir JSON dizisi (Array) döndür. Başka hiçbir metin ekleme:
[
  {
    "name": "Besin Adı",
    "calories": 130,
    "protein": 3,
    "carbs": 28,
    "fat": 0
  }
]`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: file.type, data: base64Data } }
                        ]
                    }]
                })
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates[0].content.parts[0].text;
                const items = parseGeminiJSON(text);

                if (!state.dailyLog.meals) state.dailyLog.meals = [];
                for (const item of items) {
                    const kcal = parseInt(item.calories) || 0;
                    const prot = parseInt(item.protein) || 0;
                    const carbs = parseInt(item.carbs) || 0;
                    const fat = parseInt(item.fat) || 0;
                    state.dailyLog.meals.push({
                        name: item.name,
                        calories: kcal,
                        protein: prot,
                        carbs: carbs,
                        fat: fat
                    });
                    state.dailyLog.nutrition.calories += kcal;
                    state.dailyLog.nutrition.protein += prot;
                    state.dailyLog.nutrition.carbs += carbs;
                    state.dailyLog.nutrition.fat += fat;
                }
                await saveDailyLog();
                renderDashboard();
                renderNutrition();
                renderInsights();
                showToast("Yemek görselden başarıyla eklendi! 📸", "success");
                addXP(10, "Fotoğraflı Öğün Girildi");
            } else {
                alert("Gemini API hatası. Lütfen tekrar deneyin.");
            }
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            e.target.value = ""; // Reset input
        };
        reader.readAsDataURL(file);
    } catch (err) {
        console.error(err);
        alert("Fotoğraf analizinde hata: " + err.message);
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        e.target.value = "";
    }
});

// Text-based AI Food Parser

document.getElementById("btn-parse-ai-food").addEventListener("click", async () => {
    const input = document.getElementById("ai-food-text-input");
    const textVal = input.value.trim();
    if (!textVal) return;

    const apiKey = state.profile ? state.profile.apiKey : "";
    if (!apiKey) {
        alert("Besin analizi yapmak için lütfen Ayarlar sekmesinden Gemini API anahtarınızı girin.");
        return;
    }

    const btn = document.getElementById("btn-parse-ai-food");
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Analiz Ediliyor...`;
    btn.disabled = true;

    try {
        const prompt = `
Aşağıdaki Türkçe yazılmış besin veya öğün ifadesini çözümle. İnternet verilerine dayanarak kalori ve makro değerlerini (gram cinsinden protein, karbonhidrat, yağ) hesapla.
Girdi: "${textVal}"

Bize sadece aşağıdaki formatta bir JSON dizisi (Array) döndür. Ekstra hiçbir açıklama, kod bloğu, markdown veya kelime ekleme. Yalnızca ham JSON döndür:
[
  {
    "name": "Besin Adı (Örn: Haşlanmış Pilav)",
    "calories": 130,
    "protein": 3,
    "carbs": 28,
    "fat": 0
  }
]
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            const items = parseGeminiJSON(text);

            if (!state.dailyLog.meals) state.dailyLog.meals = [];

            for (const item of items) {
                state.dailyLog.meals.push({
                    name: item.name,
                    calories: parseInt(item.calories) || 0,
                    protein: parseInt(item.protein) || 0,
                    carbs: parseInt(item.carbs) || 0,
                    fat: parseInt(item.fat) || 0
                });

                state.dailyLog.nutrition.calories += parseInt(item.calories) || 0;
                state.dailyLog.nutrition.protein += parseInt(item.protein) || 0;
                state.dailyLog.nutrition.carbs += parseInt(item.carbs) || 0;
                state.dailyLog.nutrition.fat += parseInt(item.fat) || 0;
            }

            input.value = "";
            await saveDailyLog();
            renderDashboard();
            renderNutrition();
            alert("Besinler AI tarafından ayrıştırıldı ve eklendi!");
            addXP(5, "Öğün Girildi");
        } else {
            alert("Gemini besinleri ayrıştıramadı.");
        }
    } catch (e) {
        alert("Ayrıştırma hatası (API anahtarını veya formatı kontrol edin): " + e.message);
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
});

// Nutrition Log Form
function initNutritionForm() {
    const form = document.getElementById("custom-meal-form");
    document.querySelectorAll(".btn-quick").forEach(btn => {
        btn.addEventListener("click", async () => {
            const kcal = parseInt(btn.getAttribute("data-kcal"));
            const p = parseInt(btn.getAttribute("data-p"));
            const c = parseInt(btn.getAttribute("data-c"));
            const f = parseInt(btn.getAttribute("data-f"));
            addMeal("Hızlı Ekleme", kcal, p, c, f);
        });
    });

    form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("meal-name").value;
        const kcal = parseInt(document.getElementById("meal-kcal").value);
        const p = parseInt(document.getElementById("meal-p").value);
        const c = parseInt(document.getElementById("meal-c").value);
        const f = parseInt(document.getElementById("meal-f").value);
        addMeal(name, kcal, p, c, f);
        form.reset();
    });
}

async function addMeal(name, kcal, p, c, f) {
    if (!state.dailyLog.meals) state.dailyLog.meals = [];
    state.dailyLog.meals.push({ name, calories: kcal, protein: p, carbs: c, fat: f });
    state.dailyLog.nutrition.calories += kcal;
    state.dailyLog.nutrition.protein += p;
    state.dailyLog.nutrition.carbs += c;
    state.dailyLog.nutrition.fat += f;
    await saveDailyLog();
    renderDashboard();
    renderNutrition();
    addXP(5, "Öğün Girildi");
}

function renderNutrition() {
    const list = document.getElementById("meals-list");
    list.innerHTML = "";
    const meals = state.dailyLog.meals || [];

    if (meals.length === 0) {
        list.innerHTML = `<tr><td colspan="6" class="text-center">Bugün henüz öğün girilmedi.</td></tr>`;
    } else {
        meals.forEach((meal, idx) => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${meal.name}</td>
                <td>${meal.calories} kcal</td>
                <td>${meal.protein}g</td>
                <td>${meal.carbs}g</td>
                <td>${meal.fat}g</td>
                <td style="display:flex; gap:6px;">
                    <button class="btn-icon btn-add-to-favorites" data-idx="${idx}" title="Favorilere Ekle">
                        <i class="fa-solid fa-star" style="color:var(--neon-orange);"></i>
                    </button>
                    <button class="btn-icon btn-delete-meal" data-idx="${idx}" title="Sil">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            list.appendChild(tr);
        });

        document.querySelectorAll(".btn-delete-meal").forEach(btn => {
            btn.addEventListener("click", async (e) => {
                const idx = parseInt(e.target.closest(".btn-delete-meal").getAttribute("data-idx"));
                const removed = state.dailyLog.meals.splice(idx, 1)[0];
                state.dailyLog.nutrition.calories -= removed.calories;
                state.dailyLog.nutrition.protein -= removed.protein;
                state.dailyLog.nutrition.carbs -= removed.carbs;
                state.dailyLog.nutrition.fat -= removed.fat;
                await saveDailyLog();
                renderDashboard();
                renderNutrition();
            });
        });
    }
    updateWaterUI();
}

// 10. Water Tracker
function initWaterControls() {
    document.getElementById("btn-water-plus").addEventListener("click", async () => {
        state.dailyLog.nutrition.water += 0.25;
        await saveDailyLog();
        renderDashboard();
        updateWaterUI();
    });
    document.getElementById("btn-water-minus").addEventListener("click", async () => {
        if (state.dailyLog.nutrition.water >= 0.25) {
            state.dailyLog.nutrition.water -= 0.25;
            await saveDailyLog();
            renderDashboard();
            updateWaterUI();
        }
    });
}

function updateWaterUI() {
    if (!state.dailyLog) return;
    const log = state.dailyLog;
    const target = state.profile ? state.profile.targets.water : 3.0;
    const waterL = log.nutrition.water || 0;
    document.getElementById("water-liters-display").textContent = `${waterL.toFixed(2)} L`;
    document.getElementById("water-target-display").textContent = target.toFixed(1);
    const fillPercent = Math.min(100, (waterL / target) * 100);
    document.getElementById("water-wave").style.height = `${fillPercent}%`;
}

// 11. Conversational Recovery
function initRecoveryForm() {
    const form = document.getElementById("recovery-form");
    const sleepInput = document.getElementById("rec-sleep");
    const sleepDisplay = document.getElementById("rec-sleep-val-display");

    sleepInput.addEventListener("input", (e) => {
        sleepDisplay.textContent = `${parseFloat(e.target.value).toFixed(1)} Saat`;
    });

    // Button selectors
    const wakeFeelingSelector = document.getElementById("wake-feeling-selector");
    wakeFeelingSelector.addEventListener("click", (e) => {
        const btn = e.target.closest(".select-btn");
        if (btn) {
            wakeFeelingSelector.querySelectorAll(".select-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.dailyLog.recovery.wake_feeling = parseInt(btn.getAttribute("data-val"));
        }
    });

    const focusFeelingSelector = document.getElementById("focus-feeling-selector");
    focusFeelingSelector.addEventListener("click", (e) => {
        const btn = e.target.closest(".select-btn");
        if (btn) {
            focusFeelingSelector.querySelectorAll(".select-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.dailyLog.recovery.focus_feeling = parseInt(btn.getAttribute("data-val"));
        }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        state.dailyLog.recovery.sleep_hours = parseFloat(sleepInput.value);

        const activeDoms = [];
        document.querySelectorAll(".doms-btn.active").forEach(btn => {
            activeDoms.push(btn.getAttribute("data-muscle"));
        });
        state.dailyLog.recovery.doms = activeDoms;

        await saveDailyLog();
        renderDashboard();
        alert("Durum verileri başarıyla kaydedildi!");
    });
}

function initDomsSelector() {
    document.getElementById("doms-buttons-container").addEventListener("click", (e) => {
        if (e.target.classList.contains("doms-btn")) {
            e.target.classList.toggle("active");
        }
    });
}

function renderRecovery() {
    if (!state.dailyLog) return;
    const rec = state.dailyLog.recovery;

    document.getElementById("rec-sleep").value = rec.sleep_hours || 8;
    document.getElementById("rec-sleep-val-display").textContent = `${(rec.sleep_hours || 8).toFixed(1)} Saat`;

    // Set active button for wake feeling
    const wakeVal = rec.wake_feeling || 3;
    const wakeFeelingSelector = document.getElementById("wake-feeling-selector");
    wakeFeelingSelector.querySelectorAll(".select-btn").forEach(btn => {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-val")) === wakeVal) btn.classList.add("active");
    });

    // Set active button for focus
    const focusVal = rec.focus_feeling || 3;
    const focusFeelingSelector = document.getElementById("focus-feeling-selector");
    focusFeelingSelector.querySelectorAll(".select-btn").forEach(btn => {
        btn.classList.remove("active");
        if (parseInt(btn.getAttribute("data-val")) === focusVal) btn.classList.add("active");
    });

    // DOMS
    document.querySelectorAll(".doms-btn").forEach(btn => {
        btn.classList.remove("active");
        if (rec.doms && rec.doms.includes(btn.getAttribute("data-muscle"))) {
            btn.classList.add("active");
        }
    });
}

// 12. Daily Routine Timeline Planner
function initRoutineControls() {
    const addBtn = document.getElementById("btn-add-routine-item");
    const modal = document.getElementById("routine-modal");
    const closeBtn = document.getElementById("btn-close-routine-modal");
    const saveBtn = document.getElementById("btn-save-routine-modal");

    addBtn.addEventListener("click", () => {
        document.getElementById("routine-time-input").value = "";
        document.getElementById("routine-title-input").value = "";
        modal.classList.remove("hidden");
    });
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));

    saveBtn.addEventListener("click", async () => {
        const time = document.getElementById("routine-time-input").value.trim();
        const title = document.getElementById("routine-title-input").value.trim();
        if (time && title) {
            state.dailyLog.routine.push({ time, title, completed: false });
            // Saate göre sırala
            state.dailyLog.routine.sort((a, b) => a.time.localeCompare(b.time));
            await saveDailyLog();
            renderRoutine();
            modal.classList.add("hidden");
        }
    });

    document.getElementById("btn-load-default-routine").addEventListener("click", async () => {
        if (state.profile && state.profile.routineTemplate && state.profile.routineTemplate.length > 0) {
            state.dailyLog.routine = JSON.parse(JSON.stringify(state.profile.routineTemplate));
        } else {
            state.dailyLog.routine = [
                { time: "08:00", title: "Uyanış, Hidrasyon & Esnetme", completed: false },
                { time: "08:30", title: "Kahvaltı (Protein Yoğunluklu)", completed: false },
                { time: "09:00", title: "Yazılım / Çalışma (Odaklanma Bloğu 1)", completed: false },
                { time: "13:00", title: "Öğle Yemeği & Dinlenme", completed: false },
                { time: "14:00", title: "Hafif Çalışma / Toplantılar (Odaklanma Bloğu 2)", completed: false },
                { time: "17:30", title: "Pre-Workout Öğünü & Hazırlık", completed: false },
                { time: "18:00", title: "Antrenman Seansı", completed: false },
                { time: "20:00", title: "Post-Workout Akşam Yemeği", completed: false },
                { time: "21:00", title: "Kitap Okuma / Kişisel Gelişim", completed: false },
                { time: "23:00", title: "Uyku Hazırlığı", completed: false }
            ];
        }
        await saveDailyLog();
        renderRoutine();
    });

    // AI Routine Generator
    document.getElementById("btn-submit-ai-routine").addEventListener("click", async () => {
        const promptInput = document.getElementById("routine-prompt-input");
        const promptText = promptInput.value.trim();
        if (!promptText) return;

        const apiKey = state.profile ? state.profile.apiKey : "";
        if (!apiKey) {
            alert("AI ile plan oluşturmak için Gemini API anahtarınızı girin.");
            return;
        }

        const btn = document.getElementById("btn-submit-ai-routine");
        const originalText = btn.textContent;
        btn.textContent = "AI Planı Hazırlıyor...";
        btn.disabled = true;

        try {
            const prompt = `
Aşağıdaki kullanıcının gününü saat saat planlayan şık bir günlük rutin oluştur.
Kullanıcı Hedefleri: ${promptText}
Kullanıcı Profil Verileri:
- Kilo: ${state.profile.weight} kg, Hedef Kilo: ${state.profile.targetWeight} kg
- Günlük Kalori Hedefi: ${state.profile.targets.calories} kcal
- Hedeflenen Öğün Sayısı: ${state.profile.targets.mealsCount || 3}

Lütfen tamamen aşağıdaki formatta bir JSON dizisi (Array) döndür. Başka yazı ekleme:
[
  { "time": "08:00", "title": "Uyanış ve Kahve", "completed": false },
  { "time": "09:00", "title": "Yazılım Çalışması", "completed": false }
]
`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });

            if (response.ok) {
                const result = await response.json();
                const text = result.candidates[0].content.parts[0].text;
                const items = parseGeminiJSON(text);

                state.dailyLog.routine = items.sort((a, b) => a.time.localeCompare(b.time));
                await saveDailyLog();
                renderRoutine();
                promptInput.value = "";
                alert("Günlük zaman planı AI Koç tarafından oluşturuldu!");
            }
        } catch (e) {
            alert("Rutin üretilemedi: " + e.message);
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    document.getElementById("btn-ai-generate-routine").addEventListener("click", () => {
        // Switch to routine tab input
        document.getElementById("routine-prompt-input").focus();
    });
}

function renderRoutine() {
    const list = document.getElementById("routine-timeline-list");
    const emptyState = document.getElementById("routine-empty-state");

    if (!state.dailyLog || !state.dailyLog.routine || state.dailyLog.routine.length === 0) {
        emptyState.classList.remove("hidden");
        list.innerHTML = "";
        return;
    }

    emptyState.classList.add("hidden");
    list.innerHTML = "";

    state.dailyLog.routine.forEach((item, idx) => {
        const itemEl = document.createElement("div");
        itemEl.className = `routine-item ${item.completed ? 'completed' : ''} fade-in`;
        itemEl.innerHTML = `
            <div class="routine-details">
                <span class="routine-time">${item.time}</span>
                <span class="routine-text">${item.title}</span>
            </div>
            <div class="routine-actions">
                <button class="btn btn-secondary btn-sm btn-toggle-routine" data-idx="${idx}">
                    ${item.completed ? '<i class="fa-solid fa-rotate-left"></i>' : '<i class="fa-solid fa-check"></i> Yap'}
                </button>
                <button class="btn-icon btn-delete-routine" data-idx="${idx}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
        list.appendChild(itemEl);
    });

    // Bind Toggle & Delete
    document.querySelectorAll(".btn-toggle-routine").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const idx = parseInt(btn.getAttribute("data-idx"));
            state.dailyLog.routine[idx].completed = !state.dailyLog.routine[idx].completed;
            await saveDailyLog();
            renderRoutine();
        });
    });

    document.querySelectorAll(".btn-delete-routine").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const idx = parseInt(btn.getAttribute("data-idx"));
            state.dailyLog.routine.splice(idx, 1);
            await saveDailyLog();
            renderRoutine();
        });
    });
}

// 13. Settings Update
function initSettingsForm() {
    const form = document.getElementById("settings-form");
    const toggleKey = document.getElementById("btn-toggle-key-visibility");
    const apiKeyInput = document.getElementById("setting-api-key");

    toggleKey.addEventListener("click", () => {
        const type = apiKeyInput.type === "password" ? "text" : "password";
        apiKeyInput.type = type;
        toggleKey.innerHTML = type === "password" ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        state.profile.name = document.getElementById("set-name").value;
        state.profile.gender = document.getElementById("set-gender").value;
        state.profile.tone = document.getElementById("set-tone").value;
        state.profile.age = parseInt(document.getElementById("set-age").value);
        state.profile.height = parseInt(document.getElementById("set-height").value);
        state.profile.targetWeight = parseFloat(document.getElementById("set-target-weight").value);
        state.profile.activity = document.getElementById("set-activity").value;
        state.profile.goalPace = document.getElementById("set-goal-pace").value;
        state.profile.apiKey = apiKeyInput.value.trim();

        state.profile.city = document.getElementById("set-city").value || "Istanbul";
        state.profile.sleepTime = document.getElementById("set-sleep-time").value || "23:00";
        state.profile.privacy = document.getElementById("set-privacy").value || "public";

        state.profile.targets = calculateNutritionTargets(state.profile);

        try {
            const response = await fetch(apiURL("/api/profile"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(state.profile)
            });
            if (response.ok) {
                updateUserInfoUI();
                renderDashboard();
                alert("Ayarlar başarıyla güncellendi!");
            }
        } catch (err) {
            alert("Hata: " + err);
        }
    });
}

// 14. AI Chat Controls & System Context Tones
function initChatControls() {
    const sendBtn = document.getElementById("btn-send-message");
    const chatInput = document.getElementById("chat-input");
    const reportBtn = document.getElementById("btn-generate-report");
    const clearBtn = document.getElementById("btn-clear-chat");

    sendBtn.addEventListener("click", handleUserMessage);
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") handleUserMessage();
    });
    reportBtn.addEventListener("click", generateWeeklyReport);
    if (clearBtn) {
        clearBtn.addEventListener("click", async () => {
            if (confirm("Bugünkü sohbet geçmişi silinsin mi?")) {
                await fetch(apiURL(`/api/chat?chat_date=${state.currentDate}`), { method: "DELETE" });
                document.getElementById("chat-messages-container").innerHTML = "";
                updateWelcomeMessage();
            }
        });
    }

    // Geçmiş mesajları yükle
    loadChatHistory();
}

async function loadChatHistory() {
    try {
        const container = document.getElementById("chat-messages-container");
        if (container) {
            container.innerHTML = "";
            updateWelcomeMessage();
        }
        const res = await fetch(apiURL(`/api/chat?chat_date=${state.currentDate}`));
        if (!res.ok) return;
        const history = await res.json();
        if (history.length > 0) {
            history.forEach(msg => appendMessage(msg.sender, msg.message, false));
        }
    } catch (e) {
        console.error("Chat geçmişi yüklenemedi:", e);
    }
}

function appendMessage(sender, text, saveToDb = true) {
    const container = document.getElementById("chat-messages-container");
    const msg = document.createElement("div");
    msg.className = `message ${sender} fade-in`;

    const avatarIcon = sender === "ai" ? "fa-user-astronaut" : "fa-user";
    msg.innerHTML = `
        <div class="msg-avatar"><i class="fa-solid ${avatarIcon}"></i></div>
        <div class="msg-text">${text.replace(/\n/g, "<br>")}</div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;

    // SQLite'a kaydet
    if (saveToDb && state.profile) {
        fetch(apiURL("/api/chat"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender, message: text, date: state.currentDate })
        }).catch(() => { });
    }
}

async function handleUserMessage() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    input.value = "";
    appendMessage("user", text);

    appendMessage("ai", "Düşünüyorum...", false);
    const messages = document.getElementById("chat-messages-container").children;
    const thinkingMessage = messages[messages.length - 1];

    const responseText = await getAICoachResponse(text);
    thinkingMessage.remove();
    appendMessage("ai", responseText);
}

async function getAICoachResponse(prompt) {
    const apiKey = state.profile ? state.profile.apiKey : "";
    if (!apiKey) {
        return "Yapay zeka koçu ile doğrudan sohbet edebilmek için lütfen 'Ayarlar' sekmesine gidip geçerli bir Gemini API Key kaydedin.";
    }

    try {
        const tone = state.profile.tone || "brom";
        let tonePrompt = "";

        if (tone === "brom") {
            tonePrompt = `
Kullanıcı samimi erkek hitap tarzı 'Brom / Kral' seçti. Hitap ederken kesinlikle 'brom', 'kral', 'kardeşim', 'kralım', 'şampiyon', 'dostum' kelimelerini kullan. Bir spor salonu abisi/koçu gibi samimi, motive edici, hafif espri yapan ama disiplini elden bırakmayan enerjik bir tarzda konuş.
`;
        } else if (tone === "champ") {
            tonePrompt = `
Kullanıcı samimi kadın hitap tarzı 'Şampiyon / Kraliçe' seçti. Hitap ederken 'kraliçe', 'şampiyon', 'kızım', 'canım', 'dostum' hitaplarını kullan. Çok samimi, sıcak, destekleyici, motive edici ve enerjik bir antrenör abla/koç gibi konuş.
`;
        } else {
            tonePrompt = `
Kullanıcı profesyonel/resmi koçluk tarzı seçti. Profesyonel, ciddi, tamamen bilimsel verilere dayanan, mesafeli ve kibar bir dille hitap et.
`;
        }

        const wakeFeelingTexts = ["Yorgun", "Uykusuz", "Normal", "Zinde"];
        const focusFeelingTexts = ["Dağınık", "Yorgun", "Normal", "Odaklı"];

        const toneMap = {
            brom: "Samimi, kısa, brom/kral hitapı.",
            champ: "Samimi, sıcak, şampiyon/kralıçe hitapı.",
            formal: "Profesyonel, kibar, kısa."
        };
        const toneInstr = toneMap[tone] || toneMap.formal;

        const context = `Koçsun. ${toneInstr}
Kullanıcı: ${state.profile.name}, ${state.profile.age} yaş, ${state.profile.weight}kg (hedef ${state.profile.targetWeight}kg)
Kalori hedefi: ${state.profile.targets.calories} kcal | P:${state.profile.targets.protein}g K:${state.profile.targets.carbs}g Y:${state.profile.targets.fat}g
Bugün: Kalori ${state.dailyLog.nutrition.calories} kcal, Su ${state.dailyLog.nutrition.water}L, Antrenman: ${state.dailyLog.workout ? 'Yapıldı' : 'Yapılmadı'}, Uyku: ${state.dailyLog.recovery.sleep_hours}s, Durum: ${wakeFeelingTexts[(state.dailyLog.recovery.wake_feeling || 3) - 1]}

Soru: "${prompt}"

Cevap kurallari:
- Maksimum 3-4 cümle
- Varsa somut rakam ver (kcal, gram)
- Madde işareti kullanırsan sadece 2-3 madde
- Uzun paragraf yazma
- Türkçe yaz
`;


        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: context }] }] })
        });

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            updateDashboardCoachTip(text);
            return text;
        } else {
            return "Gemini API ile bağlantı kurulamadı. API anahtarını kontrol edebilir misin kral?";
        }
    } catch (e) {
        return "Bağlantı hatası. Sunucu veya internet bağlantını kontrol et dostum.";
    }
}

function updateDashboardCoachTip(text) {
    const cleanText = text.length > 200 ? text.substring(0, 200) + "..." : text;
    document.getElementById("dashboard-coach-tip").textContent = cleanText;
}

// Generate weekly report — BUG FIX: Gerçek takvim günleri kullanılıyor
async function generateWeeklyReport() {
    const apiKey = state.profile ? state.profile.apiKey : "";
    if (!apiKey) {
        alert("API Anahtarı bulunamadı. Lütfen Ayarlar sekmesinden Gemini API anahtarınızı girin.");
        return;
    }

    appendMessage("ai", "Haftalık gelişim verilerini okuyorum, bekle biraz...");
    const messages = document.getElementById("chat-messages-container").children;
    const thinkingMessage = messages[messages.length - 1];

    try {
        // BUG FIX: Son 7 log dosyası değil, son 7 TAKVİM günü
        const today = new Date();
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            last7Days.push(getLocalDateString(d));
        }

        let logsSummary = "";
        for (const dayStr of last7Days) {
            try {
                const logRes = await fetch(apiURL(`/api/logs?date=${dayStr}`));
                if (logRes.ok) {
                    const log = await logRes.json();
                    logsSummary += `
Tarih: ${dayStr}
- Kilo: ${log.weight ? log.weight + " kg" : "Girilmedi"}
- Kalori: ${log.nutrition.calories} kcal (P:${log.nutrition.protein}g)
- Su: ${log.nutrition.water} L
- Antrenman: ${log.workout ? "Yapıldı" : "Yapılmadı"}
- Uyku: ${log.recovery.sleep_hours} saat, Uyanış: ${log.recovery.wake_feeling || 3}/4, Odak: ${log.recovery.focus_feeling || 3}/4
`;
                }
            } catch (e) { /* Boş gün */ }
        }


        const prompt = `
Sen EmreOuzoun AI Coach'sun. Kullanıcının son 7 güne ait verilerini analiz ederek haftalık gelişim ve koç raporu hazırla.
Kullanıcıya 'kral/brom' veya 'şampiyon' tarzında son derece samimi ve cesaretlendirici bir dille hitap et.

Kullanıcı Profili:
- İsim: ${state.profile.name}
- Güncel Kilo: ${state.profile.weight} kg, Hedef Kilo: ${state.profile.targetWeight} kg
- Hedef Günlük Kalori: ${state.profile.targets.calories} kcal
- Hitap Tarzı: ${state.profile.tone || 'brom'}

Son 7 Günlük Log Özetleri:
${logsSummary}

Bu verileri incele ve şu başlıkları içeren şık, markdown formatında bir analiz yap:
1. **Kilo & Fiziksel Durum Analizi:** Kilo stabil mi, hedefe göre düşüyor/artıyor mu?
2. **Beslenme & Su Tutarlılığı:** Kalori ve su hedeflerine ne kadar uyulmuş?
3. **Antrenman & Yenilenme:** Antrenman sıklığı nasıl, uyku ve enerji seviyeleri yeterli mi? DOMS durumu toparlanmayı etkilemiş mi?
4. **Koçun Tavsiyesi & Önümüzdeki Hafta Planı:** Gelecek hafta için kalori artışı/azalışı, antrenman sıklığı veya dinlenme tavsiyesi.
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        thinkingMessage.remove();

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            appendMessage("ai", `<h3>📊 HAFTALIK KOÇ RAPORU</h3>\n\n${text}`);
        } else {
            appendMessage("ai", "Rapor oluşturulurken hata oluştu. Gemini API yanıt vermedi.");
        }
    } catch (e) {
        thinkingMessage.remove();
        appendMessage("ai", `Veriler çekilirken bir hata oluştu: ${e.message}`);
    }
}

// 15. Active Workout Session Manager
let sessionState = {
    active: false,
    workout: null,
    exIdx: 0,
    setIdx: 0,
    timer: null,
    timeLeft: 0,
    totalTime: 90
};

function initWorkoutSession() {
    const startBtn = document.getElementById("btn-start-workout-session");
    const cancelBtn = document.getElementById("btn-cancel-session");
    const submitBtn = document.getElementById("btn-submit-session-set");
    const skipTimerBtn = document.getElementById("btn-skip-timer");
    const prevStepBtn = document.getElementById("btn-prev-session-step");
    const nextStepBtn = document.getElementById("btn-next-session-step");
    const rpeInput = document.getElementById("session-rpe-input");
    const rpeDisplay = document.getElementById("session-rpe-display");

    if (rpeInput && rpeDisplay) {
        const rirTexts = {
            "0": "Tam Tükeniş (Tükenişe 0 Tekrar) 💥",
            "1": "Tükenişe 1 Tekrar Kala 🔥",
            "2": "Tükenişe 2 Tekrar Kala 👍",
            "3": "Tükenişe 3 Tekrar Kala 😐",
            "4": "Tükenişe 4+ Tekrar (Isınma) ⚡"
        };
        rpeInput.addEventListener("input", (e) => {
            const val = e.target.value;
            const parsedRec = parseInt(rpeInput.dataset.recommended);
            const recVal = Number.isNaN(parsedRec) ? 2 : parsedRec;
            const recText = recVal === 0 ? "Tam Tükeniş" : `Tükenişe ${recVal} tekrar kala`;
            rpeDisplay.innerHTML = `${rirTexts[val]} <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:normal; display:block; text-align:right;">Önerilen: ${recText}</span>`;
        });
    }

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            if (!state.dailyLog.workout || state.dailyLog.workout.exercises.length === 0) {
                alert("Lütfen önce antrenman programınıza egzersiz ekleyin kral!");
                return;
            }

            sessionState.workout = JSON.parse(JSON.stringify(state.dailyLog.workout));
            sessionState.active = true;
            sessionState.exIdx = 0;
            sessionState.setIdx = 0;

            document.getElementById("workout-session-overlay").classList.remove("hidden");
            document.getElementById("session-input-panel").classList.remove("hidden");
            document.getElementById("session-timer-panel").classList.add("hidden");

            stopSessionTimer();
            renderSessionStep();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (confirm("Antrenman seansından çıkmak istiyor musun kral? Verilerin kaydedilmeyecektir.")) {
                document.getElementById("workout-session-overlay").classList.add("hidden");
                sessionState.active = false;
                stopSessionTimer();
            }
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener("click", () => {
            saveSessionSetInput();
            startSessionTimer();
        });
    }

    if (skipTimerBtn) {
        skipTimerBtn.addEventListener("click", () => {
            stopSessionTimer();
            advanceSessionStep();
        });
    }

    if (prevStepBtn) {
        prevStepBtn.addEventListener("click", () => {
            regressSessionStep();
        });
    }

    if (nextStepBtn) {
        nextStepBtn.addEventListener("click", () => {
            stopSessionTimer();
            advanceSessionStep();
        });
    }
}

async function renderSessionStep() {
    if (!sessionState.active || !sessionState.workout) return;

    const w = sessionState.workout;
    const exIdx = sessionState.exIdx;
    const setIdx = sessionState.setIdx;

    if (exIdx >= w.exercises.length) {
        await finishWorkoutSession();
        return;
    }

    const ex = w.exercises[exIdx];
    const set = ex.sets[setIdx];

    if (!set) {
        sessionState.setIdx = 0;
        sessionState.exIdx++;
        renderSessionStep();
        return;
    }

    document.getElementById("session-ex-progress").textContent = `Egzersiz ${exIdx + 1} / ${w.exercises.length}`;
    document.getElementById("session-set-progress").textContent = `${ex.name} - Set ${setIdx + 1} / ${ex.sets.length}`;
    document.getElementById("session-exercise-name").textContent = ex.name;

    document.getElementById("session-target-desc").innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Hedef hesaplanıyor...`;

    // Set-specific target RIR determination
    let recommendedRIR = 2; // Default 2 RIR for Set 1
    let rirAdvice = "";
    if (setIdx === 0) {
        recommendedRIR = 2;
        rirAdvice = "<strong>1. Set Önerisi:</strong> Isınma sonrası hazırlık, tükenişe 2 tekrar kala bırak (RIR 2). Gücünü koru!";
    } else if (setIdx === 1) {
        recommendedRIR = 1;
        rirAdvice = "<strong>2. Set Önerisi:</strong> Yoğunluğu arttır, tükenişe 1 tekrar kala bırak (RIR 1). Hissiyat artsın!";
    } else {
        recommendedRIR = 0;
        rirAdvice = "<strong>Son Set Önerisi:</strong> MAKSİMUM TÜKENİŞ! Tükenene kadar zorla (RIR 0). Son güçle savaşıyoruz! 🔥";
    }

    try {
        const listRes = await fetch(apiURL("/api/logs/list"));
        if (listRes.ok) {
            const files = await listRes.json();
            const pastDates = files.filter(f => f < state.currentDate).sort((a, b) => new Date(b) - new Date(a));

            let prevData = null;
            for (const date of pastDates) {
                const logRes = await fetch(apiURL(`/api/logs?date=${date}`));
                if (logRes.ok) {
                    const log = await logRes.json();
                    if (log.workout && log.workout.exercises) {
                        const oldEx = log.workout.exercises.find(o => o.name === ex.name);
                        if (oldEx && oldEx.sets && oldEx.sets.length > 0) {
                            prevData = oldEx.sets.reduce((max, s) => (s.kg > max.kg) ? s : max, oldEx.sets[0]);
                            prevData.date = date;
                            break;
                        }
                    }
                }
            }

            if (prevData) {
                const prevKg = prevData.kg !== undefined ? prevData.kg : (prevData.weight || 0);
                let targetWeight = prevKg;
                let targetReps = prevData.reps;
                let prevRir = prevData.rir !== undefined ? prevData.rir : 1;

                // RIR progression calculations based on set index
                if (recommendedRIR === 2) {
                    // Set 1: target RIR 2
                    if (prevRir === 1) targetReps = Math.max(3, prevData.reps - 1);
                    else if (prevRir === 0) targetReps = Math.max(3, prevData.reps - 2);
                } else if (recommendedRIR === 1) {
                    // Set 2: target RIR 1
                    if (prevRir === 0) targetReps = Math.max(3, prevData.reps - 1);
                } else {
                    // Last Set: target RIR 0 (Tükeniş!)
                    if (prevRir >= 1) {
                        targetReps = prevData.reps + 1; // +1 rep for progressive overload on failure
                    }
                }

                document.getElementById("session-target-desc").innerHTML = `
                    Geçen antrenmandaki en iyi set: ${prevKg}kg x ${prevData.reps} (RIR ${prevRir})<br>
                    <strong>Bugünkü Set Hedefi:</strong> ${targetWeight} kg x ${targetReps} tekrar (RIR ${recommendedRIR})<br>
                    <span style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-top:6px;">💡 ${rirAdvice}</span>
                `;

                document.getElementById("session-kg-input").value = targetWeight;
                document.getElementById("session-reps-input").value = targetReps;
            } else {
                document.getElementById("session-target-desc").innerHTML = `
                    Geçmiş veri yok. Güvenli bir ağırlıkla başla.<br>
                    <span style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-top:6px;">💡 ${rirAdvice}</span>
                `;
                document.getElementById("session-kg-input").value = set.kg || 20;
                document.getElementById("session-reps-input").value = set.reps || 10;
            }
        }
    } catch (e) {
        document.getElementById("session-target-desc").textContent = `Hedef belirlenemedi. Formu doldurarak başla kral.`;
    }

    const rpeInput = document.getElementById("session-rpe-input");
    rpeInput.dataset.recommended = recommendedRIR;
    rpeInput.value = recommendedRIR;

    const rirTexts = {
        "0": "Tam Tükeniş (Tükenişe 0 Tekrar) 💥",
        "1": "Tükenişe 1 Tekrar Kala 🔥",
        "2": "Tükenişe 2 Tekrar Kala 👍",
        "3": "Tükenişe 3 Tekrar Kala 😐",
        "4": "Tükenişe 4+ Tekrar (Isınma) ⚡"
    };
    const recText = recommendedRIR === 0 ? "Tam Tükeniş" : `Tükenişe ${recommendedRIR} tekrar kala`;
    document.getElementById("session-rpe-display").innerHTML = `${rirTexts[recommendedRIR]} <span style="font-size:0.75rem; color:var(--text-secondary); font-weight:normal; display:block; text-align:right;">Önerilen: ${recText}</span>`;
}

function saveSessionSetInput() {
    const w = sessionState.workout;
    const ex = w.exercises[sessionState.exIdx];
    const set = ex.sets[sessionState.setIdx];

    const kg = parseFloat(document.getElementById("session-kg-input").value) || 0;
    const reps = parseInt(document.getElementById("session-reps-input").value) || 0;
    const parsedRir = parseInt(document.getElementById("session-rpe-input").value);
    const rir = Number.isNaN(parsedRir) ? 2 : parsedRir;

    set.kg = kg;
    set.reps = reps;
    set.rir = rir;
}

function startSessionTimer() {
    document.getElementById("session-input-panel").classList.add("hidden");
    document.getElementById("session-timer-panel").classList.remove("hidden");

    const exName = sessionState.workout.exercises[sessionState.exIdx].name.toLowerCase();
    const isHeavy = exName.includes("squat") || exName.includes("bench") || exName.includes("deadlift") || exName.includes("press");
    sessionState.totalTime = isHeavy ? 90 : 60;
    sessionState.timeLeft = sessionState.totalTime;

    const display = document.getElementById("session-timer-display");
    const bar = document.getElementById("session-timer-bar");

    display.textContent = sessionState.timeLeft;
    bar.style.width = "100%";

    stopSessionTimer();

    sessionState.timer = setInterval(() => {
        sessionState.timeLeft--;
        display.textContent = sessionState.timeLeft;

        const pct = (sessionState.timeLeft / sessionState.totalTime) * 100;
        bar.style.width = `${pct}%`;

        if (sessionState.timeLeft <= 0) {
            stopSessionTimer();
            advanceSessionStep();
        }
    }, 1000);
}

function stopSessionTimer() {
    if (sessionState.timer) {
        clearInterval(sessionState.timer);
        sessionState.timer = null;
    }
}

function advanceSessionStep() {
    const w = sessionState.workout;
    sessionState.setIdx++;

    if (sessionState.setIdx >= w.exercises[sessionState.exIdx].sets.length) {
        sessionState.setIdx = 0;
        sessionState.exIdx++;
    }

    document.getElementById("session-input-panel").classList.remove("hidden");
    document.getElementById("session-timer-panel").classList.add("hidden");

    renderSessionStep();
}

function regressSessionStep() {
    stopSessionTimer();

    if (sessionState.setIdx > 0) {
        sessionState.setIdx--;
    } else if (sessionState.exIdx > 0) {
        sessionState.exIdx--;
        sessionState.setIdx = sessionState.workout.exercises[sessionState.exIdx].sets.length - 1;
    } else {
        alert("Zaten ilk egzersizin ilk setindesin kral!");
        return;
    }

    document.getElementById("session-input-panel").classList.remove("hidden");
    document.getElementById("session-timer-panel").classList.add("hidden");
    renderSessionStep();
}

async function finishWorkoutSession() {
    sessionState.active = false;
    document.getElementById("workout-session-overlay").classList.add("hidden");

    state.dailyLog.workout = sessionState.workout;
    state.dailyLog.workout.completed = true;

    await updatePRsFromWorkout(sessionState.workout);
    await saveDailyLog();
    renderDashboard();
    renderWorkout();
    renderInsights();
    addXP(50, "Antrenman Tamamlandı 🏋️‍♂️");

    alert("Tebrikler kral! Antrenmanı başarıyla bitirdin ve tüm seti kaydettik. Muhteşem iş çıkardın! 💪🔥");
}

// 16. Giriş & Profil Seçimi Oturumu Yönetimi
async function initLoginSession() {
    const loginOverlay = document.getElementById("login-overlay");
    const userSelect = document.getElementById("login-user-select");
    const usernameInput = document.getElementById("login-username-input");
    const usernameGroup = document.getElementById("login-username-group");
    const loginSubmitBtn = document.getElementById("btn-login-submit");

    // Oturumu kapatma
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (confirm("Oturumu kapatmak ve kullanıcı seçim ekranına dönmek istiyor musunuz?")) {
                localStorage.removeItem("active_username");
                state.username = null;
                state.profile = null;
                state.dailyLog = null;
                location.reload();
            }
        });
    }

    // Seçim değişince input alanını göster/gizle
    if (userSelect && usernameGroup) {
        userSelect.addEventListener("change", () => {
            if (userSelect.value === "") {
                usernameGroup.classList.remove("hidden");
            } else {
                usernameGroup.classList.add("hidden");
            }
        });
    }

    // Sistemdeki kayıtlı tüm kullanıcıları listele
    try {
        const res = await fetch("/api/users/list");
        if (res.ok) {
            const users = await res.json();
            userSelect.innerHTML = '<option value="">-- Yeni Kullanıcı Oluştur --</option>';
            users.forEach(u => {
                const opt = document.createElement("option");
                opt.value = u;
                opt.textContent = u === "default" ? "Varsayılan (default)" : u;
                userSelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Kullanıcı listesi alınamadı:", e);
    }

    const storedUser = localStorage.getItem("active_username");
    if (storedUser) {
        state.username = storedUser;
        loginOverlay.classList.add("hidden");
        await checkProfile();
        initSocialTab();
        initClockAndSleepTracker();
    } else {
        loginOverlay.classList.remove("hidden");

        loginSubmitBtn.addEventListener("click", async () => {
            let chosenUser = userSelect.value;
            if (!chosenUser) {
                const typed = usernameInput.value.trim().toLowerCase();
                if (!typed) {
                    alert("Lütfen bir kullanıcı adı girin veya listeden seçin.");
                    return;
                }
                if (!/^[a-zA-Z0-9_]+$/.test(typed)) {
                    alert("Kullanıcı adı sadece harf, rakam ve alt çizgi (_) içerebilir!");
                    return;
                }
                chosenUser = typed;
            }

            localStorage.setItem("active_username", chosenUser);
            state.username = chosenUser;
            loginOverlay.classList.add("hidden");

            // Eğer onboarding inputlarında ad alanı boşsa kullanıcı adını yazalım
            const obNameInput = document.getElementById("ob-name");
            if (obNameInput && !obNameInput.value) {
                obNameInput.value = chosenUser;
            }

            await checkProfile();
            initSocialTab();
            initClockAndSleepTracker();
        });
    }
}

// 17. Sosyal Panel & Liderlik Tablosu
function initSocialTab() {
    const detailModal = document.getElementById("social-user-modal");
    const closeDetailBtn = document.getElementById("btn-close-social-modal");

    if (closeDetailBtn && detailModal) {
        closeDetailBtn.addEventListener("click", () => detailModal.classList.add("hidden"));
    }

    const socialLink = document.querySelector('.nav-link[data-tab="social"]');
    if (socialLink) {
        socialLink.addEventListener("click", async () => {
            await loadSocialLeaderboard();
        });
    }
}

async function loadSocialLeaderboard() {
    const leaderboardBody = document.getElementById("social-leaderboard-body");
    if (!leaderboardBody) return;

    leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Liderlik tablosu yükleniyor...</td></tr>`;

    try {
        const res = await fetch("/api/social/users");
        if (res.ok) {
            const users = await res.json();

            users.forEach(u => {
                u.prs = u.prs || {};
                u.totalPR = (u.prs.squat || 0) + (u.prs.bench_press || 0) + (u.prs.deadlift || 0);
            });
            users.sort((a, b) => b.totalPR - a.totalPR);

            if (users.length === 0) {
                leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--text-muted);">Hiç herkese açık kullanıcı bulunamadı.</td></tr>`;
                return;
            }

            leaderboardBody.innerHTML = "";
            users.forEach(user => {
                const tr = document.createElement("tr");
                tr.style.cursor = "pointer";
                tr.addEventListener("click", () => showSocialUserDetail(user));

                const firstLetter = user.name.charAt(0).toUpperCase();
                const squatVal = user.prs.squat ? `${user.prs.squat} kg` : "-";
                const benchVal = user.prs.bench_press ? `${user.prs.bench_press} kg` : "-";
                const deadliftVal = user.prs.deadlift ? `${user.prs.deadlift} kg` : "-";

                tr.innerHTML = `
                    <td style="padding: 12px 8px;">
                        <div class="social-user-cell">
                            <span class="social-user-avatar">${firstLetter}</span>
                            <div>
                                <strong style="color:var(--text-primary); display:block;">${user.name}</strong>
                                <span style="font-size:0.75rem; color:var(--text-muted);">@${user.username}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 12px 8px; color:var(--text-secondary);">${user.height} cm / ${user.weight} kg</td>
                    <td style="padding: 12px 8px; text-align: center;"><span class="${user.prs.squat ? 'pr-badge' : ''}">${squatVal}</span></td>
                    <td style="padding: 12px 8px; text-align: center;"><span class="${user.prs.bench_press ? 'pr-badge' : ''}">${benchVal}</span></td>
                    <td style="padding: 12px 8px; text-align: center;"><span class="${user.prs.deadlift ? 'pr-badge' : ''}">${deadliftVal}</span></td>
                    <td style="padding: 12px 8px; text-align: center;"><button class="btn btn-secondary btn-sm"><i class="fa-solid fa-eye"></i> İncele</button></td>
                `;
                leaderboardBody.appendChild(tr);
            });
        } else {
            leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--neon-red);">Veriler yüklenirken bir hata oluştu.</td></tr>`;
        }
    } catch (e) {
        leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--neon-red);">Bağlantı hatası: ${e.message}</td></tr>`;
    }
}

function showSocialUserDetail(user) {
    const detailModal = document.getElementById("social-user-modal");
    const titleEl = document.getElementById("social-modal-user-title");
    const statsEl = document.getElementById("social-modal-user-stats");
    const programEl = document.getElementById("social-modal-user-program");

    if (!detailModal || !titleEl || !statsEl || !programEl) return;

    titleEl.innerHTML = `<i class="fa-solid fa-user-astronaut text-neon-purple"></i> ${user.name} (@${user.username})`;
    const genderText = user.gender === "female" ? "Kadın 👩" : "Erkek 👨";
    statsEl.innerHTML = `
        <div style="background:rgba(15,23,42,0.03); padding:10px; border-radius:10px;">
            <span style="font-size:0.75rem; color:var(--text-secondary); display:block;">Fiziksel Bilgi</span>
            <strong>${user.height} cm / ${user.weight} kg</strong>
        </div>
        <div style="background:rgba(15,23,42,0.03); padding:10px; border-radius:10px;">
            <span style="font-size:0.75rem; color:var(--text-secondary); display:block;">Yaş / Cinsiyet</span>
            <strong>${user.age} Yaş - ${genderText}</strong>
        </div>
        <div style="background:rgba(15,23,42,0.03); padding:10px; border-radius:10px;">
            <span style="font-size:0.75rem; color:var(--text-secondary); display:block;">Toplam PR</span>
            <strong>${user.totalPR} kg</strong>
        </div>
    `;

    if (user.workout && user.workout.exercises && user.workout.exercises.length > 0) {
        let html = `<div style="font-weight:700; margin-bottom:8px; color:var(--text-primary); text-align:left;">${user.workout.name || "Aktif Program"}</div>`;
        user.workout.exercises.forEach(ex => {
            const setsStr = ex.sets.map(s => `${s.kg}kg x ${s.reps}`).join(", ");
            html += `<div style="padding:6px 0; border-bottom:1px solid rgba(15,23,42,0.05); text-align:left;"><strong>${ex.name}:</strong> ${setsStr}</div>`;
        });
        programEl.innerHTML = html;
    } else {
        programEl.innerHTML = `<div style="color:var(--text-muted); text-align:center; padding:12px;">Aktif antrenman programı bulunmuyor veya gizli.</div>`;
    }

    detailModal.classList.remove("hidden");
}

// 18. Şehir Saati Takibi & Uyku Kilit Sistemi
let clockTimer = null;

function initClockAndSleepTracker() {
    if (clockTimer) clearInterval(clockTimer);

    // Günü Bitir butonu
    const manualBtn = document.getElementById("btn-end-day-manual");
    if (manualBtn) {
        manualBtn.addEventListener("click", () => {
            if (confirm("Bugünü sonlandırmak ve Günlük Raporunuzu almak istiyor musunuz? Günü bitirdikten sonra o günün verilerini düzenleyemezsiniz.")) {
                triggerDayEnd(false);
            }
        });
    }

    // Rapor kapatma
    const closeRepBtn = document.getElementById("btn-close-report-modal");
    if (closeRepBtn) {
        closeRepBtn.addEventListener("click", () => {
            document.getElementById("daily-report-modal").classList.add("hidden");
        });
    }

    updateCityTime();
    clockTimer = setInterval(updateCityTime, 10000);
}

function updateCityTime() {
    if (!state.profile) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    const clockEl = document.getElementById("header-city-clock");
    if (clockEl) {
        clockEl.textContent = `${state.profile.city || "İstanbul"}: ${timeStr}`;
    }

    if (state.profile.sleepTime && state.dailyLog) {
        const [sleepH, sleepM] = state.profile.sleepTime.split(":").map(Number);
        const currentH = now.getHours();
        const currentM = now.getMinutes();

        const todayStr = getLocalDateString(new Date());
        if (state.currentDate === todayStr && !state.dailyLog.dayClosed && !state.dayManuallyUnlocked) {
            // Eğer uyku saati akşam saatleriyse (18:00 - 23:59) ve saat gelmişse otomatik kapat
            // Gece yarısı sonrası uyku saatlerinde (00:00 - 05:59) gündüz vakti (06:00+) yanlışlıkla tetiklenmesini önle
            const isEveningSleep = sleepH >= 18;
            const isPastSleep = isEveningSleep
                ? (currentH > sleepH || (currentH === sleepH && currentM >= sleepM))
                : (currentH < 6 && (currentH > sleepH || (currentH === sleepH && currentM >= sleepM)));
            if (isPastSleep) {
                console.log("Sleep time reached! Auto closing day.");
                triggerDayEnd(true);
            }
        }
    }
}

async function triggerDayEnd(isAuto = false) {
    if (!state.dailyLog) return;

    state.dailyLog.dayClosed = true;
    await saveDailyLog();

    disableAllInputs();
    await showDailyReport(isAuto);
}

function disableAllInputs() {
    const isClosed = !!(state.dailyLog && state.dailyLog.dayClosed);
    const inputsToDisable = [
        "meal-name", "meal-kcal", "meal-p", "meal-c", "meal-f",
        "ai-food-text-input", "btn-parse-ai-food", "btn-parse-ai-vision", "btn-copy-yesterday-meals",
        "today-weight-input", "btn-save-weight-modal",
        "btn-add-exercise", "btn-ai-generate-workout", "btn-load-hypertrophy", "btn-load-strength",
        "btn-save-workout", "btn-start-workout-session",
        "routine-prompt-input", "btn-submit-ai-routine", "btn-ai-generate-routine", "btn-add-routine-item",
        "btn-submit-session-set"
    ];
    inputsToDisable.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = isClosed;
    });

    document.querySelectorAll(".btn-quick, .btn-toggle-routine, .btn-delete-routine, .btn-delete-meal, .btn-use-favorite").forEach(btn => {
        btn.disabled = isClosed;
    });

    document.querySelectorAll(".sets-table input").forEach(inp => {
        inp.disabled = isClosed;
    });
    document.querySelectorAll(".btn-add-set, .btn-delete-set, .btn-delete-exercise").forEach(btn => {
        btn.disabled = isClosed;
    });

    let closedNotice = document.getElementById("dashboard-closed-notice");
    if (isClosed) {
        if (!closedNotice) {
            closedNotice = document.createElement("div");
            closedNotice.id = "dashboard-closed-notice";
            closedNotice.className = "glass-card";
            closedNotice.style.background = "rgba(239, 68, 68, 0.05)";
            closedNotice.style.border = "1px solid rgba(239, 68, 68, 0.15)";
            closedNotice.style.color = "var(--neon-red)";
            closedNotice.style.padding = "12px 16px";
            closedNotice.style.borderRadius = "12px";
            closedNotice.style.marginBottom = "20px";
            closedNotice.style.fontWeight = "600";
            closedNotice.style.display = "flex";
            closedNotice.style.alignItems = "center";
            closedNotice.style.justifyContent = "space-between";
            closedNotice.style.gap = "8px";
            closedNotice.innerHTML = `
                <span><i class="fa-solid fa-lock"></i> Bu günün takibi sona erdi. Günlük Raporunuz hazırlandı.</span>
                <div style="display:flex; gap:8px;">
                    <button class="btn btn-secondary btn-sm" id="btn-view-daily-report"><i class="fa-solid fa-file-lines"></i> Raporu Gör</button>
                    <button class="btn btn-secondary btn-sm" id="btn-reopen-day"><i class="fa-solid fa-lock-open"></i> Kilidi Aç</button>
                </div>
            `;

            const dashboardSection = document.getElementById("tab-dashboard");
            if (dashboardSection) {
                dashboardSection.insertBefore(closedNotice, dashboardSection.firstChild);
            }

            document.getElementById("btn-view-daily-report")?.addEventListener("click", () => {
                showDailyReport(false);
            });
            document.getElementById("btn-reopen-day")?.addEventListener("click", async () => {
                state.dailyLog.dayClosed = false;
                state.dayManuallyUnlocked = true;
                await saveDailyLog();
                disableAllInputs();
                showToast("🔓 Günün kilidi açıldı, düzenleme yapabilirsiniz.");
            });
        }
    } else {
        if (closedNotice) closedNotice.remove();
    }
}

async function showDailyReport(isAuto = false) {
    const modal = document.getElementById("daily-report-modal");
    const dateEl = document.getElementById("daily-report-date");
    const kcalEl = document.getElementById("rep-kcal");
    const protEl = document.getElementById("rep-prot");
    const carbEl = document.getElementById("rep-carb");
    const fatEl = document.getElementById("rep-fat");
    const waterEl = document.getElementById("rep-water");
    const routineEl = document.getElementById("rep-routine");
    const workoutListEl = document.getElementById("rep-workout-list");
    const aiCommentaryEl = document.getElementById("rep-ai-commentary");

    if (!modal || !state.dailyLog || !state.profile) return;

    dateEl.textContent = formatDateDisplay(state.dailyLog.date);

    const log = state.dailyLog;
    const t = state.profile.targets;
    kcalEl.textContent = `${log.nutrition.calories || 0} / ${t.calories}`;
    protEl.textContent = `${log.nutrition.protein || 0}g / ${t.protein}g`;
    carbEl.textContent = `${log.nutrition.carbs || 0}g / ${t.carbs}g`;
    fatEl.textContent = `${log.nutrition.fat || 0}g / ${t.fat}g`;

    waterEl.textContent = `${(log.nutrition.water || 0).toFixed(1)} / ${(t.water || 3.0).toFixed(1)} L`;

    const routineItems = log.routine || [];
    const completedCount = routineItems.filter(item => item.completed).length;
    const totalCount = routineItems.length;
    const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 100;
    routineEl.textContent = `${pct}% (${completedCount} / ${totalCount})`;

    if (log.workout && log.workout.exercises && log.workout.exercises.length > 0) {
        let html = `<ul style="padding-left: 14px; margin: 0;">`;
        log.workout.exercises.forEach(ex => {
            const setsStr = ex.sets.map(s => `${s.kg}kg x ${s.reps} (RIR ${s.rir !== undefined ? s.rir : 2})`).join(", ");
            html += `<li style="margin-bottom:4px;"><strong>${ex.name}:</strong> ${setsStr}</li>`;
        });
        html += `</ul>`;
        workoutListEl.innerHTML = html;
    } else {
        workoutListEl.textContent = "Bugün antrenman yapılmadı.";
    }

    modal.classList.remove("hidden");

    aiCommentaryEl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Koçunuz gününü inceliyor, harika bir geri bildirim hazırlıyor... ⚡`;

    const apiKey = state.profile.apiKey;
    if (!apiKey) {
        aiCommentaryEl.textContent = "AI Koç yorumu için lütfen Ayarlar'dan Gemini API Anahtarınızı girin kral!";
        return;
    }

    try {
        const tone = state.profile.tone || "brom";
        let systemPrompt = "";
        if (tone === "brom") {
            systemPrompt = "Sen 'Brom/Kral' hitap tarzını kullanan, çok samimi, motive edici, esprili ve bilgili bir vücut geliştirme ve fitness koçusun. Kullanıcıya 'kral', 'brom', 'dostum' gibi kelimelerle hitap edersin. Erkek kullanıcı tarzıdır.";
        } else if (tone === "champ") {
            systemPrompt = "Sen 'Şampiyon/Kraliçe' hitap tarzını kullanan, enerjik, çok destekleyici, samimi ve motive edici bir kadın fitness koçusun. Kullanıcıya 'şampiyon', 'kraliçem', 'canım' gibi kelimelerle hitap edersin.";
        } else {
            systemPrompt = "Sen profesyonel, kibar ve resmi bir atletik performans koçusun. Sizli bizli konuşur, bilimsel ve kurumsal bir dil kullanırsın.";
        }

        const promptText = `Kısa, net ve yapıcı bir günlük değerlendirme yap.
Kullanıcı: ${state.profile.name} (${state.profile.weight}kg)
Hedefler: Kalori ${t.calories}kcal, Su ${t.water}L
Bugün: Kalori ${log.nutrition.calories}kcal, Su ${log.nutrition.water}L
Antrenman: ${log.workout && log.workout.completed ? "Yapıldı" : "Yapılmadı"}
Uyku: ${log.recovery ? log.recovery.sleep_hours : 0} saat

Format (kısa ve öz, madde madde):
🔥 Övgü: (1 cümleyle neyi iyi yaptı)
⚠️ Uyarı: (varsa eksik nokta, 1 cümle)
🎯 Yarınki Hedef: (1 somut adım)`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\n${promptText}` }] }]
            })
        });

        if (response.ok) {
            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            aiCommentaryEl.innerHTML = text.replace(/\n/g, "<br>");
        } else {
            aiCommentaryEl.textContent = "AI Koç şu an meşgul. Daha sonra tekrar deneyin kral!";
        }
    } catch (e) {
        aiCommentaryEl.textContent = "Yorum üretilirken bir hata oluştu: " + e.message;
    }
}

// ==========================================
// PWA & Canvas Icon Helper Functions
// ==========================================

function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("sw.js")
                .then(reg => console.log("Service Worker registered successfully:", reg.scope))
                .catch(err => console.error("Service Worker registration failed:", err));
        });
    }
}

let deferredPrompt = null;
function initPWAInstall() {
    const installBtn = document.getElementById("pwa-install-btn");
    const headerDlBtn = document.getElementById("header-download-btn");
    const loginDlBtn = document.getElementById("btn-login-download-app");
    const modal = document.getElementById("app-download-modal");
    const closeBtn = document.getElementById("btn-close-download-modal");
    const nativeBanner = document.getElementById("native-pwa-banner");
    const triggerNativeBtn = document.getElementById("btn-trigger-native-pwa");
    const androidGuideBtn = document.getElementById("btn-android-pwa-guide");
    const copyLinkBtn = document.getElementById("btn-copy-download-link");
    const shareLinkInput = document.getElementById("share-download-link-input");

    async function openDownloadModal() {
        if (!modal) return;
        modal.classList.remove("hidden");
        try {
            const res = await fetch("/api/network-info");
            if (res.ok) {
                const info = await res.json();
                if (shareLinkInput && info.download_url) {
                    shareLinkInput.value = info.download_url;
                }
            }
        } catch (e) { }
    }

    installBtn?.addEventListener("click", openDownloadModal);
    headerDlBtn?.addEventListener("click", openDownloadModal);
    loginDlBtn?.addEventListener("click", openDownloadModal);
    closeBtn?.addEventListener("click", () => modal?.classList.add("hidden"));

    window.addEventListener("beforeinstallprompt", (e) => {
        e.preventDefault();
        deferredPrompt = e;
        nativeBanner?.classList.remove("hidden");
    });

    triggerNativeBtn?.addEventListener("click", async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        deferredPrompt = null;
        nativeBanner?.classList.add("hidden");
    });

    androidGuideBtn?.addEventListener("click", async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            return;
        }
        alert("Android Ana Ekrana Kurulum:\n1. 'Android Uygulamasını İndir' butonuna tıklayarak taşınabilir uygulamayı cihazınıza indirin VEYA\n2. Chrome tarayıcınızın sağ üst köşesindeki (⋮) menüsünden 'Uygulamayı Yükle / Ana ekrana ekle' seçeneğine dokunun.");
    });

    copyLinkBtn?.addEventListener("click", () => {
        if (!shareLinkInput) return;
        navigator.clipboard?.writeText(shareLinkInput.value);
        showToast("🔗 İndirme linki panoya kopyalandı!");
    });

    // When running in standalone mode (file://), package and download the current document directly
    document.querySelectorAll(".btn-dl-action").forEach(link => {
        link.addEventListener("click", (e) => {
            if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
                e.preventDefault();
                const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
                const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = link.getAttribute("download") || "AICoaching_Portable_App.html";
                a.click();
                showToast("📥 Uygulama dosyası indirildi!");
            } else {
                showToast("📥 İndirme başlatıldı!");
            }
        });
    });

    androidGuideBtn?.addEventListener("click", async () => {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            await deferredPrompt.userChoice;
            deferredPrompt = null;
            return;
        }
        alert("Android Ana Ekrana Kurulum:\n1. 'Android Uygulamasını İndir' butonuna tıklayarak taşınabilir uygulamayı cihazınıza indirin VEYA\n2. Chrome tarayıcınızın sağ üst köşesindeki (⋮) menüsünden 'Uygulamayı Yükle / Ana ekrana ekle' seçeneğine dokunun.");
    });

    copyLinkBtn?.addEventListener("click", () => {
        if (!shareLinkInput) return;
        navigator.clipboard?.writeText(shareLinkInput.value);
        showToast("🔗 İndirme linki panoya kopyalandı!");
    });

    // When running in standalone mode (file://), package and download the current document directly
    document.querySelectorAll(".btn-dl-action").forEach(link => {
        link.addEventListener("click", (e) => {
            if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
                e.preventDefault();
                const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
                const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = link.getAttribute("download") || "AICoaching_Portable_App.html";
                a.click();
                showToast("📥 Uygulama dosyası indirildi!");
            } else {
                showToast("📥 İndirme başlatıldı!");
            }
        });
    });

    window.addEventListener("appinstalled", () => {
        showToast("🎉 Uygulama cihazınıza başarıyla kuruldu!");
        nativeBanner?.classList.add("hidden");
        deferredPrompt = null;
    });
}

async function checkAndGeneratePWAIcons() {
    if (localStorage.getItem("pwa_icons_generated_v3")) {
        return;
    }

    console.log("Generating PWA icons client-side...");

    function drawDumbbellOnCanvas(canvas, size) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, size, size);

        const scale = size / 512.0;
        const c_x = 256 * scale;
        const c_y = 256 * scale;
        const r = 230 * scale;

        // Background Orange
        ctx.beginPath();
        ctx.arc(c_x, c_y, r, 0, 2 * Math.PI);
        ctx.fillStyle = "#f97316";
        ctx.fill();

        // Inner white circular border
        ctx.beginPath();
        ctx.arc(c_x, c_y, 205 * scale, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = Math.max(1, 6 * scale);
        ctx.stroke();

        // Dumbbell Bar
        const bar_w = 260 * scale;
        const bar_h = 32 * scale;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(c_x - bar_w / 2, c_y - bar_h / 2, bar_w, bar_h);

        // Inner Plates
        const ip_w = 24 * scale;
        const ip_h = 160 * scale;
        ctx.fillRect(c_x - bar_w / 2 - ip_w, c_y - ip_h / 2, ip_w, ip_h);
        ctx.fillRect(c_x + bar_w / 2, c_y - ip_h / 2, ip_w, ip_h);

        // Outer Plates
        const op_w = 32 * scale;
        const op_h = 220 * scale;
        ctx.fillRect(c_x - bar_w / 2 - ip_w - 12 * scale - op_w, c_y - op_h / 2, op_w, op_h);
        ctx.fillRect(c_x + bar_w / 2 + ip_w + 12 * scale, c_y - op_h / 2, op_w, op_h);

        // Grips
        const grip_w = 120 * scale;
        const grip_h = 42 * scale;
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(c_x - grip_w / 2, c_y - grip_h / 2, grip_w, grip_h);
    }

    try {
        const sizes = [192, 512];
        for (const size of sizes) {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            drawDumbbellOnCanvas(canvas, size);

            const dataUrl = canvas.toDataURL("image/png");

            // Post to save icon route
            await fetch(`/api/save-icon?size=${size}`, {
                method: "POST",
                body: dataUrl
            });
        }
        localStorage.setItem("pwa_icons_generated_v3", "true");
        console.log("PWA Icons generated and uploaded successfully!");
    } catch (e) {
        console.error("Error generating/uploading PWA icons:", e);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// YENİ ÖZELLİKLER v2.0
// ══════════════════════════════════════════════════════════════════════════════

// ── Egzersiz Autocomplete ─────────────────────────────────────────────────────
function initExerciseAutocomplete() {
    const input = document.getElementById("exercise-name-input");
    if (!input) return;

    const wrapper = input.closest(".form-group") || input.parentElement;
    const suggBox = document.createElement("div");
    suggBox.id = "exercise-autocomplete";
    suggBox.style.cssText = `
        position:absolute; z-index:9999; background:var(--glass-bg,#1e293b);
        border:1px solid var(--border-color,rgba(255,255,255,0.1)); border-radius:10px;
        max-height:200px; overflow-y:auto; width:100%;
        box-shadow:0 8px 24px rgba(0,0,0,0.25); display:none; top:100%; left:0;
    `;
    wrapper.style.position = "relative";
    wrapper.appendChild(suggBox);

    input.addEventListener("input", () => {
        const val = input.value.trim().toLowerCase();
        suggBox.innerHTML = "";
        if (val.length < 1) { suggBox.style.display = "none"; return; }

        const matches = EXERCISE_LIST.filter(e => e.toLowerCase().includes(val)).slice(0, 8);
        if (matches.length === 0) { suggBox.style.display = "none"; return; }

        matches.forEach(ex => {
            const item = document.createElement("div");
            item.textContent = ex;
            item.style.cssText = "padding:8px 14px; cursor:pointer; font-size:0.875rem; color:var(--text-primary,#f1f5f9); transition:background 0.15s;";
            item.addEventListener("mouseenter", () => item.style.background = "rgba(249,115,22,0.15)");
            item.addEventListener("mouseleave", () => item.style.background = "");
            item.addEventListener("mousedown", (e) => {
                e.preventDefault();
                input.value = ex;
                suggBox.style.display = "none";
            });
            suggBox.appendChild(item);
        });
        suggBox.style.display = "block";
    });

    input.addEventListener("blur", () => setTimeout(() => { suggBox.style.display = "none"; }, 150));
}

// ── Yemek Favorileri ──────────────────────────────────────────────────────────
async function initMealFavorites() {
    await renderMealFavorites();

    document.addEventListener("click", async (e) => {
        const addFavBtn = e.target.closest(".btn-add-to-favorites");
        if (addFavBtn) {
            const idx = parseInt(addFavBtn.getAttribute("data-idx"));
            const meal = state.dailyLog?.meals?.[idx];
            if (!meal) return;
            await fetch(apiURL("/api/favorites"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(meal)
            });
            showToast("⭐ Favorilere eklendi!");
            await renderMealFavorites();
        }

        const useFavBtn = e.target.closest(".btn-use-favorite");
        if (useFavBtn) {
            const name = useFavBtn.getAttribute("data-name");
            const kcal = parseInt(useFavBtn.getAttribute("data-kcal"));
            const protein = parseInt(useFavBtn.getAttribute("data-protein"));
            const carbs = parseInt(useFavBtn.getAttribute("data-carbs"));
            const fat = parseInt(useFavBtn.getAttribute("data-fat"));
            await addMeal(name, kcal, protein, carbs, fat);
            showToast(`✅ ${name} eklendi!`);
        }

        const delFavBtn = e.target.closest(".btn-delete-favorite");
        if (delFavBtn) {
            const favId = delFavBtn.getAttribute("data-id");
            await fetch(apiURL(`/api/favorites/${favId}`), { method: "DELETE" });
            await renderMealFavorites();
        }
    });

    // Dünkü öğünleri kopyala
    const copyYestBtn = document.getElementById("btn-copy-yesterday-meals");
    if (copyYestBtn) {
        copyYestBtn.addEventListener("click", async () => {
            if (!confirm("Dünkü öğünler bugüne kopyalansın mı?")) return;
            try {
                const res = await fetch(apiURL(`/api/logs/copy-yesterday-meals?target_date=${state.currentDate}`));
                if (!res.ok) { showToast("❌ Dünkü veri bulunamadı."); return; }
                const data = await res.json();
                if (!data.meals || data.meals.length === 0) { showToast("❌ Dünkü öğün yok."); return; }

                if (!state.dailyLog.meals) state.dailyLog.meals = [];
                data.meals.forEach(m => {
                    state.dailyLog.meals.push(m);
                    state.dailyLog.nutrition.calories += m.calories || 0;
                    state.dailyLog.nutrition.protein += m.protein || 0;
                    state.dailyLog.nutrition.carbs += m.carbs || 0;
                    state.dailyLog.nutrition.fat += m.fat || 0;
                });
                await saveDailyLog();
                renderDashboard();
                renderNutrition();
                showToast(`✅ ${data.meals.length} öğün ${data.from_date} tarihinden kopyalandı!`);
            } catch (e) {
                showToast("❌ Hata: " + e.message);
            }
        });
    }
}

async function renderMealFavorites() {
    const container = document.getElementById("meal-favorites-list");
    if (!container) return;

    try {
        const res = await fetch(apiURL("/api/favorites"));
        if (!res.ok) return;
        const favorites = await res.json();

        if (favorites.length === 0) {
            container.innerHTML = `<div class="empty-state-sm">Henüz favori yemek yok. Öğünlerdeki ⭐ ile favorilere ekleyebilirsin.</div>`;
            return;
        }

        container.innerHTML = favorites.map(fav => `
            <div class="favorite-item fade-in" style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; border-radius:8px; background:rgba(249,115,22,0.05); margin-bottom:6px; border:1px solid rgba(249,115,22,0.1);">
                <div>
                    <strong style="font-size:0.875rem; color:var(--text-primary);">${fav.name}</strong>
                    <span style="font-size:0.75rem; color:var(--text-secondary); margin-left:8px;">${fav.calories} kcal · P:${fav.protein}g · K:${fav.carbs}g · Y:${fav.fat}g</span>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-primary btn-sm btn-use-favorite"
                        data-id="${fav.id}" data-name="${fav.name}"
                        data-kcal="${fav.calories}" data-protein="${fav.protein}"
                        data-carbs="${fav.carbs}" data-fat="${fav.fat}">
                        <i class="fa-solid fa-plus"></i> Ekle
                    </button>
                    <button class="btn-icon btn-delete-favorite" data-id="${fav.id}">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join("");
    } catch (e) {
        console.error("Favoriler yüklenemedi:", e);
    }
}

// ── Streak Sayacı ─────────────────────────────────────────────────────────────
async function loadAndDisplayStreak() {
    try {
        const res = await fetch(apiURL("/api/stats/streak"));
        if (!res.ok) return;
        const data = await res.json();
        state.streak = data.streak;

        const streakEl = document.getElementById("dashboard-streak");
        if (streakEl) {
            if (data.streak > 0) {
                streakEl.innerHTML = `<i class="fa-solid fa-fire" style="color:var(--neon-orange);"></i> <strong style="color:var(--neon-orange);">${data.streak} Günlük Seri!</strong> <span style="color:var(--text-secondary); font-size:0.75rem;">(Toplam ${data.total_days} gün)</span>`;
            } else {
                streakEl.innerHTML = `<i class="fa-solid fa-fire" style="color:var(--text-muted);"></i> <span style="color:var(--text-muted);">Henüz seri başlatılmadı</span>`;
            }
        }
    } catch (e) {
        console.error("Streak yüklenemedi:", e);
    }
}

// ── Toast Bildirim Sistemi ────────────────────────────────────────────────────
function showToast(message, typeOrDuration = 3000, customDuration = 3000) {
    const existing = document.getElementById("aura-toast");
    if (existing) existing.remove();

    const duration = typeof typeOrDuration === "number" ? typeOrDuration : customDuration;
    const borderColor = typeOrDuration === "error" ? "rgba(239,68,68,0.4)" : "rgba(249,115,22,0.3)";

    const toast = document.createElement("div");
    toast.id = "aura-toast";
    toast.textContent = message;
    toast.style.cssText = `
        position:fixed; bottom:30px; left:50%; transform:translateX(-50%) translateY(0);
        background:rgba(15,23,42,0.95); color:#f1f5f9; padding:12px 24px;
        border-radius:50px; font-size:0.875rem; font-weight:600;
        z-index:99999; box-shadow:0 8px 24px rgba(0,0,0,0.35);
        border:1px solid ${borderColor};
        transition: opacity 0.3s ease;
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ── PR Geçmişi Kaydetme ───────────────────────────────────────────────────────
async function savePRHistory(exercise, weightKg) {
    try {
        await fetch(apiURL("/api/pr-history"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exercise, weight_kg: weightKg, pr_date: state.currentDate })
        });
    } catch (e) {
        console.error("PR geçmişi kaydedilemedi:", e);
    }
}

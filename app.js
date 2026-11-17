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

        if (path === "/api/auth/register" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || "").trim().toLowerCase();
            const pw = bodyData.password || "";
            if (!uname || !/^[a-z0-9_]+$/.test(uname)) return jsonResponse({ error: "Geçerli kullanıcı adı girin." }, 400);
            if (pw.length < 3) return jsonResponse({ error: "Şifre en az 3 karakter olmalı." }, 400);
            if (db.auth[uname]) return jsonResponse({ error: "Bu kullanıcı adı zaten kayıtlı." }, 409);
            db.auth[uname] = { password: pw, avatar_data: bodyData.avatar_data || "", last_seen: new Date().toISOString() };
            saveLocalDB(db);
            return jsonResponse({ status: "ok", username: uname, avatar_data: db.auth[uname].avatar_data });
        }

        if (path === "/api/auth/login" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || "").trim().toLowerCase();
            const pw = bodyData.password || "";
            if (!db.auth[uname] && !db.users[uname]) return jsonResponse({ error: "Kullanıcı bulunamadı. Lütfen önce Kayıt Olun." }, 404);
            if (db.auth[uname] && db.auth[uname].password !== pw) return jsonResponse({ error: "Kullanıcı adı veya şifre hatalı." }, 401);
            if (!db.auth[uname]) db.auth[uname] = { password: pw, avatar_data: "", last_seen: new Date().toISOString() };
            db.auth[uname].last_seen = new Date().toISOString();
            saveLocalDB(db);
            return jsonResponse({ status: "ok", username: uname, avatar_data: db.auth[uname].avatar_data || "" });
        }

        if (path === "/api/auth/avatar" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || user).toLowerCase();
            if (!db.auth[uname]) db.auth[uname] = { password: "", avatar_data: "", last_seen: new Date().toISOString() };
            db.auth[uname].avatar_data = bodyData.avatar_data || "";
            saveLocalDB(db);
            return jsonResponse({ status: "ok", avatar_data: db.auth[uname].avatar_data });
        }

        if (path === "/api/auth/heartbeat" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || user).toLowerCase();
            if (db.auth[uname]) {
                db.auth[uname].last_seen = new Date().toISOString();
                saveLocalDB(db);
            }
            return jsonResponse({ status: "ok" });
        }

        if (path === "/api/auth/delete-user" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || user).toLowerCase();
            const pw = bodyData.password || "";
            if (db.auth[uname] && db.auth[uname].password && db.auth[uname].password !== pw) {
                return jsonResponse({ error: "Şifre hatalı! Hesap silinemedi." }, 401);
            }
            delete db.auth[uname];
            if (db.users) delete db.users[uname];
            if (db.logs) delete db.logs[uname];
            if (db.chats) delete db.chats[uname];
            if (db.favorites) delete db.favorites[uname];
            if (db.prs) delete db.prs[uname];
            saveLocalDB(db);
            return jsonResponse({ status: "ok", message: "Hesap kalıcı olarak silindi." });
        }

        if (path === "/api/auth/offline" && method === "POST") {
            return jsonResponse({ status: "ok" });
        }

        if (path === "/api/social/friends/add" && method === "POST") {
            if (!db.friends) db.friends = {};
            if (!db.friendRequests) db.friendRequests = [];
            if (!db.friends[user]) db.friends[user] = [];
            const fname = (bodyData.friend_username || "").trim().toLowerCase();
            if (!fname || !/^[a-z0-9_]+$/.test(fname)) return jsonResponse({ error: "Geçerli bir kullanıcı adı girin." }, 400);
            if (fname === user) return jsonResponse({ error: "Kendinize arkadaşlık isteği gönderemezsiniz." }, 400);
            if (!(db.auth && db.auth[fname]) && !(db.users && db.users[fname])) return jsonResponse({ error: `@${fname} adlı kullanıcı bulunamadı.` }, 404);
            if (db.friends[user].includes(fname)) return jsonResponse({ error: `@${fname} zaten arkadaş listende.` }, 409);
            const rev = db.friendRequests.findIndex(r => r.sender === fname && r.receiver === user);
            if (rev >= 0) {
                db.friendRequests.splice(rev, 1);
                db.friends[user].push(fname);
                if (!db.friends[fname]) db.friends[fname] = [];
                if (!db.friends[fname].includes(user)) db.friends[fname].push(user);
                saveLocalDB(db);
                return jsonResponse({ status: "accepted", message: `@${fname} ile arkadaş oldunuz!` });
            }
            if (!db.friendRequests.some(r => r.sender === user && r.receiver === fname)) {
                db.friendRequests.push({ sender: user, receiver: fname });
            }
            saveLocalDB(db);
            return jsonResponse({ status: "pending", friend_username: fname, message: `@${fname} kullanıcısına arkadaşlık isteği gönderildi!` });
        }

        if (path === "/api/social/friends/requests" && method === "GET") {
            const reqs = db.friendRequests || [];
            const authMap = db.auth || {};
            const fmt = (uName) => ({
                username: uName,
                name: (db.users && db.users[uName] && db.users[uName].name) || uName,
                avatar_data: (authMap[uName] && authMap[uName].avatar_data) || ""
            });
            return jsonResponse({
                incoming: reqs.filter(r => r.receiver === user).map(r => fmt(r.sender)),
                outgoing: reqs.filter(r => r.sender === user).map(r => fmt(r.receiver))
            });
        }

        if (path === "/api/social/friends/respond" && method === "POST") {
            if (!db.friendRequests) db.friendRequests = [];
            if (!db.friends) db.friends = {};
            const sender = (bodyData.sender || "").toLowerCase();
            const action = bodyData.action;
            db.friendRequests = db.friendRequests.filter(r => !(r.sender === sender && r.receiver === user));
            if (action === "accept") {
                if (!db.friends[user]) db.friends[user] = [];
                if (!db.friends[sender]) db.friends[sender] = [];
                if (!db.friends[user].includes(sender)) db.friends[user].push(sender);
                if (!db.friends[sender].includes(user)) db.friends[sender].push(user);
            }
            saveLocalDB(db);
            return jsonResponse({ status: action === "accept" ? "accepted" : "rejected" });
        }

        if (path === "/api/social/friends/remove" && method === "POST") {
            if (db.friends && db.friends[user]) {
                const fname = (bodyData.friend_username || "").trim().toLowerCase();
                db.friends[user] = db.friends[user].filter(x => x !== fname);
                saveLocalDB(db);
            }
            return jsonResponse({ status: "ok" });
        }

        if (path === "/api/social/users") {
            const todayStr = new Date().toISOString().slice(0, 10);
            const authMap = db.auth || {};
            const fList = (db.friends && db.friends[user]) || [];
            const allowed = new Set([user, ...fList]);
            const list = Object.keys(db.users || {}).filter(u => allowed.has(u)).map(uname => {
                const prof = db.users[uname] || {};
                if (prof.privacy === "private" && uname !== user) return null;
                const todayLog = (db.logs[uname] && db.logs[uname][todayStr]) || {};
                const nut = todayLog.nutrition || {};
                return {
                    username: uname,
                    name: prof.name || uname,
                    avatar_data: (authMap[uname] && authMap[uname].avatar_data) || prof.avatar_data || "",
                    is_online: uname === user,
                    is_friend: fList.includes(uname),
                    weight: prof.weight || 70,
                    height: prof.height || 170,
                    age: prof.age || 23,
                    prs: prof.prs || {},
                    workout: prof.workoutTemplate,
                    today_nutrition: {
                        calories: nut.calories || 0,
                        protein: nut.protein || 0,
                        carbs: nut.carbs || 0,
                        fat: nut.fat || 0,
                        meals_count: (todayLog.meals || []).length
                    }
                };
            }).filter(Boolean);
            return jsonResponse(list);
        }

        if (path === "/api/social/calendar") {
            const month = u.searchParams.get("month") || new Date().toISOString().slice(0, 7);
            const authMap = db.auth || {};
            const fList = (db.friends && db.friends[user]) || [];
            const allowed = new Set([user, ...fList]);
            const days = {};
            Object.keys(db.logs || {}).filter(u => allowed.has(u)).forEach(uname => {
                const prof = (db.users && db.users[uname]) || {};
                if (prof.privacy === "private") return;
                const uLogs = db.logs[uname] || {};
                Object.keys(uLogs).forEach(d => {
                    if (!d.startsWith(month)) return;
                    const log = uLogs[d] || {};
                    const nut = log.nutrition || {};
                    const cal = parseInt(nut.calories || 0, 10);
                    if (cal === 0 && !(log.meals || []).length) return;
                    if (!days[d]) days[d] = [];
                    days[d].push({
                        username: uname,
                        name: prof.name || uname,
                        avatar_data: (authMap[uname] && authMap[uname].avatar_data) || "",
                        calories: cal,
                        protein: parseInt(nut.protein || 0, 10),
                        carbs: parseInt(nut.carbs || 0, 10),
                        fat: parseInt(nut.fat || 0, 10),
                        meals_count: (log.meals || []).length,
                        workout_done: Boolean(log.workout)
                    });
                });
            });
            return jsonResponse({ month, days });
        }

        if (path === "/api/social/dm") {
            if (!db.dms) db.dms = [];
            const peer = (u.searchParams.get("peer") || bodyData.receiver || "").toLowerCase();
            if (method === "GET") {
                const afterId = parseInt(u.searchParams.get("after_id") || "0", 10);
                return jsonResponse(db.dms.filter(m =>
                    ((m.sender === user && m.receiver === peer) || (m.sender === peer && m.receiver === user)) && m.id > afterId
                ).slice(-100));
            }
            if (method === "POST") {
                const msg = (bodyData.message || "").trim();
                if (!peer || !msg) return jsonResponse({ error: "Mesaj boş olamaz." }, 400);
                const item = { id: Date.now(), sender: user, receiver: peer, message: msg, created_at: new Date().toISOString() };
                db.dms.push(item);
                saveLocalDB(db);
                return jsonResponse({ status: "ok", ...item });
            }
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

        const CLOUD_SERVER_URL = "https://eocoaching-production.up.railway.app";
        // Standalone portable app: connect to 7/24 Railway cloud server when online, fallback to LocalStorage offline
        if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
            try {
                const targetUrl = urlStr.startsWith("/") ? (CLOUD_SERVER_URL + urlStr) : urlStr;
                return await nativeFetch(targetUrl, init);
            } catch (err) {
                return handleOfflineAPI(urlStr, init);
            }
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

        if (path === "/api/auth/register" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || "").trim().toLowerCase();
            const pw = bodyData.password || "";
            if (!uname || !/^[a-z0-9_]+$/.test(uname)) return jsonResponse({ error: "Geçerli kullanıcı adı girin." }, 400);
            if (pw.length < 3) return jsonResponse({ error: "Şifre en az 3 karakter olmalı." }, 400);
            if (db.auth[uname]) return jsonResponse({ error: "Bu kullanıcı adı zaten kayıtlı." }, 409);
            db.auth[uname] = { password: pw, avatar_data: bodyData.avatar_data || "", last_seen: new Date().toISOString() };
            saveLocalDB(db);
            return jsonResponse({ status: "ok", username: uname, avatar_data: db.auth[uname].avatar_data });
        }

        if (path === "/api/auth/login" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || "").trim().toLowerCase();
            const pw = bodyData.password || "";
            if (!db.auth[uname] && !db.users[uname]) return jsonResponse({ error: "Kullanıcı bulunamadı. Lütfen önce Kayıt Olun." }, 404);
            if (db.auth[uname] && db.auth[uname].password !== pw) return jsonResponse({ error: "Kullanıcı adı veya şifre hatalı." }, 401);
            if (!db.auth[uname]) db.auth[uname] = { password: pw, avatar_data: "", last_seen: new Date().toISOString() };
            db.auth[uname].last_seen = new Date().toISOString();
            saveLocalDB(db);
            return jsonResponse({ status: "ok", username: uname, avatar_data: db.auth[uname].avatar_data || "" });
        }

        if (path === "/api/auth/avatar" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || user).toLowerCase();
            if (!db.auth[uname]) db.auth[uname] = { password: "", avatar_data: "", last_seen: new Date().toISOString() };
            db.auth[uname].avatar_data = bodyData.avatar_data || "";
            saveLocalDB(db);
            return jsonResponse({ status: "ok", avatar_data: db.auth[uname].avatar_data });
        }

        if (path === "/api/auth/heartbeat" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || user).toLowerCase();
            if (db.auth[uname]) {
                db.auth[uname].last_seen = new Date().toISOString();
                saveLocalDB(db);
            }
            return jsonResponse({ status: "ok" });
        }

        if (path === "/api/auth/delete-user" && method === "POST") {
            if (!db.auth) db.auth = {};
            const uname = (bodyData.username || user).toLowerCase();
            const pw = bodyData.password || "";
            if (db.auth[uname] && db.auth[uname].password && db.auth[uname].password !== pw) {
                return jsonResponse({ error: "Şifre hatalı! Hesap silinemedi." }, 401);
            }
            delete db.auth[uname];
            if (db.users) delete db.users[uname];
            if (db.logs) delete db.logs[uname];
            if (db.chats) delete db.chats[uname];
            if (db.favorites) delete db.favorites[uname];
            if (db.prs) delete db.prs[uname];
            saveLocalDB(db);
            return jsonResponse({ status: "ok", message: "Hesap kalıcı olarak silindi." });
        }

        if (path === "/api/auth/offline" && method === "POST") {
            return jsonResponse({ status: "ok" });
        }

        if (path === "/api/social/friends/add" && method === "POST") {
            if (!db.friends) db.friends = {};
            if (!db.friendRequests) db.friendRequests = [];
            if (!db.friends[user]) db.friends[user] = [];
            const fname = (bodyData.friend_username || "").trim().toLowerCase();
            if (!fname || !/^[a-z0-9_]+$/.test(fname)) return jsonResponse({ error: "Geçerli bir kullanıcı adı girin." }, 400);
            if (fname === user) return jsonResponse({ error: "Kendinize arkadaşlık isteği gönderemezsiniz." }, 400);
            if (!(db.auth && db.auth[fname]) && !(db.users && db.users[fname])) return jsonResponse({ error: `@${fname} adlı kullanıcı bulunamadı.` }, 404);
            if (db.friends[user].includes(fname)) return jsonResponse({ error: `@${fname} zaten arkadaş listende.` }, 409);
            const rev = db.friendRequests.findIndex(r => r.sender === fname && r.receiver === user);
            if (rev >= 0) {
                db.friendRequests.splice(rev, 1);
                db.friends[user].push(fname);
                if (!db.friends[fname]) db.friends[fname] = [];
                if (!db.friends[fname].includes(user)) db.friends[fname].push(user);
                saveLocalDB(db);
                return jsonResponse({ status: "accepted", message: `@${fname} ile arkadaş oldunuz!` });
            }
            if (!db.friendRequests.some(r => r.sender === user && r.receiver === fname)) {
                db.friendRequests.push({ sender: user, receiver: fname });
            }
            saveLocalDB(db);
            return jsonResponse({ status: "pending", friend_username: fname, message: `@${fname} kullanıcısına arkadaşlık isteği gönderildi!` });
        }

        if (path === "/api/social/friends/requests" && method === "GET") {
            const reqs = db.friendRequests || [];
            const authMap = db.auth || {};
            const fmt = (uName) => ({
                username: uName,
                name: (db.users && db.users[uName] && db.users[uName].name) || uName,
                avatar_data: (authMap[uName] && authMap[uName].avatar_data) || ""
            });
            return jsonResponse({
                incoming: reqs.filter(r => r.receiver === user).map(r => fmt(r.sender)),
                outgoing: reqs.filter(r => r.sender === user).map(r => fmt(r.receiver))
            });
        }

        if (path === "/api/social/friends/respond" && method === "POST") {
            if (!db.friendRequests) db.friendRequests = [];
            if (!db.friends) db.friends = {};
            const sender = (bodyData.sender || "").toLowerCase();
            const action = bodyData.action;
            db.friendRequests = db.friendRequests.filter(r => !(r.sender === sender && r.receiver === user));
            if (action === "accept") {
                if (!db.friends[user]) db.friends[user] = [];
                if (!db.friends[sender]) db.friends[sender] = [];
                if (!db.friends[user].includes(sender)) db.friends[user].push(sender);
                if (!db.friends[sender].includes(user)) db.friends[sender].push(user);
            }
            saveLocalDB(db);
            return jsonResponse({ status: action === "accept" ? "accepted" : "rejected" });
        }

        if (path === "/api/social/friends/remove" && method === "POST") {
            if (db.friends && db.friends[user]) {
                const fname = (bodyData.friend_username || "").trim().toLowerCase();
                db.friends[user] = db.friends[user].filter(x => x !== fname);
                saveLocalDB(db);
            }
            return jsonResponse({ status: "ok" });
        }

        if (path === "/api/social/users") {
            const todayStr = new Date().toISOString().slice(0, 10);
            const authMap = db.auth || {};
            const fList = (db.friends && db.friends[user]) || [];
            const allowed = new Set([user, ...fList]);
            const list = Object.keys(db.users || {}).filter(u => allowed.has(u)).map(uname => {
                const prof = db.users[uname] || {};
                if (prof.privacy === "private" && uname !== user) return null;
                const todayLog = (db.logs[uname] && db.logs[uname][todayStr]) || {};
                const nut = todayLog.nutrition || {};
                return {
                    username: uname,
                    name: prof.name || uname,
                    avatar_data: (authMap[uname] && authMap[uname].avatar_data) || prof.avatar_data || "",
                    is_online: uname === user,
                    is_friend: fList.includes(uname),
                    weight: prof.weight || 70,
                    height: prof.height || 170,
                    age: prof.age || 23,
                    prs: prof.prs || {},
                    workout: prof.workoutTemplate,
                    today_nutrition: {
                        calories: nut.calories || 0,
                        protein: nut.protein || 0,
                        carbs: nut.carbs || 0,
                        fat: nut.fat || 0,
                        meals_count: (todayLog.meals || []).length
                    }
                };
            }).filter(Boolean);
            return jsonResponse(list);
        }

        if (path === "/api/social/calendar") {
            const month = u.searchParams.get("month") || new Date().toISOString().slice(0, 7);
            const authMap = db.auth || {};
            const fList = (db.friends && db.friends[user]) || [];
            const allowed = new Set([user, ...fList]);
            const days = {};
            Object.keys(db.logs || {}).filter(u => allowed.has(u)).forEach(uname => {
                const prof = (db.users && db.users[uname]) || {};
                if (prof.privacy === "private") return;
                const uLogs = db.logs[uname] || {};
                Object.keys(uLogs).forEach(d => {
                    if (!d.startsWith(month)) return;
                    const log = uLogs[d] || {};
                    const nut = log.nutrition || {};
                    const cal = parseInt(nut.calories || 0, 10);
                    if (cal === 0 && !(log.meals || []).length) return;
                    if (!days[d]) days[d] = [];
                    days[d].push({
                        username: uname,
                        name: prof.name || uname,
                        avatar_data: (authMap[uname] && authMap[uname].avatar_data) || "",
                        calories: cal,
                        protein: parseInt(nut.protein || 0, 10),
                        carbs: parseInt(nut.carbs || 0, 10),
                        fat: parseInt(nut.fat || 0, 10),
                        meals_count: (log.meals || []).length,
                        workout_done: Boolean(log.workout)
                    });
                });
            });
            return jsonResponse({ month, days });
        }

        if (path === "/api/social/dm") {
            if (!db.dms) db.dms = [];
            const peer = (u.searchParams.get("peer") || bodyData.receiver || "").toLowerCase();
            if (method === "GET") {
                const afterId = parseInt(u.searchParams.get("after_id") || "0", 10);
                return jsonResponse(db.dms.filter(m =>
                    ((m.sender === user && m.receiver === peer) || (m.sender === peer && m.receiver === user)) && m.id > afterId
                ).slice(-100));
            }
            if (method === "POST") {
                const msg = (bodyData.message || "").trim();
                if (!peer || !msg) return jsonResponse({ error: "Mesaj boş olamaz." }, 400);
                const item = { id: Date.now(), sender: user, receiver: peer, message: msg, created_at: new Date().toISOString() };
                db.dms.push(item);
                saveLocalDB(db);
                return jsonResponse({ status: "ok", ...item });
            }
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

        const CLOUD_SERVER_URL = "https://eocoaching-production.up.railway.app";
        // Standalone portable app: connect to 7/24 Railway cloud server when online, fallback to LocalStorage offline
        if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
            try {
                const targetUrl = urlStr.startsWith("/") ? (CLOUD_SERVER_URL + urlStr) : urlStr;
                return await nativeFetch(targetUrl, init);
            } catch (err) {
                return handleOfflineAPI(urlStr, init);
            }
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
    initPWAInstall();
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

// Helper: Compress image file to 160x160 JPEG base64 data URL (works on all OS & mobile galleries)
function compressAvatarFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                const size = 160;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;
                ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };
            img.onerror = reject;
            img.src = ev.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// 16. Giriş, Kayıt Ol, Şifre & Profil Fotoğrafı Yönetimi
async function initLoginSession() {
    const loginOverlay = document.getElementById("login-overlay");
    const tabLoginBtn = document.getElementById("tab-auth-login");
    const tabRegBtn = document.getElementById("tab-auth-register");
    const loginPanel = document.getElementById("auth-login-panel");
    const regPanel = document.getElementById("auth-register-panel");
    const errBox = document.getElementById("auth-error-msg");

    const loginUserInput = document.getElementById("login-username-input");
    const loginPassInput = document.getElementById("login-password-input");
    const loginRemember = document.getElementById("login-remember-check");
    const loginSubmitBtn = document.getElementById("btn-login-submit");

    const regUserInput = document.getElementById("reg-username-input");
    const regPassInput = document.getElementById("reg-password-input");
    const regRemember = document.getElementById("reg-remember-check");
    const regSubmitBtn = document.getElementById("btn-register-submit");
    const regAvatarPreview = document.getElementById("reg-avatar-preview");
    const regAvatarFileBtn = document.getElementById("btn-reg-avatar-file");
    const regAvatarFile = document.getElementById("reg-avatar-file");
    const regAvatarUrl = document.getElementById("reg-avatar-url");
    let pendingAvatarData = "";

    function showAuthError(msg) {
        if (!errBox) return alert(msg);
        errBox.textContent = msg;
        errBox.classList.remove("hidden");
    }
    function clearAuthError() {
        errBox?.classList.add("hidden");
    }

    tabLoginBtn?.addEventListener("click", () => {
        clearAuthError();
        tabLoginBtn.className = "btn btn-primary btn-sm";
        tabRegBtn.className = "btn btn-secondary btn-sm";
        loginPanel?.classList.remove("hidden");
        regPanel?.classList.add("hidden");
    });
    tabRegBtn?.addEventListener("click", () => {
        clearAuthError();
        tabRegBtn.className = "btn btn-primary btn-sm";
        tabLoginBtn.className = "btn btn-secondary btn-sm";
        regPanel?.classList.remove("hidden");
        loginPanel?.classList.add("hidden");
    });

    regAvatarFileBtn?.addEventListener("click", () => regAvatarFile?.click());
    regAvatarFile?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            pendingAvatarData = await compressAvatarFile(file);
            if (regAvatarPreview) regAvatarPreview.src = pendingAvatarData;
            if (regAvatarUrl) regAvatarUrl.value = "";
        } catch (err) {
            showAuthError("Fotoğraf yüklenemedi.");
        }
    });
    regAvatarUrl?.addEventListener("input", () => {
        const url = regAvatarUrl.value.trim();
        if (url) {
            pendingAvatarData = url;
            if (regAvatarPreview) regAvatarPreview.src = url;
        }
    });

    // Oturumu kapatma
    const logoutBtn = document.getElementById("btn-logout");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (confirm("Oturumu kapatmak ve giriş ekranına dönmek istiyor musunuz?")) {
                sessionStorage.removeItem("active_username");
                localStorage.removeItem("remembered_user");
                localStorage.removeItem("active_username");
                state.username = null;
                state.profile = null;
                state.dailyLog = null;
                location.reload();
            }
        });
    }

    // Kullanıcıyı şifre doğrulamasıyla kalıcı olarak silme
    const deleteAccountBtn = document.getElementById("btn-delete-account");
    const deleteModal = document.getElementById("delete-account-modal");
    const deletePassInput = document.getElementById("delete-account-password");
    const deleteErrEl = document.getElementById("delete-account-error");
    const cancelDeleteBtn = document.getElementById("btn-cancel-delete-account");
    const confirmDeleteBtn = document.getElementById("btn-confirm-delete-account");

    deleteAccountBtn?.addEventListener("click", () => {
        if (!deleteModal) return;
        if (deletePassInput) deletePassInput.value = "";
        deleteErrEl?.classList.add("hidden");
        deleteModal.classList.remove("hidden");
    });
    cancelDeleteBtn?.addEventListener("click", () => deleteModal?.classList.add("hidden"));
    confirmDeleteBtn?.addEventListener("click", async () => {
        const pw = deletePassInput?.value || "";
        if (!pw) {
            if (deleteErrEl) {
                deleteErrEl.textContent = "Lütfen şifrenizi girin.";
                deleteErrEl.classList.remove("hidden");
            }
            return;
        }
        try {
            const res = await fetch("/api/auth/delete-user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: state.username, password: pw })
            });
            const data = await res.json();
            if (!res.ok) {
                if (deleteErrEl) {
                    deleteErrEl.textContent = data.detail || data.error || "Şifre hatalı.";
                    deleteErrEl.classList.remove("hidden");
                }
                return;
            }
            localStorage.removeItem(`avatar_${state.username}`);
            localStorage.removeItem("remembered_user");
            localStorage.removeItem("active_username");
            sessionStorage.removeItem("active_username");
            alert("Hesabınız ve tüm verileriniz kalıcı olarak silindi.");
            location.reload();
        } catch (err) {
            if (deleteErrEl) {
                deleteErrEl.textContent = "Silme işlemi sırasında hata oluştu.";
                deleteErrEl.classList.remove("hidden");
            }
        }
    });

    function startHeartbeat(username) {
        const ping = () => fetch("/api/auth/heartbeat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username })
        }).catch(() => {});
        ping();
        setInterval(ping, 60000);
        window.addEventListener("beforeunload", () => {
            try {
                navigator.sendBeacon("/api/auth/offline", JSON.stringify({ username }));
            } catch (e) { }
        });
    }

    async function completeAuth(username, remember, avatarData) {
        sessionStorage.setItem("active_username", username);
        if (remember) {
            localStorage.setItem("remembered_user", username);
        } else {
            localStorage.removeItem("remembered_user");
        }
        if (avatarData) {
            localStorage.setItem(`avatar_${username}`, avatarData);
        }
        state.username = username;
        loginOverlay.classList.add("hidden");
        startHeartbeat(username);

        const obNameInput = document.getElementById("ob-name");
        if (obNameInput && !obNameInput.value) {
            obNameInput.value = username;
        }
        await checkProfile();
        initSocialTab();
        initClockAndSleepTracker();
    }

    const autoUser = sessionStorage.getItem("active_username") || localStorage.getItem("remembered_user");
    if (autoUser) {
        state.username = autoUser;
        loginOverlay.classList.add("hidden");
        startHeartbeat(autoUser);
        await checkProfile();
        initSocialTab();
        initClockAndSleepTracker();
        return;
    }

    loginOverlay.classList.remove("hidden");

    loginSubmitBtn?.addEventListener("click", async () => {
        clearAuthError();
        const username = (loginUserInput?.value || "").trim().toLowerCase();
        const password = loginPassInput?.value || "";
        if (!username || !password) {
            showAuthError("Kullanıcı adı ve şifre girin.");
            return;
        }
        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) {
                showAuthError(data.detail || data.error || "Giriş başarısız.");
                return;
            }
            await completeAuth(data.username, Boolean(loginRemember?.checked), data.avatar_data);
        } catch (err) {
            showAuthError("Sunucuya bağlanılamadı.");
        }
    });

    regSubmitBtn?.addEventListener("click", async () => {
        clearAuthError();
        const username = (regUserInput?.value || "").trim().toLowerCase();
        const password = regPassInput?.value || "";
        if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) {
            showAuthError("Kullanıcı adı sadece harf, rakam ve alt çizgi (_) içerebilir!");
            return;
        }
        if (password.length < 3) {
            showAuthError("Şifre en az 3 karakter olmalıdır.");
            return;
        }
        try {
            const res = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password, avatar_data: pendingAvatarData })
            });
            const data = await res.json();
            if (!res.ok) {
                showAuthError(data.detail || data.error || "Kayıt başarısız.");
                return;
            }
            await completeAuth(data.username, Boolean(regRemember?.checked), data.avatar_data);
        } catch (err) {
            showAuthError("Kayıt sırasında hata oluştu.");
        }
    });
}

// 17. Sosyal Panel, Çevrimiçi Arkadaşlar & Kalori Takvimi
let socialCalDate = new Date();

function initSocialTab() {
    const detailModal = document.getElementById("social-user-modal");
    const closeDetailBtn = document.getElementById("btn-close-social-modal");
    if (closeDetailBtn && detailModal) {
        closeDetailBtn.addEventListener("click", () => detailModal.classList.add("hidden"));
    }

    const dayModal = document.getElementById("social-day-modal");
    const closeDayBtn = document.getElementById("btn-close-social-day-modal");
    if (closeDayBtn && dayModal) {
        closeDayBtn.addEventListener("click", () => dayModal.classList.add("hidden"));
    }

    // Avatar change inside Social tab
    const changeAvatarBtn = document.getElementById("btn-social-change-avatar");
    const avatarFileInput = document.getElementById("social-avatar-file");
    changeAvatarBtn?.addEventListener("click", () => avatarFileInput?.click());
    avatarFileInput?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file || !state.username) return;
        try {
            const avatarData = await compressAvatarFile(file);
            await fetch("/api/auth/avatar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username: state.username, avatar_data: avatarData })
            });
            localStorage.setItem(`avatar_${state.username}`, avatarData);
            const myAvatarEl = document.getElementById("social-my-avatar");
            if (myAvatarEl) myAvatarEl.src = avatarData;
            showToast("📸 Profil fotoğrafın güncellendi!");
            await loadSocialLeaderboard();
        } catch (err) {
            showToast("Fotoğraf güncellenemedi.");
        }
    });

    // Add Friend handler
    const addFriendInput = document.getElementById("social-add-friend-input");
    const addFriendBtn = document.getElementById("btn-social-add-friend");
    const friendMsgEl = document.getElementById("social-friend-msg");
    addFriendBtn?.addEventListener("click", async () => {
        const fname = (addFriendInput?.value || "").trim().toLowerCase();
        if (!fname) return;
        try {
            const res = await fetch(apiURL("/api/social/friends/add"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ friend_username: fname })
            });
            const data = await res.json();
            if (friendMsgEl) {
                friendMsgEl.classList.remove("hidden");
                if (res.ok) {
                    friendMsgEl.style.background = "rgba(16,185,129,0.12)";
                    friendMsgEl.style.color = "#059669";
                    friendMsgEl.textContent = data.message || `@${fname} kullanıcısına arkadaşlık isteği gönderildi!`;
                    if (addFriendInput) addFriendInput.value = "";
                    await loadFriendRequests();
                    await loadSocialLeaderboard();
                    await loadSocialCalendar();
                } else {
                    friendMsgEl.style.background = "rgba(239,68,68,0.12)";
                    friendMsgEl.style.color = "#dc2626";
                    friendMsgEl.textContent = data.detail || data.error || "Arkadaşlık isteği gönderilemedi.";
                }
            }
        } catch (err) {
            showToast("Arkadaş eklenirken hata oluştu.");
        }
    });

    // Calendar month navigation & filter
    document.getElementById("btn-cal-prev")?.addEventListener("click", () => {
        socialCalDate = new Date(socialCalDate.getFullYear(), socialCalDate.getMonth() - 1, 1);
        loadSocialCalendar();
    });
    document.getElementById("btn-cal-next")?.addEventListener("click", () => {
        socialCalDate = new Date(socialCalDate.getFullYear(), socialCalDate.getMonth() + 1, 1);
        loadSocialCalendar();
    });
    document.getElementById("social-cal-user-filter")?.addEventListener("change", () => {
        loadSocialCalendar();
    });

    const socialLink = document.querySelector('.nav-link[data-tab="social"]');
    if (socialLink) {
        socialLink.addEventListener("click", async () => {
            updateSocialMySummary();
            await loadFriendRequests();
            await loadSocialLeaderboard();
            await loadSocialCalendar();
        });
    }
}

async function loadFriendRequests() {
    const box = document.getElementById("social-friend-requests-box");
    if (!box) return;
    try {
        const res = await fetch(apiURL("/api/social/friends/requests"));
        if (!res.ok) return;
        const data = await res.json();
        const incoming = data.incoming || [];
        const outgoing = data.outgoing || [];
        if (incoming.length === 0 && outgoing.length === 0) {
            box.classList.add("hidden");
            box.innerHTML = "";
            return;
        }
        box.classList.remove("hidden");
        let html = "";
        if (incoming.length > 0) {
            html += `<div style="font-size:0.82rem; font-weight:700; color:var(--text-primary); margin-bottom:8px;"><i class="fa-solid fa-bell text-neon-purple"></i> Gelen Arkadaşlık İstekleri (${incoming.length})</div>`;
            html += incoming.map(u => `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; background:#fff; border:1px solid var(--border-color); border-radius:10px; padding:8px 10px; margin-bottom:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${u.avatar_data ? `<img src="${u.avatar_data}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">` : `<span class="social-user-avatar" style="width:30px; height:30px; font-size:0.8rem;">${(u.name || "?").charAt(0).toUpperCase()}</span>`}
                        <div><strong>${u.name}</strong> <span style="font-size:0.75rem; color:var(--text-muted);">@${u.username}</span></div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button type="button" class="btn btn-primary btn-sm btn-req-accept" data-sender="${u.username}" style="background:#10b981; padding:4px 10px; font-size:0.76rem;"><i class="fa-solid fa-check"></i> Kabul Et</button>
                        <button type="button" class="btn btn-secondary btn-sm btn-req-reject" data-sender="${u.username}" style="color:#dc2626; border-color:rgba(239,68,68,0.35); padding:4px 10px; font-size:0.76rem;"><i class="fa-solid fa-xmark"></i> Reddet</button>
                    </div>
                </div>
            `).join("");
        }
        if (outgoing.length > 0) {
            html += `<div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">Onay bekleyen gönderilen istekler: ${outgoing.map(u => `<strong>@${u.username}</strong>`).join(", ")}</div>`;
        }
        box.innerHTML = html;

        box.querySelectorAll(".btn-req-accept").forEach(btn => {
            btn.addEventListener("click", async () => {
                await respondFriendRequest(btn.getAttribute("data-sender"), "accept");
            });
        });
        box.querySelectorAll(".btn-req-reject").forEach(btn => {
            btn.addEventListener("click", async () => {
                await respondFriendRequest(btn.getAttribute("data-sender"), "reject");
            });
        });
    } catch (e) { }
}

async function respondFriendRequest(sender, action) {
    try {
        const res = await fetch(apiURL("/api/social/friends/respond"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sender, action })
        });
        if (res.ok) {
            showToast(action === "accept" ? `✅ @${sender} ile arkadaş oldunuz!` : `❌ @${sender} isteği reddedildi.`);
            await loadFriendRequests();
            await loadSocialLeaderboard();
            await loadSocialCalendar();
        }
    } catch (e) { }
}

function updateSocialMySummary() {
    const uname = state.username || "default";
    const prof = state.profile || {};
    const nut = (state.dailyLog && state.dailyLog.nutrition) || {};
    const myNameEl = document.getElementById("social-my-name");
    const myUserEl = document.getElementById("social-my-username");
    const myAvatarEl = document.getElementById("social-my-avatar");
    if (myNameEl) myNameEl.textContent = prof.name || uname;
    if (myUserEl) myUserEl.textContent = `@${uname}`;
    const savedAvatar = localStorage.getItem(`avatar_${uname}`) || prof.avatar_data;
    if (myAvatarEl && savedAvatar) myAvatarEl.src = savedAvatar;

    const calEl = document.getElementById("social-my-cal");
    const proEl = document.getElementById("social-my-pro");
    const carbEl = document.getElementById("social-my-carb");
    const fatEl = document.getElementById("social-my-fat");
    if (calEl) calEl.textContent = `${Math.round(nut.calories || 0)} kcal`;
    if (proEl) proEl.textContent = `${Math.round(nut.protein || 0)} g`;
    if (carbEl) carbEl.textContent = `${Math.round(nut.carbs || 0)} g`;
    if (fatEl) fatEl.textContent = `${Math.round(nut.fat || 0)} g`;
}

function renderAvatarHtml(user, size = 36) {
    const firstLetter = (user.name || user.username || "?").charAt(0).toUpperCase();
    const imgHtml = user.avatar_data
        ? `<img src="${user.avatar_data}" alt="${firstLetter}" style="width:${size}px; height:${size}px; border-radius:50%; object-fit:cover; border:2px solid rgba(249,115,22,0.4);">`
        : `<span class="social-user-avatar" style="width:${size}px; height:${size}px; font-size:${Math.round(size * 0.45)}px;">${firstLetter}</span>`;
    const dotStyle = user.is_online
        ? "background:#10b981; box-shadow:0 0 6px rgba(16,185,129,0.8);"
        : "background:#cbd5e1; opacity:0.5;";
    return `<div style="position:relative; display:inline-flex; flex-shrink:0;">
        ${imgHtml}
        <span title="${user.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}" style="position:absolute; bottom:0; right:0; width:10px; height:10px; border-radius:50%; border:2px solid #fff; ${dotStyle}"></span>
    </div>`;
}

async function loadSocialLeaderboard() {
    const leaderboardBody = document.getElementById("social-leaderboard-body");
    const onlineCountEl = document.getElementById("social-online-count");
    const filterSelect = document.getElementById("social-cal-user-filter");
    if (!leaderboardBody) return;

    leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px;"><i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...</td></tr>`;

    try {
        const res = await fetch(apiURL("/api/social/users"));
        if (res.ok) {
            const allUsers = await res.json();
            const friends = allUsers.filter(u => u.username !== state.username);

            allUsers.forEach(u => {
                u.prs = u.prs || {};
                u.totalPR = (u.prs.squat || 0) + (u.prs.bench_press || 0) + (u.prs.deadlift || 0);
                if (u.username === state.username && u.avatar_data) {
                    localStorage.setItem(`avatar_${u.username}`, u.avatar_data);
                    const myAvatarEl = document.getElementById("social-my-avatar");
                    if (myAvatarEl) myAvatarEl.src = u.avatar_data;
                }
            });
            friends.sort((a, b) => (b.is_online ? 1 : 0) - (a.is_online ? 1 : 0) || b.totalPR - a.totalPR);

            if (onlineCountEl) {
                const onlineNum = friends.filter(u => u.is_online).length;
                onlineCountEl.textContent = `${onlineNum} Çevrimiçi / ${friends.length} Arkadaş`;
            }

            if (filterSelect) {
                const prev = filterSelect.value;
                filterSelect.innerHTML = `<option value="all">Tümü (Ben & Arkadaşlar)</option>`;
                allUsers.forEach(u => {
                    const opt = document.createElement("option");
                    opt.value = u.username;
                    opt.textContent = `${u.name} (@${u.username})`;
                    filterSelect.appendChild(opt);
                });
                if ([...filterSelect.options].some(o => o.value === prev)) filterSelect.value = prev;
            }

            if (friends.length === 0) {
                leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:24px; color:var(--text-muted); font-weight:600;">Henüz arkadaşın yok. Yukarıdan kullanıcı adı yazarak arkadaş ekleyebilirsin.</td></tr>`;
                return;
            }

            leaderboardBody.innerHTML = "";
            friends.forEach(user => {
                const tr = document.createElement("tr");
                tr.style.cursor = "pointer";
                tr.addEventListener("click", () => showSocialUserDetail(user));

                const nut = user.today_nutrition || {};
                const squatVal = user.prs.squat ? `${user.prs.squat} kg` : "-";
                const benchVal = user.prs.bench_press ? `${user.prs.bench_press} kg` : "-";
                const deadliftVal = user.prs.deadlift ? `${user.prs.deadlift} kg` : "-";

                tr.innerHTML = `
                    <td style="padding: 12px 8px;">
                        <div class="social-user-cell">
                            ${renderAvatarHtml(user, 38)}
                            <div>
                                <strong style="color:var(--text-primary); display:block;">${user.name}</strong>
                                <span style="font-size:0.75rem; color:var(--text-muted);">@${user.username} · ${user.is_online ? '<span style="color:#059669; font-weight:700;">Çevrimiçi</span>' : '<span style="opacity:0.65;">Çevrimdışı</span>'}</span>
                            </div>
                        </div>
                    </td>
                    <td style="padding: 12px 8px;">
                        <strong style="color:var(--neon-orange); font-size:0.92rem;">${Math.round(nut.calories || 0)} kcal</strong>
                        <div style="font-size:0.74rem; color:var(--text-secondary);">P: ${Math.round(nut.protein || 0)}g · K: ${Math.round(nut.carbs || 0)}g · Y: ${Math.round(nut.fat || 0)}g</div>
                    </td>
                    <td style="padding: 12px 8px; text-align: center;"><span class="${user.prs.squat ? 'pr-badge' : ''}">${squatVal}</span></td>
                    <td style="padding: 12px 8px; text-align: center;"><span class="${user.prs.bench_press ? 'pr-badge' : ''}">${benchVal}</span></td>
                    <td style="padding: 12px 8px; text-align: center;"><span class="${user.prs.deadlift ? 'pr-badge' : ''}">${deadliftVal}</span></td>
                    <td style="padding: 12px 8px; text-align: center;">
                        <div style="display:flex; gap:6px; justify-content:center;">
                            <button type="button" class="btn btn-primary btn-sm btn-dm-friend" title="Anlık Sohbet"><i class="fa-solid fa-comments"></i> Mesaj</button>
                            <button type="button" class="btn btn-secondary btn-sm btn-view-friend"><i class="fa-solid fa-eye"></i> İncele</button>
                        </div>
                    </td>
                `;
                tr.querySelector(".btn-dm-friend")?.addEventListener("click", (e) => {
                    e.stopPropagation();
                    openFriendChat(user);
                });
                leaderboardBody.appendChild(tr);
            });
        } else {
            leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--neon-red);">Veriler yüklenirken bir hata oluştu.</td></tr>`;
        }
    } catch (e) {
        leaderboardBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:20px; color:var(--neon-red);">Bağlantı hatası: ${e.message}</td></tr>`;
    }
}

async function loadSocialCalendar() {
    const gridEl = document.getElementById("social-calendar-grid");
    const monthLabelEl = document.getElementById("social-cal-month-label");
    const filterUser = document.getElementById("social-cal-user-filter")?.value || "all";
    if (!gridEl || !monthLabelEl) return;

    const year = socialCalDate.getFullYear();
    const monthIdx = socialCalDate.getMonth();
    const monthStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}`;
    const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
    monthLabelEl.textContent = `${monthNames[monthIdx]} ${year}`;

    let daysMap = {};
    try {
        const res = await fetch(apiURL(`/api/social/calendar?month=${monthStr}`));
        if (res.ok) {
            const payload = await res.json();
            daysMap = payload.days || {};
        }
    } catch (e) { }

    gridEl.innerHTML = "";
    const firstDay = new Date(year, monthIdx, 1).getDay(); // 0=Sun..6=Sat
    const startOffset = (firstDay + 6) % 7; // Mon=0..Sun=6
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement("div");
        empty.style.minHeight = "64px";
        gridEl.appendChild(empty);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${monthStr}-${String(day).padStart(2, "0")}`;
        const rawList = daysMap[dateKey] || [];
        const entries = filterUser === "all" ? rawList : rawList.filter(x => x.username === filterUser);

        const cell = document.createElement("div");
        cell.style.cssText = `min-height:68px; border:1px solid var(--border-color); border-radius:10px; padding:6px; cursor:pointer; background:${entries.length ? 'rgba(249,115,22,0.06)' : '#fff'}; transition:transform 0.15s; display:flex; flex-direction:column; justify-content:space-between;`;

        let chipsHtml = "";
        entries.slice(0, 2).forEach(item => {
            chipsHtml += `<div style="font-size:0.66rem; background:rgba(249,115,22,0.14); color:#c2410c; border-radius:5px; padding:1px 4px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:700;">${item.name.split(" ")[0]}: ${item.calories} kcal</div>`;
        });
        if (entries.length > 2) {
            chipsHtml += `<div style="font-size:0.62rem; color:var(--text-muted); margin-top:2px;">+${entries.length - 2} kişi daha</div>`;
        }

        cell.innerHTML = `<div style="font-size:0.78rem; font-weight:700; color:var(--text-primary);">${day}</div><div>${chipsHtml}</div>`;
        cell.addEventListener("click", () => openSocialDayModal(dateKey, entries));
        gridEl.appendChild(cell);
    }
}

function openSocialDayModal(dateKey, entries) {
    const modal = document.getElementById("social-day-modal");
    const titleEl = document.getElementById("social-day-modal-title");
    const bodyEl = document.getElementById("social-day-modal-body");
    if (!modal || !titleEl || !bodyEl) return;

    const [y, m, d] = dateKey.split("-");
    titleEl.textContent = `📅 ${d}/${m}/${y} — Kalori & Makro Detayları`;

    if (!entries || entries.length === 0) {
        bodyEl.innerHTML = `<p class="subtitle" style="text-align:center; padding:20px;">Bu tarihte kayıtlı kalori/öğün verisi bulunmuyor.</p>`;
    } else {
        bodyEl.innerHTML = entries.map(item => `
            <div style="background:#fff; border:1px solid var(--border-color); border-radius:12px; padding:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:10px;">
                    ${item.avatar_data ? `<img src="${item.avatar_data}" style="width:40px; height:40px; border-radius:50%; object-fit:cover;">` : `<span class="social-user-avatar">${(item.name || "?").charAt(0).toUpperCase()}</span>`}
                    <div>
                        <strong style="color:var(--text-primary); display:block;">${item.name}</strong>
                        <span style="font-size:0.75rem; color:var(--text-muted);">@${item.username} · ${item.meals_count} öğün ${item.workout_done ? '· 🏋️ Antrenman yapıldı' : ''}</span>
                    </div>
                </div>
                <div style="text-align:right;">
                    <strong style="color:var(--neon-orange); font-size:1rem;">${item.calories} kcal</strong>
                    <div style="font-size:0.76rem; color:var(--text-secondary);">Protein: ${item.protein}g · Karb: ${item.carbs}g · Yağ: ${item.fat}g</div>
                </div>
            </div>
        `).join("");
    }
    modal.classList.remove("hidden");
}

let dmPollTimer = null;
let dmCurrentPeer = null;
let dmLastId = 0;

function appendDmBubble(m) {
    const box = document.getElementById("dm-messages-box");
    if (!box) return;
    const isMe = m.sender === state.username;
    const div = document.createElement("div");
    div.style.cssText = `max-width:80%; padding:8px 12px; border-radius:12px; font-size:0.86rem; line-height:1.4; align-self:${isMe ? 'flex-end' : 'flex-start'}; background:${isMe ? 'var(--neon-orange)' : '#fff'}; color:${isMe ? '#fff' : 'var(--text-primary)'}; border:${isMe ? 'none' : '1px solid var(--border-color)'};`;
    const t = m.created_at ? new Date(m.created_at + (m.created_at.endsWith("Z") ? "" : "Z")).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }) : "";
    div.innerHTML = `<div>${m.message.replace(/</g, "&lt;")}</div><div style="font-size:0.65rem; opacity:0.75; margin-top:2px; text-align:right;">${t}</div>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

async function fetchDmUpdates() {
    if (!dmCurrentPeer) return;
    try {
        const res = await fetch(apiURL(`/api/social/dm?peer=${encodeURIComponent(dmCurrentPeer)}&after_id=${dmLastId}`));
        if (res.ok) {
            const list = await res.json();
            const box = document.getElementById("dm-messages-box");
            if (dmLastId === 0 && box && list.length === 0) {
                box.innerHTML = `<p class="subtitle" style="text-align:center; margin:auto; font-size:0.82rem;">Henüz mesaj yok. İlk mesajı sen gönder!</p>`;
            }
            list.forEach(m => {
                if (dmLastId === 0 && box && box.querySelector("p.subtitle")) box.innerHTML = "";
                if (m.id > dmLastId) {
                    dmLastId = m.id;
                    appendDmBubble(m);
                }
            });
        }
    } catch (e) { }
}

function openFriendChat(friend) {
    const modal = document.getElementById("social-dm-modal");
    const avatarEl = document.getElementById("dm-modal-avatar");
    const nameEl = document.getElementById("dm-modal-name");
    const statusEl = document.getElementById("dm-modal-status");
    const box = document.getElementById("dm-messages-box");
    const input = document.getElementById("dm-message-input");
    const sendBtn = document.getElementById("btn-send-dm");
    const closeBtn = document.getElementById("btn-close-dm-modal");
    if (!modal || !box) return;

    dmCurrentPeer = friend.username;
    dmLastId = 0;
    if (avatarEl) avatarEl.innerHTML = renderAvatarHtml(friend, 38);
    if (nameEl) nameEl.textContent = friend.name || friend.username;
    if (statusEl) statusEl.innerHTML = friend.is_online ? '<span style="color:#059669; font-weight:700;">● Çevrimiçi</span>' : '● Çevrimdışı';
    box.innerHTML = `<p class="subtitle" style="text-align:center; margin:auto;">Mesajlar yükleniyor...</p>`;
    modal.classList.remove("hidden");

    if (dmPollTimer) clearInterval(dmPollTimer);
    fetchDmUpdates();
    dmPollTimer = setInterval(fetchDmUpdates, 2500);

    const closeDm = () => {
        modal.classList.add("hidden");
        if (dmPollTimer) { clearInterval(dmPollTimer); dmPollTimer = null; }
        dmCurrentPeer = null;
    };
    if (closeBtn) closeBtn.onclick = closeDm;

    const sendDm = async () => {
        const txt = (input?.value || "").trim();
        if (!txt || !dmCurrentPeer) return;
        input.value = "";
        try {
            const res = await fetch(apiURL("/api/social/dm"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ receiver: dmCurrentPeer, message: txt })
            });
            if (res.ok) await fetchDmUpdates();
        } catch (e) { }
    };
    if (sendBtn) sendBtn.onclick = sendDm;
    if (input) input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); sendDm(); } };
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

    async function smartDownloadOrInstall() {
        const ua = navigator.userAgent || "";
        if (/android/i.test(ua)) {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                await deferredPrompt.userChoice;
                deferredPrompt = null;
                return;
            }
            if (!window.location.origin.includes("railway.app") && window.location.protocol === "file:") {
                window.open("https://eocoaching-production.up.railway.app", "_blank", "noopener");
                return;
            }
            alert("Android Ana Ekrana Kurulum:\nChrome sağ üst köşedeki (⋮) menüsünden 'Uygulamayı Yükle / Ana ekrana ekle' seçeneğine dokunun.");
            return;
        }
        if (/iphone|ipad|ipod/i.test(ua)) {
            window.location.href = "/api/download/ios-profile";
            return;
        }
        if (/macintosh|mac os x/i.test(ua)) {
            const a = document.createElement("a");
            a.href = "/api/download/mac";
            a.download = "EOcoachingmacOS.zip";
            a.click();
            showToast("📥 Mac uygulaması indiriliyor!");
            return;
        }
        // Windows / Default
        const a = document.createElement("a");
        a.href = window.location.protocol === "file:"
            ? "https://eocoaching-production.up.railway.app/api/download/windows"
            : "/api/download/windows";
        a.download = "EOcoachingWindows.exe";
        a.click();
        showToast("📥 Windows uygulaması indiriliyor!");
    }

    installBtn?.addEventListener("click", smartDownloadOrInstall);
    headerDlBtn?.addEventListener("click", smartDownloadOrInstall);
    loginDlBtn?.addEventListener("click", smartDownloadOrInstall);
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

    // When running in standalone mode (file://), package HTML for standalone links or point platform links to GitHub releases
    const GITHUB_DL_MAP = {
        windows: "https://github.com/EmreOuzouns/EOCoaching/raw/main/downloads/EOcoachingWindows.exe",
        android: "https://github.com/EmreOuzouns/EOCoaching/raw/main/downloads/EOcoachingAndroid.zip",
        ios: "https://github.com/EmreOuzouns/EOCoaching/raw/main/downloads/EOcoachingiOS.zip",
        mac: "https://github.com/EmreOuzouns/EOCoaching/raw/main/downloads/EOcoachingmacOS.zip"
    };
    document.querySelectorAll(".btn-dl-action").forEach(link => {
        link.addEventListener("click", (e) => {
            const plat = (link.getAttribute("data-platform") || "").toLowerCase();
            if (window.location.protocol === "file:" || window.AICOACHING_STANDALONE_MODE || window.AURA_STANDALONE_MODE) {
                e.preventDefault();
                if (plat && GITHUB_DL_MAP[plat]) {
                    window.open(GITHUB_DL_MAP[plat], "_blank", "noopener");
                    showToast("📥 İndirme başlatıldı!");
                    return;
                }
                const htmlContent = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
                const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = link.getAttribute("download") || "EOcoachingPortable.html";
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
    if (localStorage.getItem("pwa_icons_generated_v4")) {
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

        // Background Deep Slate Circle
        ctx.beginPath();
        ctx.arc(c_x, c_y, r, 0, 2 * Math.PI);
        ctx.fillStyle = "#0f172a";
        ctx.fill();

        // Inner yellow circular border
        ctx.beginPath();
        ctx.arc(c_x, c_y, 208 * scale, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.82)";
        ctx.lineWidth = Math.max(2, 8 * scale);
        ctx.stroke();

        // Yellow Dumbbell Bar
        const bar_w = 250 * scale;
        const bar_h = 30 * scale;
        ctx.fillStyle = "#facc15";
        ctx.fillRect(c_x - bar_w / 2, c_y - bar_h / 2, bar_w, bar_h);

        // Inner Plates
        const ip_w = 30 * scale;
        const ip_h = 156 * scale;
        ctx.fillRect(c_x - bar_w / 2 - ip_w, c_y - ip_h / 2, ip_w, ip_h);
        ctx.fillRect(c_x + bar_w / 2, c_y - ip_h / 2, ip_w, ip_h);

        // Outer Plates
        const op_w = 34 * scale;
        const op_h = 216 * scale;
        ctx.fillStyle = "#eab308";
        ctx.fillRect(c_x - bar_w / 2 - ip_w - 10 * scale - op_w, c_y - op_h / 2, op_w, op_h);
        ctx.fillRect(c_x + bar_w / 2 + ip_w + 10 * scale, c_y - op_h / 2, op_w, op_h);

        // Grips
        const grip_w = 110 * scale;
        const grip_h = 40 * scale;
        ctx.fillStyle = "#eab308";
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
        localStorage.setItem("pwa_icons_generated_v4", "true");
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

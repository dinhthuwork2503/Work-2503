
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, session, clipboard } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, execFile } = require("child_process");
const crypto = require("crypto");

const APP_NAME = "Jordan Task Manager";
const USER_DATA_FILE = path.join(app.getPath("userData"), "jordan-task-manager-data-v13.json");

const URLS = {
  tiktokUpload: "https://www.tiktok.com/tiktokstudio/upload?from=webapp",
  facebookBusiness: "https://business.facebook.com/latest/home",
  chatgpt: "https://chatgpt.com/",
  gemini: "https://gemini.google.com/app",
  openaiBilling: "https://platform.openai.com/settings/organization/billing/overview",
  openaiUsage: "https://platform.openai.com/usage",
  geminiRateLimit: "https://ai.google.dev/gemini-api/docs/rate-limits",
  geminiUsage: "https://ai.dev/rate-limit",
  aiStudio: "https://aistudio.google.com/"
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 810,
    minWidth: 960,
    minHeight: 540,
    backgroundColor: "#f6f8fc",
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function readData() {
  try {
    if (!fs.existsSync(USER_DATA_FILE)) return {};
    return JSON.parse(fs.readFileSync(USER_DATA_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(USER_DATA_FILE), { recursive: true });
  fs.writeFileSync(USER_DATA_FILE, JSON.stringify(data || {}, null, 2), "utf-8");
}

function findEdgeExe() {
  const candidates = [
    path.join(process.env["PROGRAMFILES(X86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.PROGRAMFILES || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe")
  ];
  return candidates.find(p => p && fs.existsSync(p)) || null;
}

function edgeUserDataDir() {
  return path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "User Data");
}

function listEdgeProfiles() {
  const dir = edgeUserDataDir();
  if (!fs.existsSync(dir)) return [];
  let infoCache = {};
  try {
    const localStatePath = path.join(dir, "Local State");
    if (fs.existsSync(localStatePath)) {
      const localState = JSON.parse(fs.readFileSync(localStatePath, "utf-8"));
      infoCache = localState?.profile?.info_cache || {};
    }
  } catch {}

  const folders = [];
  const defaultDir = path.join(dir, "Default");
  if (fs.existsSync(defaultDir)) folders.push("Default");

  for (const name of fs.readdirSync(dir)) {
    if (/^Profile \d+$/.test(name) && fs.statSync(path.join(dir, name)).isDirectory()) {
      folders.push(name);
    }
  }

  return folders.map(folder => {
    const info = infoCache[folder] || {};
    const name = info.name || info.gaia_name || info.user_name || folder;
    const email = info.user_name || "";
    return {
      directory: folder,
      name,
      email,
      displayName: email && !String(name).includes(email) ? `${name} (${email}) · ${folder}` : `${name} · ${folder}`
    };
  });
}

function openInEdge(url, profileDirectory, appMode = false) {
  const edge = findEdgeExe();
  if (!edge) {
    shell.openExternal(url);
    return { ok: true, fallback: true };
  }

  const args = [];
  if (profileDirectory) args.push(`--profile-directory=${profileDirectory}`);
  if (appMode) args.push(`--app=${url}`);
  else args.push(url);

  spawn(edge, args, { detached: true, stdio: "ignore" }).unref();
  return { ok: true, fallback: false };
}


function normalizeSupabaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function supabaseHeaders(anonKey) {
  const key = sanitizeKey(anonKey);
  return {
    "apikey": key,
    "Authorization": `Bearer ${key}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };
}

async function supabaseRequest(config, table, method = "GET", body = null, query = "") {
  const baseUrl = normalizeSupabaseUrl(config.supabaseUrl);
  if (!baseUrl || !config.supabaseAnonKey) throw new Error("Thiếu Supabase URL hoặc Supabase Anon Key.");
  const url = `${baseUrl}/rest/v1/${table}${query}`;
  const res = await fetch(url, {
    method,
    headers: supabaseHeaders(config.supabaseAnonKey),
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase lỗi ${res.status} tại bảng ${table}:\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

function cleanRows(rows) {
  return Array.isArray(rows) ? rows.map(row => {
    const copy = { ...row };
    delete copy.created_at;
    delete copy.updated_at;
    return copy;
  }) : [];
}


ipcMain.handle("storage:get", () => readData());
ipcMain.handle("storage:set", (_event, data) => {
  writeData(data || {});
  return true;
});


ipcMain.handle("cloud:testSupabase", async (_event, config) => {
  const result = await supabaseRequest(config, "settings", "GET", null, "?select=key,value&limit=1");
  return { ok: true, message: "Kết nối Supabase thành công.", sample: result };
});

ipcMain.handle("cloud:pullAll", async (_event, config) => {
  const [accounts, videos, proxies, posts, postLogs, hashtags, settings] = await Promise.all([
    supabaseRequest(config, "accounts", "GET", null, "?select=*&order=created_at.desc"),
    supabaseRequest(config, "videos", "GET", null, "?select=*&order=created_at.desc"),
    supabaseRequest(config, "proxies", "GET", null, "?select=*&order=created_at.desc"),
    supabaseRequest(config, "posts", "GET", null, "?select=*&order=created_at.desc"),
    supabaseRequest(config, "post_logs", "GET", null, "?select=*&order=created_at.desc"),
    supabaseRequest(config, "hashtags", "GET", null, "?select=*&order=created_at.desc"),
    supabaseRequest(config, "settings", "GET", null, "?select=*")
  ]);
  return { accounts, videos, proxies, posts, postLogs, hashtags, settings };
});

ipcMain.handle("cloud:pushAll", async (_event, payload) => {
  const { config, data } = payload || {};
  if (!config) throw new Error("Thiếu cấu hình Supabase.");
  const now = new Date().toISOString();

  const accounts = (data.accounts || []).map((a, idx) => ({
    account_id: String(a.id || a.account_id || `account_${idx + 1}`),
    name: a.name || "-",
    platform: a.platform || "mixed",
    status: a.status || "Live",
    proxy: a.proxy || "",
    note: a.note || "",
    selected: !!a.selected,
    updated_at: now
  }));

  const videos = (data.videos || []).map((v, idx) => ({
    video_id: String(v.video_id || `video_${idx + 1}_${Date.now()}`),
    name: v.name || "",
    path: v.path || "",
    folder: v.folder || "",
    size_bytes: Number(v.size || v.size_bytes || 0),
    status: v.status || "ready",
    updated_at: now
  }));

  const proxies = (data.proxies || []).map((p, idx) => ({
    proxy_id: String(p.proxy_id || `proxy_${idx + 1}_${Date.now()}`),
    proxy: p.proxy || "",
    note: p.note || "",
    status: p.status || "unchecked",
    updated_at: now
  }));

  const posts = (data.posts || []).map((p, idx) => ({
    post_id: String(p.post_id || `post_${idx + 1}_${Date.now()}`),
    account_id: p.account_id || "",
    video_id: p.video_id || "",
    platform: p.platform || "tiktok",
    caption: p.caption || "",
    status: p.status || "draft",
    scheduled_at: p.scheduled_at || null,
    updated_at: now
  }));

  const hashtags = (data.hashtags || []).map((h, idx) => ({
    tag_id: String(h.tag_id || `tag_${idx + 1}_${Date.now()}`),
    platform: h.platform || "mixed",
    tag: h.tag || h.name || "",
    note: h.note || "",
    updated_at: now
  }));

  async function upsert(table, rows, onConflict) {
    if (!rows.length) return [];
    return supabaseRequest(config, table, "POST", rows, `?on_conflict=${onConflict}`);
  }

  const result = {};
  result.accounts = await upsert("accounts", accounts, "account_id");
  result.videos = await upsert("videos", videos, "video_id");
  result.proxies = await upsert("proxies", proxies, "proxy_id");
  result.posts = await upsert("posts", posts, "post_id");
  result.hashtags = await upsert("hashtags", hashtags, "tag_id");

  await supabaseRequest(config, "sync_logs", "POST", [{
    source: "desktop_app",
    action: "push_all",
    message: `Pushed accounts=${accounts.length}, videos=${videos.length}, proxies=${proxies.length}, posts=${posts.length}, hashtags=${hashtags.length}`,
    created_at: now
  }]);

  return { ok: true, result };
});

ipcMain.handle("cloud:sendToGoogleSheet", async (_event, payload) => {
  const { webhookUrl, data } = payload || {};
  if (!webhookUrl) throw new Error("Thiếu Google Sheets Webhook URL.");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      app: "Jordan Task Manager",
      edition: "v1 Cloud Sync",
      sentAt: new Date().toISOString(),
      data
    })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Google Sheets webhook lỗi ${res.status}:\n${text}`);
  return { ok: true, response: text };
});



/* JTM v9.2 Auth & Roles */
function jtmAuthHashPassword(password, salt) {
  return crypto.createHash("sha256").update(String(salt || "") + String(password || "")).digest("hex");
}

function jtmAuthNewSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function jtmAuthPublicUser(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    email: row.email,
    display_name: row.display_name || row.email,
    role: row.role || "member",
    status: row.status || "active",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_login_at: row.last_login_at || null
  };
}

async function jtmAuthLog(config, action, user, message) {
  const now = new Date().toISOString();
  const row = {
    log_id: `auth_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    action,
    user_email: user?.email || "",
    role: user?.role || "",
    message: message || "",
    created_at: now
  };
  try { await supabaseRequest(config, "auth_logs", "POST", [row]); } catch {}
  try {
    const data = readData();
    const webhookUrl = data?.cloud?.googleSheetWebhook || "";
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          app: "Jordan Task Manager",
          edition: "v9.2 Auth & Roles",
          sentAt: now,
          data: { authLogs: [row], appUsers: user ? [jtmAuthPublicUser(user)] : [] }
        })
      });
    }
  } catch {}
}

async function jtmAuthListRawUsers(config) {
  return await supabaseRequest(config, "app_users", "GET", null, "?select=*&order=created_at.asc");
}

async function jtmAuthGetUserByEmail(config, email) {
  const q = `?select=*&email=eq.${encodeURIComponent(String(email || "").toLowerCase())}&limit=1`;
  const rows = await supabaseRequest(config, "app_users", "GET", null, q);
  return rows && rows[0] ? rows[0] : null;
}


/* JTM v9.3 Team Config */
function jtmReadTeamConfig() {
  const candidates = [
    path.join(__dirname, "team_config.json"),
    path.join(process.cwd(), "src", "team_config.json"),
    path.join(process.cwd(), "team_config.json")
  ];
  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, "utf8"));
        return {
          supabaseUrl: cfg.supabaseUrl || "",
          supabaseAnonKey: cfg.supabaseAnonKey || "",
          showBootstrapAdmin: !!cfg.showBootstrapAdmin,
          appName: cfg.appName || "Jordan Task Manager",
          teamMode: cfg.teamMode !== false
        };
      }
    } catch {}
  }
  return { supabaseUrl: "", supabaseAnonKey: "", showBootstrapAdmin: false, appName: "Jordan Task Manager", teamMode: true };
}
ipcMain.handle("config:getTeamConfig", async () => jtmReadTeamConfig());
/* End JTM v9.3 Team Config */

ipcMain.handle("auth:bootstrapAdmin", async (_event, payload) => {
  const { config, email, password, displayName } = payload || {};
  if (!config) throw new Error("Thiếu cấu hình Supabase.");
  const existing = await jtmAuthListRawUsers(config);
  if (existing && existing.length) throw new Error("Đã có user trong hệ thống. Chỉ admin hiện tại mới được tạo thêm tài khoản.");
  if (!email || !password) throw new Error("Thiếu email hoặc mật khẩu admin đầu tiên.");
  const now = new Date().toISOString();
  const salt = jtmAuthNewSalt();
  const row = {
    user_id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email: String(email).toLowerCase().trim(),
    display_name: displayName || "Admin",
    role: "admin",
    status: "active",
    password_salt: salt,
    password_hash: jtmAuthHashPassword(password, salt),
    created_at: now,
    updated_at: now
  };
  const res = await supabaseRequest(config, "app_users", "POST", [row]);
  await jtmAuthLog(config, "bootstrap_admin", row, "Created first admin account");
  return { ok: true, user: jtmAuthPublicUser(row), result: res };
});

ipcMain.handle("auth:login", async (_event, payload) => {
  const { config, email, password } = payload || {};
  if (!config) throw new Error("Thiếu cấu hình Supabase.");
  const user = await jtmAuthGetUserByEmail(config, email);
  if (!user) throw new Error("Không tìm thấy tài khoản.");
  if ((user.status || "active") !== "active") throw new Error("Tài khoản đang bị khóa hoặc chưa kích hoạt.");
  const hash = jtmAuthHashPassword(password, user.password_salt);
  if (hash !== user.password_hash) {
    await jtmAuthLog(config, "login_failed", { email, role: user.role }, "Wrong password");
    throw new Error("Sai mật khẩu.");
  }
  const now = new Date().toISOString();
  await supabaseRequest(config, "app_users", "PATCH", { last_login_at: now, updated_at: now }, `?email=eq.${encodeURIComponent(String(email).toLowerCase())}`);
  const publicUser = { ...jtmAuthPublicUser(user), last_login_at: now };
  await jtmAuthLog(config, "login_success", publicUser, "Login success");
  return { ok: true, user: publicUser };
});

ipcMain.handle("auth:listUsers", async (_event, payload) => {
  const { config, currentUser } = payload || {};
  if (!currentUser || currentUser.role !== "admin") throw new Error("Chỉ admin mới được xem danh sách tài khoản.");
  const rows = await jtmAuthListRawUsers(config);
  return { ok: true, users: (rows || []).map(jtmAuthPublicUser) };
});

ipcMain.handle("auth:createUser", async (_event, payload) => {
  const { config, currentUser, user } = payload || {};
  if (!currentUser || currentUser.role !== "admin") throw new Error("Chỉ admin mới được tạo tài khoản.");
  if (!user?.email || !user?.password) throw new Error("Thiếu email hoặc mật khẩu.");
  const existed = await jtmAuthGetUserByEmail(config, user.email);
  if (existed) throw new Error("Email này đã tồn tại.");
  const now = new Date().toISOString();
  const salt = jtmAuthNewSalt();
  const row = {
    user_id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    email: String(user.email).toLowerCase().trim(),
    display_name: user.display_name || user.email,
    role: user.role === "admin" ? "admin" : "member",
    status: user.status || "active",
    password_salt: salt,
    password_hash: jtmAuthHashPassword(user.password, salt),
    created_at: now,
    updated_at: now
  };
  const res = await supabaseRequest(config, "app_users", "POST", [row]);
  await jtmAuthLog(config, "create_user", currentUser, `Created user ${row.email} as ${row.role}`);
  return { ok: true, user: jtmAuthPublicUser(row), result: res };
});

ipcMain.handle("auth:updateUser", async (_event, payload) => {
  const { config, currentUser, user } = payload || {};
  if (!currentUser || currentUser.role !== "admin") throw new Error("Chỉ admin mới được sửa tài khoản.");
  if (!user?.email) throw new Error("Thiếu email.");
  const patch = {
    display_name: user.display_name || user.email,
    role: user.role === "admin" ? "admin" : "member",
    status: user.status || "active",
    updated_at: new Date().toISOString()
  };
  if (user.password) {
    const salt = jtmAuthNewSalt();
    patch.password_salt = salt;
    patch.password_hash = jtmAuthHashPassword(user.password, salt);
  }
  const res = await supabaseRequest(config, "app_users", "PATCH", patch, `?email=eq.${encodeURIComponent(String(user.email).toLowerCase())}`);
  await jtmAuthLog(config, "update_user", currentUser, `Updated user ${user.email}`);
  return { ok: true, result: res };
});

ipcMain.handle("auth:deleteUser", async (_event, payload) => {
  const { config, currentUser, email } = payload || {};
  if (!currentUser || currentUser.role !== "admin") throw new Error("Chỉ admin mới được xóa tài khoản.");
  if (!email) throw new Error("Thiếu email.");
  if (String(email).toLowerCase() === String(currentUser.email).toLowerCase()) throw new Error("Không thể tự xóa tài khoản đang đăng nhập.");
  const res = await supabaseRequest(config, "app_users", "DELETE", null, `?email=eq.${encodeURIComponent(String(email).toLowerCase())}`);
  await jtmAuthLog(config, "delete_user", currentUser, `Deleted user ${email}`);
  return { ok: true, result: res };
});
/* End JTM v9.2 Auth & Roles */


ipcMain.handle("edge:listProfiles", () => listEdgeProfiles());
ipcMain.handle("edge:openUrl", (_event, payload) => {
  const { url, profileDirectory, appMode } = payload || {};
  if (!url) throw new Error("Thiếu URL.");
  return openInEdge(url, profileDirectory, !!appMode);
});

ipcMain.handle("dialog:chooseImage", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn ảnh cover/thumbnail",
    properties: ["openFile"],
    filters: [
      { name: "Image", extensions: ["jpg", "jpeg", "png", "webp"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("dialog:chooseVideo", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn video",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Video", extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle("dialog:chooseFolder", async () => {
  const result = await dialog.showOpenDialog({
    title: "Chọn thư mục",
    properties: ["openDirectory"]
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("file:scanVideos", async (_event, folder) => {
  if (!folder || !fs.existsSync(folder)) return [];
  const exts = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"]);
  const out = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (exts.has(path.extname(full).toLowerCase())) {
        out.push({
          path: full,
          name: path.basename(full),
          folder: path.dirname(full),
          size: st.size,
          mtime: st.mtimeMs
        });
      }
    }
  }
  walk(folder);
  return out.sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle("external:open", async (_event, url) => {
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("file:show", async (_event, filePath) => {
  if (!filePath) return false;
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("account:importCsv", async () => {
  const result = await dialog.showOpenDialog({
    title: "Nhập CSV",
    properties: ["openFile"],
    filters: [{ name: "CSV/TXT", extensions: ["csv", "txt"] }, { name: "All files", extensions: ["*"] }]
  });
  if (result.canceled) return null;
  const file = result.filePaths[0];
  const content = fs.readFileSync(file, "utf-8");
  return { file, content };
});

ipcMain.handle("account:exportCsv", async (_event, csvContent, defaultName = "jordan_export.csv") => {
  const result = await dialog.showSaveDialog({
    title: "Xuất CSV",
    defaultPath: defaultName,
    filters: [{ name: "CSV", extensions: ["csv"] }]
  });
  if (result.canceled) return null;
  fs.writeFileSync(result.filePath, csvContent || "", "utf-8");
  return result.filePath;
});


/* JTM v9.7 Douyin Translate Studio */
function jtmSafeFileName(name) {
  return String(name || "video").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").slice(0, 80);
}

function jtmRunCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", d => stdout += d.toString());
    child.stderr?.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited ${code}: ${stderr || stdout}`));
    });
  });
}

async function jtmFindFfmpeg(customPath) {
  const candidates = [
    customPath,
    process.env.FFMPEG_PATH,
    path.join(process.cwd(), "ffmpeg.exe"),
    path.join(process.cwd(), "bin", "ffmpeg.exe"),
    "ffmpeg"
  ].filter(Boolean);
  for (const cmd of candidates) {
    try {
      await jtmRunCommand(cmd, ["-version"]);
      return cmd;
    } catch {}
  }
  return null;
}



/* JTM v10.4 video aspect ratio presets */
function jtmAspectPresetInfo(preset) {
  const p = String(preset || "original").toLowerCase();
  if (p === "1:1" || p === "square") return { key: "1:1", width: 1080, height: 1080, label: "1:1 (1080x1080)" };
  if (p === "16:9" || p === "landscape") return { key: "16:9", width: 1920, height: 1080, label: "16:9 (1920x1080)" };
  if (p === "9:16" || p === "portrait") return { key: "9:16", width: 1080, height: 1920, label: "9:16 (1080x1920)" };
  return { key: "original", width: 0, height: 0, label: "Giữ nguyên khung gốc" };
}

function jtmBuildVideoCanvasFilter(preset) {
  const info = jtmAspectPresetInfo(preset);
  if (!info.width || !info.height) return "";
  return `scale=${info.width}:${info.height}:force_original_aspect_ratio=decrease,pad=${info.width}:${info.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
}

function jtmBuildSubtitleVideoFilter({ preset, srtForFfmpeg, subtitleStyle }) {
  const parts = [];
  const canvas = jtmBuildVideoCanvasFilter(preset);
  if (canvas) parts.push(canvas);
  parts.push(`subtitles='${srtForFfmpeg}':force_style='${subtitleStyle}'`);
  return parts.join(",");
}
/* End JTM v10.4 video aspect ratio presets */


/* JTM v10.3 Vietnamese subtitle style */
function jtmAssEscapeStyleValue(value) {
  return String(value || "").replace(/[,\n\r]/g, " ").trim();
}

function jtmAssColor(name, fallback) {
  const n = String(name || "").toLowerCase();
  const map = {
    black: "&H00000000",
    white: "&H00FFFFFF",
    yellow: "&H0000FFFF",
    lightyellow: "&H00CCFFFF",
    transparentblack: "&H66000000"
  };
  return map[n] || fallback || "&H00000000";
}

function jtmBuildVietnameseSubtitleForceStyle(options = {}) {
  const font = jtmAssEscapeStyleValue(options.subtitleFont || "Arial");
  const fontSize = Math.max(14, Math.min(48, Number(options.subtitleFontSize || 24)));
  const bg = jtmAssColor(options.subtitleBoxColor || "yellow", "&H0000FFFF");
  const text = jtmAssColor(options.subtitleTextColor || "black", "&H00000000");
  const marginV = Math.max(10, Math.min(120, Number(options.subtitleMarginV || 42)));

  // BorderStyle=4 creates an opaque box background behind subtitle text in libass.
  // Alignment=2 means bottom-center.
  return [
    `FontName=${font}`,
    `FontSize=${fontSize}`,
    `PrimaryColour=${text}`,
    `BackColour=${bg}`,
    "BorderStyle=4",
    "Outline=0",
    "Shadow=0",
    "Alignment=2",
    `MarginV=${marginV}`,
    "Bold=1"
  ].join(",");
}

function jtmSubtitleFontNote() {
  return "Nên dùng font hỗ trợ tiếng Việt như Arial, Segoe UI, Tahoma, Roboto hoặc Noto Sans.";
}
/* End JTM v10.3 Vietnamese subtitle style */


function jtmSrtTime(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s - Math.floor(s)) * 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")},${String(ms).padStart(3,"0")}`;
}

function jtmSrtEscape(text) {
  return String(text || "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function jtmBuildSrt(segments) {
  return (segments || []).map((seg, idx) => {
    return `${idx + 1}\n${jtmSrtTime(seg.start)} --> ${jtmSrtTime(seg.end)}\n${jtmSrtEscape(seg.vi || seg.text || "")}\n`;
  }).join("\n");
}

function jtmCleanJsonText(text) {
  let t = String(text || "").trim();
  t = t.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const first = t.indexOf("[");
  const last = t.lastIndexOf("]");
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return t;
}

async function jtmOpenAIText(apiKey, model, prompt) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${sanitizeKey(apiKey)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: model || "gpt-4o-mini", input: prompt })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyOpenAIError(res.status, text));
  const data = JSON.parse(text);
  return data.output_text || parseOpenAIText(data) || JSON.stringify(data);
}


/* JTM v10.5 Gemini smart retry/fallback */
const JTM_GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash"
];


function jtmSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function jtmGeminiIsRetryableError(err) {
  const msg = String(err?.message || err || "");
  return /503|high demand|overloaded|unavailable|temporarily|429|rate limit|quota exceeded|RESOURCE_EXHAUSTED/i.test(msg);
}

function jtmGeminiIsModelError(err) {
  const msg = String(err?.message || err || "");
  return /404|not found|not supported|NOT_FOUND/i.test(msg);
}

async function jtmGeminiListModels(apiKey) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(sanitizeKey(apiKey))}`);
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyGeminiError(res.status, text));
  const data = JSON.parse(text);
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => String(m.name || "").replace(/^models\//, ""))
    .filter(Boolean);
}

async function jtmGeminiPickModel(apiKey, preferred) {
  const pref = String(preferred || "").trim();
  if (pref) return pref;
  try {
    const available = await jtmGeminiListModels(apiKey);
    for (const m of JTM_GEMINI_MODEL_CANDIDATES) if (available.includes(m)) return m;
    return available[0] || "gemini-2.5-flash";
  } catch {
    return "gemini-2.5-flash";
  }
}

async function jtmGeminiGenerateSmart(apiKey, preferredModel, buildRequest) {
  const tried = [];
  const first = await jtmGeminiPickModel(apiKey, preferredModel);
  const candidates = [...new Set([first, ...JTM_GEMINI_MODEL_CANDIDATES])];
  let lastErr = null;

  for (const model of candidates) {
    const retryDelays = [0, 1800, 4200];
    for (let attempt = 0; attempt < retryDelays.length; attempt++) {
      if (retryDelays[attempt] > 0) await jtmSleep(retryDelays[attempt]);
      try {
        tried.push(`${model}#${attempt + 1}`);
        return { model, text: await buildRequest(model), attempts: tried };
      } catch (err) {
        lastErr = err;
        const isModelError = jtmGeminiIsModelError(err);
        const isRetryable = jtmGeminiIsRetryableError(err);

        if (isModelError) break;                 // Try next model immediately.
        if (isRetryable && attempt < retryDelays.length - 1) continue; // Retry same model.
        if (isRetryable) break;                  // Then try next model.
        throw err;                               // Non-transient error: fail fast.
      }
    }
  }

  throw new Error(`Gemini đang quá tải hoặc không có model khả dụng. Đã thử: ${tried.join(", ")}. Lỗi cuối: ${lastErr?.message || lastErr}. Hãy thử lại sau vài phút hoặc chuyển sang OpenAI nếu API còn quota.`);
}
/* End JTM v10.5 Gemini smart retry/fallback */


async function jtmGeminiText(apiKey, model, prompt) {
  const smart = await jtmGeminiGenerateSmart(apiKey, model, async (chosenModel) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${encodeURIComponent(sanitizeKey(apiKey))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(friendlyGeminiError(res.status, text));
    const data = JSON.parse(text);
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || JSON.stringify(data);
  });
  return smart.text;
}


async function jtmGeminiUploadFile(apiKey, filePath, displayName) {
  if (!apiKey) throw new Error("Thiếu Gemini API key để nhận diện/dịch audio.");
  const mime = path.extname(filePath).toLowerCase() === ".mp3" ? "audio/mpeg" : "audio/wav";
  const bytes = fs.readFileSync(filePath);
  const meta = { file: { display_name: displayName || path.basename(filePath) } };

  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(sanitizeKey(apiKey))}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(bytes.length),
      "X-Goog-Upload-Header-Content-Type": mime,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(meta)
  });
  const startText = await start.text();
  if (!start.ok) throw new Error(friendlyGeminiError(start.status, startText));
  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Gemini không trả upload URL.");

  const up = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(bytes.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: bytes
  });
  const upText = await up.text();
  if (!up.ok) throw new Error(friendlyGeminiError(up.status, upText));
  const file = JSON.parse(upText).file;
  if (!file?.uri) throw new Error("Gemini upload xong nhưng thiếu file.uri.");
  return file;
}

async function jtmGeminiGenerateWithFile(apiKey, model, file, prompt, mimeType) {
  const smart = await jtmGeminiGenerateSmart(apiKey, model, async (chosenModel) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${encodeURIComponent(sanitizeKey(apiKey))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { file_data: { mime_type: mimeType || "audio/mpeg", file_uri: file.uri } },
            { text: prompt }
          ]
        }]
      })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(friendlyGeminiError(res.status, text));
    const data = JSON.parse(text);
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || JSON.stringify(data);
  });
  return smart.text;
}

function jtmNormalizeTranscriptSegments(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((s, i) => ({
    index: Number(s.index || s.i || i + 1),
    start: Number(s.start || 0),
    end: Number(s.end || (Number(s.start || 0) + 4)),
    text: String(s.text || s.zh || "").trim()
  })).filter(x => x.text);
}


async function jtmTranscribeOpenAISmart(apiKey, audioFile, preferredModel) {
  const candidates = [...new Set([preferredModel || "whisper-1", "whisper-1"].filter(Boolean))];
  let lastErr = null;
  for (const model of candidates) {
    try {
      return await jtmTranscribeOpenAI(apiKey, audioFile, model);
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err || "");
      // Try whisper-1 if a newer/custom model rejects verbose_json/timestamps.
      if (!/model|response_format|timestamp|not found|unsupported|invalid/i.test(msg)) throw err;
    }
  }
  throw lastErr || new Error("OpenAI transcript failed.");
}

async function jtmTranscribeGemini(apiKey, audioFile, model) {
  if (!apiKey) throw new Error("Thiếu Gemini API key để nhận diện giọng nói tiếng Trung.");
  const file = await jtmGeminiUploadFile(apiKey, audioFile, "douyin_audio");
  const prompt = `
Bạn là hệ thống nhận diện giọng nói tiếng Trung cho video ngắn.
Hãy nghe audio và tạo transcript tiếng Trung có phân đoạn thời gian tương đối.
Trả về DUY NHẤT JSON array hợp lệ, không markdown, không giải thích.
Mỗi item có:
- index: số thứ tự
- start: thời gian bắt đầu tính bằng giây
- end: thời gian kết thúc tính bằng giây
- text: lời thoại tiếng Trung giản thể

Nếu không chắc timestamp chính xác, hãy ước lượng hợp lý theo thứ tự câu nói.
`;
  const raw = await jtmGeminiGenerateWithFile(apiKey, model || "gemini-2.5-flash", file, prompt, "audio/mpeg");
  let arr;
  try { arr = JSON.parse(jtmCleanJsonText(raw)); }
  catch { arr = [{ index: 1, start: 0, end: 5, text: raw.replace(/```/g, "").trim() }]; }
  const segments = jtmNormalizeTranscriptSegments(arr);
  if (!segments.length) throw new Error("Gemini không tạo được transcript hợp lệ từ audio.");
  return { text: segments.map(s => s.text).join("\n"), segments };
}

async function jtmTranscribeAuto({ openaiKey, geminiKey, audioPath, provider, geminiModel, openaiModel }) {
  if (provider === "gemini") {
    try {
      return await jtmTranscribeGemini(geminiKey, audioPath, geminiModel);
    } catch (err) {
      if (jtmGeminiIsRetryableError(err) && openaiKey) return await jtmTranscribeOpenAISmart(openaiKey, audioPath, openaiModel);
      throw err;
    }
  }
  if (provider === "openai") return await jtmTranscribeOpenAISmart(openaiKey, audioPath, openaiModel);

  try {
    if (openaiKey) return await jtmTranscribeOpenAISmart(openaiKey, audioPath, openaiModel);
  } catch (err) {
    const msg = String(err?.message || err || "");
    const isQuota = /quota|billing|insufficient_quota|rate limit|bị giới hạn billing/i.test(msg);
    if (!(isQuota && geminiKey)) throw err;
  }

  return await jtmTranscribeGemini(geminiKey, audioPath, geminiModel);
}


async function jtmTranscribeOpenAI(apiKey, audioFile, transcriptModel) {
  if (!apiKey) throw new Error("Thiếu OpenAI API key để nhận diện giọng nói tiếng Trung.");
  const buf = fs.readFileSync(audioFile);
  const blob = new Blob([buf], { type: "audio/mpeg" });
  const form = new FormData();
  form.append("file", blob, path.basename(audioFile));
  form.append("model", transcriptModel || "whisper-1");
  form.append("language", "zh");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${sanitizeKey(apiKey)}` },
    body: form
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyOpenAIError(res.status, text));
  const data = JSON.parse(text);
  const segments = (data.segments || []).map((s, i) => ({
    index: i + 1,
    start: Number(s.start || 0),
    end: Number(s.end || (Number(s.start || 0) + 3)),
    text: String(s.text || "").trim()
  })).filter(s => s.text);
  if (!segments.length && data.text) {
    segments.push({ index: 1, start: 0, end: 5, text: data.text.trim() });
  }
  return { text: data.text || segments.map(s => s.text).join("\n"), segments };
}

async function jtmTranslateSegments({ provider, openaiKey, geminiKey, model, segments, style }) {
  const compact = (segments || []).map(s => ({ i: s.index, start: s.start, end: s.end, zh: s.text }));
  const prompt = `
Bạn là biên dịch viên Trung → Việt chuyên nghiệp cho video ngắn.
Hãy dịch các segment tiếng Trung sang tiếng Việt tự nhiên, ngắn gọn, dễ đọc khi làm phụ đề.
Yêu cầu:
- Giữ nguyên số lượng segment và trường i/start/end.
- Không thêm giải thích.
- Trả về JSON array hợp lệ.
- Mỗi item có: i, start, end, zh, vi.
- Văn phong: ${style || "tự nhiên, rõ nghĩa, phù hợp video mạng xã hội"}.

Dữ liệu:
${JSON.stringify(compact, null, 2)}
`;
  const raw = provider === "gemini"
    ? await jtmGeminiText(geminiKey, model || "gemini-2.5-flash", prompt)
    : await jtmOpenAIText(openaiKey, model || "gpt-4o-mini", prompt);
  let arr;
  try {
    arr = JSON.parse(jtmCleanJsonText(raw));
  } catch {
    arr = compact.map(x => ({ ...x, vi: x.zh }));
  }
  const map = new Map(arr.map(x => [Number(x.i), x]));
  return segments.map(s => {
    const t = map.get(Number(s.index)) || {};
    return { ...s, vi: String(t.vi || s.text || "").trim() };
  });
}





/* JTM v10.6 generic clipboard helper */
ipcMain.handle("app:copyText", async (_event, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});
/* End JTM v10.6 generic clipboard helper */


/* JTM v10.2 TTS OhFree Web integration */
ipcMain.handle("ttsOhFree:open", async (_event, target) => {
  const url = target === "history" ? "https://tts.ohfree.me/voice-clone/history" : "https://tts.ohfree.me/";
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: target === "history" ? "TTS OhFree History" : "TTS OhFree",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  await win.loadURL(url);
  return true;
});

ipcMain.handle("ttsOhFree:copyText", async (_event, text) => {
  clipboard.writeText(String(text || ""));
  return true;
});
/* End JTM v10.2 TTS OhFree Web integration */


/* JTM v10.1 Web AI shortcuts */
ipcMain.handle("aiWeb:open", async (_event, target) => {
  const url = target === "gemini" ? "https://gemini.google.com/" : "https://chatgpt.com/";
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: target === "gemini" ? "Gemini Web" : "ChatGPT Web",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false }
  });
  await win.loadURL(url);
  return true;
});
/* End JTM v10.1 Web AI shortcuts */


/* JTM v10.0 FFmpeg picker */
ipcMain.handle("douyin:pickFfmpegExe", async () => {
  const r = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      { name: "FFmpeg executable", extensions: ["exe"] },
      { name: "All files", extensions: ["*"] }
    ]
  });
  if (r.canceled) return "";
  return r.filePaths[0] || "";
});
/* End JTM v10.0 FFmpeg picker */

ipcMain.handle("douyin:pickVideos", async () => {
  const r = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "webm", "m4v"] }]
  });
  if (r.canceled) return [];
  return r.filePaths.map(p => {
    const stat = fs.statSync(p);
    return { path: p, name: path.basename(p), size: stat.size };
  });
});

ipcMain.handle("douyin:pickOutputDir", async () => {
  const r = await dialog.showOpenDialog({ properties: ["openDirectory", "createDirectory"] });
  return r.canceled ? "" : r.filePaths[0];
});

ipcMain.handle("douyin:processVideo", async (_event, payload) => {
  const {
    videoPath, outputDir, openaiKey, geminiKey, translateProvider,
    translateModel, exportBurnedVideo, subtitleStyle, ffmpegPath, transcriptProvider, geminiTranscriptModel,
    subtitleFont, subtitleFontSize, subtitleBoxColor, subtitleTextColor, subtitleMarginV, outputAspectRatio,
    openaiTranscriptModel
  } = payload || {};
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Video không tồn tại.");
  const ffmpeg = await jtmFindFfmpeg(ffmpegPath);
  if (!ffmpeg) throw new Error("Chưa tìm thấy FFmpeg. Hãy bấm nút Chọn ffmpeg.exe trong tab Douyin, hoặc cài FFmpeg và thêm vào PATH, hoặc đặt ffmpeg.exe cạnh file app.");
  const outDir = outputDir || path.join(app.getPath("videos"), "JTM Douyin Translate");
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = jtmSafeFileName(path.basename(videoPath, path.extname(videoPath)));
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const audioPath = path.join(outDir, `${baseName}_${stamp}_audio.mp3`);
  const zhTxt = path.join(outDir, `${baseName}_${stamp}_zh.txt`);
  const viTxt = path.join(outDir, `${baseName}_${stamp}_vi.txt`);
  const srtPath = path.join(outDir, `${baseName}_${stamp}_vi.srt`);
  const burnedPath = path.join(outDir, `${baseName}_${stamp}_sub_vi.mp4`);

  await jtmRunCommand(ffmpeg, ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "64k", audioPath]);

  const transcript = await jtmTranscribeAuto({ openaiKey, geminiKey, audioPath, provider: transcriptProvider || "auto", geminiModel: geminiTranscriptModel || translateModel, openaiModel: openaiTranscriptModel || "whisper-1" });
  const translated = await jtmTranslateSegments({
    provider: translateProvider || "openai",
    openaiKey,
    geminiKey,
    model: translateModel,
    segments: transcript.segments,
    style: subtitleStyle
  });

  fs.writeFileSync(zhTxt, transcript.segments.map(s => `[${jtmSrtTime(s.start)}] ${s.text}`).join("\n"), "utf-8");
  fs.writeFileSync(viTxt, translated.map(s => `[${jtmSrtTime(s.start)}] ${s.vi}`).join("\n"), "utf-8");
  fs.writeFileSync(srtPath, jtmBuildSrt(translated), "utf-8");

  let finalVideo = "";
  if (exportBurnedVideo) {
    const srtForFfmpeg = srtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    const forceStyle = jtmBuildVietnameseSubtitleForceStyle({ subtitleFont, subtitleFontSize, subtitleBoxColor, subtitleTextColor, subtitleMarginV });
    const vf = jtmBuildSubtitleVideoFilter({ preset: outputAspectRatio, srtForFfmpeg, subtitleStyle: forceStyle });
    await jtmRunCommand(ffmpeg, ["-y", "-i", videoPath, "-vf", vf, "-c:a", "copy", burnedPath]);
    finalVideo = burnedPath;
  }

  return {
    ok: true,
    videoPath,
    outputDir: outDir,
    audioPath,
    zhTxt,
    viTxt,
    srtPath,
    burnedVideo: finalVideo,
    segments: translated.length,
    subtitleStyle: exportBurnedVideo ? jtmBuildVietnameseSubtitleForceStyle({ subtitleFont, subtitleFontSize, subtitleBoxColor, subtitleTextColor, subtitleMarginV }) : "",
    outputAspectInfo: jtmAspectPresetInfo(outputAspectRatio),
    fontNote: jtmSubtitleFontNote(),
    message: finalVideo ? "Đã xuất SRT/TXT và video có phụ đề Việt dạng boxed subtitle." : "Đã xuất SRT/TXT tiếng Việt."
  };
});
/* End JTM v9.7 Douyin Translate Studio */




/* JTM v9.9 AI Control Center */
function jtmRequireSuperAdmin(currentUser) {
  if (!currentUser || currentUser.role !== "admin") {
    throw new Error("Chỉ admin cao nhất mới được dùng AI Control Center.");
  }
}

function jtmAssertApproved(payload, actionName) {
  if (!payload || payload.approved !== true) {
    throw new Error(`Tác vụ "${actionName}" chưa được admin xác nhận.`);
  }
}

function jtmSafeResolvePath(inputPath) {
  if (!inputPath) throw new Error("Thiếu đường dẫn.");
  return path.resolve(String(inputPath));
}

function jtmNowStamp() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

function jtmCopyDirSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, {
    recursive: true,
    force: true,
    filter: (p) => {
      const s = String(p).replace(/\\/g, "/");
      return !/\/node_modules(\/|$)|\/dist(\/|$)|\/release(\/|$)|\/\.git(\/|$)/i.test(s);
    }
  });
}

function jtmRunTerminalCommand({ cwd, command, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const safeCwd = cwd ? jtmSafeResolvePath(cwd) : process.cwd();
    if (!fs.existsSync(safeCwd)) throw new Error("Thư mục terminal không tồn tại: " + safeCwd);
    const child = spawn(command, {
      cwd: safeCwd,
      shell: true,
      windowsHide: true,
      timeout: Math.min(Number(timeoutMs || 120000), 600000)
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", d => stdout += d.toString());
    child.stderr?.on("data", d => stderr += d.toString());
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr, cwd: safeCwd, command }));
  });
}

ipcMain.handle("aiControl:pickSourceDir", async (_event, payload) => {
  jtmRequireSuperAdmin(payload?.currentUser);
  const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return r.canceled ? "" : r.filePaths[0];
});

ipcMain.handle("aiControl:backupSource", async (_event, payload) => {
  jtmRequireSuperAdmin(payload?.currentUser);
  jtmAssertApproved(payload, "backup source");
  const src = jtmSafeResolvePath(payload.sourceDir);
  if (!fs.existsSync(src)) throw new Error("Source dir không tồn tại.");
  const backupRoot = path.join(app.getPath("documents"), "JTM AI Backups");
  const dest = path.join(backupRoot, `${path.basename(src)}_backup_${jtmNowStamp()}`);
  jtmCopyDirSafe(src, dest);
  return { ok: true, backupDir: dest };
});

ipcMain.handle("aiControl:runTerminal", async (_event, payload) => {
  jtmRequireSuperAdmin(payload?.currentUser);
  jtmAssertApproved(payload, "run terminal");
  const cmd = String(payload.command || "").trim();
  if (!cmd) throw new Error("Chưa nhập lệnh terminal.");
  const dangerous = /(format\s+[a-z]:|del\s+\/s|rmdir\s+\/s|rm\s+-rf|shutdown|powershell\s+.*encodedcommand)/i;
  if (dangerous.test(cmd)) throw new Error("Lệnh quá nguy hiểm, app đã chặn.");
  const result = await jtmRunTerminalCommand({ cwd: payload.cwd, command: cmd, timeoutMs: payload.timeoutMs });
  return { ok: result.code === 0, ...result };
});

ipcMain.handle("aiControl:writeFile", async (_event, payload) => {
  jtmRequireSuperAdmin(payload?.currentUser);
  jtmAssertApproved(payload, "write file");
  const filePath = jtmSafeResolvePath(payload.filePath);
  const content = String(payload.content ?? "");
  if (payload.backup !== false && fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak_${jtmNowStamp()}`);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
  return { ok: true, filePath };
});

ipcMain.handle("aiControl:readTextFile", async (_event, payload) => {
  jtmRequireSuperAdmin(payload?.currentUser);
  const filePath = jtmSafeResolvePath(payload.filePath);
  if (!fs.existsSync(filePath)) throw new Error("File không tồn tại.");
  const stat = fs.statSync(filePath);
  if (stat.size > 1024 * 1024 * 2) throw new Error("File quá lớn để đọc trực tiếp.");
  return { ok: true, filePath, content: fs.readFileSync(filePath, "utf-8") };
});
/* End JTM v9.9 AI Control Center */


/* JTM v9.8 Admin AI Engineer Assistant */
function jtmRequireAdmin(currentUser) {
  if (!currentUser || currentUser.role !== "admin") throw new Error("Chỉ admin mới được sử dụng Trợ lý AI Engineer.");
}
function jtmAiEngineerSystemPrompt() {
  return `Bạn là AI Engineer nội bộ của Jordan Task Manager.
Dự án dùng Electron + JavaScript + HTML/CSS + Node.js + Supabase + Google Apps Script + OpenAI/Gemini API.
Nhiệm vụ: phân tích lỗi, gợi ý sửa, tạo patch mẫu, hướng dẫn build/update. Trả lời bằng tiếng Việt, rõ ràng, thực dụng. Luôn nhắc backup và test trước khi build.`;
}
async function jtmAiEngineerAskOpenAI(payload, prompt) {
  const apiKey = payload.openaiKey;
  if (!apiKey) throw new Error("Thiếu OpenAI API key.");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${sanitizeKey(apiKey)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: payload.model || "gpt-4o-mini", input: [{ role: "system", content: jtmAiEngineerSystemPrompt() }, { role: "user", content: prompt }] })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyOpenAIError(res.status, text));
  const data = JSON.parse(text);
  return data.output_text || parseOpenAIText(data) || JSON.stringify(data);
}
async function jtmAiEngineerAskGemini(payload, prompt) {
  const apiKey = payload.geminiKey;
  if (!apiKey) throw new Error("Thiếu Gemini API key.");
  const smart = await jtmGeminiGenerateSmart(apiKey, payload.model, async (chosenModel) => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}:generateContent?key=${encodeURIComponent(sanitizeKey(apiKey))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${jtmAiEngineerSystemPrompt()}

${prompt}` }] }] })
    });
    const text = await res.text();
    if (!res.ok) throw new Error(friendlyGeminiError(res.status, text));
    const data = JSON.parse(text);
    return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || JSON.stringify(data);
  });
  return `Đang dùng Gemini model: ${smart.model}

${smart.text}`;
}
function jtmAiEngineerPrompt(p) {
  return `Chế độ: ${p.mode || "debug"}

Yêu cầu:
${p.request || ""}

Log/lỗi:
${p.log || ""}

Ngữ cảnh:
${p.context || ""}

Hãy trả lời theo cấu trúc:
1. Chẩn đoán nhanh
2. Nguyên nhân có khả năng cao nhất
3. Cách sửa đề xuất
4. File/khu vực cần sửa
5. Patch/code mẫu nếu phù hợp
6. Cách kiểm tra sau khi sửa`;
}
ipcMain.handle("aiEngineer:ask", async (_event, payload) => {
  jtmRequireAdmin(payload?.currentUser);
  const prompt = jtmAiEngineerPrompt(payload || {});
  try {
    const answer = payload?.provider === "gemini"
      ? await jtmAiEngineerAskGemini(payload || {}, prompt)
      : await jtmAiEngineerAskOpenAI(payload || {}, prompt);
    return { ok: true, answer, provider: payload?.provider || "openai" };
  } catch (err) {
    const msg = String(err?.message || err || "");
    const isQuota = /quota|billing|insufficient_quota|rate limit|bị giới hạn billing/i.test(msg);
    if ((payload?.provider || "openai") === "openai" && isQuota && payload?.geminiKey) {
      const answer = await jtmAiEngineerAskGemini({ ...(payload || {}), provider: "gemini" }, prompt);
      return {
        ok: true,
        provider: "gemini",
        fallback: true,
        answer: "OpenAI API đang lỗi quota/billing nên app đã tự chuyển sang Gemini.\n\n" + answer
      };
    }
    throw err;
  }
});
ipcMain.handle("aiEngineer:saveNote", async (_event, payload) => {
  jtmRequireAdmin(payload?.currentUser);
  const dir = path.join(app.getPath("documents"), "JTM AI Engineer Notes");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `ai_engineer_${new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0,14)}.md`);
  fs.writeFileSync(file, String(payload?.content || ""), "utf-8");
  return { ok: true, file };
});
/* End JTM v9.8 Admin AI Engineer Assistant */


ipcMain.handle("api:openaiText", async (_event, payload) => {
  const { apiKey, model, prompt } = payload || {};
  if (!apiKey || !prompt) throw new Error("Thiếu OpenAI API key hoặc prompt.");
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sanitizeKey(apiKey)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, input: prompt })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyOpenAIError(res.status, text));
  const data = JSON.parse(text);
  return data.output_text || parseOpenAIText(data) || JSON.stringify(data, null, 2);
});

ipcMain.handle("api:geminiText", async (_event, payload) => {
  const { apiKey, model, prompt } = payload || {};
  if (!apiKey || !prompt) throw new Error("Thiếu Gemini API key hoặc prompt.");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": sanitizeKey(apiKey)
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyGeminiError(res.status, text));
  const data = JSON.parse(text);
  return data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("\n").trim() || JSON.stringify(data, null, 2);
});

ipcMain.handle("api:openaiImage", async (_event, payload) => {
  const { apiKey, model, prompt, size, outputDir } = payload || {};
  if (!apiKey || !prompt) throw new Error("Thiếu OpenAI API key hoặc prompt tạo ảnh.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sanitizeKey(apiKey)}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model, prompt, size, n: 1 })
  });
  const text = await res.text();
  if (!res.ok) throw new Error(friendlyOpenAIError(res.status, text));
  const data = JSON.parse(text);
  const item = data?.data?.[0];
  if (!item) throw new Error("OpenAI không trả về ảnh hợp lệ.");
  const dir = outputDir || path.join(app.getPath("pictures"), "Jordan Task Manager");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `openai_image_${Date.now()}.png`);
  if (item.b64_json) {
    fs.writeFileSync(file, Buffer.from(item.b64_json, "base64"));
    return file;
  }
  if (item.url) {
    const img = await fetch(item.url);
    fs.writeFileSync(file, Buffer.from(await img.arrayBuffer()));
    return file;
  }
  throw new Error("Không đọc được ảnh trả về từ OpenAI.");
});


ipcMain.handle("api:geminiImage", async (_event, payload) => {
  const { apiKey, model, prompt, outputDir } = payload || {};
  if (!apiKey || !prompt) throw new Error("Thiếu Gemini API key hoặc prompt tạo ảnh.");

  const cleanKey = sanitizeKey(apiKey);
  const selectedModel = model || "gemini-2.5-flash-image";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": cleanKey
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  const text = await res.text();
  if (!res.ok) throw new Error(friendlyGeminiError(res.status, text));

  const data = JSON.parse(text);
  const candidates = data?.candidates || [];
  const dir = outputDir || path.join(app.getPath("pictures"), "Jordan Task Manager");
  fs.mkdirSync(dir, { recursive: true });

  for (const cand of candidates) {
    const parts = cand?.content?.parts || [];
    for (const part of parts) {
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData && inlineData.data) {
        const mime = inlineData.mimeType || inlineData.mime_type || "image/png";
        const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : "png";
        const file = path.join(dir, `gemini_image_${Date.now()}.${ext}`);
        fs.writeFileSync(file, Buffer.from(inlineData.data, "base64"));
        return file;
      }
    }
  }

  const textFallback = candidates
    .flatMap(c => (c?.content?.parts || []).map(p => p.text || ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  if (textFallback) {
    throw new Error(
      "Gemini trả về nội dung text thay vì ảnh.\n\n" +
      textFallback +
      "\n\nHãy kiểm tra model ảnh, quota/billing, hoặc dùng Gemini Web/App Window."
    );
  }

  throw new Error(
    "Gemini không trả về ảnh trong response. Có thể model chưa hỗ trợ image generation, API key hết quota, hoặc prompt bị chặn."
  );
});


async function setFileInputViaDebugger(webContents, filePath) {
  try { webContents.debugger.attach("1.3"); } catch (err) {}
  try {
    const search = await webContents.debugger.sendCommand("DOM.performSearch", { query: 'input[type="file"]' });
    if (!search.resultCount) throw new Error("Không tìm thấy input upload file trên trang TikTok Studio.");
    const results = await webContents.debugger.sendCommand("DOM.getSearchResults", { searchId: search.searchId, fromIndex: 0, toIndex: 1 });
    const nodeId = results.nodeIds[0];
    await webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId, files: [filePath] });
    return true;
  } finally {
    try { webContents.debugger.detach(); } catch {}
  }
}

async function tryFillCaption(webContents, caption) {
  if (!caption || !caption.trim()) return false;
  const safeCaption = JSON.stringify(caption);
  const script = `
    (async () => {
      const caption = ${safeCaption};
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      function visible(el){const r=el.getBoundingClientRect();const s=getComputedStyle(el);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'}
      const selectors = ['div[contenteditable="true"]','[role="textbox"]','textarea','input[placeholder*="caption" i]','textarea[placeholder*="caption" i]','div[aria-label*="caption" i]','div[aria-label*="mô tả" i]','div[aria-label*="chú thích" i]'];
      for (let round=0; round<25; round++) {
        for (const sel of selectors) {
          const nodes = Array.from(document.querySelectorAll(sel)).filter(visible);
          for (const el of nodes) {
            try {
              el.scrollIntoView({block:'center'}); el.focus(); el.click();
              if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                el.value = caption;
                el.dispatchEvent(new Event('input', {bubbles:true}));
                el.dispatchEvent(new Event('change', {bubbles:true}));
                return true;
              }
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, caption);
              el.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertText', data:caption}));
              return true;
            } catch(e) {}
          }
        }
        await wait(1000);
      }
      return false;
    })();
  `;
  return await webContents.executeJavaScript(script, true);
}

ipcMain.handle("tiktok:autoUpload", async (_event, payload) => {
  const { videoPath, caption, profileDirectory } = payload || {};
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Chưa chọn video hoặc file video không tồn tại.");
  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    title: "TikTok Upload - Jordan Task Manager",
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, partition: profileDirectory ? `persist:jordan-tiktok-${profileDirectory}` : "persist:jordan-tiktok-default" }
  });
  await win.loadURL(URLS.tiktokUpload);
  await new Promise(r => setTimeout(r, 6500));
  let uploaded = false, captionFilled = false, message = "";
  try { uploaded = await setFileInputViaDebugger(win.webContents, videoPath); } catch (err) { message += (err.message || String(err)) + " "; }
  await new Promise(r => setTimeout(r, 4000));
  try { captionFilled = await tryFillCaption(win.webContents, caption || ""); } catch (err) { message += "Không tự điền được caption. "; }
  return { ok: uploaded || captionFilled, uploaded, captionFilled, message: message || "Đã thử tự chèn video/caption. Bạn kiểm tra lại rồi tự bấm Đăng/Lên lịch." };
});



ipcMain.handle("social:autoUpload", async (_event, payload) => {
  const { platform, videoPath, caption, profileDirectory } = payload || {};
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Chưa chọn video hoặc file video không tồn tại.");

  const selected = String(platform || "tiktok").toLowerCase();
  const url = selected === "facebook" ? URLS.facebookBusiness : selected === "youtube" ? "https://studio.youtube.com/" : URLS.tiktokUpload;
  const title = selected === "facebook" ? "Facebook/Meta Upload - Jordan Task Manager" : selected === "youtube" ? "YouTube Studio - Jordan Task Manager" : "TikTok Upload - Jordan Task Manager";

  const win = new BrowserWindow({
    width: 1320,
    height: 900,
    title,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: profileDirectory ? `persist:jordan-${selected}-${profileDirectory}` : `persist:jordan-${selected}-default`
    }
  });

  await win.loadURL(url);
  await new Promise(r => setTimeout(r, selected === "facebook" ? 8500 : 6500));

  let uploaded = false;
  let captionFilled = false;
  let message = "";

  try {
    uploaded = await setFileInputViaDebugger(win.webContents, videoPath);
  } catch (err) {
    message += (err.message || String(err)) + " ";
  }

  await new Promise(r => setTimeout(r, 4500));

  try {
    captionFilled = await tryFillCaption(win.webContents, caption || "");
  } catch (err) {
    message += "Không tự điền được caption. ";
  }

  return {
    ok: uploaded || captionFilled,
    platform: selected,
    uploaded,
    captionFilled,
    message: message || "Đã thử tự chèn video/caption. Bạn kiểm tra lại rồi tự bấm Đăng/Lên lịch."
  };
});


ipcMain.handle("system:selfCheck", async () => {
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok, detail });
  try { add("Local storage file", true, USER_DATA_FILE); } catch (e) { add("Local storage file", false, String(e)); }
  try {
    const edge = findEdgeExe();
    add("Microsoft Edge executable", !!edge, edge || "Không tìm thấy Edge, sẽ fallback sang trình duyệt mặc định.");
  } catch (e) { add("Microsoft Edge executable", false, String(e)); }
  try {
    const profiles = listEdgeProfiles();
    add("Microsoft Edge profiles", profiles.length > 0, `${profiles.length} profile(s)`);
  } catch (e) { add("Microsoft Edge profiles", false, String(e)); }
  try { add("TikTok upload URL", !!URLS.tiktokUpload, URLS.tiktokUpload); } catch (e) { add("TikTok upload URL", false, String(e)); }
  try { add("Facebook Business URL", !!URLS.facebookBusiness, URLS.facebookBusiness); } catch (e) { add("Facebook Business URL", false, String(e)); }
  try { add("ChatGPT URL", !!URLS.chatgpt, URLS.chatgpt); } catch (e) { add("ChatGPT URL", false, String(e)); }
  try { add("Gemini URL", !!URLS.gemini, URLS.gemini); } catch (e) { add("Gemini URL", false, String(e)); }
  try {
    const tempDir = app.getPath("temp");
    fs.accessSync(tempDir, fs.constants.W_OK);
    add("Temp folder writable", true, tempDir);
  } catch (e) { add("Temp folder writable", false, String(e)); }
  try {
    const userData = app.getPath("userData");
    fs.mkdirSync(userData, { recursive: true });
    fs.accessSync(userData, fs.constants.W_OK);
    add("App userData writable", true, userData);
  } catch (e) { add("App userData writable", false, String(e)); }
  return { ok: checks.every(c => c.ok), checks };
});


const LONGF_ADMIN_URL = "https://api.longf.vn/admin/video/index.do";

async function longfSetFileInput(webContents, selectorQuery, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return false;
  try { webContents.debugger.attach("1.3"); } catch {}
  try {
    const search = await webContents.debugger.sendCommand("DOM.performSearch", { query: selectorQuery || 'input[type="file"]' });
    if (!search.resultCount) return false;
    const results = await webContents.debugger.sendCommand("DOM.getSearchResults", { searchId: search.searchId, fromIndex: 0, toIndex: 1 });
    if (!results.nodeIds || !results.nodeIds.length) return false;
    await webContents.debugger.sendCommand("DOM.setFileInputFiles", { nodeId: results.nodeIds[0], files: [filePath] });
    return true;
  } finally { try { webContents.debugger.detach(); } catch {} }
}

async function longfFillForm(webContents, item) {
  const payload = JSON.stringify(item || {});
  const script = `
    (async () => {
      const item = ${payload};
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden';
      };
      const setVal = (el, value) => {
        if (!el || value === undefined || value === null || value === '') return false;
        el.focus();
        if ('value' in el) {
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          el.textContent = value;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value }));
        }
        return true;
      };
      const byLabelNear = (labelText) => {
        const labels = Array.from(document.querySelectorAll('label, .form-label, .control-label, td, th, span, div'))
          .filter(x => (x.innerText || '').trim().toLowerCase().includes(labelText.toLowerCase()));
        for (const label of labels) {
          const box = label.closest('.form-group, .row, .layui-form-item, tr, div') || label.parentElement;
          if (!box) continue;
          const input = box.querySelector('input, textarea, select, [contenteditable="true"]');
          if (input && visible(input)) return input;
        }
        return null;
      };
      const firstVisible = (selectors) => {
        for (const sel of selectors) {
          const el = Array.from(document.querySelectorAll(sel)).find(visible);
          if (el) return el;
        }
        return null;
      };
      for (let i = 0; i < 10; i++) {
        const titleEl = byLabelNear('Title') || byLabelNear('Tiêu đề') || firstVisible(['textarea[name*="title" i]', 'input[name*="title" i]', 'textarea']);
        if (setVal(titleEl, item.title)) break;
        await wait(500);
      }
      setVal(byLabelNear('Category') || byLabelNear('Danh mục') || firstVisible(['select[name*="category" i]', 'select']), item.category);
      setVal(byLabelNear('Author') || byLabelNear('Tác giả') || firstVisible(['select[name*="author" i]', 'input[name*="author" i]']), item.author);
      setVal(byLabelNear('Publish time') || byLabelNear('Thời gian') || firstVisible(['input[type="datetime-local"]', 'input[name*="publish" i]', 'input[name*="time" i]']), item.publishTime);
      setVal(byLabelNear('Video file path') || byLabelNear('Đường dẫn') || firstVisible(['input[name*="path" i]', 'input[placeholder*="path" i]']), item.videoPath);
      const status = String(item.status || 'on').toLowerCase();
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      for (const r of radios) {
        const txt = ((r.parentElement && r.parentElement.innerText) || '').toLowerCase();
        if ((status === 'on' && txt.includes('on')) || (status === 'off' && txt.includes('off'))) { r.click(); break; }
      }
      return true;
    })();`;
  return await webContents.executeJavaScript(script, true);
}



ipcMain.handle("longf:autoPostOne", async (_event, item) => {
  const win = new BrowserWindow({ width: 1280, height: 860, title: "LongF Bulk Posting - Jordan Task Manager", autoHideMenuBar: true, backgroundColor: "#ffffff", webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, partition: "persist:jordan-longf-admin" } });
  await win.loadURL(LONGF_ADMIN_URL);
  await new Promise(resolve => setTimeout(resolve, 4000));
  try {
    await win.webContents.executeJavaScript(`(() => { const btns = Array.from(document.querySelectorAll('button, a, .btn')); const add = btns.find(b => /add|thêm|create|new/i.test(b.innerText || b.textContent || '')); if (add) { add.click(); return true; } return false; })();`, true);
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1500));
  let formFilled = false, videoSet = false, imageSet = false;
  try { formFilled = await longfFillForm(win.webContents, item); } catch {}
  try { videoSet = await longfSetFileInput(win.webContents, 'input[type="file"][accept*="mp4"], input[type="file"][accept*="mov"], input[type="file"]', item.videoPath); } catch {}
  try { imageSet = await longfSetFileInput(win.webContents, 'input[type="file"][accept*="image"], input[type="file"]', item.imagePath); } catch {}
  return { ok: formFilled || videoSet || imageSet, formFilled, videoSet, imageSet, message: "Đã mở LongF Admin và thử tự điền form. Bạn kiểm tra lại rồi bấm Confirm/Đăng nếu dữ liệu đúng." };
});



const LONGF_ADMIN_BASE = "https://api.longf.vn";

const LONGF_PARTITION = "persist:jordan-longf-admin";
let longfAdminWindowRef = null;

function getLongFSession() {
  return session.fromPartition(LONGF_PARTITION);
}

function findLongFWindow() {
  if (longfAdminWindowRef && !longfAdminWindowRef.isDestroyed()) return longfAdminWindowRef;
  const found = BrowserWindow.getAllWindows().find(w => {
    try {
      const url = String(w.webContents.getURL() || "");
      const title = String(w.getTitle() || "");
      return url.includes("api.longf.vn") || url.includes("img.longf.vn") || /LongF|Long Finance/i.test(title);
    } catch { return false; }
  });
  if (found) longfAdminWindowRef = found;
  return found || null;
}

async function createOrShowLongFWindow() {
  let win = findLongFWindow();
  if (win && !win.isDestroyed()) {
    win.show(); win.focus();
    const url = String(win.webContents.getURL() || "");
    if (!url.includes("api.longf.vn")) await win.loadURL(LONGF_VIDEO_INDEX_URL);
    return win;
  }
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "LongF Admin - Jordan Task Manager",
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, partition: LONGF_PARTITION }
  });
  longfAdminWindowRef = win;
  win.on("closed", () => { if (longfAdminWindowRef === win) longfAdminWindowRef = null; });
  await win.loadURL(LONGF_VIDEO_INDEX_URL);
  return win;
}






const LONGF_FALLBACK_CATEGORIES = [
  { value: "1", label: "Việt Nam" },
  { value: "2", label: "Quốc tế" },
  { value: "4", label: "Thị trường" },
  { value: "5", label: "Nổi bật" },
  { value: "7", label: "Giáo dục" },
  { value: "8", label: "Tài chính quốc tế" },
  { value: "9", label: "VJ" }
];

const LONGF_FALLBACK_AUTHORS = [
  { value: "", label: "-- Random selection --" },
  { value: "1", label: "Long finance" },
  { value: "1067", label: "Trung Nguyen" },
  { value: "1068", label: "Phung Ha" },
  { value: "1069", label: "Biên tập LF" },
  { value: "1070", label: "Ngoc Truc" },
  { value: "1071", label: "Minh Đạt" },
  { value: "1072", label: "Hồng Nhung" },
  { value: "1073", label: "Thanh Tùng" },
  { value: "1074", label: "LF Researcher" },
  { value: "1075", label: "Tiền Nguyễn" },
  { value: "1076", label: "Thanh Hiền" }
];

const LONGF_IMG_BASE = "https://img.longf.vn";
const LONGF_VIDEO_INDEX_URL = `${LONGF_ADMIN_BASE}/admin/video/index.do`;
const LONGF_VIDEO_ADD_RESULT_URL = `${LONGF_ADMIN_BASE}/admin/video/addResult.do`;


function getLongFAdminWindow() {
  const wins = BrowserWindow.getAllWindows();
  if (longfAdminWindowRef && !longfAdminWindowRef.isDestroyed()) return longfAdminWindowRef;
  const found = wins.find(w => {
    try {
      const url = w.webContents.getURL() || "";
      const title = w.getTitle() || "";
      return url.includes("api.longf.vn") || title.includes("LongF");
    } catch { return false; }
  });
  if (found) longfAdminWindowRef = found;
  return longfAdminWindowRef;
}

async function ensureLongFBrowserReady() {
  const win = getLongFAdminWindow();
  if (!win || win.isDestroyed()) {
    throw new Error("Chưa mở cửa sổ LongF Admin trong app. Hãy bấm 'Mở LongF Admin / Đăng nhập' trước.");
  }

  const currentUrl = win.webContents.getURL() || "";
  if (!currentUrl.includes("api.longf.vn")) {
    await win.loadURL(LONGF_VIDEO_INDEX_URL);
    await new Promise(resolve => setTimeout(resolve, 2500));
  }

  return win;
}

async function longfBrowserFetch(pathOrUrl, options = {}) {
  const win = await ensureLongFBrowserReady();
  const payload = {
    url: pathOrUrl.startsWith("http") ? pathOrUrl : `${LONGF_ADMIN_BASE}${pathOrUrl}`,
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || null
  };

  const script = `
    (async () => {
      const payload = ${JSON.stringify(payload)};
      const res = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers || {},
        body: payload.body,
        credentials: "include"
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        url: res.url,
        text
      };
    })();
  `;

  return await win.webContents.executeJavaScript(script, true);
}

async function longfBrowserGetVideoHtml() {
  const result = await longfBrowserFetch("/admin/video/index.do");
  const text = result.text || "";
  if (!result.ok) {
    throw new Error(`LongF Video List lỗi HTTP ${result.status}:\n${text.slice(0, 500)}`);
  }
  if (/login\.do|Welcome Back|Security token|Google verification code|Password/i.test(text)) {
    throw new Error(
      "LongF browser context vẫn đang ở trang đăng nhập. " +
      "Trong cửa sổ LongF Admin của app, hãy đăng nhập xong và chắc chắn thấy được Video List, rồi quay lại app bấm lại."
    );
  }
  return text;
}


function longfExtractResponseMessage(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  return data.msg || data.message || data.error || data.info || JSON.stringify(data);
}

async function longfBrowserPostAddResult(formObject) {
  const win = await ensureLongFBrowserReady();
  const script = `
    (async () => {
      const data = ${JSON.stringify(formObject || {})};
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) form.append(k, String(v));
      });
      const res = await fetch("/admin/video/addResult.do", {
        method: "POST",
        body: form,
        credentials: "include"
      });
      const text = await res.text();
      return {
        ok: res.ok,
        status: res.status,
        text
      };
    })();
  `;
  const result = await win.webContents.executeJavaScript(script, true);
  let data;
  try { data = JSON.parse(result.text); }
  catch { throw new Error("LongF addResult trả về không phải JSON:\n" + String(result.text || "").slice(0, 800)); }
  const codeOk = data.code === 200 || data.code === "200" || data.status === true || data.success === true;
  if (!(result.ok && codeOk)) {
    throw new Error("LongF tạo video lỗi:\n" + JSON.stringify(data, null, 2));
  }
  return data;
}

const LONGF_VIDEO_CLASS_URL = `${LONGF_ADMIN_BASE}/admin/videoClass/index.do`;
const LONGF_UPLOAD_VIDEO_URL = `${LONGF_IMG_BASE}/v1/upload/addEditResult.do`;



async function longfSessionFetch(url, options = {}) {
  const ses = getLongFSession();

  // Electron session.fetch uses the same cookie jar/local session as the login window.
  if (ses && typeof ses.fetch === "function") {
    return await ses.fetch(url, options);
  }

  // Fallback for older Electron: manually attach cookies.
  const cookies = await ses.cookies.get({ url });
  const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");
  const headers = Object.assign({}, options.headers || {});
  if (cookieHeader) headers["Cookie"] = cookieHeader;
  return await fetch(url, Object.assign({}, options, { headers }));
}

async function longfCheckLoggedIn() {
  const ses = getLongFSession();
  const cookies = await ses.cookies.get({ url: LONGF_ADMIN_BASE });
  const hasCookie = cookies && cookies.length > 0;
  const res = await longfSessionFetch(LONGF_VIDEO_INDEX_URL);
  const text = await res.text();
  const loginLike = /login\.do|Welcome Back|Security token|Google verification code|Password/i.test(text);
  return { ok: !!(hasCookie && !loginLike), hasCookie, loginLike, cookieCount: cookies.length };
}


async function getCookieHeaderFor(url) {
  const cookies = await getLongFSession().cookies.get({ url });
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

function longfParseOptionsFromHtml(html, fieldName) {
  const rx = new RegExp(`<select[^>]+name=["']${fieldName}["'][\\s\\S]*?<\\/select>`, "i");
  const m = String(html || "").match(rx);
  if (!m) return [];
  const opts = [];
  const optRx = /<option[^>]*value=['"]?([^'">]*)['"]?[^>]*>([\s\S]*?)<\/option>/gi;
  let x;
  while ((x = optRx.exec(m[0]))) {
    const value = String(x[1] || "").trim();
    const label = String(x[2] || "").replace(/<[^>]+>/g, "").replace(/∴/g, "").replace(/\s+/g, " ").trim();
    if (value || label) opts.push({ value, label });
  }
  return opts;
}

function longfGuessOptionValue(options, input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const direct = options.find(o => String(o.value) === raw);
  if (direct) return direct.value;
  const lower = raw.toLowerCase();
  const found = options.find(o => String(o.label || "").toLowerCase().includes(lower));
  return found ? (found.value || found.label || raw) : raw;
}

async function longfGetVideoPageHtml() {
  return await longfBrowserGetVideoHtml();
}






async function longfUploadVideoDirect(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Video không tồn tại: " + videoPath);
  const cookie = await getCookieHeaderFor(LONGF_IMG_BASE);
  const buf = fs.readFileSync(videoPath);
  const filename = path.basename(videoPath);
  const blob = new Blob([buf], { type: "video/mp4" });
  const form = new FormData();
  form.append("file", blob, filename);
  const res = await longfSessionFetch(LONGF_UPLOAD_VIDEO_URL, {
    method: "POST",
    body: form
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw jtmLongFUploadJsonParseError(text, res.status, videoPath); }
  if (!(res.ok && (data.code === 200 || data.code === "200"))) { if (res.status === 413) throw jtmLongFUploadJsonParseError(JSON.stringify(data), res.status, videoPath); throw new Error("LongF upload video lỗi HTTP " + res.status + ":\n" + JSON.stringify(data, null, 2)); }
  const result = data.result || {};
  if (!result.video_file_path) throw new Error("Upload thành công nhưng không thấy video_file_path:\n" + JSON.stringify(data, null, 2));
  return result;
}

function imageToBase64DataUrl(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return "";
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
}


function longfNormalizePublishTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 16).replace("T", " ");
  return raw.replace("T", " ");
}

async function longfCreateVideoDirect(item) {
  const html = await longfGetVideoPageHtml();
  const categories = longfParseOptionsFromHtml(html, "class_id");
  const authors = longfParseOptionsFromHtml(html, "user_id");

  let uploaded = {};
  if (!item.video_file && item.videoPath) {
    uploaded = await longfUploadVideoDirect(item.videoPath);
  }

  const effectiveCategories = categories && categories.length ? categories : LONGF_FALLBACK_CATEGORIES;
  const effectiveAuthors = authors && authors.length ? authors : LONGF_FALLBACK_AUTHORS;
  const classId = longfGuessOptionValue(effectiveCategories, item.category || item.class_id);
  const userId = longfGuessOptionValue(effectiveAuthors, item.author || item.user_id);

  if (!classId) throw new Error("LongF thiếu Category. Hãy bấm 'Lấy category/author' rồi chọn category trước khi đăng.");
  if (!item.title || !String(item.title).trim()) throw new Error("LongF thiếu Title.");
  const finalVideoPath = item.video_file || item.videoFilePath || uploaded.video_file_path || "";
  if (!finalVideoPath) throw new Error("LongF thiếu video_file_path. Hãy upload video trước hoặc để app upload tự động.");

  const cookie = await getCookieHeaderFor(LONGF_ADMIN_BASE);
  const form = new FormData();
  form.append("class_id", classId || "");
  form.append("title", item.title || "");
  form.append("user_id", userId || "");
  form.append("publish_time", longfNormalizePublishTime(item.publishTime || item.publish_time));
  form.append("video_file", finalVideoPath);
  form.append("is_open", String(item.status || item.is_open || "on").toLowerCase() === "off" || String(item.is_open) === "0" ? "0" : "1");
  form.append("image_file", item.image_file || item.imageFilePath || uploaded.image_file_path || "");

  const base64Image = imageToBase64DataUrl(item.imagePath);
  if (base64Image) form.append("base64_file", base64Image);

  const res = await longfSessionFetch(LONGF_VIDEO_ADD_RESULT_URL, {
    method: "POST",
    body: form
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("LongF addResult trả về không phải JSON:\n" + text.slice(0, 800)); }

  if (!(res.ok && (data.code === 200 || data.code === "200"))) {
    if (data.code === 401 || data.code === "401") {
      throw new Error("LongF báo 401. Session đăng nhập đã hết hạn. Hãy mở LongF Admin và đăng nhập lại.");
    }
    throw new Error("LongF tạo video lỗi:\n" + JSON.stringify(data, null, 2));
  }

  return { ok: true, response: data, uploaded, classId, userId, videoFilePath: item.video_file || item.videoFilePath || uploaded.video_file_path || "", imageFilePath: item.image_file || item.imageFilePath || uploaded.image_file_path || "" };
}





async function longfVerifyVideoCreated(title) {
  if (!title) return { checked: false, found: false };
  try {
    const html = await longfBrowserGetVideoHtml();
    return { checked: true, found: html.includes(String(title).slice(0, 40)) };
  } catch (err) {
    return { checked: false, found: false, error: err.message || String(err) };
  }
}

async function longfCreateVideoViaBrowserContext(item) {
  const html = await longfBrowserGetVideoHtml();
  const categories = longfParseOptionsFromHtml(html, "class_id");
  const authors = longfParseOptionsFromHtml(html, "user_id");
  const effectiveCategories = categories && categories.length ? categories : LONGF_FALLBACK_CATEGORIES;
  const effectiveAuthors = authors && authors.length ? authors : LONGF_FALLBACK_AUTHORS;

  let uploaded = {};
  if (!item.video_file && !item.videoFilePath && item.videoPath) {
    uploaded = await longfUploadVideoDirect(item.videoPath);
  }

  const classId = longfGuessOptionValue(effectiveCategories, item.category || item.class_id);
  const userId = longfGuessOptionValue(effectiveAuthors, item.author || item.user_id);
  const finalVideoPath = item.video_file || item.videoFilePath || uploaded.video_file_path || "";
  if (!classId) throw new Error("LongF thiếu Category. Hãy chọn category trước khi đăng.");
  if (!item.title || !String(item.title).trim()) throw new Error("LongF thiếu Title.");
  if (!finalVideoPath) throw new Error("LongF thiếu video_file_path. Hãy upload video trước hoặc để app upload tự động.");

  const formObject = {
    class_id: classId,
    title: item.title || "",
    user_id: userId || "",
    publish_time: longfNormalizePublishTime(item.publishTime || item.publish_time),
    video_file: finalVideoPath,
    is_open: String(item.status || item.is_open || "on").toLowerCase() === "off" || String(item.is_open) === "0" ? "0" : "1",
    image_file: item.image_file || item.imageFilePath || uploaded.image_file_path || ""
  };

  const base64Image = imageToBase64DataUrl(item.imagePath);
  if (base64Image) formObject.base64_file = base64Image;

  const data = await longfBrowserPostAddResult(formObject);
  const verify = await longfVerifyVideoCreated(item.title || "");
  return { ok: true, response: data, verify, uploaded, classId, userId, videoFilePath: finalVideoPath, imageFilePath: formObject.image_file || "" };
}






ipcMain.handle("system:deepUninstall", async (_event, options) => {
  const batPath = path.join(app.getPath("temp"), "Jordan_Task_Manager_Uninstall_DeepClean.bat");
  const exePath = process.execPath;
  const userProfile = process.env.USERPROFILE || app.getPath("home");
  const localApp = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");

  const lines = [
    "@echo off",
    "chcp 65001 > nul",
    "title Go cai dat Jordan Task Manager",
    "echo Dang dong Jordan Task Manager...",
    "timeout /t 2 /nobreak > nul",
    `taskkill /f /im "Jordan Task Manager.exe" > nul 2>&1`,
    "echo Dang xoa cache/profile rieng...",
    `rmdir /s /q "${path.join(userProfile, ".jordan_task_manager_browser_profile")}" > nul 2>&1`,
    `rmdir /s /q "${path.join(localApp, "Jordan Task Manager")}" > nul 2>&1`,
    `rmdir /s /q "${app.getPath("userData")}" > nul 2>&1`,
    "echo Dang xoa app hien tai...",
    `del /f /q "${exePath}" > nul 2>&1`
  ];

  if (options && options.openAppsSettings) lines.push("start ms-settings:appsfeatures");
  if (options && options.tryWingetNode) {
    lines.push("echo Dang thu go Node.js bang winget neu co...");
    lines.push('winget uninstall --id OpenJS.NodeJS.LTS -e --silent > nul 2>&1');
    lines.push('winget uninstall --id OpenJS.NodeJS -e --silent > nul 2>&1');
  }

  lines.push(`del /f /q "%~f0" > nul 2>&1`);
  fs.writeFileSync(batPath, lines.join("\r\n"), "utf-8");
  spawn("cmd.exe", ["/c", "start", "", batPath], { detached: true, stdio: "ignore" }).unref();
  app.quit();
  return true;
});

ipcMain.handle("system:uninstallNode", async (_event, options) => {
  const batPath = path.join(app.getPath("temp"), "Jordan_Uninstall_NodeJS.bat");
  const lines = [
    "@echo off",
    "chcp 65001 > nul",
    "title Go Node.js",
    "echo Dang mo Windows Apps Settings...",
    "start ms-settings:appsfeatures"
  ];
  if (options && options.tryWinget) {
    lines.push("echo Dang thu go Node.js bang winget...");
    lines.push('winget uninstall --id OpenJS.NodeJS.LTS -e --silent');
    lines.push('winget uninstall --id OpenJS.NodeJS -e --silent');
  }
  lines.push("pause");
  fs.writeFileSync(batPath, lines.join("\r\n"), "utf-8");
  spawn("cmd.exe", ["/c", "start", "", batPath], { detached: true, stdio: "ignore" }).unref();
  return true;
});

function sanitizeKey(key) {
  const cleaned = String(key || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^["']|["']$/g, "");
  if (!/^[\x00-\x7F]+$/.test(cleaned)) throw new Error("API key không hợp lệ: có ký tự tiếng Việt/ký tự đặc biệt.");
  if (/\s/.test(cleaned)) throw new Error("API key không hợp lệ: có khoảng trắng hoặc xuống dòng.");
  return cleaned;
}

function parseOpenAIText(data) {
  try {
    const chunks = [];
    for (const item of data.output || []) {
      for (const c of item.content || []) {
        if (c.type === "output_text" || c.type === "text") chunks.push(c.text || "");
      }
    }
    return chunks.join("\n").trim();
  } catch {
    return "";
  }
}

function friendlyOpenAIError(status, text) {
  try {
    const data = JSON.parse(text);
    const msg = data?.error?.message || text;
    const code = data?.error?.code || "";
    if (code.includes("billing") || msg.toLowerCase().includes("billing") || msg.toLowerCase().includes("quota")) {
      return "OpenAI API bị giới hạn billing/quota. Hãy kiểm tra Billing/Usage hoặc dùng ChatGPT Web/App Window.";
    }
    return `OpenAI API lỗi HTTP ${status}:\n${msg}`;
  } catch {
    return `OpenAI API lỗi HTTP ${status}:\n${text}`;
  }
}

function friendlyGeminiError(status, text) {
  try {
    const data = JSON.parse(text);
    const err = data.error || {};
    const msg = err.message || text;
    if (status === 429 || err.status === "RESOURCE_EXHAUSTED") {
      return "Gemini API đã hết quota hoặc vượt rate limit.\n\n" + msg + "\n\nHãy đợi reset, bật billing, đổi API key/project, hoặc dùng Gemini Web/App Window.";
    }
    return `Gemini API lỗi HTTP ${status}:\n${msg}`;
  } catch {
    return `Gemini API lỗi HTTP ${status}:\n${text}`;
  }
}







async function longfCreateVideoViaBrowserContextV81(item) {
  const html = await longfBrowserGetVideoHtml();
  const categories = longfParseOptionsFromHtml(html, "class_id");
  const authors = longfParseOptionsFromHtml(html, "user_id");
  const effectiveCategories = categories && categories.length ? categories : LONGF_FALLBACK_CATEGORIES;
  const effectiveAuthors = authors && authors.length ? authors : LONGF_FALLBACK_AUTHORS;

  let uploaded = {};
  if (!item.video_file && !item.videoFilePath && item.videoPath) {
    uploaded = await longfUploadVideoDirect(item.videoPath);
  }

  const classId = longfGuessOptionValue(effectiveCategories, item.category || item.class_id);
  const userId = longfGuessOptionValue(effectiveAuthors, item.author || item.user_id);
  const finalVideoPath = item.video_file || item.videoFilePath || uploaded.video_file_path || "";

  if (!classId) throw new Error("LongF thiếu Category. Hãy chọn category trước khi đăng.");
  if (!item.title || !String(item.title).trim()) throw new Error("LongF thiếu Title.");
  if (!finalVideoPath) throw new Error("LongF thiếu video_file_path. Hãy upload video trước hoặc để app upload tự động.");

  const formObject = {
    class_id: classId,
    title: item.title || "",
    user_id: userId || "",
    publish_time: typeof longfNormalizePublishTime === "function" ? longfNormalizePublishTime(item.publishTime || item.publish_time) : String(item.publishTime || item.publish_time || "").replace("T", " "),
    video_file: finalVideoPath,
    is_open: String(item.status || item.is_open || "on").toLowerCase() === "off" || String(item.is_open) === "0" ? "0" : "1",
    image_file: item.image_file || item.imageFilePath || uploaded.image_file_path || ""
  };
  const base64Image = imageToBase64DataUrl(item.imagePath);
  if (base64Image) formObject.base64_file = base64Image;

  const data = await longfBrowserPostAddResult(formObject);
  let verify = { checked: false, found: false };
  try { verify = await longfVerifyVideoCreated(item.title || ""); } catch {}
  return { ok: true, response: data, verify, uploaded, classId, userId, videoFilePath: finalVideoPath, imageFilePath: formObject.image_file || "" };
}










/* JTM v8.5 LongF IPC handlers */

/* JTM v9.5 LongF upload limit guard */
const JTM_LONGF_MAX_UPLOAD_MB_DEFAULT = 95;

function jtmFormatBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(2) + " KB";
  return n + " B";
}

function jtmLongFUploadLimitBytes() {
  const mb = Number(process.env.JTM_LONGF_MAX_UPLOAD_MB || JTM_LONGF_MAX_UPLOAD_MB_DEFAULT);
  return Math.max(1, mb) * 1024 * 1024;
}

function jtmLongFAssertUploadSize(videoPath) {
  const stat = fs.statSync(videoPath);
  const limit = jtmLongFUploadLimitBytes();
  if (stat.size > limit) {
    throw new Error(
      `Video quá lớn để upload lên LongF. Dung lượng hiện tại: ${jtmFormatBytes(stat.size)}. ` +
      `Giới hạn an toàn của app đang đặt khoảng ${jtmFormatBytes(limit)} để tránh lỗi server 413 Request Entity Too Large. ` +
      `Hãy xuất/nén lại video nhỏ hơn ${Math.round(limit / 1024 / 1024)}MB rồi đăng lại.`
    );
  }
  return stat;
}

function jtmLongFUploadJsonParseError(text, status, videoPath) {
  const body = String(text || "");
  const sizeText = videoPath && fs.existsSync(videoPath) ? jtmFormatBytes(fs.statSync(videoPath).size) : "không rõ";
  if (status === 413 || /413 Request Entity Too Large|Request Entity Too Large/i.test(body)) {
    return new Error(
      `LongF từ chối upload vì video quá lớn (HTTP 413 Request Entity Too Large). ` +
      `Dung lượng file: ${sizeText}. Hãy nén/xuất lại video nhỏ hơn, rồi thử lại.`
    );
  }
  if (/<!doctype html|<html/i.test(body)) {
    return new Error(
      `LongF upload trả về HTML thay vì JSON. HTTP ${status || "?"}. ` +
      `Có thể server chặn request, file quá lớn, hết phiên đăng nhập hoặc endpoint upload thay đổi. ` +
      `Nội dung trả về: ${body.slice(0, 240).replace(/\s+/g, " ")}`
    );
  }
  return new Error("LongF upload trả về không phải JSON: " + body.slice(0, 300));
}
/* End JTM v9.5 LongF upload limit guard */


const JTM_LONGF_ADMIN_BASE = "https://api.longf.vn";
const JTM_LONGF_IMG_BASE = "https://img.longf.vn";
const JTM_LONGF_PARTITION = "persist:jordan-longf-admin";
const JTM_LONGF_VIDEO_INDEX_URL = `${JTM_LONGF_ADMIN_BASE}/admin/video/index.do`;
const JTM_LONGF_UPLOAD_VIDEO_URL = `${JTM_LONGF_IMG_BASE}/v1/upload/addEditResult.do`;

const JTM_LONGF_CATEGORIES = [
  { value: "1", label: "Việt Nam" }, { value: "2", label: "Quốc tế" },
  { value: "4", label: "Thị trường" }, { value: "5", label: "Nổi bật" },
  { value: "7", label: "Giáo dục" }, { value: "8", label: "Tài chính quốc tế" },
  { value: "9", label: "VJ" }
];

const JTM_LONGF_AUTHORS = [
  { value: "", label: "-- Random selection --" }, { value: "1", label: "Long finance" },
  { value: "1067", label: "Trung Nguyen" }, { value: "1068", label: "Phung Ha" },
  { value: "1069", label: "Biên tập LF" }, { value: "1070", label: "Ngoc Truc" },
  { value: "1071", label: "Minh Đạt" }, { value: "1072", label: "Hồng Nhung" },
  { value: "1073", label: "Thanh Tùng" }, { value: "1074", label: "LF Researcher" },
  { value: "1075", label: "Tiền Nguyễn" }, { value: "1076", label: "Thanh Hiền" }
];

let jtmLongFWindow = null;

function jtmLFSession() { return session.fromPartition(JTM_LONGF_PARTITION); }

function jtmLFFindWindow() {
  if (jtmLongFWindow && !jtmLongFWindow.isDestroyed()) return jtmLongFWindow;
  const found = BrowserWindow.getAllWindows().find((w) => {
    try {
      const url = String(w.webContents.getURL() || "");
      const title = String(w.getTitle() || "");
      return url.includes("api.longf.vn") || url.includes("img.longf.vn") || /LongF|Long Finance/i.test(title);
    } catch { return false; }
  });
  if (found) jtmLongFWindow = found;
  return found || null;
}

async function jtmLFOpenWindow() {
  let win = jtmLFFindWindow();
  if (win && !win.isDestroyed()) {
    win.show(); win.focus();
    if (!String(win.webContents.getURL() || "").includes("api.longf.vn")) await win.loadURL(JTM_LONGF_VIDEO_INDEX_URL);
    return win;
  }
  win = new BrowserWindow({
    width: 1280, height: 860, title: "LongF Admin - Jordan Task Manager",
    autoHideMenuBar: true, backgroundColor: "#ffffff",
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false, partition: JTM_LONGF_PARTITION }
  });
  jtmLongFWindow = win;
  win.on("closed", () => { if (jtmLongFWindow === win) jtmLongFWindow = null; });
  await win.loadURL(JTM_LONGF_VIDEO_INDEX_URL);
  return win;
}

async function jtmLFEnsureWindow() {
  const win = jtmLFFindWindow();
  if (!win || win.isDestroyed()) {
    await jtmLFOpenWindow();
    throw new Error("Đã mở lại cửa sổ LongF Admin trong app. Hãy đăng nhập/đảm bảo vào được Video List, rồi bấm lại thao tác.");
  }
  return win;
}

async function jtmLFBrowserFetch(pathOrUrl, options = {}) {
  const win = await jtmLFEnsureWindow();
  const payload = {
    url: pathOrUrl.startsWith("http") ? pathOrUrl : `${JTM_LONGF_ADMIN_BASE}${pathOrUrl}`,
    method: options.method || "GET", headers: options.headers || {}, body: options.body || null
  };
  const script = `(async () => {
    const payload = ${JSON.stringify(payload)};
    const res = await fetch(payload.url, { method: payload.method, headers: payload.headers || {}, body: payload.body, credentials: "include", cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text };
  })();`;
  return await win.webContents.executeJavaScript(script, true);
}

async function jtmLFVideoHtml() {
  const result = await jtmLFBrowserFetch("/admin/video/index.do");
  const text = String(result.text || "");
  if (!result.ok) throw new Error(`LongF Video List lỗi HTTP ${result.status}: ${text.slice(0, 300)}`);
  const isLogin = /login\.do|Welcome Back|Security token|Google verification code|Password/i.test(text);
  const hasVideo = /Video List|Videos|videoClass|addResult|Video category|Long Finance/i.test(text);
  if (isLogin || !hasVideo) throw new Error("LongF chưa xác nhận đăng nhập trong cửa sổ app. Hãy đăng nhập xong và chắc chắn thấy Video List.");
  return text;
}

function jtmLFParseOptions(html, fieldName) {
  const rx = new RegExp(`<select[^>]+name=["']${fieldName}["'][\\s\\S]*?<\\/select>`, "i");
  const m = String(html || "").match(rx);
  if (!m) return [];
  const opts = [];
  const optRx = /<option[^>]*value=['"]?([^'">]*)['"]?[^>]*>([\s\S]*?)<\/option>/gi;
  let x;
  while ((x = optRx.exec(m[0]))) {
    const value = String(x[1] || "").trim();
    const label = String(x[2] || "").replace(/<[^>]+>/g, "").replace(/∴/g, "").replace(/\s+/g, " ").trim();
    if (value || label) opts.push({ value, label });
  }
  return opts;
}

function jtmLFGuess(options, input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const direct = options.find((o) => String(o.value) === raw);
  if (direct) return direct.value;
  const lower = raw.toLowerCase();
  const found = options.find((o) => String(o.label || "").toLowerCase().includes(lower));
  return found ? (found.value || found.label || raw) : raw;
}

function jtmLFNormTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 16).replace("T", " ");
  return raw.replace("T", " ");
}

function jtmLFImageBase64(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return "";
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
}

async function jtmLFUploadVideo(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Video không tồn tại: " + videoPath);
  
  jtmLongFAssertUploadSize(videoPath);
const buf = fs.readFileSync(videoPath);
  const blob = new Blob([buf], { type: "video/mp4" });
  const form = new FormData();
  form.append("file", blob, path.basename(videoPath));
  const cookies = await jtmLFSession().cookies.get({ url: JTM_LONGF_IMG_BASE }).catch(() => []);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(JTM_LONGF_UPLOAD_VIDEO_URL, { method: "POST", headers: cookieHeader ? { Cookie: cookieHeader } : {}, body: form });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw jtmLongFUploadJsonParseError(text, res.status, videoPath); }
  if (!(res.ok && (data.code === 200 || data.code === "200"))) { if (res.status === 413) throw jtmLongFUploadJsonParseError(JSON.stringify(data), res.status, videoPath); throw new Error("LongF upload video lỗi HTTP " + res.status + ": " + JSON.stringify(data)); }
  if (!data.result?.video_file_path) throw new Error("Upload thành công nhưng thiếu video_file_path.");
  return data.result;
}

async function jtmLFAddVideo(formObject) {
  const win = await jtmLFEnsureWindow();
  const script = `(async () => {
    const data = ${JSON.stringify(formObject || {})};
    const form = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null) form.append(k, String(v)); });
    const res = await fetch("/admin/video/addResult.do", { method: "POST", body: form, credentials: "include", cache: "no-store" });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  })();`;
  const result = await win.webContents.executeJavaScript(script, true);
  let data;
  try { data = JSON.parse(result.text); } catch { throw new Error("LongF addResult không trả JSON: " + String(result.text || "").slice(0, 500)); }
  const codeOk = data.code === 200 || data.code === "200" || data.status === true || data.success === true;
  if (!(result.ok && codeOk)) throw new Error("LongF tạo video lỗi: " + JSON.stringify(data));
  return data;
}

async function jtmLFCreateVideo(item) {
  const html = await jtmLFVideoHtml();
  const cats = jtmLFParseOptions(html, "class_id");
  const authors = jtmLFParseOptions(html, "user_id");
  const classId = jtmLFGuess(cats.length ? cats : JTM_LONGF_CATEGORIES, item.category || item.class_id);
  const userId = jtmLFGuess(authors.length ? authors : JTM_LONGF_AUTHORS, item.author || item.user_id);
  let uploaded = {};
  if (!item.video_file && !item.videoFilePath && item.videoPath) uploaded = await jtmLFUploadVideo(item.videoPath);
  const finalVideoPath = item.video_file || item.videoFilePath || uploaded.video_file_path || "";
  if (!classId) throw new Error("LongF thiếu Category.");
  if (!String(item.title || "").trim()) throw new Error("LongF thiếu Title.");
  if (!finalVideoPath) throw new Error("LongF thiếu video_file_path.");
  const formObject = {
    class_id: classId, title: item.title || "", user_id: userId || "",
    publish_time: jtmLFNormTime(item.publishTime || item.publish_time),
    video_file: finalVideoPath,
    is_open: String(item.status || item.is_open || "on").toLowerCase() === "off" || String(item.is_open) === "0" ? "0" : "1",
    image_file: item.image_file || item.imageFilePath || uploaded.image_file_path || ""
  };
  const base64 = jtmLFImageBase64(item.imagePath);
  if (base64) formObject.base64_file = base64;
  const response = await jtmLFAddVideo(formObject);
  return { ok: true, response, uploaded, classId, userId, videoFilePath: finalVideoPath, imageFilePath: formObject.image_file || "" };
}






/* End JTM v8.5 LongF IPC handlers */




/* JTM v8.7 LongF DOM auth/session handlers */
const JTM_LONGF_ADMIN_BASE_87 = "https://api.longf.vn";
const JTM_LONGF_IMG_BASE_87 = "https://img.longf.vn";
const JTM_LONGF_PARTITION_87 = "persist:jordan-longf-admin";
const JTM_LONGF_VIDEO_INDEX_URL_87 = `${JTM_LONGF_ADMIN_BASE_87}/admin/video/index.do`;
const JTM_LONGF_UPLOAD_VIDEO_URL_87 = `${JTM_LONGF_IMG_BASE_87}/v1/upload/addEditResult.do`;

const JTM_LONGF_CATEGORIES_87 = [
  { value: "1", label: "Việt Nam" },
  { value: "2", label: "Quốc tế" },
  { value: "4", label: "Thị trường" },
  { value: "5", label: "Nổi bật" },
  { value: "7", label: "Giáo dục" },
  { value: "8", label: "Tài chính quốc tế" },
  { value: "9", label: "VJ" }
];

const JTM_LONGF_AUTHORS_87 = [
  { value: "", label: "-- Random selection --" },
  { value: "1", label: "Long finance" },
  { value: "1067", label: "Trung Nguyen" },
  { value: "1068", label: "Phung Ha" },
  { value: "1069", label: "Biên tập LF" },
  { value: "1070", label: "Ngoc Truc" },
  { value: "1071", label: "Minh Đạt" },
  { value: "1072", label: "Hồng Nhung" },
  { value: "1073", label: "Thanh Tùng" },
  { value: "1074", label: "LF Researcher" },
  { value: "1075", label: "Tiền Nguyễn" },
  { value: "1076", label: "Thanh Hiền" }
];

let jtmLongFWindow87 = null;

function jtmLFSession87() {
  return session.fromPartition(JTM_LONGF_PARTITION_87);
}

function jtmLFFindWindow87() {
  if (jtmLongFWindow87 && !jtmLongFWindow87.isDestroyed()) return jtmLongFWindow87;
  const found = BrowserWindow.getAllWindows().find((w) => {
    try {
      const url = String(w.webContents.getURL() || "");
      const title = String(w.getTitle() || "");
      return url.includes("api.longf.vn") || url.includes("img.longf.vn") || /LongF|Long Finance/i.test(title);
    } catch {
      return false;
    }
  });
  if (found) jtmLongFWindow87 = found;
  return found || null;
}

async function jtmLFOpenWindow87() {
  let win = jtmLFFindWindow87();
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    if (!String(win.webContents.getURL() || "").includes("api.longf.vn")) {
      await win.loadURL(JTM_LONGF_VIDEO_INDEX_URL_87);
    }
    return win;
  }

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    title: "LongF Admin - Jordan Task Manager",
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      partition: JTM_LONGF_PARTITION_87
    }
  });

  jtmLongFWindow87 = win;
  win.on("closed", () => {
    if (jtmLongFWindow87 === win) jtmLongFWindow87 = null;
  });

  await win.loadURL(JTM_LONGF_VIDEO_INDEX_URL_87);
  return win;
}

async function jtmLFEnsureWindow87() {
  const win = jtmLFFindWindow87();
  if (!win || win.isDestroyed()) {
    await jtmLFOpenWindow87();
    throw new Error("Đã mở lại cửa sổ LongF Admin trong app. Hãy đăng nhập/đảm bảo vào được Video List, rồi bấm lại thao tác.");
  }
  return win;
}

async function jtmLFPageState87() {
  const win = await jtmLFEnsureWindow87();
  const state = await win.webContents.executeJavaScript(`
    (() => {
      const bodyText = (document.body && document.body.innerText) ? document.body.innerText : "";
      const html = document.documentElement ? document.documentElement.outerHTML : "";
      const selects = {};
      document.querySelectorAll("select").forEach((s) => {
        const key = s.getAttribute("name") || s.id || s.className || "select";
        selects[key] = Array.from(s.options || []).map(o => ({ value: o.value || "", label: (o.textContent || "").replace(/∴/g, "").trim() }));
      });
      const inputs = Array.from(document.querySelectorAll("input")).map(i => ({ name: i.name || "", id: i.id || "", type: i.type || "", value: i.type === "password" ? "" : (i.value || "") }));
      return {
        href: location.href,
        title: document.title,
        bodyText,
        html,
        selects,
        inputs,
        hasVideoListText: /Video List|Videos|Video category|Every morning|Pin\\/Unpin|Management|Long Finance/i.test(bodyText),
        hasLoginText: /Welcome Back|Security token|Google verification code|password|Log In/i.test(bodyText),
        hasAdminUrl: /\\/admin\\//i.test(location.href),
        hasVideoUrl: /\\/admin\\/video/i.test(location.href)
      };
    })();
  `, true);
  return state || {};
}

function jtmLFIsLoggedInState87(state) {
  if (!state) return false;
  if (state.hasVideoListText || state.hasVideoUrl) return true;
  if (state.hasAdminUrl && !state.hasLoginText) return true;
  return false;
}

async function jtmLFRequireLoggedIn87() {
  const state = await jtmLFPageState87();
  if (!jtmLFIsLoggedInState87(state)) {
    const summary = `url=${state.href || ""}; title=${state.title || ""}; hasLogin=${!!state.hasLoginText}; hasVideoList=${!!state.hasVideoListText}`;
    throw new Error("LongF chưa xác nhận đăng nhập theo DOM hiện tại. " + summary);
  }
  return state;
}

function jtmLFParseOptionsFromHtml87(html, fieldName) {
  const rx = new RegExp(`<select[^>]+name=["']${fieldName}["'][\\s\\S]*?<\\/select>`, "i");
  const m = String(html || "").match(rx);
  if (!m) return [];
  const opts = [];
  const optRx = /<option[^>]*value=['"]?([^'">]*)['"]?[^>]*>([\s\S]*?)<\/option>/gi;
  let x;
  while ((x = optRx.exec(m[0]))) {
    const value = String(x[1] || "").trim();
    const label = String(x[2] || "").replace(/<[^>]+>/g, "").replace(/∴/g, "").replace(/\s+/g, " ").trim();
    if (value || label) opts.push({ value, label });
  }
  return opts;
}

function jtmLFOptions87(state, fieldName, fallback) {
  const fromSelect = state && state.selects && state.selects[fieldName] ? state.selects[fieldName] : [];
  const cleanSelect = (fromSelect || []).filter(o => o && (o.value || o.label));
  if (cleanSelect.length > 1) return cleanSelect;
  const fromHtml = jtmLFParseOptionsFromHtml87(state?.html || "", fieldName);
  if (fromHtml.length > 1) return fromHtml;
  return fallback;
}

function jtmLFGuess87(options, input) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const direct = options.find((o) => String(o.value) === raw);
  if (direct) return direct.value;
  const lower = raw.toLowerCase();
  const found = options.find((o) => String(o.label || "").toLowerCase().includes(lower));
  return found ? (found.value || found.label || raw) : raw;
}

function jtmLFNormTime87(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString().slice(0, 16).replace("T", " ");
  return raw.replace("T", " ");
}

function jtmLFImageBase6487(imagePath) {
  if (!imagePath || !fs.existsSync(imagePath)) return "";
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return `data:${mime};base64,${fs.readFileSync(imagePath).toString("base64")}`;
}

async function jtmLFBrowserFetch87(pathOrUrl, options = {}) {
  const win = await jtmLFEnsureWindow87();
  const payload = {
    url: pathOrUrl.startsWith("http") ? pathOrUrl : `${JTM_LONGF_ADMIN_BASE_87}${pathOrUrl}`,
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body || null
  };
  const script = `
    (async () => {
      const payload = ${JSON.stringify(payload)};
      const res = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers || {},
        body: payload.body,
        credentials: "include",
        cache: "no-store"
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, url: res.url, text };
    })();
  `;
  return await win.webContents.executeJavaScript(script, true);
}

async function jtmLFUploadVideo87(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Video không tồn tại: " + videoPath);
  
  jtmLongFAssertUploadSize(videoPath);
const buf = fs.readFileSync(videoPath);
  const blob = new Blob([buf], { type: "video/mp4" });
  const form = new FormData();
  form.append("file", blob, path.basename(videoPath));
  const cookies = await jtmLFSession87().cookies.get({ url: JTM_LONGF_IMG_BASE_87 }).catch(() => []);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(JTM_LONGF_UPLOAD_VIDEO_URL_87, {
    method: "POST",
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
    body: form
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw jtmLongFUploadJsonParseError(text, res.status, videoPath); }
  if (!(res.ok && (data.code === 200 || data.code === "200"))) { if (res.status === 413) throw jtmLongFUploadJsonParseError(JSON.stringify(data), res.status, videoPath); throw new Error("LongF upload video lỗi HTTP " + res.status + ": " + JSON.stringify(data)); }
  if (!data.result?.video_file_path) throw new Error("Upload thành công nhưng thiếu video_file_path.");
  return data.result;
}

async function jtmLFAddVideo87(formObject) {
  await jtmLFRequireLoggedIn87();
  const win = await jtmLFEnsureWindow87();
  const script = `
    (async () => {
      const data = ${JSON.stringify(formObject || {})};
      const form = new FormData();
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && v !== null) form.append(k, String(v));
      });
      const res = await fetch("/admin/video/addResult.do", {
        method: "POST",
        body: form,
        credentials: "include",
        cache: "no-store"
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, url: res.url, text };
    })();
  `;
  const result = await win.webContents.executeJavaScript(script, true);
  let data;
  try { data = JSON.parse(result.text); }
  catch {
    const loginLike = /Welcome Back|Security token|Google verification code|Log In|password/i.test(String(result.text || ""));
    throw new Error(`LongF addResult không trả JSON. HTTP ${result.status}. loginLike=${loginLike}. Body: ${String(result.text || "").slice(0, 500)}`);
  }
  const codeOk = data.code === 200 || data.code === "200" || data.status === true || data.success === true;
  if (!(result.ok && codeOk)) throw new Error("LongF tạo video lỗi: " + JSON.stringify(data));
  return data;
}

async function jtmLFCreateVideo87(item) {
  const state = await jtmLFRequireLoggedIn87();
  const cats = jtmLFOptions87(state, "class_id", JTM_LONGF_CATEGORIES_87);
  const authors = jtmLFOptions87(state, "user_id", JTM_LONGF_AUTHORS_87);
  const classId = jtmLFGuess87(cats, item.category || item.class_id);
  const userId = jtmLFGuess87(authors, item.author || item.user_id);
  let uploaded = {};
  if (!item.video_file && !item.videoFilePath && item.videoPath) uploaded = await jtmLFUploadVideo87(item.videoPath);
  const finalVideoPath = item.video_file || item.videoFilePath || uploaded.video_file_path || "";
  if (!classId) throw new Error("LongF thiếu Category.");
  if (!String(item.title || "").trim()) throw new Error("LongF thiếu Title.");
  if (!finalVideoPath) throw new Error("LongF thiếu video_file_path.");
  const formObject = {
    class_id: classId,
    title: item.title || "",
    user_id: userId || "",
    publish_time: jtmLFNormTime87(item.publishTime || item.publish_time),
    video_file: finalVideoPath,
    is_open: String(item.status || item.is_open || "on").toLowerCase() === "off" || String(item.is_open) === "0" ? "0" : "1",
    image_file: item.image_file || item.imageFilePath || uploaded.image_file_path || ""
  };
  const base64 = jtmLFImageBase6487(item.imagePath);
  if (base64) formObject.base64_file = base64;
  const response = await jtmLFAddVideo87(formObject);
  return { ok: true, response, uploaded, classId, userId, videoFilePath: finalVideoPath, imageFilePath: formObject.image_file || "" };
}

ipcMain.handle("longf:openAdmin", async () => {
  await jtmLFOpenWindow87();
  return true;
});

ipcMain.handle("longf:checkSession", async () => {
  try {
    const win = jtmLFFindWindow87();
    const cookies = await jtmLFSession87().cookies.get({ url: JTM_LONGF_ADMIN_BASE_87 }).catch(() => []);
    if (!win || win.isDestroyed()) return { ok: false, loginLike: true, cookieCount: cookies.length, error: "Chưa có cửa sổ LongF Admin trong app." };
    const state = await jtmLFPageState87();
    const ok = jtmLFIsLoggedInState87(state);
    return {
      ok,
      loginLike: !!state.hasLoginText,
      cookieCount: cookies.length,
      url: state.href || "",
      title: state.title || "",
      hasVideoList: !!state.hasVideoListText,
      hasAdminUrl: !!state.hasAdminUrl,
      message: ok ? "Kiểm tra đăng nhập thành công: đã vào được Video List LongF." : "",
      error: ok ? "" : "DOM hiện tại chưa giống trang Video List/admin."
    };
  } catch (err) {
    const cookies = await jtmLFSession87().cookies.get({ url: JTM_LONGF_ADMIN_BASE_87 }).catch(() => []);
    return { ok: false, loginLike: true, cookieCount: cookies.length, error: err.message || String(err) };
  }
});

ipcMain.handle("longf:extractApiMap", async () => {
  const state = await jtmLFRequireLoggedIn87();
  const cats = jtmLFOptions87(state, "class_id", JTM_LONGF_CATEGORIES_87);
  const authors = jtmLFOptions87(state, "user_id", JTM_LONGF_AUTHORS_87);
  return {
    ok: true,
    map: { videoIndex: "/admin/video/index.do", videoAddResult: "/admin/video/addResult.do", videoUpload: JTM_LONGF_UPLOAD_VIDEO_URL_87 },
    categories: cats,
    authors,
    debug: { url: state.href, title: state.title, hasVideoList: state.hasVideoListText, hasLoginText: state.hasLoginText }
  };
});

ipcMain.handle("longf:uploadVideoDirect", async (_event, videoPath) => await jtmLFUploadVideo87(videoPath));
ipcMain.handle("longf:createVideoDirect", async (_event, item) => await jtmLFCreateVideo87(item || {}));
ipcMain.handle("longf:bulkCreateVideoDirect", async (_event, items) => {
  const results = [];
  for (let i = 0; i < (items || []).length; i++) {
    try { results.push({ index: i, ok: true, result: await jtmLFCreateVideo87(items[i] || {}) }); }
    catch (err) { results.push({ index: i, ok: false, error: err.message || String(err) }); }
  }
  return results;
});
/* End JTM v8.7 LongF DOM auth/session handlers */

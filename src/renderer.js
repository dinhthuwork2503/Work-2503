
jtmInitSplash();

function jtmHideSplash(){
  const splash = document.getElementById("jtmSplashScreen");
  document.body.classList.remove("jtm-app-loading");
  if(!splash) return;
  splash.classList.add("is-hidden");
  setTimeout(()=>{ try{ splash.remove(); }catch{} }, 720);
}

function jtmInitSplash(){
  document.body.classList.add("jtm-app-loading");
  const minShowMs = 1450;
  const maxShowMs = 3200;
  const startedAt = Date.now();
  const done = () => {
    const remain = Math.max(0, minShowMs - (Date.now() - startedAt));
    setTimeout(jtmHideSplash, remain);
  };
  window.addEventListener("load", done, { once:true });
  setTimeout(jtmHideSplash, maxShowMs);
}


const OPENAI_CHAT_MODELS=["gpt-5.5","gpt-5.4","gpt-5.4-mini","gpt-5.4-nano"];
const GEMINI_CHAT_MODELS=["gemini-2.5-pro","gemini-2.5-flash","gemini-2.5-flash-lite"];
const OPENAI_IMAGE_MODELS=["gpt-image-2"];
const GEMINI_IMAGE_MODELS=["gemini-2.5-flash-image","gemini-2.5-flash-image-preview"];

const LONGF_DEFAULT_CATEGORIES = [
  { value: "1", label: "Việt Nam" },
  { value: "2", label: "Quốc tế" },
  { value: "4", label: "Thị trường" },
  { value: "5", label: "Nổi bật" },
  { value: "7", label: "Giáo dục" },
  { value: "8", label: "Tài chính quốc tế" },
  { value: "9", label: "VJ" }
];

const LONGF_DEFAULT_AUTHORS = [
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

const URLS={tiktokUpload:"https://www.tiktok.com/tiktokstudio/upload?from=webapp",facebookBusiness:"https://business.facebook.com/latest/home",chatgpt:"https://chatgpt.com/",gemini:"https://gemini.google.com/app",openaiBilling:"https://platform.openai.com/settings/organization/billing/overview",geminiRateLimit:"https://ai.google.dev/gemini-api/docs/rate-limits"};
const hashtags={tiktok:["#fyp","#xuhuong","#viral","#trending","#tiktokvietnam","#news","#tintuc","#taichinh","#kinhte","#longfinance"],facebook:["#FacebookReels","#Reels","#VideoMoi","#TinTuc","#TaiChinh","#KinhTe","#DauTu","#LongFinance"]};
let state={platform:"tiktok",edgeProfile:"",accounts:[{selected:true,name:"-",id:"id12s31",status:"Live",proxy:"",result:"-",action:"-"},{selected:true,name:"-",id:"id12a31",status:"Live",proxy:"",result:"-",action:"-"},{selected:true,name:"-",id:"id1231",status:"Live",proxy:"",result:"-",action:"-"}],videos:[],proxies:[],videoPath:"",videoFolder:"",outputDir:"",imagePath:"",longfVideos:[],longfMainImage:"",longfQueue:[],cloud:{supabaseUrl:"",supabaseAnonKey:"",googleSheetWebhook:""},auth:{currentUser:null,teamConfig:null,rememberLogin:{enabled:false,email:"",password:""}},botQueue:[],douyinQueue:[],douyinOutputDir:"",douyinFfmpegPath:""};
const $=id=>document.getElementById(id);
let editingAccountIndex=null;
let editingProxyIndex=null;
document.addEventListener("DOMContentLoaded",async()=>{
  try{
    await loadState();authForceLogoutOnStartup();
    await loadTeamConfig();
    setupModels();
    bindEvents();
    await loadEdgeProfiles();
    if(typeof longfResetDraftState==="function") longfResetDraftState({keepLog:true});
    renderAll();
    showView("postingView");
    authRequireLogin();
    setStatus("Sẵn sàng.");
  }catch(e){
    console.error("App init error", e);
    const bar=document.getElementById("statusBar");
    if(bar) bar.textContent="Lỗi khởi tạo app: "+(e.message||e);
  }
});
async function loadState(){const saved=await window.JordanAPI.storageGet();if(saved&&Object.keys(saved).length)state={...state,...saved};/* v5: không tự hiện lại video/thư mục cũ khi mở app để tránh phiền. */if(state.outputDir)$("outputDirText").textContent="Thư mục lưu: "+state.outputDir;hydrateCloudFields();hydrateAuthFields();if($("douyinOutputDirText")&&state.douyinOutputDir)$("douyinOutputDirText").textContent=state.douyinOutputDir;if($("douyinFfmpegText")&&state.douyinFfmpegPath)$("douyinFfmpegText").textContent=state.douyinFfmpegPath}
function saveState(){return window.JordanAPI.storageSet(state)}


async function loadTeamConfig(){
  try{
    if(window.JordanAPI?.getTeamConfig){
      const cfg = await window.JordanAPI.getTeamConfig();
      state.auth = state.auth || {};
      state.auth.teamConfig = cfg || {};
      state.cloud = state.cloud || {};
      if(cfg?.supabaseUrl && !cfg.supabaseUrl.includes("PASTE_")) state.cloud.supabaseUrl = cfg.supabaseUrl;
      if(cfg?.supabaseAnonKey && !cfg.supabaseAnonKey.includes("PASTE_")) state.cloud.supabaseAnonKey = cfg.supabaseAnonKey;
      if($("bootstrapAdminPanel")) $("bootstrapAdminPanel").classList.toggle("hidden", !cfg?.showBootstrapAdmin);
      saveState();
      return cfg;
    }
  }catch(e){ console.warn("Team config load failed", e); }
  return null;
}


function authEnsureRememberState(){
  state.auth = state.auth || {};
  state.auth.rememberLogin = state.auth.rememberLogin || {enabled:false,email:"",password:""};
  return state.auth.rememberLogin;
}
function authHydrateRememberLogin(){
  const remember = authEnsureRememberState();
  if($("authRememberLogin")) $("authRememberLogin").checked = !!remember.enabled;
  if(remember.enabled){
    if($("authEmail")) $("authEmail").value = remember.email || "";
    if($("authPassword")) $("authPassword").value = remember.password || "";
  }else{
    if($("authPassword")) $("authPassword").value = "";
  }
}
function authSaveRememberLogin(){
  const remember = authEnsureRememberState();
  const enabled = !!$("authRememberLogin")?.checked;
  remember.enabled = enabled;
  if(enabled){
    remember.email = $("authEmail")?.value.trim() || "";
    remember.password = $("authPassword")?.value || "";
  }else{
    remember.email = "";
    remember.password = "";
  }
  saveState();
}
function authForceLogoutOnStartup(){
  state.auth = state.auth || {};
  state.auth.currentUser = null;
  saveState();
}

function authConfig(){
  state.cloud = state.cloud || {};
  const teamCfg = state.auth?.teamConfig || {};
  const url = teamCfg.supabaseUrl && !teamCfg.supabaseUrl.includes("PASTE_") ? teamCfg.supabaseUrl : ($("authSupabaseUrl")?.value.trim() || state.cloud.supabaseUrl || "");
  const key = teamCfg.supabaseAnonKey && !teamCfg.supabaseAnonKey.includes("PASTE_") ? teamCfg.supabaseAnonKey : ($("authSupabaseKey")?.value.trim() || state.cloud.supabaseAnonKey || "");
  state.cloud.supabaseUrl = url;
  state.cloud.supabaseAnonKey = key;
  if($("supabaseUrl")) $("supabaseUrl").value = url;
  if($("supabaseAnonKey")) $("supabaseAnonKey").value = key;
  saveState();
  return { supabaseUrl: url, supabaseAnonKey: key };
}

function authLog(text){
  const msg = `[${new Date().toLocaleString()}] ${text}`;
  if($("authMessage")) $("authMessage").textContent = text;
  if($("authLogBox")) $("authLogBox").value = msg + "\n" + ($("authLogBox").value || "");
  setStatus(text);
}


let loginMusicStarted = false;

function loginMusicState(){
  const storedMuted = localStorage.getItem("jtmLoginMusicMuted");
  const storedVolume = localStorage.getItem("jtmLoginMusicVolume");
  return {
    muted: storedMuted === "1",
    volume: storedVolume !== null ? Math.max(0, Math.min(1, Number(storedVolume))) : 0.35
  };
}

function loginMusicApplyUI(){
  const audio = $("loginThemeAudio");
  const toggle = $("loginMusicToggle");
  const volume = $("loginMusicVolume");
  const gate = $("authGate");
  if(!audio) return;
  const muted = audio.muted || audio.volume <= 0.001 || audio.paused;
  if(toggle) toggle.textContent = muted ? "🔇" : "🔊";
  if(volume) volume.value = Math.round((audio.volume || 0) * 100);
  if(gate) gate.classList.toggle("music-muted", muted);
}

async function loginMusicPlay(){
  const audio = $("loginThemeAudio");
  if(!audio) return;
  try{
    const st = loginMusicState();
    audio.volume = st.volume;
    audio.muted = st.muted;
    if(st.muted){
      loginMusicApplyUI();
      return;
    }
    await audio.play();
    loginMusicStarted = true;
  }catch(e){
    // Some systems block autoplay. The toggle button will start it on user click.
  }
  loginMusicApplyUI();
}

function loginMusicStop(){
  const audio = $("loginThemeAudio");
  if(!audio) return;
  try{
    audio.pause();
    audio.currentTime = 0;
  }catch{}
  loginMusicApplyUI();
}

function loginMusicInit(){
  const audio = $("loginThemeAudio");
  const toggle = $("loginMusicToggle");
  const volume = $("loginMusicVolume");
  if(!audio) return;

  const st = loginMusicState();
  audio.volume = st.volume;
  audio.muted = st.muted;
  if(volume) volume.value = Math.round(st.volume * 100);

  if(toggle){
    toggle.onclick = async () => {
      if(audio.paused || audio.muted){
        audio.muted = false;
        localStorage.setItem("jtmLoginMusicMuted", "0");
        try{ await audio.play(); loginMusicStarted = true; }catch(e){}
      }else{
        audio.muted = true;
        localStorage.setItem("jtmLoginMusicMuted", "1");
      }
      loginMusicApplyUI();
    };
  }

  if(volume){
    volume.oninput = () => {
      const v = Math.max(0, Math.min(1, Number(volume.value || 0) / 100));
      audio.volume = v;
      audio.muted = v <= 0.001;
      localStorage.setItem("jtmLoginMusicVolume", String(v));
      localStorage.setItem("jtmLoginMusicMuted", audio.muted ? "1" : "0");
      if(!audio.muted && audio.paused) audio.play().catch(()=>{});
      loginMusicApplyUI();
    };
  }

  document.addEventListener("click", () => {
    if(!loginMusicStarted && !audio.muted && $("authGate") && !$("authGate").classList.contains("hidden")){
      audio.play().then(()=>{ loginMusicStarted = true; loginMusicApplyUI(); }).catch(()=>{});
    }
  }, { once:true });

  loginMusicApplyUI();
}

function authShowGate(){
  const gate = $("authGate");
  if(gate) gate.classList.remove("hidden");
  document.body.classList.add("auth-locked");
  authHydrateRememberLogin();
  // authShowGateRememberPatch
  loginMusicInit();
  loginMusicPlay();
}

function authHideGate(){
  const gate = $("authGate");
  if(gate) gate.classList.add("hidden");
  document.body.classList.remove("auth-locked");
  loginMusicStop();
}

function authApplyRoleUI(){
  const user = state.auth?.currentUser;
  const isAdmin = user && user.role === "admin";
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
  if($("currentUserName")) $("currentUserName").textContent = user ? (user.display_name || user.email) : "Chưa đăng nhập";
  if($("currentUserRole")) $("currentUserRole").textContent = user ? `${user.role.toUpperCase()} • ${user.email}` : "Auth required";
  if($("currentUserAvatar")) $("currentUserAvatar").textContent = user ? String(user.display_name || user.email || "J").trim().charAt(0).toUpperCase() : "J";
}

function authRequireLogin(){
  if(state.auth?.currentUser){
    authHideGate();
    authApplyRoleUI();
    return true;
  }
  authShowGate();
  authApplyRoleUI();
  return false;
}

function hydrateAuthFields(){
  state.cloud = state.cloud || {};
  const teamCfg = state.auth?.teamConfig || {};
  if($("authSupabaseUrl")) $("authSupabaseUrl").value = state.cloud.supabaseUrl || teamCfg.supabaseUrl || "";
  if($("authSupabaseKey")) $("authSupabaseKey").value = state.cloud.supabaseAnonKey || teamCfg.supabaseAnonKey || "";
  if($("bootstrapAdminPanel")) $("bootstrapAdminPanel").classList.toggle("hidden", !teamCfg.showBootstrapAdmin);
  authHydrateRememberLogin();
}

async function authLogin(){
  try{
    const config = authConfig();
    const res = await window.JordanAPI.authLogin({ config, email: $("authEmail").value.trim(), password: $("authPassword").value });
    state.auth = state.auth || {};
    state.auth.currentUser = res.user;
    authSaveRememberLogin();
    saveState();
    authHideGate();
    authApplyRoleUI();
    authLog(`Đăng nhập thành công: ${res.user.display_name || res.user.email} (${res.user.role})`);
    if(res.user.role === "admin") await authRefreshUsers();
  }catch(e){ authLog(e.message || String(e)); }
}

async function authBootstrapAdmin(){
  try{
    const config = authConfig();
    const res = await window.JordanAPI.authBootstrapAdmin({
      config,
      email: $("bootstrapEmail").value.trim(),
      password: $("bootstrapPassword").value,
      displayName: $("bootstrapDisplayName").value.trim() || "Admin"
    });
    authLog(`Đã tạo admin đầu tiên: ${res.user.email}. Bây giờ hãy đăng nhập.`);
    $("authEmail").value = res.user.email;
  }catch(e){ authLog(e.message || String(e)); }
}

function authLogout(){
  state.auth = state.auth || {};
  state.auth.currentUser = null;
  saveState();
  authApplyRoleUI();
  authShowGate();
  authHydrateRememberLogin();
  authLog("Đã đăng xuất. Vui lòng đăng nhập lại để sử dụng app.");
}

async function authRefreshUsers(){
  try{
    if(!state.auth?.currentUser || state.auth.currentUser.role !== "admin") return;
    const res = await window.JordanAPI.authListUsers({ config: getCloudConfig(), currentUser: state.auth.currentUser });
    const body = $("usersTableBody");
    if(body){
      body.innerHTML = (res.users || []).map(u => `<tr data-user-email="${esc(u.email)}"><td>${esc(u.email)}</td><td>${esc(u.display_name||"")}</td><td><span class="role-pill ${u.role}">${esc(u.role)}</span></td><td>${esc(u.status)}</td><td>${esc(u.last_login_at||"-")}</td></tr>`).join("") || '<tr><td colspan="5">Chưa có user.</td></tr>';
      body.querySelectorAll("tr[data-user-email]").forEach(row => row.onclick = () => {
        const email = row.dataset.userEmail;
        const u = (res.users || []).find(x => x.email === email);
        if(!u) return;
        $("adminUserEmail").value = u.email;
        $("adminUserName").value = u.display_name || "";
        $("adminUserRole").value = u.role || "member";
        $("adminUserStatus").value = u.status || "active";
        $("adminUserPassword").value = "";
      });
    }
    authLog(`Đã tải ${res.users?.length || 0} tài khoản.`);
  }catch(e){ authLog(e.message || String(e)); }
}

async function authCreateUser(){
  try{
    const user = {
      email: $("adminUserEmail").value.trim(),
      display_name: $("adminUserName").value.trim(),
      password: $("adminUserPassword").value,
      role: $("adminUserRole").value,
      status: $("adminUserStatus").value
    };
    const res = await window.JordanAPI.authCreateUser({ config: getCloudConfig(), currentUser: state.auth.currentUser, user });
    authLog(`Đã tạo tài khoản: ${res.user.email} (${res.user.role})`);
    await authRefreshUsers();
  }catch(e){ authLog(e.message || String(e)); }
}

async function authUpdateUser(){
  try{
    const user = {
      email: $("adminUserEmail").value.trim(),
      display_name: $("adminUserName").value.trim(),
      password: $("adminUserPassword").value,
      role: $("adminUserRole").value,
      status: $("adminUserStatus").value
    };
    await window.JordanAPI.authUpdateUser({ config: getCloudConfig(), currentUser: state.auth.currentUser, user });
    authLog(`Đã cập nhật tài khoản: ${user.email}`);
    await authRefreshUsers();
  }catch(e){ authLog(e.message || String(e)); }
}

async function authDeleteUser(){
  try{
    const email = $("adminUserEmail").value.trim();
    if(!email) return alert("Chọn hoặc nhập email cần xóa.");
    if(!confirm(`Xóa tài khoản ${email}?`)) return;
    await window.JordanAPI.authDeleteUser({ config: getCloudConfig(), currentUser: state.auth.currentUser, email });
    authLog(`Đã xóa tài khoản: ${email}`);
    await authRefreshUsers();
  }catch(e){ authLog(e.message || String(e)); }
}

function hydrateCloudFields(){if(!$("supabaseUrl"))return;$("supabaseUrl").value=state.cloud?.supabaseUrl||"";$("supabaseAnonKey").value=state.cloud?.supabaseAnonKey||"";$("googleSheetWebhook").value=state.cloud?.googleSheetWebhook||""}
function getCloudConfig(){state.cloud=state.cloud||{};state.cloud.supabaseUrl=$("supabaseUrl")?.value.trim()||"";state.cloud.supabaseAnonKey=$("supabaseAnonKey")?.value.trim()||"";state.cloud.googleSheetWebhook=$("googleSheetWebhook")?.value.trim()||"";saveState();return state.cloud}
function logCloud(text){const box=$("cloudLog");if(box)box.value=`[${new Date().toLocaleString()}] ${text}\n\n`+(box.value||"")}
function collectCloudData(){return{accounts:state.accounts||[],videos:state.videos||[],proxies:state.proxies||[],posts:state.posts||[],hashtags:state.hashtags||[],botQueue:state.botQueue||[],config:state.config||{}}}
function applyCloudData(data){if(data.accounts)state.accounts=data.accounts.map(x=>({selected:!!x.selected,name:x.name||"-",id:x.account_id||x.id,status:x.status||"Live",proxy:x.proxy||"",result:"-",action:"-"}));if(data.videos)state.videos=data.videos.map(x=>({video_id:x.video_id,name:x.name,path:x.path,folder:x.folder,size:x.size_bytes,status:x.status}));if(data.proxies)state.proxies=data.proxies.map(x=>({proxy_id:x.proxy_id,proxy:x.proxy,note:x.note,status:x.status}));renderAll();saveState()}
async function testSupabase(){try{const res=await window.JordanAPI.testSupabase(getCloudConfig());logCloud(res.message||"Kết nối Supabase thành công.")}catch(e){logCloud(e.message||String(e))}}
async function pullCloud(){try{const data=await window.JordanAPI.pullCloudAll(getCloudConfig());applyCloudData(data);logCloud("Đã pull dữ liệu từ Supabase.")}catch(e){logCloud(e.message||String(e))}}
async function pushCloud(){try{const res=await window.JordanAPI.pushCloudAll({config:getCloudConfig(),data:collectCloudData()});logCloud("Đã push dữ liệu lên Supabase.")}catch(e){logCloud(e.message||String(e))}}
async function exportGoogleSheet(){try{const cfg=getCloudConfig();const res=await window.JordanAPI.sendToGoogleSheet({webhookUrl:cfg.googleSheetWebhook,data:collectCloudData()});logCloud("Đã export sang Google Sheets. Response: "+(res.response||"OK"))}catch(e){logCloud(e.message||String(e))}}
function setupModels(){fill($("openaiModel"),OPENAI_CHAT_MODELS);fill($("geminiModel"),GEMINI_CHAT_MODELS);fill($("imageOpenAIModel"),OPENAI_IMAGE_MODELS);fill($("imageGeminiModel"),GEMINI_IMAGE_MODELS)}
function fill(sel,arr){sel.innerHTML="";arr.forEach(x=>{const o=document.createElement("option");o.value=x;o.textContent=x;sel.appendChild(o)})}
async function loadEdgeProfiles(){const profiles=await window.JordanAPI.listEdgeProfiles();const sel=$("edgeProfileSelect");sel.innerHTML="";profiles.forEach(p=>{const o=document.createElement("option");o.value=p.directory;o.textContent=p.displayName;sel.appendChild(o)});if(state.edgeProfile)sel.value=state.edgeProfile;if(!sel.value&&profiles[0])sel.value=profiles[0].directory;state.edgeProfile=sel.value;saveState();setStatus(profiles.length?`Đã tìm thấy ${profiles.length} Edge profile.`:"Chưa tìm thấy Edge profile.")}
function profile(){return $("edgeProfileSelect").value||state.edgeProfile||""}
function bindEvents(){
if($("aiControlPickSourceBtn"))$("aiControlPickSourceBtn").onclick=aiControlPickSource;
if($("aiControlBackupBtn"))$("aiControlBackupBtn").onclick=aiControlBackup;
if($("aiControlRunCommandBtn"))$("aiControlRunCommandBtn").onclick=aiControlRunCommand;
if($("aiControlWriteFileBtn"))$("aiControlWriteFileBtn").onclick=aiControlWriteFile;
if($("aiOpenChatGPTWebBtn"))$("aiOpenChatGPTWebBtn").onclick=()=>window.JordanAPI.openAIWeb("chatgpt");
if($("aiOpenGeminiWebBtn"))$("aiOpenGeminiWebBtn").onclick=()=>window.JordanAPI.openAIWeb("gemini");
if($("aiEngineerAskBtn"))$("aiEngineerAskBtn").onclick=aiEngineerAsk;
if($("aiEngineerClearBtn"))$("aiEngineerClearBtn").onclick=aiEngineerClear;
if($("aiEngineerCopyBtn"))$("aiEngineerCopyBtn").onclick=aiEngineerCopy;
if($("aiEngineerSaveBtn"))$("aiEngineerSaveBtn").onclick=aiEngineerSave;
if($("authLoginBtn"))$("authLoginBtn").onclick=authLogin;
if($("authRememberLogin"))$("authRememberLogin").onchange=authSaveRememberLogin;
if($("authPassword"))$("authPassword").addEventListener("keydown",e=>{if(e.key==="Enter")authLogin()});
if($("authEmail"))$("authEmail").addEventListener("input",()=>{if($("authRememberLogin")?.checked)authSaveRememberLogin()});
if($("authPassword"))$("authPassword").addEventListener("input",()=>{if($("authRememberLogin")?.checked)authSaveRememberLogin()});
// authRememberLiveSave
if($("showDevAuthSetupBtn"))$("showDevAuthSetupBtn").onclick=()=>{$("authDevSetup")?.classList.toggle("hidden")};
if($("bootstrapAdminBtn"))$("bootstrapAdminBtn").onclick=authBootstrapAdmin;
if($("logoutBtn"))$("logoutBtn").onclick=authLogout;
if($("refreshUsersBtn"))$("refreshUsersBtn").onclick=authRefreshUsers;
if($("createUserBtn"))$("createUserBtn").onclick=authCreateUser;
if($("updateUserBtn"))$("updateUserBtn").onclick=authUpdateUser;
if($("deleteUserBtn"))$("deleteUserBtn").onclick=authDeleteUser;
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{const v=b.dataset.view;setActiveMenu(b);if(v==="posting")showView("postingView");else if(v==="accounts")showView("accountsView");else if(v==="videos")showView("videosView");else if(v==="proxy")showView("proxyView");else if(v==="bot")showView("botView");else if(v==="longf"){showView("longfView");setTimeout(()=>{if(typeof longfEnsureSelects==="function")longfEnsureSelects();},0);}else if(v==="douyin"){showView("douyinView");douyinRenderQueue();}else if(v==="ttsOhFree"){showView("ttsOhFreeView");}else if(v==="aiEngineer"){if(state.auth?.currentUser?.role==="admin")showView("aiEngineerView");else alert("Chỉ admin mới được dùng Trợ lý AI.")}else if(v==="ai")showView("aiView");else if(v==="image")showView("imageView");else if(v==="cloud")showView("cloudView");else if(v==="users"){if(state.auth?.currentUser?.role==="admin"){showView("usersView");authRefreshUsers()}else alert("Chỉ admin mới được vào Quản lý thành viên.")}else if(v==="diagnostics")showView("diagnosticsView");else if(v==="settings")showView("settingsView")});
document.querySelectorAll(".nav-sub").forEach(b=>b.onclick=()=>{setActiveMenu(b);state.platform=b.dataset.platform||"tiktok";$("configTitle").textContent=state.platform==="facebook"?"Cấu hình đăng Facebook":state.platform==="youtube"?"Cấu hình đăng Youtube Short":"Cấu hình đăng Tiktok";showView("postingView");saveState()});
$("edgeProfileSelect").onchange=()=>{state.edgeProfile=profile();saveState();setStatus("Đã chọn Edge profile: "+state.edgeProfile)};
$("refreshEdgeProfiles").onclick=loadEdgeProfiles;$("openTikTokProfile").onclick=()=>openEdge(URLS.tiktokUpload,true);$("openFacebookProfile").onclick=()=>openEdge(URLS.facebookBusiness,true);
$("selectAll").onchange=e=>{state.accounts.forEach(a=>a.selected=e.target.checked);renderAccounts();saveState()};$("accountSearch").oninput=renderAccounts;
$("addAccountBtn").onclick=addAccount;$("accAdd2").onclick=addAccount;$("editAccountBtn").onclick=editSelectedAccount;$("importAccountsBtn").onclick=importAccounts;$("accImport2").onclick=importAccounts;$("exportAccountsBtn").onclick=exportAccounts;$("accExport2").onclick=exportAccounts;$("deleteAccountBtn").onclick=deleteSelectedAccounts;
$("pickVideoBtn").onclick=pickVideo;$("chooseVideoFolderBtn").onclick=chooseVideoFolder;$("scanVideosBtn").onclick=scanVideos;if($("clearSelectedVideoBtn"))$("clearSelectedVideoBtn").onclick=clearSelectedVideo;if($("clearVideoFolderBtn"))$("clearVideoFolderBtn").onclick=clearVideoFolder;if($("clearVideoListBtn"))$("clearVideoListBtn").onclick=clearVideoList;$("addTiktokHash").onclick=()=>appendHash("tiktok");$("addFacebookHash").onclick=()=>appendHash("facebook");$("clearCaption").onclick=()=>$("captionBox").value="";
$("startBtn").onclick=startPosting;$("saveConfigBtn").onclick=saveConfig;$("resetConfigBtn").onclick=resetConfig;
$("addProxyBtn").onclick=addProxy;$("importProxyBtn").onclick=importProxy;$("exportProxyBtn").onclick=exportProxy;$("assignProxyBtn").onclick=assignProxyToSelected;
$("chatgptWebBtn").onclick=() => openEdge(URLS.chatgpt,true);$("geminiWebBtn").onclick=()=>openEdge(URLS.gemini,true);$("openaiBillingBtn").onclick=()=>window.JordanAPI.openExternal(URLS.openaiBilling);$("geminiQuotaBtn").onclick=()=>window.JordanAPI.openExternal(URLS.geminiRateLimit);
$("askOpenAI").onclick=askOpenAI;$("askGemini").onclick=askGemini;$("copyAI").onclick=()=>navigator.clipboard.writeText($("aiOutput").value||"");$("openChatGPTWeb").onclick=()=>openEdge(URLS.chatgpt,true);$("openGeminiWeb").onclick=()=>openEdge(URLS.gemini,true);
$("chooseOutputDir").onclick=chooseOutputDir;$("generateOpenAIImage").onclick=generateOpenAIImage;$("generateGeminiImage").onclick=generateGeminiImage;$("openGeminiImageWeb").onclick=()=>openEdge(URLS.gemini,true);$("geminiImageQuota").onclick=()=>window.JordanAPI.openExternal(URLS.geminiRateLimit);$("openImageFile").onclick=()=>state.imagePath&&window.JordanAPI.openExternal("file:///"+state.imagePath.replace(/\\/g,"/"));$("openImageFolder").onclick=()=>state.outputDir&&window.JordanAPI.openExternal("file:///"+state.outputDir.replace(/\\/g,"/"));
$("deepUninstallBtn").onclick=deepUninstall;$("uninstallNodeBtn").onclick=uninstallNode;

if($("ttsOhFreeOpenBtn"))$("ttsOhFreeOpenBtn").onclick=ttsOhFreeOpen;
if($("ttsOhFreeHistoryBtn"))$("ttsOhFreeHistoryBtn").onclick=ttsOhFreeHistory;
if($("ttsOhFreeCopyBtn"))$("ttsOhFreeCopyBtn").onclick=ttsOhFreeCopy;
if($("douyinSendToTtsBtn"))$("douyinSendToTtsBtn").onclick=douyinSendToTts;
if($("douyinCopyWebPromptBtn"))$("douyinCopyWebPromptBtn").onclick=douyinCopyWebPrompt;
if($("douyinOpenChatGPTWebBtn"))$("douyinOpenChatGPTWebBtn").onclick=()=>window.JordanAPI.openAIWeb("chatgpt");
if($("douyinOpenGeminiWebBtn"))$("douyinOpenGeminiWebBtn").onclick=()=>window.JordanAPI.openAIWeb("gemini");
if($("douyinPickVideos"))$("douyinPickVideos").onclick=douyinPickVideos;
if($("douyinRunQueue"))$("douyinRunQueue").onclick=douyinRunQueue;
if($("douyinClearQueue"))$("douyinClearQueue").onclick=douyinClearQueue;
if($("douyinPickOutputDir"))$("douyinPickOutputDir").onclick=douyinPickOutputDir;
if($("douyinPickFfmpegBtn"))$("douyinPickFfmpegBtn").onclick=douyinPickFfmpeg;
if($("longfOpenAdminBtn"))$("longfOpenAdminBtn").onclick=longfOpenAdmin;
if($("longfCheckSessionBtn"))$("longfCheckSessionBtn").onclick=longfCheckSession;
if($("longfApiDiscoveryBtn"))$("longfApiDiscoveryBtn").onclick=longfApiDiscovery;
if($("longfChooseVideosBtn"))$("longfChooseVideosBtn").onclick=longfChooseVideos;
if($("longfChooseMainImageBtn"))$("longfChooseMainImageBtn").onclick=longfChooseMainImage;
if($("longfClearSelectedBtn"))$("longfClearSelectedBtn").onclick=longfClearSelectedVideo;
if($("longfClearCoverBtn"))$("longfClearCoverBtn").onclick=longfClearCover;
if($("longfUploadSelectedBtn"))$("longfUploadSelectedBtn").onclick=longfUploadSelectedVideo;
if($("longfSyncTimeBtn"))$("longfSyncTimeBtn").onclick=longfSyncPublishTime;
if($("longfAiSuggestBtn"))$("longfAiSuggestBtn").onclick=longfAiSuggest;
if($("longfGenerateFromVideosBtn"))$("longfGenerateFromVideosBtn").onclick=longfGenerateFromVideos;
if($("longfAddManualBtn"))$("longfAddManualBtn").onclick=longfAddManual;
if($("longfClearQueueBtn"))$("longfClearQueueBtn").onclick=longfClearQueue;
if($("longfResetQueueBtn"))$("longfResetQueueBtn").onclick=()=>longfResetDraftState();
if($("longfRunApiQueueBtn"))$("longfRunApiQueueBtn").onclick=longfRunApiQueue;
if($("longfRunQueueBtn"))$("longfRunQueueBtn").onclick=longfRunQueue;
if($("longfExportQueueBtn"))$("longfExportQueueBtn").onclick=longfExportQueue;


if($("longfOpenAdminBtn"))$("longfOpenAdminBtn").onclick=longfOpenAdmin;
if($("longfCheckSessionBtn"))$("longfCheckSessionBtn").onclick=longfCheckSession;
if($("longfApiDiscoveryBtn"))$("longfApiDiscoveryBtn").onclick=longfApiDiscovery;
if($("longfChooseVideosBtn"))$("longfChooseVideosBtn").onclick=longfChooseVideos;
if($("longfChooseMainImageBtn"))$("longfChooseMainImageBtn").onclick=longfChooseMainImage;
if($("longfGenerateFromVideosBtn"))$("longfGenerateFromVideosBtn").onclick=longfGenerateFromVideos;
if($("longfClearQueueBtn"))$("longfClearQueueBtn").onclick=longfClearQueue;
if($("longfResetQueueBtn"))$("longfResetQueueBtn").onclick=()=>longfResetDraftState();
if($("longfRunApiQueueBtn"))$("longfRunApiQueueBtn").onclick=longfRunApiQueue;
if($("longfRunQueueBtn"))$("longfRunQueueBtn").onclick=longfRunQueue;
if($("longfExportQueueBtn"))$("longfExportQueueBtn").onclick=longfExportQueue;
if($("longfOpenAdminBtn"))$("longfOpenAdminBtn").onclick=longfOpenAdmin;if($("longfTestOpenBtn"))$("longfTestOpenBtn").onclick=longfOpenAdmin;if($("longfChooseVideosBtn"))$("longfChooseVideosBtn").onclick=longfChooseVideos;if($("longfChooseMainImageBtn"))$("longfChooseMainImageBtn").onclick=longfChooseMainImage;if($("longfGenerateFromVideosBtn"))$("longfGenerateFromVideosBtn").onclick=longfGenerateFromVideos;if($("longfAddManualBtn"))$("longfAddManualBtn").onclick=longfAddManual;if($("longfClearQueueBtn"))$("longfClearQueueBtn").onclick=longfClearQueue;
if($("longfResetQueueBtn"))$("longfResetQueueBtn").onclick=()=>longfResetDraftState();if($("longfRunQueueBtn"))$("longfRunQueueBtn").onclick=longfRunQueue;if($("longfExportQueueBtn"))$("longfExportQueueBtn").onclick=longfExportQueue;if($("runSelfCheckBtn"))$("runSelfCheckBtn").onclick=runSelfCheck;if($("copySelfCheckBtn"))$("copySelfCheckBtn").onclick=copySelfCheck;if($("saveAccountModal"))$("saveAccountModal").onclick=saveAccountFromModal;if($("cancelAccountModal"))$("cancelAccountModal").onclick=closeAccountModal;if($("saveProxyModal"))$("saveProxyModal").onclick=saveProxyFromModal;if($("cancelProxyModal"))$("cancelProxyModal").onclick=closeProxyModal;if($("botPickVideos"))$("botPickVideos").onclick=botPickVideos;if($("botUseScannedVideos"))$("botUseScannedVideos").onclick=botUseScannedVideos;if($("botClearQueue"))$("botClearQueue").onclick=botClearQueue;if($("botClearScannedVideos"))$("botClearScannedVideos").onclick=clearVideoList;if($("botGenerateCaptions"))$("botGenerateCaptions").onclick=botGenerateCaptions;if($("botRunQueue"))$("botRunQueue").onclick=botRunQueue;if($("testSupabaseBtn"))$("testSupabaseBtn").onclick=testSupabase;if($("pullCloudBtn"))$("pullCloudBtn").onclick=pullCloud;if($("pushCloudBtn"))$("pushCloudBtn").onclick=pushCloud;if($("exportSheetBtn"))$("exportSheetBtn").onclick=exportGoogleSheet;if($("openAppsScriptGuide"))$("openAppsScriptGuide").onclick=()=>window.JordanAPI.openExternal("https://developers.google.com/apps-script/guides/web");
}
function showView(id){document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden"));$(id).classList.remove("hidden");if(id==="accountsView")renderAccountsList();if(id==="videosView")renderVideos();if(id==="proxyView")renderProxies();if(id==="botView")renderBotQueue();if(typeof renderLongFQueue==="function")renderLongFQueue()}
function setActiveMenu(clicked){document.querySelectorAll(".nav-item,.nav-sub").forEach(x=>x.classList.remove("active"));clicked.classList.add("active");if(clicked.classList.contains("nav-sub")){const parent=clicked.closest(".nav-group");const parentItem=parent&&parent.querySelector(".nav-item.primary");if(parentItem)parentItem.classList.add("active")}}
function renderAll(){renderAccounts();renderAccountsList();renderVideos();renderProxies();if(typeof renderBotQueue==="function")renderBotQueue();if(typeof renderLongFQueue==="function")renderLongFQueue();if(typeof douyinRenderQueue==="function")douyinRenderQueue();if(typeof longfEnsureSelects==="function")longfEnsureSelects();}
function renderAccounts(){const body=$("accountsBody");body.innerHTML="";const q=($("accountSearch")?.value||"").toLowerCase();state.accounts.forEach((a,i)=>{if(q&&!`${a.name} ${a.id} ${a.proxy}`.toLowerCase().includes(q))return;const tr=document.createElement("tr");tr.innerHTML=`<td class=center><input type=checkbox ${a.selected?"checked":""} data-i="${i}"></td><td class=center>${i+1}</td><td>${esc(a.name||"-")}</td><td>${esc(a.id||"-")}</td><td class=center><span class=live-pill>${esc(a.status||"Live")}</span></td><td>${a.proxy?`<span class=proxy-pill>${esc(a.proxy)}</span>`:"-"}</td><td>${esc(a.result||"-")}</td><td>${esc(a.action||"-")}</td>`;body.appendChild(tr)});body.querySelectorAll("input[data-i]").forEach(x=>x.onchange=()=>{state.accounts[+x.dataset.i].selected=x.checked;updateCounters();saveState()});updateCounters()}
function updateCounters(){$("totalAccounts").textContent=state.accounts.length;$("selectedAccounts").textContent=state.accounts.filter(a=>a.selected).length;$("tableInfo").textContent=`Hiển thị ${state.accounts.length} dữ liệu`}
function renderAccountsList(){const el=$("accountsList");el.innerHTML=state.accounts.map((a,i)=>`<div class=mini-row><b>${i+1}. ${esc(a.id)}</b> · ${esc(a.name)} · ${esc(a.status)} · Proxy: ${esc(a.proxy||"-")}</div>`).join("")}
function addAccount(){openAccountModal(null)}
function editSelectedAccount(){const idx=state.accounts.findIndex(a=>a.selected);if(idx<0)return alert("Hãy tick một tài khoản để sửa.");openAccountModal(idx)}
function openAccountModal(idx){editingAccountIndex=idx;const a=idx===null?{name:"",id:"",platform:state.platform||"tiktok",status:"Live",proxy:""}:state.accounts[idx];$("accountModalTitle").textContent=idx===null?"Thêm tài khoản":"Sửa tài khoản";$("accountNameInput").value=a.name||"";$("accountIdInput").value=a.id||a.account_id||"";$("accountPlatformInput").value=a.platform||"mixed";$("accountStatusInput").value=a.status||"Live";$("accountProxyInput").value=a.proxy||"";$("accountModal").classList.remove("hidden")}
function closeAccountModal(){$("accountModal").classList.add("hidden");editingAccountIndex=null}
function saveAccountFromModal(){const name=$("accountNameInput").value.trim()||"-";const id=$("accountIdInput").value.trim();if(!id)return alert("Hãy nhập ID tài khoản.");const item={selected:true,name,id,platform:$("accountPlatformInput").value,status:$("accountStatusInput").value,proxy:$("accountProxyInput").value.trim(),result:"-",action:"-"};if(editingAccountIndex===null)state.accounts.push(item);else state.accounts[editingAccountIndex]={...state.accounts[editingAccountIndex],...item};closeAccountModal();renderAll();saveState();setStatus("Đã lưu tài khoản.")}
function deleteSelectedAccounts(){state.accounts=state.accounts.filter(a=>!a.selected);renderAll();saveState()}
async function importAccounts(){const r=await window.JordanAPI.importCsv();if(!r)return;const rows=parseCsv(r.content);state.accounts=rows.map((x,i)=>({selected:true,name:x.name||x["Họ và tên"]||"-",id:x.id||x.account_id||x["ID tài khoản"]||"id"+(i+1),status:x.status||"Live",proxy:x.proxy||"",result:"-",action:"-"}));renderAll();saveState();setStatus("Đã nhập tài khoản từ CSV.")}
async function exportAccounts(){const csv=["name,id,status,proxy,result,action",...state.accounts.map(a=>[a.name,a.id,a.status,a.proxy,a.result,a.action].map(csvEsc).join(","))].join("\n");const f=await window.JordanAPI.exportCsv(csv,"jordan_accounts.csv");if(f)setStatus("Đã xuất: "+f)}
async function pickVideo(){
  const files=await window.JordanAPI.chooseVideo();
  if(files&&files.length){
    state.videoPath=files[0];
    state.selectedVideoPaths=files;
    $("selectedVideoPath").value=files.length>1?`${files.length} video đã chọn`:files[0];
    saveState();
    setStatus(`Đã chọn ${files.length} video.`);
  }
}

function clearSelectedVideo(){
  state.videoPath="";
  state.selectedVideoPaths=[];
  if($("selectedVideoPath"))$("selectedVideoPath").value="";
  saveState();
  setStatus("Đã xóa video đang chọn.");
}

async function chooseVideoFolder(){
  const dir=await window.JordanAPI.chooseFolder();
  if(dir){
    state.videoFolder=dir;
    if($("videoFolderPath"))$("videoFolderPath").value=dir;
    state.videos=[];
    renderVideos();
    saveState();
    setStatus("Đã chọn thư mục video. Bấm Quét video để tải danh sách.");
  }
}

async function scanVideos(){
  const folder=($("videoFolderPath")?.value||state.videoFolder||"").trim();
  if(!folder)return alert("Hãy chọn thư mục video trước.");
  state.videoFolder=folder;
  state.videos=await window.JordanAPI.scanVideos(folder);
  renderVideos();
  saveState();
  setStatus(`Đã quét ${state.videos.length} video.`);
}

function clearVideoFolder(){
  state.videoFolder="";
  state.videos=[];
  if($("videoFolderPath"))$("videoFolderPath").value="";
  renderVideos();
  saveState();
  setStatus("Đã xóa thư mục video và danh sách đã quét.");
}

function clearVideoList(){
  if(!state.videos?.length){
    setStatus("Danh sách video đang trống.");
    return;
  }
  if(!confirm("Xóa toàn bộ danh sách video đã quét khỏi app? File gốc trên máy sẽ không bị xóa."))return;
  state.videos=[];
  renderVideos();
  saveState();
  setStatus("Đã xóa danh sách video đã quét. File gốc không bị ảnh hưởng.");
}

function removeVideoFromList(index){
  const v=state.videos?.[index];
  if(!v)return;
  state.videos.splice(index,1);
  renderVideos();
  saveState();
  setStatus(`Đã xóa khỏi danh sách: ${v.name||"video"}. File gốc không bị xóa.`);
}

function useVideoFromList(index){
  const v=state.videos?.[index];
  if(!v)return;
  state.videoPath=v.path;
  state.selectedVideoPaths=[v.path];
  if($("selectedVideoPath"))$("selectedVideoPath").value=v.path;
  showView("postingView");
  saveState();
  setStatus(`Đã chọn video: ${v.name||v.path}`);
}

function renderVideos(){
  const b=$("videosBody");
  if(!b)return;
  const list=state.videos||[];
  if(!list.length){
    b.innerHTML='<tr><td colspan="5" class="center muted-cell">Chưa có video nào. Chọn thư mục rồi bấm Quét video.</td></tr>';
    return;
  }
  b.innerHTML=list.map((v,i)=>`<tr>
    <td>${i+1}</td>
    <td>${esc(v.name)}</td>
    <td>${formatSize(v.size)}</td>
    <td>${esc(v.folder)}</td>
    <td>
      <div class="video-action-buttons">
        <button data-use-video="${i}">Chọn</button>
        <button data-show-video="${i}">Mở</button>
        <button class="danger-lite" data-remove-video="${i}">Xóa khỏi DS</button>
      </div>
    </td>
  </tr>`).join("");
  b.querySelectorAll("[data-use-video]").forEach(x=>x.onclick=()=>useVideoFromList(+x.dataset.useVideo));
  b.querySelectorAll("[data-show-video]").forEach(x=>x.onclick=()=>window.JordanAPI.showFile(state.videos[+x.dataset.showVideo].path));
  b.querySelectorAll("[data-remove-video]").forEach(x=>x.onclick=()=>removeVideoFromList(+x.dataset.removeVideo));
}
function addProxy(){openProxyModal(null)}
function openProxyModal(idx){editingProxyIndex=idx;const p=idx===null?{proxy:"",note:"",status:"Chưa kiểm tra"}:state.proxies[idx];$("proxyModalTitle").textContent=idx===null?"Thêm proxy":"Sửa proxy";$("proxyValueInput").value=p.proxy||"";$("proxyNoteInput").value=p.note||"";$("proxyStatusInput").value=p.status||"Chưa kiểm tra";$("proxyModal").classList.remove("hidden")}
function closeProxyModal(){$("proxyModal").classList.add("hidden");editingProxyIndex=null}
function saveProxyFromModal(){const proxy=$("proxyValueInput").value.trim();if(!proxy)return alert("Hãy nhập proxy.");const item={proxy,note:$("proxyNoteInput").value.trim(),status:$("proxyStatusInput").value};if(editingProxyIndex===null)state.proxies.push(item);else state.proxies[editingProxyIndex]={...state.proxies[editingProxyIndex],...item};closeProxyModal();renderProxies();saveState();setStatus("Đã lưu proxy.")}
async function importProxy(){const r=await window.JordanAPI.importCsv();if(!r)return;const lines=r.content.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);state.proxies=lines.map(line=>{const parts=line.split(",");return{proxy:parts[0],note:parts[1]||"",status:"Chưa kiểm tra"}});renderProxies();saveState()}
async function exportProxy(){const csv=state.proxies.map(p=>[p.proxy,p.note,p.status].map(csvEsc).join(",")).join("\n");const f=await window.JordanAPI.exportCsv("proxy,note,status\n"+csv,"jordan_proxies.csv");if(f)setStatus("Đã xuất proxy: "+f)}
function renderProxies(){const b=$("proxyBody");b.innerHTML=(state.proxies||[]).map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.proxy)}</td><td>${esc(p.note||"-")}</td><td>${esc(p.status||"-")}</td><td><button data-edit-proxy="${i}">Sửa</button> <button data-del-proxy="${i}">Xóa</button></td></tr>`).join("");b.querySelectorAll("[data-edit-proxy]").forEach(x=>x.onclick=()=>openProxyModal(+x.dataset.editProxy));b.querySelectorAll("[data-del-proxy]").forEach(x=>x.onclick=()=>{state.proxies.splice(+x.dataset.delProxy,1);renderProxies();saveState()})}
function assignProxyToSelected(){if(!state.proxies.length)return alert("Chưa có proxy.");let n=0;state.accounts.forEach(a=>{if(a.selected){a.proxy=state.proxies[n%state.proxies.length].proxy;n++}});renderAll();saveState();setStatus(`Đã gán proxy cho ${n} tài khoản.`)}
function appendHash(type){const t=hashtags[type].join(" ");$("captionBox").value=$("captionBox").value.trim()?$("captionBox").value.trim()+"\n\n"+t:t}
async function startPosting(){const selected=state.accounts.filter(a=>a.selected);if(!selected.length)return alert("Hãy chọn tài khoản.");if(!state.videoPath)return alert("Hãy chọn video.");const platform=state.platform==="facebook"?"Facebook":state.platform==="youtube"?"YouTube":"TikTok";if(!confirm(`Mở ${platform} upload cho ${selected.length} tài khoản?

Với TikTok, app sẽ thử tự chèn video + caption nếu tùy chọn đang bật. Bạn vẫn tự bấm Đăng/Lên lịch.`))return;selected.forEach(a=>a.action="Đang mở upload");renderAccounts();const caption=$("captionBox")?.value||"";if(state.platform==="tiktok" && $("autoFillTikTok")?.checked){try{const res=await window.JordanAPI.tiktokAutoUpload({videoPath:state.videoPath,caption,profileDirectory:profile()});selected.forEach(a=>a.action=res.uploaded?"Đã chèn video TikTok":"Đã mở TikTok Studio");renderAccounts();setStatus(`${res.message} Video: ${res.uploaded?"OK":"chưa chắc"} | Caption: ${res.captionFilled?"OK":"chưa chắc"}`);saveState();return}catch(e){setStatus("Auto TikTok lỗi: "+(e.message||String(e))+" | Sẽ mở TikTok Studio thủ công.")}}const url=state.platform==="facebook"?URLS.facebookBusiness:state.platform==="youtube"?"https://studio.youtube.com/":URLS.tiktokUpload;await openEdge(url,true)}
function saveConfig(){state.config={delayMin:$("delayMin").value,delayMax:$("delayMax").value,switchErrors:$("switchErrors").value,videoMin:$("videoMin").value,videoMax:$("videoMax").value,tagMin:$("tagMin").value,tagMax:$("tagMax").value,caption:$("captionBox").value};saveState();setStatus("Đã lưu cấu hình.")}
function resetConfig(){["delayMin","delayMax","switchErrors","videoMin","videoMax","tagMin","tagMax"].forEach((id,i)=>$(id).value=[5,10,30,1,3,0,5][i]);setStatus("Đã reset cấu hình.")}
async function openEdge(url,appMode=true){await window.JordanAPI.openEdgeUrl({url,profileDirectory:profile(),appMode});setStatus("Đã mở bằng Edge profile: "+(profile()||"Default"))}
function profile(){return $("edgeProfileSelect").value||state.edgeProfile||""}

function botLog(text){const box=$("botLog");if(box)box.value=`[${new Date().toLocaleString()}] ${text}\n`+(box.value||"")}
function videoNameFromPath(p){return String(p||"").split(/[\\/]/).pop()||"video"}
function cleanTitleFromFilename(name){return String(name||"").replace(/\.[^.]+$/," ").replace(/[_\-]+/g," ").replace(/\s+/g," ").trim()}
function botSelectedAccounts(){return (state.accounts||[]).filter(a=>a.selected)}
async function botPickVideos(){const files=await window.JordanAPI.chooseVideo();if(!files||!files.length)return;const accounts=botSelectedAccounts();for(const f of files){state.botQueue.push({videoPath:f,videoName:videoNameFromPath(f),accountId:accounts[0]?.id||"",accountName:accounts[0]?.name||profile()||"Default",platform:$("botPlatform")?.value||state.platform||"tiktok",caption:"",hashtags:"",status:"Chưa tạo caption"})}renderBotQueue();saveState();botLog(`Đã thêm ${files.length} video vào queue.`)}
function botUseScannedVideos(){
  if(!state.videos?.length)return alert("Chưa có video đã quét. Vào Quản lý video → Chọn thư mục → Quét video trước.");
  const selectedAccounts=state.accounts.filter(a=>a.selected);
  const account=selectedAccounts[0]||state.accounts[0]||{};
  state.botQueue=(state.botQueue||[]).concat(state.videos.map(v=>({
    videoPath:v.path,
    videoName:v.name,
    accountId:account.id||"",
    accountName:account.name||"",
    platform:$("botPlatform")?.value||state.platform||"tiktok",
    caption:"",
    hashtags:"",
    status:"Chờ tạo caption"
  })));
  renderBotQueue();saveState();botLog(`Đã thêm ${state.videos.length} video đã quét vào queue.`);
}
function botClearQueue(){if(!confirm("Xóa toàn bộ posting queue?"))return;state.botQueue=[];renderBotQueue();saveState();botLog("Đã xóa queue.")}
function localCaptionFor(item){const title=cleanTitleFromFilename(item.videoName);const tone=$("botCaptionTone")?.value||"news";const platform=item.platform||"tiktok";const base= tone==="genz"?`Video này đang có vibe rất đáng xem: ${title}. Bạn nghĩ sao về chủ đề này?`:tone==="sales"?`${title}\n\nNếu bạn đang quan tâm, lưu lại ngay để xem lại khi cần.`:tone==="neutral"?`${title}\n\nMột nội dung ngắn gọn, dễ hiểu và đáng để theo dõi.`:`${title}\n\nGóc nhìn nhanh, dễ hiểu và cập nhật cho bạn.`;const tags=(hashtags[platform]==null?hashtags.tiktok:hashtags[platform]).slice(0,8).join(" ");return{caption:base,hashtags:tags}}
async function aiCaptionFor(item){const provider=$("botAIProvider")?.value||"local";if(provider==="local")return localCaptionFor(item);const tone=$("botCaptionTone")?.value||"news";const platform=item.platform||"tiktok";const prompt=`Bạn là social media manager. Viết caption tiếng Việt tự nhiên cho video đăng ${platform}. Tên file video: "${item.videoName}". Tone: ${tone}. Trả về JSON hợp lệ dạng {"caption":"...","hashtags":"#tag #tag"}. Caption dưới 500 ký tự, không thêm giải thích.`;try{let res="";if(provider==="openai")res=await window.JordanAPI.openaiText({apiKey:$("openaiKey")?.value||"",model:$("openaiModel")?.value||OPENAI_CHAT_MODELS[0],prompt});else res=await window.JordanAPI.geminiText({apiKey:$("geminiKey")?.value||"",model:$("geminiModel")?.value||GEMINI_CHAT_MODELS[0],prompt});const match=String(res).match(/\{[\s\S]*\}/);const obj=JSON.parse(match?match[0]:res);return{caption:obj.caption||localCaptionFor(item).caption,hashtags:obj.hashtags||localCaptionFor(item).hashtags}}catch(e){botLog(`AI lỗi với ${item.videoName}: ${e.message||e}. Dùng local rule.`);return localCaptionFor(item)}}
async function botGenerateCaptions(){if(!state.botQueue?.length)return alert("Queue chưa có video.");for(let i=0;i<state.botQueue.length;i++){state.botQueue[i].status="Đang tạo caption";renderBotQueue();const out=await aiCaptionFor(state.botQueue[i]);state.botQueue[i].caption=out.caption;state.botQueue[i].hashtags=out.hashtags;state.botQueue[i].status="Sẵn sàng upload";renderBotQueue();saveState()}botLog("Đã tạo caption/hashtag cho queue.")}
function renderBotQueue(){const b=$("botQueueBody");if(!b)return;const q=state.botQueue||[];b.innerHTML=q.map((item,i)=>`<tr><td>${i+1}</td><td>${esc(item.videoName||videoNameFromPath(item.videoPath))}</td><td>${esc(item.accountName||item.accountId||profile())}</td><td><textarea class="queue-caption" data-qcaption="${i}">${esc(((item.caption||"")+"\n"+(item.hashtags||"")).trim())}</textarea></td><td><span class="queue-status">${esc(item.status||"-")}</span></td><td><button data-qupload="${i}">Upload</button> <button data-qdel="${i}">Xóa</button></td></tr>`).join("");b.querySelectorAll("[data-qcaption]").forEach(x=>x.onchange=()=>{const i=+x.dataset.qcaption;state.botQueue[i].caption=x.value;state.botQueue[i].hashtags="";saveState()});b.querySelectorAll("[data-qupload]").forEach(x=>x.onclick=()=>botUploadOne(+x.dataset.qupload));b.querySelectorAll("[data-qdel]").forEach(x=>x.onclick=()=>{state.botQueue.splice(+x.dataset.qdel,1);renderBotQueue();saveState()})}
async function botUploadOne(i){const item=state.botQueue[i];if(!item)return;item.status="Đang upload/fill";renderBotQueue();try{const caption=((item.caption||"")+"\n"+(item.hashtags||"")).trim();const res=await window.JordanAPI.socialAutoUpload({platform:item.platform||$("botPlatform")?.value||state.platform||"tiktok",videoPath:item.videoPath,caption,profileDirectory:profile()});item.status=res.uploaded?`Đã chèn video${res.captionFilled?" + caption":""}`:"Đã mở studio, cần kiểm tra";botLog(`${item.videoName}: ${res.message||"OK"}`)}catch(e){item.status="Lỗi";botLog(`${item.videoName}: ${e.message||e}`)}renderBotQueue();saveState()}
async function botRunQueue(){if(!state.botQueue?.length)return alert("Queue chưa có video.");if(!confirm(`Chạy upload queue ${state.botQueue.length} video?\n\nApp sẽ thử chèn video + caption. Bạn vẫn tự bấm Đăng/Lên lịch.`))return;for(let i=0;i<state.botQueue.length;i++){await botUploadOne(i);await new Promise(r=>setTimeout(r,1500))}botLog("Đã chạy xong queue.")}

async function askOpenAI(){$("aiOutput").value="Đang hỏi OpenAI...";try{$("aiOutput").value=await window.JordanAPI.openaiText({apiKey:$("openaiKey").value,model:$("openaiModel").value,prompt:$("aiPrompt").value})}catch(e){$("aiOutput").value=e.message||String(e)}}
async function askGemini(){$("aiOutput").value="Đang hỏi Gemini...";try{$("aiOutput").value=await window.JordanAPI.geminiText({apiKey:$("geminiKey").value,model:$("geminiModel").value,prompt:$("aiPrompt").value})}catch(e){$("aiOutput").value=e.message||String(e)}}
async function chooseOutputDir(){const dir=await window.JordanAPI.chooseFolder();if(dir){state.outputDir=dir;$("outputDirText").textContent="Thư mục lưu: "+dir;saveState()}}
async function generateOpenAIImage(){$("imageResult").textContent="Đang tạo ảnh...";try{const f=await window.JordanAPI.openaiImage({apiKey:$("imageOpenAIKey").value,model:$("imageOpenAIModel").value,size:$("imageSize").value,prompt:$("imagePrompt").value,outputDir:state.outputDir});state.imagePath=f;saveState();$("imageResult").textContent="Đã tạo ảnh: "+f}catch(e){$("imageResult").textContent=e.message||String(e)}}
async function deepUninstall(){if(!confirm("Gỡ Jordan Task Manager và dọn dữ liệu app?"))return;const openAppsSettings=confirm("Có muốn mở Apps Settings sau khi gỡ không?");await window.JordanAPI.deepUninstall({openAppsSettings})}
async function uninstallNode(){if(!confirm("Node.js có thể đang được phần mềm khác dùng. Bạn vẫn muốn mở/gỡ Node.js?"))return;const tryWinget=confirm("Thử gỡ Node.js tự động bằng winget nếu có? Chọn Không để chỉ mở Apps Settings.");await window.JordanAPI.uninstallNode({tryWinget})}
function parseCsv(text){const lines=text.split(/\r?\n/).filter(Boolean);if(!lines.length)return[];const h=splitCsv(lines[0]).map(x=>x.trim());return lines.slice(1).map(l=>{const v=splitCsv(l);const o={};h.forEach((k,i)=>o[k]=v[i]||"");return o})}
function splitCsv(line){const r=[];let c="",q=false;for(const ch of line){if(ch==='"')q=!q;else if(ch===","&&!q){r.push(c);c=""}else c+=ch}r.push(c);return r.map(x=>x.replace(/^"|"$/g,"").replace(/""/g,'"'))}
function csvEsc(v){const s=String(v||"");return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function formatSize(n){if(!n)return"-";const u=["B","KB","MB","GB"];let i=0;while(n>1024&&i<u.length-1){n/=1024;i++}return n.toFixed(i?1:0)+" "+u[i]}
function esc(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]))}
async function generateGeminiImage(){
  $("imageResult").textContent="Đang tạo ảnh bằng Gemini...";
  try{
    const prompt=$("geminiImagePrompt").value || $("imagePrompt").value;
    const f=await window.JordanAPI.geminiImage({
      apiKey:$("imageGeminiKey").value,
      model:$("imageGeminiModel").value,
      prompt,
      outputDir:state.outputDir
    });
    state.imagePath=f;
    saveState();
    $("imageResult").textContent="Đã tạo ảnh Gemini: "+f;
  }catch(e){
    $("imageResult").textContent=e.message||String(e);
  }
}

async function runSelfCheck(){
  const body=$("selfCheckBody"); const summary=$("selfCheckSummary");
  if(!body||!summary)return;
  body.innerHTML=""; summary.textContent="Đang kiểm tra...";
  const manual=[];
  function add(name,ok,detail){manual.push({name,ok,detail});}
  try{add("DOM: Account modal",!!$("accountModal")&&!!$("saveAccountModal"),"Form thêm/sửa tài khoản");}catch(e){add("DOM: Account modal",false,String(e));}
  try{add("DOM: Proxy modal",!!$("proxyModal")&&!!$("saveProxyModal"),"Form thêm/sửa proxy");}catch(e){add("DOM: Proxy modal",false,String(e));}
  try{add("DOM: Cloud Sync",!!$("supabaseUrl")&&!!$("supabaseAnonKey")&&!!$("googleSheetWebhook"),"Supabase + Google Sheets fields");}catch(e){add("DOM: Cloud Sync",false,String(e));}
  try{add("DOM: TikTok auto-fill",!!$("autoFillTikTok"),"Checkbox tự chèn video/caption");}catch(e){add("DOM: TikTok auto-fill",false,String(e));}
  try{add("State: accounts array",Array.isArray(state.accounts),`${(state.accounts||[]).length} account(s)`);}catch(e){add("State: accounts array",false,String(e));}
  try{add("State: proxies array",Array.isArray(state.proxies),`${(state.proxies||[]).length} proxy(s)`);}catch(e){add("State: proxies array",false,String(e));}
  try{add("State: videos array",Array.isArray(state.videos),`${(state.videos||[]).length} video(s)`);}catch(e){add("State: videos array",false,String(e));}
  let native={checks:[]};
  try{native=await window.JordanAPI.selfCheck();}catch(e){native={checks:[{name:"Native self check",ok:false,detail:e.message||String(e)}]};}
  const all=[...manual,...(native.checks||[])];
  body.innerHTML=all.map(x=>`<tr><td>${esc(x.name)}</td><td class="${x.ok?'qa-ok':'qa-fail'}">${x.ok?'OK':'Lỗi'}</td><td>${esc(x.detail||'')}</td></tr>`).join("");
  const ok=all.filter(x=>x.ok).length;
  summary.textContent=`Kết quả: ${ok}/${all.length} hạng mục OK.`;
  summary.dataset.raw=JSON.stringify(all,null,2);
}
function copySelfCheck(){const raw=$("selfCheckSummary")?.dataset.raw||"Chưa có kết quả.";navigator.clipboard.writeText(raw);setStatus("Đã copy kết quả kiểm tra hệ thống.");}




function shortErr(e){return String(e?.message||e||"").replace(/\s+/g," ").slice(0,180)}
function longfSafe(fn, label){
  try { return fn(); }
  catch(e){ console.error(label || "LongF error", e); try{ setStatus((label||"LongF lỗi")+": "+(e.message||e)); }catch{} }
}


function longfFriendlyErrorText(err){
  const msg = String(err?.message || err || "");
  if(/413 Request Entity Too Large|video quá lớn|file quá lớn|quá lớn để upload/i.test(msg)){
    return msg + " | Gợi ý: xuất video H.264 MP4, 1080p hoặc 720p, bitrate thấp hơn; nếu video dài hãy chia nhỏ hoặc nén trước khi đăng.";
  }
  return msg;
}

function longfLog(text){
  const box=$("longfLog");
  const line=`[${new Date().toLocaleString()}] ${text}`;
  if(box) box.value=line+"\n"+(box.value||"");
  setStatus(text);
}

function longfGetDefaultCategories(){
  return (typeof LONGF_DEFAULT_CATEGORIES !== "undefined" && LONGF_DEFAULT_CATEGORIES.length) ? LONGF_DEFAULT_CATEGORIES : [
    { value: "1", label: "Việt Nam" },
    { value: "2", label: "Quốc tế" },
    { value: "4", label: "Thị trường" },
    { value: "5", label: "Nổi bật" },
    { value: "7", label: "Giáo dục" },
    { value: "8", label: "Tài chính quốc tế" },
    { value: "9", label: "VJ" }
  ];
}

function longfGetDefaultAuthors(){
  return (typeof LONGF_DEFAULT_AUTHORS !== "undefined" && LONGF_DEFAULT_AUTHORS.length) ? LONGF_DEFAULT_AUTHORS : [
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
}

function longfFillSelect(id, items, firstLabel){
  const sel=$(id);
  if(!sel)return;
  const current=sel.value;
  sel.innerHTML="";
  const first=document.createElement("option");
  first.value="";
  first.textContent=firstLabel;
  sel.appendChild(first);
  (items||[]).forEach(x=>{
    if(!x) return;
    const label=x.label||x.value||"";
    const value=x.value!==undefined ? String(x.value) : String(label);
    if(!label || label===firstLabel) return;
    const o=document.createElement("option");
    o.value=value;
    o.textContent=label;
    sel.appendChild(o);
  });
  if(current) sel.value=current;
}

function longfEnsureSelects(){
  const cat=$("longfCategory");
  const author=$("longfAuthor");
  if(cat && cat.options.length <= 1){
    state.longfCategories = state.longfCategories && state.longfCategories.length ? state.longfCategories : longfGetDefaultCategories();
    longfFillSelect("longfCategory", state.longfCategories, "-- Category --");
  }
  if(author && author.options.length <= 1){
    state.longfAuthors = state.longfAuthors && state.longfAuthors.length ? state.longfAuthors : longfGetDefaultAuthors();
    longfFillSelect("longfAuthor", state.longfAuthors, "-- Random selection --");
  }
}

function longfCategoryOptionsHtml(selected){
  const list = (state.longfCategories && state.longfCategories.length) ? state.longfCategories : longfGetDefaultCategories();
  const rows = ['<option value="">-- Category --</option>'];
  list.forEach(x=>{
    const value = x.value !== undefined ? String(x.value) : String(x.label||"");
    const label = x.label || value;
    rows.push(`<option value="${esc(value)}" ${String(selected||"")===value ? "selected" : ""}>${esc(label)}</option>`);
  });
  return rows.join("");
}

function longfAuthorOptionsHtml(selected){
  const list = (state.longfAuthors && state.longfAuthors.length) ? state.longfAuthors : longfGetDefaultAuthors();
  const rows = ['<option value="">-- Random selection --</option>'];
  list.forEach(x=>{
    const value = x.value !== undefined ? String(x.value) : String(x.label||"");
    const label = x.label || value;
    if(!label || label === "-- Random selection --") return;
    rows.push(`<option value="${esc(value)}" ${String(selected||"")===value ? "selected" : ""}>${esc(label)}</option>`);
  });
  return rows.join("");
}

function longfGetStatus(){
  const checked=document.querySelector('input[name="longfStatusRadio"]:checked');
  return checked ? checked.value : ($("longfStatus")?.value||"on");
}

function longfNowLocalInput(){
  const d=new Date();
  const pad=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function longfSyncPublishTime(){
  if($("longfPublishTime")) $("longfPublishTime").value=longfNowLocalInput();
  longfLog("Đã lấy giờ hiện tại từ Windows/app. Đây cũng là thời gian lên lịch nếu dùng để đăng.");
}


let longfLoginWatchTimer = null;
let longfLoginWatchSuccess = false;

function longfStartLoginWatcher(){
  if(!window.JordanAPI || !window.JordanAPI.longfCheckSession) return;
  if(longfLoginWatchTimer) clearInterval(longfLoginWatchTimer);
  longfLoginWatchSuccess = false;
  let count = 0;
  longfLoginWatchTimer = setInterval(async () => {
    count++;
    try{
      const res = await window.JordanAPI.longfCheckSession();
      if(res && res.ok){
        longfLoginWatchSuccess = true;
        clearInterval(longfLoginWatchTimer);
        longfLoginWatchTimer = null;
        longfLog(`Đăng nhập LongF thành công. Đã vào được Video List. URL: ${res.url||""}`);
        return;
      }
      if(count === 1 || count % 10 === 0){
        longfLog(`Đang chờ đăng nhập LongF... Cookie: ${res?.cookieCount ?? 0}. hasVideoList: ${res?.hasVideoList || false}`);
      }
    }catch(e){
      if(count === 1 || count % 10 === 0) longfLog("Đang chờ đăng nhập LongF...");
    }
    if(count >= 150){
      clearInterval(longfLoginWatchTimer);
      longfLoginWatchTimer = null;
      longfLog("Chưa xác nhận được đăng nhập LongF sau 5 phút. Hãy bấm Kiểm tra đăng nhập nếu đã vào Video List.");
    }
  }, 2000);
}

async function longfOpenAdmin(){
  try{
    await window.JordanAPI.longfOpenAdmin();
    longfLog("Đã mở LongF Admin. App sẽ tự báo khi đăng nhập thành công và vào được Video List.");
    longfStartLoginWatcher();
  }catch(e){longfLog(e.message||String(e))}
}

async function longfCheckSession(){
  try{
    if(!window.JordanAPI.longfCheckSession){ longfLog("Bản preload chưa có longfCheckSession."); return; }
    const res=await window.JordanAPI.longfCheckSession();
    if(res.ok) longfLog(`Kiểm tra đăng nhập thành công. Đã vào được Video List LongF. Cookie: ${res.cookieCount}. URL: ${res.url||""}. Title: ${res.title||""}`);
    else longfLog(`LongF chưa sẵn sàng. Cookie: ${res.cookieCount}, loginPage: ${res.loginLike}, hasVideoList: ${res.hasVideoList||false}. URL: ${res.url||""}. ${res.error||""}`);
  }catch(e){longfLog(e.message||String(e))}
}

async function longfApiDiscovery(){
  try{
    longfEnsureSelects();
    const res=await window.JordanAPI.longfExtractApiMap();
    state.longfCategories=(res.categories&&res.categories.length)?res.categories:longfGetDefaultCategories();
    state.longfAuthors=(res.authors&&res.authors.length)?res.authors:longfGetDefaultAuthors();
    longfFillSelect("longfCategory",state.longfCategories,"-- Category --");
    longfFillSelect("longfAuthor",state.longfAuthors,"-- Random selection --");
    if(!$("longfPublishTime")?.value) longfSyncPublishTime();
    saveState();
    longfLog(`Đã lấy ${state.longfCategories.length} category và ${state.longfAuthors.length} author từ LongF. Author dùng ID thật để gửi API.`);
    renderLongFQueue();
  }catch(e){
    state.longfCategories=longfGetDefaultCategories();
    state.longfAuthors=longfGetDefaultAuthors();
    longfFillSelect("longfCategory",state.longfCategories,"-- Category --");
    longfFillSelect("longfAuthor",state.longfAuthors,"-- Random selection --");
    saveState();
    longfLog((e.message||String(e))+" | Đã dùng danh sách category/author mặc định.");
  }
}

function longfRenderSelectedVideo(){
  const box=$("longfVideoPreview");
  if(!box)return;
  const count=state.longfVideos?.length||0;
  if(!count){
    box.classList.remove("has-video");
    box.innerHTML='<div><div class="upload-icon">⇧</div><p>Chọn một hoặc nhiều video MP4/MOV</p><small>Đăng lẻ hoặc tạo queue hàng loạt</small></div>';
    if($("longfVideoFilePathField")) $("longfVideoFilePathField").value="";
    return;
  }
  const first=(state.longfVideos[0]||"").split(/[\\\\/]/).pop();
  box.classList.add("has-video");
  box.innerHTML=`<div><p class="longf-video-name">${esc(count>1?`${count} video đã chọn`:first)}</p><div class="upload-icon">MP4</div><small>Upload để lấy video file path</small></div>`;
}

async function longfChooseVideos(){
  const files=await window.JordanAPI.chooseVideo();
  if(!files||!files.length)return;
  state.longfVideos=files;
  state.longfVideoFilePath="";
  longfRenderSelectedVideo();
  saveState();
  longfLog(`Đã chọn ${files.length} video LongF.`);
}

function longfClearSelectedVideo(){
  state.longfVideos=[];
  state.longfVideoFilePath="";
  longfRenderSelectedVideo();
  saveState();
  longfLog("Đã xóa video đang chọn.");
}

async function longfChooseMainImage(){
  const files=await window.JordanAPI.chooseImage();
  if(!files||!files.length)return;
  state.longfMainImage=files[0];
  if($("longfImagePathField")) $("longfImagePathField").value=files[0];
  longfRenderCover();
  saveState();
  longfLog("Đã chọn ảnh cover/thumbnail.");
}

function longfClearCover(){
  state.longfMainImage="";
  if($("longfImagePathField")) $("longfImagePathField").value="";
  longfRenderCover();
  saveState();
  longfLog("Đã xóa cover.");
}

function longfRenderCover(){
  const grid=$("longfCoverGrid");
  if(!grid)return;
  if(!state.longfMainImage){
    grid.innerHTML='<div class="longf-cover-card muted-cell">Chưa chọn ảnh cover.</div>';
    return;
  }
  const src="file:///"+state.longfMainImage.replace(/\\\\/g,"/");
  grid.innerHTML=[1,2,3,4].map(()=>`<div class="longf-cover-card"><img src="${src}"></div>`).join("");
}

async function longfUploadSelectedVideo(){
  if(!state.longfVideos?.length)return alert("Hãy chọn video trước.");
  if(state.longfVideos.length>1)return alert("Bạn đang chọn nhiều video. Với upload lẻ, hãy chọn 1 video. Với hàng loạt, bấm Tạo queue rồi Đăng hàng loạt bằng API.");
  try{
    longfLog("Đang upload video lên LongF...");
    const res=await window.JordanAPI.longfUploadVideoDirect(state.longfVideos[0]);
    state.longfVideoFilePath=res.video_file_path||"";
    if($("longfVideoFilePathField")) $("longfVideoFilePathField").value=state.longfVideoFilePath;
    saveState();
    longfLog("Upload thành công: "+state.longfVideoFilePath);
  }catch(e){longfLog(e.message||String(e))}
}

function longfAiSuggest(){
  const videoName=(state.longfVideos?.[0]||"").split(/[\\\\/]/).pop()?.replace(/\.[^.]+$/,"")||"video";
  const titleBox=$("longfDefaultTitle");
  const hashBox=$("longfDefaultHashtag");
  if(titleBox && !titleBox.value.trim()) titleBox.value=`${videoName}`;
  if(hashBox && !hashBox.value.trim()) hashBox.value="#LongFinance #TinTuc #Video";
  longfLog("AI/BOT đã gợi ý title và hashtag cơ bản. Có thể chỉnh lại trước khi tạo queue.");
}

function longfBuildItem(videoPath){
  longfEnsureSelects();
  const name=(videoPath||"").split(/[\\\\/]/).pop()||"video";
  const cleanName=name.replace(/\.[^.]+$/,"");
  const rawTitle=($("longfDefaultTitle")?.value||"{filename}").trim()||"{filename}";
  const hashtag=($("longfDefaultHashtag")?.value||"").trim();
  const title=(rawTitle.replaceAll("{filename}",cleanName)+(hashtag?("\\n\\n"+hashtag):"")).trim();
  return{
    videoPath,
    videoName:name,
    imagePath:state.longfMainImage||"",
    title,
    category:$("longfCategory")?.value||"",
    author:$("longfAuthor")?.value||"",
    publishTime:$("longfPublishTime")?.value||longfNowLocalInput(),
    status:longfGetStatus(),
    videoFilePath: state.longfVideos?.length===1 ? (state.longfVideoFilePath||"") : "",
    imageFilePath:"",
    result:"Chờ đăng/lên lịch"
  };
}

function longfGenerateFromVideos(){
  if(!state.longfVideos?.length)return alert("Hãy chọn video trước.");
  if(!$("longfPublishTime")?.value) longfSyncPublishTime();
  state.longfQueue=(state.longfQueue||[]).concat(state.longfVideos.map(longfBuildItem));
  renderLongFQueue();
  saveState();
  longfLog(`Đã tạo queue ${state.longfVideos.length} bài/video.`);
}

function longfAddManual(){
  const videoPath=prompt("Dán đường dẫn video:");
  if(!videoPath)return;
  state.longfQueue=state.longfQueue||[];
  state.longfQueue.push(longfBuildItem(videoPath));
  renderLongFQueue();
  saveState();
}

function longfClearQueue(){
  if(!confirm("Xóa toàn bộ queue LongF?"))return;
  state.longfQueue=[];
  renderLongFQueue();
  saveState();
  longfLog("Đã xóa queue LongF.");
}

async function longfChooseQueueCover(index){
  const item=state.longfQueue?.[index];
  if(!item)return;
  const files=await window.JordanAPI.chooseImage();
  if(!files||!files.length)return;
  item.imagePath=files[0];
  item.imageFilePath="";
  item.result="Đã chọn cover";
  renderLongFQueue();
  saveState();
  longfLog(`Đã chọn cover riêng cho video ${index+1}.`);
}

function longfClearQueueCover(index){
  const item=state.longfQueue?.[index];
  if(!item)return;
  item.imagePath="";
  item.imageFilePath="";
  renderLongFQueue();
  saveState();
  longfLog(`Đã xóa cover riêng của video ${index+1}.`);
}

function longfCoverPreviewHtml(imagePath){
  if(!imagePath) return '<div class="longf-queue-cover muted-cell">No cover</div>';
  const src="file:///"+String(imagePath).replace(/\\\\/g,"/");
  return `<div class="longf-queue-cover"><img src="${src}"></div>`;
}


function longfToDatetimeLocal(value){
  const raw=String(value||"").trim();
  if(!raw) return "";
  if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0,16);
  const m=raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
  if(m) return `${m[1]}T${m[2]}`;
  return raw;
}

function longfFromDatetimeLocal(value){
  const raw=String(value||"").trim();
  return raw ? raw : "";
}


function longfResetDraftState(options={}){
  const keepLog = !!options.keepLog;
  state.longfVideos = [];
  state.longfMainImage = "";
  state.longfVideoFilePath = "";
  state.longfQueue = [];
  if($("longfVideoFilePathField")) $("longfVideoFilePathField").value = "";
  if($("longfImagePathField")) $("longfImagePathField").value = "";
  if($("longfDefaultTitle")) $("longfDefaultTitle").value = "";
  if($("longfDefaultHashtag")) $("longfDefaultHashtag").value = "";
  if($("longfPublishTime")) $("longfPublishTime").value = "";
  if(typeof longfRenderSelectedVideo==="function") longfRenderSelectedVideo();
  if(typeof longfRenderCover==="function") longfRenderCover();
  if(typeof renderLongFQueue==="function") renderLongFQueue();
  saveState();
  if(!keepLog) longfLog("Đã reset video đã chọn và Queue LongF về trạng thái ban đầu.");
}

function longfRemoveSuccessfulQueueItems(){
  const q = state.longfQueue || [];
  const before = q.length;
  state.longfQueue = q.filter(item => {
    const result = String(item.result || "");
    return !(result.includes("Đã gửi lịch đăng") || result.includes("API đã nhận") || result.includes("Đã thấy trên list") || result.includes("Đã đăng"));
  });
  const removed = before - state.longfQueue.length;
  renderLongFQueue();
  saveState();
  return removed;
}

function renderLongFQueue(){
  const b=$("longfQueueBody");
  if(!b)return;
  const q=state.longfQueue||[];
  if(!q.length){
    b.innerHTML='<tr><td colspan="11" class="center muted-cell">Chưa có bài trong queue.</td></tr>';
    return;
  }
  b.innerHTML=q.map((it,i)=>`<tr>
    <td>${i+1}</td>
    <td>${esc(it.videoName||it.videoPath||"-")}</td>
    <td>
      ${longfCoverPreviewHtml(it.imagePath)}
      <div class="longf-cover-actions">
        <button data-longf-cover="${i}">Chọn cover</button>
        <button class="danger-lite" data-longf-cover-clear="${i}">Xóa</button>
      </div>
    </td>
    <td><textarea class="longf-title-input" data-longf-title="${i}">${esc(it.title||"")}</textarea></td>
    <td><select class="longf-small-input" data-longf-category="${i}">${longfCategoryOptionsHtml(it.category)}</select></td>
    <td><select class="longf-small-input" data-longf-author="${i}">${longfAuthorOptionsHtml(it.author)}</select></td>
    <td><input type="datetime-local" class="longf-time-input" data-longf-time="${i}" value="${esc(longfToDatetimeLocal(it.publishTime||""))}"></td>
    <td><input class="longf-path-input" data-longf-video-path="${i}" value="${esc(it.videoFilePath||it.video_file||"")}" placeholder="auto after upload"></td>
    <td><select data-longf-status="${i}"><option value="on" ${it.status==="on"?"selected":""}>On</option><option value="off" ${it.status==="off"?"selected":""}>Off</option></select></td>
    <td>${esc(it.result||"")}</td>
    <td><button data-longf-now="${i}">Giờ</button> <button data-longf-api-run="${i}">API</button> <button data-longf-run="${i}">Web</button> <button class="danger-lite" data-longf-del="${i}">Xóa</button></td>
  </tr>`).join("");

  b.querySelectorAll("[data-longf-cover]").forEach(x=>x.onclick=()=>longfChooseQueueCover(+x.dataset.longfCover));
  b.querySelectorAll("[data-longf-cover-clear]").forEach(x=>x.onclick=()=>longfClearQueueCover(+x.dataset.longfCoverClear));
  b.querySelectorAll("[data-longf-title]").forEach(x=>x.onchange=()=>{state.longfQueue[+x.dataset.longfTitle].title=x.value;saveState()});
  b.querySelectorAll("[data-longf-category]").forEach(x=>x.onchange=()=>{state.longfQueue[+x.dataset.longfCategory].category=x.value;saveState()});
  b.querySelectorAll("[data-longf-author]").forEach(x=>x.onchange=()=>{state.longfQueue[+x.dataset.longfAuthor].author=x.value;saveState()});
  b.querySelectorAll("[data-longf-time]").forEach(x=>x.onchange=()=>{state.longfQueue[+x.dataset.longfTime].publishTime=longfFromDatetimeLocal(x.value);saveState()});
  b.querySelectorAll("[data-longf-video-path]").forEach(x=>x.onchange=()=>{state.longfQueue[+x.dataset.longfVideoPath].videoFilePath=x.value;saveState()});
  b.querySelectorAll("[data-longf-status]").forEach(x=>x.onchange=()=>{state.longfQueue[+x.dataset.longfStatus].status=x.value;saveState()});
  b.querySelectorAll("[data-longf-now]").forEach(x=>x.onclick=()=>{const idx=+x.dataset.longfNow;state.longfQueue[idx].publishTime=longfNowLocalInput();renderLongFQueue();saveState()});
  b.querySelectorAll("[data-longf-api-run]").forEach(x=>x.onclick=()=>longfRunApiOne(+x.dataset.longfApiRun));
  b.querySelectorAll("[data-longf-run]").forEach(x=>x.onclick=()=>longfRunOne(+x.dataset.longfRun));
  b.querySelectorAll("[data-longf-del]").forEach(x=>x.onclick=()=>{state.longfQueue.splice(+x.dataset.longfDel,1);renderLongFQueue();saveState()});
}

async function longfRunApiOne(index){
  const item=state.longfQueue?.[index];
  if(!item)return false;
  item.result="Đang upload/API";
  renderLongFQueue();saveState();
  try{
    const res=await window.JordanAPI.longfCreateVideoDirect(item);
    item.videoFilePath=res.videoFilePath||item.videoFilePath||"";
    item.imageFilePath=res.imageFilePath||item.imageFilePath||"";
    if(res.verify?.checked && res.verify?.found) item.result="Đã đăng/đã thấy trên list";
    else if(res && res.ok) item.result=item.publishTime ? "Đã gửi lịch đăng" : "API OK, cần kiểm tra list";
    else item.result="Chưa xác nhận";
    if(index===0 && $("longfVideoFilePathField")) $("longfVideoFilePathField").value=item.videoFilePath;
    longfLog((item.publishTime ? "LongF đã nhận lịch đăng: " : "LongF đã nhận bài: ")+(item.videoFilePath||res.response?.msg||"OK")+(res.verify?.found?" | Đã thấy trong Video List":" | API đã nhận, chưa quét lại thấy trên list"));
    renderLongFQueue();saveState();
    return true;
  }catch(e){
    const msg=shortErr(e);
    item.result="API lỗi: "+msg;
    longfLog("API lỗi video "+(index+1)+": "+msg);
    renderLongFQueue();saveState();
    return false;
  }
}

async function longfRunApiQueue(){
  const q=state.longfQueue||[];
  if(!q.length)return alert("Queue LongF đang trống.");
  if(!confirm(`Đăng/lên lịch hàng loạt ${q.length} video bằng LongF API? Publish time sẽ được dùng làm thời gian lên lịch trên LongF.`))return;
  let ok=0, fail=0;
  for(let i=0;i<q.length;i++){
    const done=await longfRunApiOne(i);
    if(done) ok++; else fail++;
  }
  longfLog(`Đã chạy xong queue LongF API. LongF đã nhận/gửi lịch: ${ok}. Lỗi: ${fail}.`);
  if(ok>0 && fail===0){
    longfResetDraftState({keepLog:true});
    longfLog("Đăng/gửi lịch thành công. App đã tự xóa toàn bộ video và reset Queue LongF.");
  }else if(ok>0){
    const removed = longfRemoveSuccessfulQueueItems();
    longfLog(`Đã tự xóa ${removed} video đăng thành công khỏi Queue LongF. Các video lỗi được giữ lại để kiểm tra.`);
  } if(fail>0) alert(`LongF API còn lỗi: ${fail}/${q.length}. Xem log để biết chi tiết.`);
}

async function longfRunOne(index){
  const item=state.longfQueue?.[index];
  if(!item)return;
  item.result="Đang mở web";
  renderLongFQueue();saveState();
  try{
    const res=await window.JordanAPI.longfAutoPostOne(item);
    item.result=(res.formFilled||res.videoSet||res.imageSet)?"Đã điền form, chờ Confirm":"Đã mở web, cần kiểm tra tay";
    longfLog(res.message||"Đã chạy LongF item.");
  }catch(e){item.result="Lỗi Web";longfLog(e.message||String(e))}
  renderLongFQueue();saveState();
}

async function longfRunQueue(){
  const q=state.longfQueue||[];
  if(!q.length)return alert("Queue LongF đang trống.");
  if(!confirm(`Chạy fallback web automation cho ${q.length} bài/video?`))return;
  for(let i=0;i<q.length;i++) await longfRunOne(i);
  longfLog("Đã chạy xong queue LongF web automation.");
}

async function longfExportQueue(){
  const q=state.longfQueue||[];
  const csv=["videoPath,imagePath,title,category,author,publishTime,videoFilePath,status,result",...q.map(x=>[x.videoPath,x.imagePath,x.title,x.category,x.author,x.publishTime,x.videoFilePath,x.status,x.result].map(csvEsc).join(","))].join("\\n");
  const f=await window.JordanAPI.exportCsv(csv,"longf_queue.csv");
  if(f)longfLog("Đã xuất LongF queue: "+f);
}

function setStatus(t){$("statusBar").textContent=t}




function douyinFriendlyGeminiError(message){
  const msg=String(message||"");
  if(/503|high demand|overloaded|unavailable/i.test(msg)){
    return msg+" | Gemini đang quá tải tạm thời. Bản v10.6 đã tự retry/fallback; nếu vẫn lỗi, đợi vài phút rồi chạy lại hoặc chọn OpenAI nếu API còn quota.";
  }
  if(/429|rate limit/i.test(msg)){
    return msg+" | Gemini đang giới hạn tốc độ. Hãy đợi một lúc hoặc giảm số video xử lý cùng lúc.";
  }
  return msg;
}

function douyinLog(text){
  const box=$("douyinLog");
  if(box) box.value=`[${new Date().toLocaleString()}] ${text}\n`+(box.value||"");
  setStatus(text);
}
function douyinFormatSize(bytes){
  const n=Number(bytes||0);
  if(n>1024*1024*1024)return(n/1024/1024/1024).toFixed(2)+" GB";
  if(n>1024*1024)return(n/1024/1024).toFixed(2)+" MB";
  if(n>1024)return(n/1024).toFixed(2)+" KB";
  return n+" B";
}
function douyinRenderQueue(){
  const body=$("douyinQueueBody");
  if(!body)return;
  const q=state.douyinQueue||[];
  body.innerHTML=q.map((v,i)=>`<tr>
    <td>${i+1}</td>
    <td>${esc(v.name||"")}</td>
    <td>${douyinFormatSize(v.size)}</td>
    <td>${esc(v.status||"Chờ xử lý")}</td>
    <td>${v.srtPath?`<div><b>SRT:</b> ${esc(v.srtPath)}</div>`:""}${v.burnedVideo?`<div><b>MP4:</b> ${esc(v.burnedVideo)}</div>`:esc(v.result||"-")}</td>
    <td><button data-douyin-open="${i}">Mở file</button> <button class="danger-lite" data-douyin-del="${i}">Xóa</button></td>
  </tr>`).join("") || '<tr><td colspan="6">Chưa có video. Bấm “Chọn video” để bắt đầu.</td></tr>';
  body.querySelectorAll("[data-douyin-del]").forEach(b=>b.onclick=()=>{state.douyinQueue.splice(+b.dataset.douyinDel,1);douyinRenderQueue();saveState()});
  body.querySelectorAll("[data-douyin-open]").forEach(b=>b.onclick=()=>{const it=state.douyinQueue[+b.dataset.douyinOpen];const p=it?.burnedVideo||it?.srtPath||it?.viTxt||it?.path;if(p)window.JordanAPI.openExternal("file:///"+p.replace(/\\/g,"/"))});
}
async function douyinPickVideos(){
  const files=await window.JordanAPI.douyinPickVideos();
  if(!files?.length)return;
  state.douyinQueue=state.douyinQueue||[];
  files.forEach(f=>state.douyinQueue.push({...f,status:"Chờ xử lý",result:"-"}));
  douyinRenderQueue();saveState();douyinLog(`Đã chọn ${files.length} video.`);
}

async function douyinPickFfmpeg(){
  const p = await window.JordanAPI.douyinPickFfmpegExe();
  if(!p) return;
  state.douyinFfmpegPath = p;
  if($("douyinFfmpegText")) $("douyinFfmpegText").textContent = p;
  saveState();
  douyinLog("Đã chọn FFmpeg: " + p);
}

async function douyinPickOutputDir(){
  const dir=await window.JordanAPI.douyinPickOutputDir();
  if(!dir)return;
  state.douyinOutputDir=dir;
  if($("douyinOutputDirText"))$("douyinOutputDirText").textContent=dir;
  saveState();douyinLog("Đã chọn thư mục xuất.");
}
function douyinConfig(){
  return{
    openaiKey:$("douyinOpenAIKey")?.value.trim()||$("openaiKey")?.value.trim()||"",
    geminiKey:$("douyinGeminiKey")?.value.trim()||$("geminiKey")?.value.trim()||"",
    translateProvider:$("douyinProvider")?.value||"openai",
    translateModel:$("douyinTranslateModel")?.value.trim()||"",
    transcriptProvider:$("douyinTranscriptProvider")?.value||"auto",
    geminiTranscriptModel:(($("douyinGeminiTranscriptCustomModel")?.value.trim()) || ($("douyinGeminiTranscriptModel")?.value.trim()) || ""),
    openaiTranscriptModel:(($("douyinOpenAITranscriptModel")?.value==="custom" ? $("douyinOpenAITranscriptCustomModel")?.value.trim() : $("douyinOpenAITranscriptModel")?.value) || "whisper-1"),
    subtitleStyle:$("douyinSubtitleStyle")?.value||"",
    outputDir:state.douyinOutputDir||"",
    ffmpegPath:state.douyinFfmpegPath||"",
    exportBurnedVideo:!!$("douyinBurnSub")?.checked,
    subtitleFont:$("douyinSubtitleFont")?.value||"Arial",
    subtitleFontSize:$("douyinSubtitleFontSize")?.value||"24",
    subtitleBoxColor:$("douyinSubtitleBoxColor")?.value||"yellow",
    subtitleTextColor:$("douyinSubtitleTextColor")?.value||"black",
    subtitleMarginV:$("douyinSubtitleMarginV")?.value||"42",
    outputAspectRatio:$("douyinOutputAspectRatio")?.value||"original"
  };
}
async function douyinRunQueue(){
  const q=state.douyinQueue||[];
  if(!q.length)return alert("Chưa có video trong queue.");
  const cfg=douyinConfig();
  if(cfg.transcriptProvider==="openai" && !cfg.openaiKey)return alert("Cần OpenAI API key nếu chọn OpenAI Whisper.");
  if((cfg.transcriptProvider==="gemini" || cfg.transcriptProvider==="auto") && !cfg.openaiKey && !cfg.geminiKey)return alert("Cần OpenAI hoặc Gemini API key để nhận diện giọng nói.");
  let ok=0,fail=0;
  for(let i=0;i<q.length;i++){
    const item=q[i];
    try{
      item.status="Đang xử lý";item.result="Tách audio / transcript / dịch...";douyinRenderQueue();saveState();
      const res=await window.JordanAPI.douyinProcessVideo({...cfg,videoPath:item.path});
      Object.assign(item,{status:"Hoàn tất",result:res.message,srtPath:res.srtPath,zhTxt:res.zhTxt,viTxt:res.viTxt,burnedVideo:res.burnedVideo,segments:res.segments,subtitleStyle:res.subtitleStyle||"",outputAspectInfo:res.outputAspectInfo||null});
      ok++;douyinLog(`Hoàn tất video ${i+1}: ${item.name}`);
    }catch(e){
      item.status="Lỗi";item.result=douyinFriendlyGeminiError(e.message||String(e));fail++;douyinLog(`Lỗi video ${i+1}: ${item.result}`);
    }
    douyinRenderQueue();saveState();
  }
  douyinLog(`Xong queue Douyin. Thành công: ${ok}. Lỗi: ${fail}.`);
}

function douyinBuildWebPrompt(){
  const q=state.douyinQueue||[];
  const names=q.map((x,i)=>`${i+1}. ${x.name||x.path||"video"}`).join("\n");
  return `Bạn là trợ lý xử lý video Trung Quốc sang tiếng Việt cho Jordan Task Manager.

Nhiệm vụ:
1. Nếu tôi cung cấp transcript tiếng Trung, hãy dịch sang tiếng Việt tự nhiên.
2. Tạo phụ đề tiếng Việt ngắn gọn, dễ đọc.
3. Giữ văn phong phù hợp video mạng xã hội.
4. Nếu có timeline, giữ timeline và xuất SRT.
5. Nếu không có timeline, hãy xuất bản dịch theo đoạn để tôi đưa lại vào app.

Video trong queue:
${names || "Chưa có video trong queue"}

Yêu cầu đầu ra:
- Bản dịch tiếng Việt
- Gợi ý caption ngắn
- Gợi ý hashtag
- Nếu có thể, tạo SRT tiếng Việt`;
}
async function douyinCopyWebPrompt(){
  const prompt=douyinBuildWebPrompt();
  if(window.JordanAPI.appCopyText) await window.JordanAPI.appCopyText(prompt);
  else await navigator.clipboard.writeText(prompt);
  douyinLog("Đã copy prompt xử lý web. Có thể dán vào ChatGPT/Gemini web.");
}

function douyinClearQueue(){state.douyinQueue=[];douyinRenderQueue();saveState();douyinLog("Đã xóa queue Douyin.")}




function aiEngineerRequireAdminUI(){
  if(!state.auth?.currentUser || state.auth.currentUser.role !== "admin"){alert("Chỉ admin mới được sử dụng Trợ lý AI.");return false}
  return true;
}
function aiEngineerConfig(){
  return{
    currentUser:state.auth?.currentUser,
    provider:$("aiEngineerProvider")?.value||"openai",
    model:$("aiEngineerModel")?.value.trim()||"",
    openaiKey:$("aiEngineerOpenAIKey")?.value.trim()||$("openaiKey")?.value.trim()||"",
    geminiKey:$("aiEngineerGeminiKey")?.value.trim()||$("geminiKey")?.value.trim()||"",
    mode:$("aiEngineerMode")?.value||"debug",
    request:$("aiEngineerRequest")?.value||"",
    log:$("aiEngineerLog")?.value||"",
    context:$("aiEngineerContext")?.value||""
  };
}
async function aiEngineerAsk(){
  if(!aiEngineerRequireAdminUI())return;
  const payload=aiEngineerConfig();
  if(!payload.request.trim()&&!payload.log.trim())return alert("Nhập yêu cầu hoặc dán log lỗi trước.");
  try{$("aiEngineerAnswer").value="Đang phân tích...";setStatus("AI Engineer đang xử lý...");const res=await window.JordanAPI.aiEngineerAsk(payload);$("aiEngineerAnswer").value=res.answer||"";setStatus("AI Engineer đã trả lời.")}
  catch(e){$("aiEngineerAnswer").value=e.message||String(e);setStatus("AI Engineer lỗi.")}
}
function aiEngineerClear(){["aiEngineerRequest","aiEngineerLog","aiEngineerContext","aiEngineerAnswer"].forEach(id=>{if($(id))$(id).value=""})}
async function aiEngineerCopy(){const t=$("aiEngineerAnswer")?.value||"";if(t){await navigator.clipboard.writeText(t);setStatus("Đã copy kết quả AI Engineer.")}}
async function aiEngineerSave(){if(!aiEngineerRequireAdminUI())return;const content=$("aiEngineerAnswer")?.value||"";if(!content)return alert("Chưa có nội dung để lưu.");const res=await window.JordanAPI.aiEngineerSaveNote({currentUser:state.auth.currentUser,content});alert("Đã lưu note:\\n"+res.file)}




function aiControlRequireAdmin(){
  if(!state.auth?.currentUser || state.auth.currentUser.role !== "admin"){
    alert("Chỉ admin cao nhất mới được dùng AI Control Center.");
    return false;
  }
  return true;
}
function aiControlLog(text){
  const box=$("aiControlLog");
  const msg=`[${new Date().toLocaleString()}] ${text}`;
  if(box) box.value=msg+"\n"+(box.value||"");
  setStatus(text);
}
async function aiControlPickSource(){
  if(!aiControlRequireAdmin())return;
  const dir=await window.JordanAPI.aiControlPickSourceDir({currentUser:state.auth.currentUser});
  if(dir){$("aiControlSourceDir").value=dir;aiControlLog("Đã chọn source: "+dir)}
}
async function aiControlBackup(){
  if(!aiControlRequireAdmin())return;
  if(!$("aiControlApproveBackup")?.checked)return alert("Cần tick xác nhận backup trước.");
  try{
    const res=await window.JordanAPI.aiControlBackupSource({currentUser:state.auth.currentUser,sourceDir:$("aiControlSourceDir").value,approved:true});
    aiControlLog("Đã backup source: "+res.backupDir);
  }catch(e){aiControlLog("Backup lỗi: "+(e.message||String(e)))}
}
async function aiControlRunCommand(){
  if(!aiControlRequireAdmin())return;
  if(!$("aiControlApproveTerminal")?.checked)return alert("Cần tick xác nhận chạy terminal trước.");
  const cmd=$("aiControlCommand")?.value.trim();
  if(!cmd)return alert("Chưa nhập lệnh.");
  if(!confirm("Xác nhận chạy lệnh terminal này?\n\n"+cmd))return;
  try{
    aiControlLog("Đang chạy: "+cmd);
    const res=await window.JordanAPI.aiControlRunTerminal({currentUser:state.auth.currentUser,cwd:$("aiControlSourceDir").value,command:cmd,approved:true});
    aiControlLog(`Terminal xong. Code: ${res.code}\nSTDOUT:\n${res.stdout||""}\nSTDERR:\n${res.stderr||""}`);
  }catch(e){aiControlLog("Terminal lỗi: "+(e.message||String(e)))}
}
async function aiControlWriteFile(){
  if(!aiControlRequireAdmin())return;
  if(!$("aiControlApproveWrite")?.checked)return alert("Cần tick xác nhận ghi file trước.");
  const filePath=$("aiControlFilePath")?.value.trim();
  if(!filePath)return alert("Chưa nhập đường dẫn file.");
  if(!confirm("Xác nhận ghi/sửa file này?\n\n"+filePath))return;
  try{
    const res=await window.JordanAPI.aiControlWriteFile({currentUser:state.auth.currentUser,filePath,content:$("aiControlFileContent").value,approved:true,backup:true});
    aiControlLog("Đã ghi file: "+res.filePath);
  }catch(e){aiControlLog("Ghi file lỗi: "+(e.message||String(e)))}
}




function ttsOhFreeLog(text){
  const box=$("ttsOhFreeLog");
  const msg=`[${new Date().toLocaleString()}] ${text}`;
  if(box) box.value=msg+"\n"+(box.value||"");
  setStatus(text);
}
async function ttsOhFreeCopy(){
  const text=$("ttsOhFreeText")?.value||"";
  if(!text.trim())return alert("Chưa có nội dung để copy.");
  await window.JordanAPI.ttsOhFreeCopyText(text);
  ttsOhFreeLog("Đã copy nội dung voice vào clipboard.");
}
async function ttsOhFreeOpen(){
  await window.JordanAPI.ttsOhFreeOpen("main");
  ttsOhFreeLog("Đã mở TTS OhFree trong cửa sổ app.");
}
async function ttsOhFreeHistory(){
  await window.JordanAPI.ttsOhFreeOpen("history");
  ttsOhFreeLog("Đã mở Voice Clone History.");
}
function douyinSendToTts(){
  const q=state.douyinQueue||[];
  const text=q.map(x=>x.viText||x.result||"").filter(Boolean).join("\n\n");
  const paths=q.map(x=>x.viTxt).filter(Boolean);
  if(text.trim()){
    if($("ttsOhFreeText"))$("ttsOhFreeText").value=text;
    showView("ttsOhFreeView");
    ttsOhFreeLog("Đã gửi nội dung dịch sang Voice Việt.");
  }else if(paths.length){
    if($("ttsOhFreeText"))$("ttsOhFreeText").value="File bản dịch Việt đã xuất:\n"+paths.join("\n");
    showView("ttsOhFreeView");
    ttsOhFreeLog("Đã gửi đường dẫn file bản dịch sang Voice Việt.");
  }else{
    alert("Chưa có bản dịch Việt trong queue Douyin.");
  }
}


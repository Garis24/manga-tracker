/**
* MANGA TRACKER - Popup JS
*/
const CLIENT_ID = "67925064642-k8s30qr54jje3b59n391siah2dtrss7m.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.appdata";
const REDIRECT_URI = chrome.identity.getRedirectURL();
const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/manga-tracker/kobfdnepnoplkcgnpkcjellfeokhhnlk?authuser=0&hl=fr';

// ──────────────────────────────────────────────
// DISCORD
// ──────────────────────────────────────────────
document.getElementById('btn-discord')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://discord.gg/Tef2uFXFC6' });
});

document.getElementById('about-discord-link')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://discord.gg/Tef2uFXFC6' });
});

// ──────────────────────────────────────────────
// BANNER NOW VERSTION
// ──────────────────────────────────────────────
async function loadUpdateBanner() {
  const resp = await sendMsg('getUpdateInfo');

  const info = resp?.info;
  const box = document.getElementById('update-banner');
  const text = document.getElementById('update-banner-text');
  const btn = document.getElementById('update-banner-download');
  const checkBtn = document.getElementById('btn-check-update');
  const settingsBadge = document.getElementById('settings-update-badge');
  const menuBadge = document.getElementById('menu-update-badge');

  if (!box || !text || !btn) return;

  const storeUrl = info?.storeUrl || CHROME_WEB_STORE_URL;

  btn.onclick = null;

  if (!info || (!info.hasUpdate && !info.updateReady && info.status !== 'throttled')) {
    box.classList.add('hidden');
    settingsBadge?.classList.add('hidden');
    menuBadge?.classList.add('hidden');

    if (checkBtn) checkBtn.textContent = 'Rechercher une mise à jour';
    return;
  }

  if (info.updateReady) {
    text.textContent = `La version v${info.remoteVersion} est prête. Cliquez pour redémarrer l’extension et appliquer la mise à jour.`;
    btn.textContent = 'Mettre à jour maintenant';
    btn.onclick = async () => {
      await sendMsg('applyPendingUpdate');
      window.close();
    };

    box.classList.remove('hidden');
    settingsBadge?.classList.remove('hidden');
    menuBadge?.classList.remove('hidden');

    if (checkBtn) checkBtn.textContent = 'Re-vérifier';
    return;
  }

  if (info.status === 'throttled') {
    text.textContent = 'Chrome limite les vérifications trop fréquentes. Réessayez dans quelques minutes.';
    btn.textContent = 'Ouvrir le Chrome Web Store';
    btn.onclick = () => chrome.tabs.create({ url: storeUrl });

    box.classList.remove('hidden');
    settingsBadge?.classList.add('hidden');
    menuBadge?.classList.add('hidden');

    if (checkBtn) checkBtn.textContent = 'Réessayer plus tard';
    return;
  }

  if (info.hasUpdate) {
    text.textContent = `Une nouvelle version v${info.remoteVersion} a été détectée. Chrome la téléchargera et l’appliquera automatiquement dès que l’extension sera inactive.`;
    btn.textContent = 'Voir sur le Chrome Web Store';
    btn.onclick = () => chrome.tabs.create({ url: storeUrl });

    box.classList.remove('hidden');
    settingsBadge?.classList.remove('hidden');
    menuBadge?.classList.remove('hidden');

    if (checkBtn) checkBtn.textContent = 'Re-vérifier';
  }
}

async function manualCheckUpdate() {
  const resp = await sendMsg('checkForExtensionUpdate');
  await loadUpdateBanner();

  if (!resp?.success) {
    showToast(`Erreur vérification MAJ : ${resp?.error || 'inconnue'}`, 'error');
    return;
  }

  if (resp.status === 'update_available') {
    showToast(`Mise à jour détectée, Chrome la prépare automatiquement`, 'success');
    return;
  }

  if (resp.status === 'no_update') {
    showToast(`Aucune mise à jour, version actuelle : v${resp.localVersion}`, 'success');
    return;
  }

  if (resp.status === 'throttled') {
    showToast(`Vérification limitée par Chrome, réessaie dans quelques minutes`, 'error');
    return;
  }
}
// ──────────────────────────────────────────────
// UTILITAIRES
// ──────────────────────────────────────────────

function sendMsg(action, data = {}) {
return new Promise((resolve) => {
chrome.runtime.sendMessage({ action, data }, (response) => {
resolve(response || { success: false, reason: "no_response" });
});
});
}
function setDriveStatus(state, customText = "") {
const dot = document.getElementById("sync-dot");
const text = document.getElementById("sync-status-text");
const connectBtn = document.getElementById("btn-connect-drive");

if (dot) {
dot.className = "sync-dot";
if (state === "connected") dot.classList.add("connected");
if (state === "syncing") dot.classList.add("syncing");
}

if (text) {
if (customText) {
text.textContent = customText;
} else if (state === "connected") {
text.textContent = "Connecté à Google Drive";
} else if (state === "syncing") {
text.textContent = "Connexion…";
} else {
text.textContent = "Non connecté";
}
}

if (connectBtn) {
if (state === "connected") {
connectBtn.textContent = "Déjà connecté";
connectBtn.dataset.connected = "1";
} else {
connectBtn.textContent = "Connecter à Google Drive";
connectBtn.dataset.connected = "0";
}
}
}

async function withButtonLoading(buttonId, fn) {
const btn = document.getElementById(buttonId);
if (!btn) return await fn();

const oldOpacity = btn.style.opacity;
const oldPointerEvents = btn.style.pointerEvents;

btn.style.opacity = "0.5";
btn.style.pointerEvents = "none";

try {
return await fn();
} finally {
btn.style.opacity = oldOpacity || "1";
btn.style.pointerEvents = oldPointerEvents || "";
}
}

// ───────── AUTH ─────────

async function launchOAuth() {
const params = new URLSearchParams({
client_id: CLIENT_ID,
redirect_uri: REDIRECT_URI,
response_type: "token",
scope: SCOPES,
prompt: "consent"
});

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

const redirectUrl = await new Promise((resolve, reject) => {
chrome.identity.launchWebAuthFlow(
{ url: authUrl, interactive: true },
(responseUrl) => {
if (chrome.runtime.lastError || !responseUrl) {
reject(new Error(chrome.runtime.lastError?.message || "Auth annulée"));
return;
}
resolve(responseUrl);
}
);
});

const hash = new URL(redirectUrl).hash.replace(/^#/, "");
const data = new URLSearchParams(hash);

const accessToken = data.get("access_token");
const expiresIn = parseInt(data.get("expires_in") || "3600", 10);

if (!accessToken) {
throw new Error("token_absent");
}

return { accessToken, expiresIn };
}

async function checkSyncStatus() {
setDriveStatus("idle", "Vérification…");

try {
const resp = await sendMsg("checkDriveAuth");

if (resp?.connected) {
setDriveStatus("connected");
} else {
setDriveStatus("idle");
}
} catch (_) {
setDriveStatus("idle");
}
}

async function connectDrive() {
const current = await sendMsg("checkDriveAuth");
if (current?.connected) {
setDriveStatus("connected");
showToast("Google Drive déjà connecté", "success");
return;
}

setDriveStatus("syncing");

try {
const { accessToken, expiresIn } = await launchOAuth();

const storeResp = await sendMsg("storeToken", { accessToken, expiresIn });
if (!storeResp?.success) {
throw new Error(storeResp?.reason || "store_failed");
}

setDriveStatus("connected");
showToast("Google Drive connecté", "success");
} catch (err) {
console.error(err);
setDriveStatus("idle", "Erreur de connexion");
showToast("Connexion annulée ou refusée", "error");
}
}

// ───────── ACTIONS ─────────
async function manualSyncToDrive() {
await withButtonLoading("btn-sync", async () => {
const resp = await sendMsg("syncToDrive");

if (resp?.success) {
setDriveStatus("connected");
showToast("Synchronisation envoyée vers Drive", "success");
} else if (resp?.reason === "not_connected") {
setDriveStatus("idle");
showToast("Connectez Drive dans les paramètres", "error");
} else {
showToast(`Erreur sync: ${resp?.reason || "inconnue"}`, "error");
}
});
}

async function manualSyncWithDrive() {
await withButtonLoading("btn-force-sync", async () => {
const resp = await sendMsg("syncWithDrive");

if (resp?.success) {
setDriveStatus("connected");

if (resp.mode === "push_initial") {
showToast("Sauvegarde Drive créée", "success");
} else if (resp.mode === "rewrite_remote") {
showToast("Drive réparé puis synchronisé", "success");
} else {
showToast(
`Synchronisation réussie${resp.mangasCount ? ` (${resp.mangasCount} mangas)` : ""}`,
"success"
);
}

selectedManga = null;
await refreshPopupUI({ keepDetail: false });
} else if (resp?.reason === "not_connected") {
setDriveStatus("idle");
showToast("Connectez Drive dans les paramètres", "error");
} else {
showToast(`Erreur sync: ${resp?.reason || "inconnue"}`, "error");
}
});
}

async function importFromDrive() {
await withButtonLoading("btn-import-drive", async () => {
const resp = await sendMsg("syncFromDrive");

if (resp?.success) {
setDriveStatus("connected");
showToast(
`Import Drive réussi${resp.mangasCount ? ` (${resp.mangasCount} mangas)` : ""}`,
"success"
);

selectedManga = null;
await refreshPopupUI({ keepDetail: false });
} else if (resp?.reason === "not_connected") {
setDriveStatus("idle");
showToast("Connectez d'abord Google Drive", "error");
} else if (resp?.reason === "no_file") {
showToast("Aucun fichier Drive trouvé", "error");
} else if (resp?.reason === "empty") {
showToast("Fichier Drive vide", "error");
} else if (resp?.reason === "invalid_remote_data") {
showToast("Fichier Drive invalide", "error");
} else {
showToast(`Erreur import: ${resp?.reason || "inconnue"}`, "error");
}
});
}

// ───────── EVENTS ─────────

document.addEventListener("DOMContentLoaded", async () => {
const btnConnect = document.getElementById("btn-connect-drive");
const btnSync = document.getElementById("btn-sync");
const btnImport = document.getElementById("btn-import-drive");
const btnForceSync = document.getElementById("btn-force-sync");
const btnCheckUpdate = document.getElementById('btn-check-update');

  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', manualCheckUpdate);
  }

if (btnConnect) {
btnConnect.addEventListener("click", connectDrive);
}

if (btnSync) {
btnSync.addEventListener("click", manualSyncToDrive);
}

if (btnImport) {
btnImport.addEventListener("click", importFromDrive);
}

if (btnForceSync) {
btnForceSync.addEventListener("click", manualSyncWithDrive);
}

await checkSyncStatus();
});

function showToast(msg, type = '') {
const toast = document.getElementById('toast');
toast.textContent = msg;
toast.className = `toast ${type}`;
toast.classList.remove('hidden');
clearTimeout(toast._timer);
toast._timer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function formatDate(iso) {
if (!iso) return '—';
const d = new Date(iso);
return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatChaptersLabel(count) {
return count === 0 ? '0 chapitre lu' : count === 1 ? '1 chapitre lu' : `${count} chapitres lus`;
}


function findSameManga(list, manga) {
if (!manga) return null;

return list.find(m => m.domain === manga.domain && m.slug === manga.slug)
|| list.find(m => m.slug === manga.slug)
|| null;
}

async function refreshPopupUI({ keepDetail = true } = {}) {
await loadMangaList();
await loadCurrentPage();

if (!keepDetail) {
showView('view-main');
return;
}

if (selectedManga) {
const refreshed = findSameManga(allMangas, selectedManga);

if (refreshed) {
selectedManga = refreshed;
openMangaDetail(selectedManga);
} else {
selectedManga = null;
showView('view-main');
}
} else {
showView('view-main');
}
}

// ──────────────────────────────────────────────
// NAVIGATION ENTRE VUES
// ──────────────────────────────────────────────

const VIEWS = ['view-main', 'view-detail', 'view-settings', 'view-report'];
function showView(id) {
VIEWS.forEach(v => {
document.getElementById(v).classList.toggle('hidden', v !== id);
});
}

// ──────────────────────────────────────────────
// PAGE COURANTE (bandeau en haut)
// ──────────────────────────────────────────────

let currentPageInfo = null;
let currentIsRead = false;

async function loadCurrentPage() {
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (!tab) return;

try {
const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
if (!resp || !resp.pageInfo) return;

currentPageInfo = resp.pageInfo;
const pageInfo = resp.pageInfo;

const banner = document.getElementById('current-page-info');
const badge = document.getElementById('page-type-badge');
const titleEl = document.getElementById('page-manga-title');
const chapterEl = document.getElementById('page-chapter-info');
const toggleBtn = document.getElementById('btn-toggle-read');

banner.classList.remove('hidden');

if (pageInfo.type === 'chapter') {
badge.textContent = `Ch. ${pageInfo.chapterNumber}`;
badge.className = 'page-badge chapter';
titleEl.textContent = resp.mangaTitle || pageInfo.mangaSlug;
chapterEl.textContent = `Chapitre ${pageInfo.chapterNumber}`;

// Vérifier si déjà lu
const readResp = await sendMsg('getReadChapters', {
mangaSlug: pageInfo.mangaSlug,
domain: new URL(tab.url).hostname
});

const chapters = readResp.chapters || [];
currentIsRead = chapters.includes(pageInfo.chapterNumber);
updateToggleBtn(toggleBtn, currentIsRead);
toggleBtn.classList.remove('hidden');

} else if (pageInfo.type === 'manga') {
badge.textContent = 'Manga';
badge.className = 'page-badge';
titleEl.textContent = resp.mangaTitle || pageInfo.mangaSlug;

const readResp = await sendMsg('getReadChapters', {
mangaSlug: pageInfo.mangaSlug,
domain: new URL(tab.url).hostname
});
const count = (readResp.chapters || []).length;
chapterEl.textContent = formatChaptersLabel(count);
toggleBtn.classList.add('hidden');
}
} catch (e) {
// Page non-manga : pas d'erreur visible
}
}

function updateToggleBtn(btn, isRead) {
if (isRead) {
btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="16" height="16">
<path d="M5 12l5 5L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
btn.title = 'Lu — cliquer pour marquer non lu';
btn.className = 'btn-toggle';
} else {
btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" width="16" height="16">
<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
</svg>`;
btn.title = 'Non lu — cliquer pour marquer lu';
btn.className = 'btn-toggle unread';
}
}

// ──────────────────────────────────────────────
// LISTE DES MANGAS
// ──────────────────────────────────────────────

let allMangas = [];
let filteredMangas = [];
let selectedManga = null;
let activeStatusFilter = '';

const STATUS_LABELS = {
reading: { label: '📖 En cours', cls: 'status-reading' },
completed: { label: '✅ Terminé', cls: 'status-completed' },
paused: { label: '⏸ En pause', cls: 'status-paused' },
dropped: { label: '❌ Abandonné', cls: 'status-dropped' },
};

async function loadMangaList() {
const resp = await sendMsg('getAllMangas');
allMangas = resp.mangas || [];
applyFilters();
updateStats();
}

function updateStats() {
const totalChapters = allMangas.reduce((sum, m) => sum + (m.totalRead || 0), 0);
document.getElementById('stats-total').textContent =
allMangas.length === 0 ? '0 manga' :
allMangas.length === 1 ? '1 manga' : `${allMangas.length} mangas`;
document.getElementById('stats-chapters').textContent = formatChaptersLabel(totalChapters);
}

function applyFilters() {
const q = document.getElementById('search-input').value.toLowerCase().trim();
const status = document.getElementById('filter-status').value;

filteredMangas = allMangas.filter(m => {
const matchQ = !q ||
(m.title || '').toLowerCase().includes(q) ||
(m.slug || '').toLowerCase().includes(q) ||
(m.domain || '').toLowerCase().includes(q);
const matchStatus = !status || (m.status || 'reading') === status;
return matchQ && matchStatus;
});
renderMangaList();
}

function renderMangaList() {
const container = document.getElementById('manga-list');
const emptyState = document.getElementById('empty-state');

if (filteredMangas.length === 0) {
container.innerHTML = '';
container.appendChild(emptyState);
emptyState.classList.remove('hidden');
return;
}

emptyState.classList.add('hidden');

container.innerHTML = filteredMangas.map((manga, i) => {
const initial = (manga.title || '?').charAt(0).toUpperCase();
const lastCh = manga.lastReadChapter ? `Ch. ${manga.lastReadChapter}` : '—';
const lastDate = formatDate(manga.lastReadAt);
const st = STATUS_LABELS[manga.status || 'reading'];
const pct = manga.totalChapters > 0
? Math.round((manga.totalRead / manga.totalChapters) * 100) + '%'
: '';
return `
<div class="manga-item" data-index="${i}">
<div class="manga-item-icon">${initial}</div>
<div class="manga-item-info">
<div class="manga-item-title">${escapeHtml(manga.title || manga.slug)}</div>
<div class="manga-item-meta">${escapeHtml(manga.domain)} · ${lastCh}${pct ? ' · ' + pct : ''} · ${lastDate}</div>
</div>
<span class="status-pill ${st.cls}">${manga.status === 'reading' ? manga.totalRead : st.label}</span>
</div>
`;
}).join('');

container.querySelectorAll('.manga-item').forEach(el => {
el.addEventListener('click', () => openMangaDetail(filteredMangas[parseInt(el.dataset.index)]));
});
}

function escapeHtml(str) {
return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ──────────────────────────────────────────────
// VUE DÉTAIL D'UN MANGA
// ──────────────────────────────────────────────

function openMangaDetail(manga) {
selectedManga = manga;
showView('view-detail');

document.getElementById('detail-title').textContent = manga.title || manga.slug;
document.getElementById('detail-domain').textContent = manga.domain;
document.getElementById('detail-total-chapters').textContent = formatChaptersLabel(manga.totalRead);
document.getElementById('detail-last-read').textContent = formatDate(manga.lastReadAt);

// Progression
const pct = manga.totalChapters > 0
? Math.round((manga.totalRead / manga.totalChapters) * 100)
: null;
document.getElementById('detail-progress').textContent =
pct !== null ? `${pct}% (${manga.totalChapters} connus)` : '—';

// Barre de progression
let progressBar = document.getElementById('detail-progress-bar');
if (!progressBar) {
progressBar = document.createElement('div');
progressBar.id = 'detail-progress-bar';
progressBar.className = 'detail-progress-bar';
progressBar.innerHTML = '<div class="detail-progress-fill" id="detail-progress-fill"></div>';
document.querySelector('.detail-stats').after(progressBar);
}
document.getElementById('detail-progress-fill').style.width = (pct || 0) + '%';

// Statut
document.getElementById('detail-status').value = manga.status || 'reading';

// Notes
document.getElementById('detail-notes').value = manga.notes || '';

renderChapterChips(manga);
}

function renderChapterChips(manga) {
const container = document.getElementById('chapter-chips');
const chapters = [...(manga.chaptersRead || [])].sort((a, b) => a - b);

if (!container) return;

if (chapters.length === 0) {
container.innerHTML = '<span style="color:var(--text-muted);font-size:12px;">Aucun chapitre lu</span>';
return;
}

container.innerHTML = chapters.map(ch => `
<span class="chip read" data-chapter="${ch}" title="Cliquer pour marquer non lu">
Ch. ${ch}
</span>
`).join('');

container.querySelectorAll('.chip').forEach(chip => {
chip.addEventListener('click', async () => {
if (!selectedManga) return;

const ch = parseFloat(chip.dataset.chapter);

const resp = await sendMsg('unmarkChapter', {
mangaSlug: selectedManga.slug,
domain: selectedManga.domain,
chapterNumber: ch
});

if (!resp?.success) {
showToast(`Erreur: ${resp?.reason || 'suppression impossible'}`, 'error');
return;
}

selectedManga.chaptersRead = (selectedManga.chaptersRead || []).filter(c => c !== ch);
selectedManga.totalRead = selectedManga.chaptersRead.length;
selectedManga.lastReadChapter = selectedManga.chaptersRead.length
? Math.max(...selectedManga.chaptersRead)
: null;

if (!selectedManga.chaptersRead.length) {
selectedManga.lastReadAt = null;
}

const idx = allMangas.findIndex(m =>
m.domain === selectedManga.domain && m.slug === selectedManga.slug
);

if (idx !== -1) {
allMangas[idx] = {
...allMangas[idx],
chaptersRead: [...selectedManga.chaptersRead],
totalRead: selectedManga.totalRead,
lastReadChapter: selectedManga.lastReadChapter,
lastReadAt: selectedManga.lastReadAt
};
}

showToast(`Chapitre ${ch} marqué non lu`, 'success');

openMangaDetail(selectedManga);
updateStats();
applyFilters();

setTimeout(() => {
  refreshPopupUI({ keepDetail: true });
}, 150);
});
});
}

// ──────────────────────────────────────────────
// RECHERCHE
// ──────────────────────────────────────────────

document.getElementById('search-input').addEventListener('input', applyFilters);
document.getElementById('filter-status').addEventListener('change', applyFilters);

// ──────────────────────────────────────────────
// TOGGLE LU / NON LU (page courante)
// ──────────────────────────────────────────────

document.getElementById('btn-toggle-read').addEventListener('click', async () => {
if (!currentPageInfo || currentPageInfo.type !== 'chapter') return;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
const domain = new URL(tab.url).hostname;

if (currentIsRead) {
const resp = await sendMsg('unmarkChapter', {
mangaSlug: currentPageInfo.mangaSlug,
domain,
chapterNumber: currentPageInfo.chapterNumber
});

if (resp?.success) {
currentIsRead = false;
showToast(`Chapitre ${currentPageInfo.chapterNumber} marqué non lu`, 'success');
} else {
showToast(`Erreur: ${resp?.reason || 'suppression impossible'}`, 'error');
return;
}
} else {
const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });

const saveResp = await sendMsg('markAsRead', {
mangaSlug: currentPageInfo.mangaSlug,
mangaTitle: resp.mangaTitle || currentPageInfo.mangaSlug,
chapterNumber: currentPageInfo.chapterNumber,
domain,
url: tab.url,
readAt: new Date().toISOString()
});

if (saveResp?.success) {
currentIsRead = true;
showToast(`Chapitre ${currentPageInfo.chapterNumber} marqué lu`, 'success');
} else {
showToast(`Erreur: ${saveResp?.reason || 'enregistrement impossible'}`, 'error');
return;
}
}

updateToggleBtn(document.getElementById('btn-toggle-read'), currentIsRead);
await refreshPopupUI({ keepDetail: true });
});

// ──────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────

async function refreshMainListOnly() {
await loadMangaList();
await loadCurrentPage();
}

document.getElementById('btn-settings').addEventListener('click', () => {
showView('view-settings');
checkSyncStatus();
loadBadgeSizeSettings();
});

document.getElementById('btn-report').addEventListener('click', async () => {
showView('view-report');
// Pré-remplir l'URL avec la page active
try {
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (tab?.url) document.getElementById('report-url').value = tab.url;
} catch {}
});

document.getElementById('btn-back').addEventListener('click', () => {
showView('view-main');
selectedManga = null;
});

document.getElementById('btn-back-settings').addEventListener('click', () => showView('view-main'));
document.getElementById('btn-back-report').addEventListener('click', () => showView('view-main'));

// ── Statut manga ──
document.getElementById('detail-status').addEventListener('change', async (e) => {
if (!selectedManga) return;
const status = e.target.value;

const resp = await sendMsg('updateManga', {
mangaSlug: selectedManga.slug,
domain: selectedManga.domain,
status
});

if (!resp?.success) {
showToast(`Erreur: ${resp?.reason || 'mise à jour impossible'}`, 'error');
return;
}

showToast('Statut mis à jour', 'success');
await refreshPopupUI({ keepDetail: true });
});

// ── Notes ──
document.getElementById('btn-save-notes').addEventListener('click', async () => {
if (!selectedManga) return;
const notes = document.getElementById('detail-notes').value;

const resp = await sendMsg('updateManga', {
mangaSlug: selectedManga.slug,
domain: selectedManga.domain,
notes
});

if (!resp?.success) {
showToast(`Erreur: ${resp?.reason || 'enregistrement impossible'}`, 'error');
return;
}

showToast('Note enregistrée', 'success');
await refreshPopupUI({ keepDetail: true });
});

// ── Taille badge ──
async function loadBadgeSizeSettings() {
const s = await sendMsg('getSettings');
const size = s?.badgeSize || 'medium';
document.querySelectorAll('.size-btn').forEach(btn => {
btn.classList.toggle('active', btn.dataset.size === size);
});
}

document.querySelectorAll('.size-btn').forEach(btn => {
btn.addEventListener('click', async () => {
document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
btn.classList.add('active');
await sendMsg('saveSettings', { badgeSize: btn.dataset.size });
showToast('Taille mise à jour', 'success');
});
});

// ── Signalement bug ──
document.getElementById('btn-send-report').addEventListener('click', async () => {
const url = document.getElementById('report-url').value.trim();
const type = document.getElementById('report-type').value;
const comment = document.getElementById('report-comment').value.trim();
const version = chrome.runtime.getManifest().version;

// Google Form pré-rempli
// Remplace les entry.XXXXXXX par les vrais IDs de ton Google Form
const FORM_BASE = 'https://docs.google.com/forms/d/e/1FAIpQLSe2SOccfPeLbqpBdg7jQlYJPey1Qhpwt9hW6xiZIDVBYM0ZcA/viewform';
const params = new URLSearchParams({
'entry.1023135367': url,
'entry.746407402': type,
'entry.214887534': comment,
'entry.610292677': `v${version}`
});
const formUrl = `${FORM_BASE}?${params.toString()}&usp=pp_url`;
chrome.tabs.create({ url: formUrl });
showToast('Formulaire ouvert', 'success');
});

// ── PayPal ──
document.getElementById('btn-paypal').addEventListener('click', (e) => {
e.preventDefault();
// Remplace par ton lien PayPal.me
chrome.tabs.create({ url: 'https://www.paypal.me/GarisSellier' });
});

document.getElementById('btn-delete-manga').addEventListener('click', async () => {
if (!selectedManga) return;
if (!confirm(`Supprimer "${selectedManga.title}" et tout son historique ?`)) return;

const resp = await sendMsg('deleteManga', {
mangaSlug: selectedManga.slug,
domain: selectedManga.domain
});

if (!resp?.success) {
showToast(`Erreur: ${resp?.reason || 'suppression impossible'}`, 'error');
return;
}

selectedManga = null;
showToast('Manga supprimé', 'success');

await refreshMainListOnly();
showView('view-main');
});

// ──────────────────────────────────────────────
// EXPORT / IMPORT JSON
// ──────────────────────────────────────────────

document.getElementById('btn-export').addEventListener('click', async () => {
const resp = await sendMsg('exportDB');
if (!resp.success) return;

const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `manga_tracker_${new Date().toISOString().slice(0, 10)}.json`;
a.click();
URL.revokeObjectURL(url);
showToast('Export téléchargé', 'success');
});

document.getElementById('btn-import').addEventListener('click', () => {
document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
const file = e.target.files[0];
if (!file) return;
const text = await file.text();
try {
const data = JSON.parse(text);
if (!data.mangas) throw new Error('Format invalide');
await sendMsg('importDB', data);
showToast('Import réussi', 'success');
await refreshPopupUI({ keepDetail: false });
e.target.value = '';
} catch {
showToast('Fichier invalide', 'error');
}
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
if (!confirm('Effacer TOUTES les données de lecture ? Cette action est irréversible.')) return;
await sendMsg('importDB', { mangas: {}, version: 1 });
showToast('Données effacées');
selectedManga = null;
await refreshPopupUI({ keepDetail: false });
showView('view-main');
});

// ──────────────────────────────────────────────
// VERSION
// ──────────────────────────────────────────────

document.getElementById('ext-version').textContent = chrome.runtime.getManifest().version;

// ──────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────

async function init() {
await loadCurrentPage();
await loadMangaList();
await checkSyncStatus();
await checkOpenMangaRequest();
await loadUpdateBanner();
}

async function checkOpenMangaRequest() {
return new Promise((resolve) => {
chrome.storage.local.get('_openManga', async (result) => {
const req = result._openManga;
if (!req) return resolve();

// Ignorer si la demande est trop vieille (>5s)
if (Date.now() - req.ts > 5000) {
chrome.storage.local.remove('_openManga');
return resolve();
}

// Nettoyer immédiatement
chrome.storage.local.remove('_openManga');

// Trouver le manga dans la liste
const manga = allMangas.find(
m => m.slug === req.slug && m.domain === req.domain
) || allMangas.find(
// Fallback : slug seul si domain différent
m => m.slug === req.slug
);

if (manga) {
openMangaDetail(manga);
}

resolve();
});
});
}

init();
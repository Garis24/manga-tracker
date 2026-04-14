/**
 * MANGA TRACKER - Background Service Worker (Manifest V3)
 * Gère :
 * - Le stockage local (chrome.storage.sync)
 * - La synchronisation Google Drive (AppData, gratuit, invisible pour l'utilisateur)
 */


// ──────────────────────────────────────────────
// STRUCTURE DE LA BASE DE DONNÉES LOCALE
// ──────────────────────────────────────────────
// {
//   mangas: {
//     "<domain>|<mangaSlug>": {
//       slug: "enigmatica",
//       title: "Enigmatica",
//       domain: "raijin-scans.fr",
//       chaptersRead: [1, 2, 3],
//       totalChapters: 50,               // total chapitres connus (pour la progression)
//       lastReadChapter: 3,
//       lastReadAt: "2026-04-08T20:00:00Z",
//       addedAt: "2026-04-08T18:00:00Z",
//       status: "reading",               // reading | completed | paused | dropped
//       notes: "Mon avis...",
//     }
//   },
//   settings: {
//     badgeSize: "medium",              // small | medium | large
//   },
//   lastSync: "2026-04-08T20:00:00Z",
//   version: 2
// }

const DB_KEY = 'mangaTrackerDB';



// ──────────────────────────────────────────────
// TEST VERSTION
// ──────────────────────────────────────────────
const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/manga-tracker/kobfdnepnoplkcgnpkcjellfeokhhnlk?authuser=0&hl=fr';
const UPDATE_CHECK_INTERVAL_MIN = 180;
const UPDATE_STATE_KEY = 'mangaTrackerUpdateInfo';

chrome.alarms.create('checkExtensionUpdate', {
  periodInMinutes: UPDATE_CHECK_INTERVAL_MIN
});

async function ensureUpdateAlarm() {
  const existing = await chrome.alarms.get('checkExtensionUpdate');
  if (!existing) {
    chrome.alarms.create('checkExtensionUpdate', {
      periodInMinutes: UPDATE_CHECK_INTERVAL_MIN
    });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkExtensionUpdate') {
    checkForExtensionUpdate().catch(() => {});
  }
});

ensureUpdateAlarm().catch(() => {});



function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

async function saveUpdateInfo(info) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [UPDATE_STATE_KEY]: info }, resolve);
  });
}

async function getUpdateInfo() {
  return new Promise((resolve) => {
    chrome.storage.local.get(UPDATE_STATE_KEY, (res) => {
      resolve(res[UPDATE_STATE_KEY] || null);
    });
  });
}

async function clearUpdateBadge() {
  chrome.action.setBadgeText({ text: '' });
}

function requestUpdateCheckAsync() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.requestUpdateCheck((status, details) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve({ status, details: details || {} });
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function notifyUpdateAvailable(info) {
  if (!info?.remoteVersion) return;

  chrome.notifications.create('manga-tracker-update', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Manga Tracker',
    message: `Mise à jour prête : v${info.remoteVersion}`,
    priority: 2
  });
}

async function syncInstalledVersionState() {
  const currentVersion = chrome.runtime.getManifest().version;
  const previous = await getUpdateInfo();

  if (!previous || !previous.remoteVersion || compareVersions(currentVersion, previous.remoteVersion) >= 0) {
    await saveUpdateInfo({
      checkedAt: new Date().toISOString(),
      localVersion: currentVersion,
      remoteVersion: currentVersion,
      hasUpdate: false,
      updateReady: false,
      status: 'up_to_date',
      storeUrl: CHROME_WEB_STORE_URL
    });

    await clearUpdateBadge();
  }
}

async function checkForExtensionUpdate() {
  const localVersion = chrome.runtime.getManifest().version;

  try {
    const { status, details } = await requestUpdateCheckAsync();

    const info = {
      checkedAt: new Date().toISOString(),
      localVersion,
      remoteVersion: details?.version || localVersion,
      hasUpdate: status === 'update_available',
      updateReady: false,
      status,
      storeUrl: CHROME_WEB_STORE_URL
    };

    if (status === 'no_update') {
      info.remoteVersion = localVersion;
      await clearUpdateBadge();
    }

    await saveUpdateInfo(info);
    return { success: true, ...info };
  } catch (err) {
    const previous = await getUpdateInfo();

    const fallback = {
      ...(previous || {}),
      checkedAt: new Date().toISOString(),
      localVersion,
      status: 'error',
      error: err.message || 'update_check_failed',
      storeUrl: CHROME_WEB_STORE_URL
    };

    await saveUpdateInfo(fallback);
    return { success: false, ...fallback };
  }
}

chrome.runtime.onUpdateAvailable.addListener(async (details) => {
  const info = {
    checkedAt: new Date().toISOString(),
    localVersion: chrome.runtime.getManifest().version,
    remoteVersion: details.version,
    hasUpdate: true,
    updateReady: true,
    status: 'update_available',
    storeUrl: CHROME_WEB_STORE_URL
  };

  await saveUpdateInfo(info);

  chrome.action.setBadgeText({ text: 'NEW' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });

  await notifyUpdateAvailable(info);
});

async function applyPendingUpdate() {
  const info = await getUpdateInfo();

  if (!info?.updateReady) {
    return { success: false, reason: 'no_update_ready' };
  }

  chrome.runtime.reload();
  return { success: true, reloading: true };
}


// ──────────────────────────────────────────────
// HELPERS BDD LOCALE
// ──────────────────────────────────────────────


async function getDB() {
  return new Promise((resolve) => {
    chrome.storage.local.get(DB_KEY, (result) => {
      const db = result[DB_KEY] || { mangas: {}, settings: { badgeSize: 'medium' }, lastSync: null, version: 2 };
      if (!db.settings) db.settings = { badgeSize: 'medium' };
      resolve(db);
    });
  });
}


async function getSettings() {
  const db = await getDB();
  return db.settings || { badgeSize: 'medium' };
}


async function saveSettings(settings) {
  const db = await getDB();
  db.settings = { ...db.settings, ...settings };
  await saveDB(db);
  return { success: true };
}


async function saveDB(db) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [DB_KEY]: db }, resolve);
  });
}


function getMangaKey(domain, slug) {
  return `${domain}|${slug}`;
}


// ──────────────────────────────────────────────
// MARQUER UN CHAPITRE COMME LU
// ──────────────────────────────────────────────


async function markAsRead({ mangaSlug, mangaTitle, chapterNumber, domain, url, readAt }) {
  const db = await getDB();
  const key = getMangaKey(domain, mangaSlug);


  if (!db.mangas[key]) {
    db.mangas[key] = {
      slug: mangaSlug,
      title: mangaTitle,
      domain: domain,
      chaptersRead: [],
      totalChapters: null,
      lastReadChapter: null,
      lastReadAt: null,
      addedAt: readAt,
      status: 'reading',
      notes: ''
    };
  }


  const manga = db.mangas[key];


  // Mettre à jour le titre si vide ou "inconnu"
  if (manga.title === 'Manga inconnu' || !manga.title) {
    manga.title = mangaTitle;
  }


  // Ajouter le chapitre s'il n'est pas déjà lu
  if (!manga.chaptersRead.includes(chapterNumber)) {
    manga.chaptersRead.push(chapterNumber);
    manga.chaptersRead.sort((a, b) => a - b);
  }


  // Mettre à jour le dernier chapitre lu
  if (!manga.lastReadChapter || chapterNumber > manga.lastReadChapter) {
    manga.lastReadChapter = chapterNumber;
    manga.lastReadAt = readAt;
  }


  await saveDB(db);
  scheduleDriveSync();
  updateBadgeCount();
  return { success: true };
}


// ──────────────────────────────────────────────
// RÉCUPÉRER LES CHAPITRES LUS D'UN MANGA
// ──────────────────────────────────────────────


async function getReadChapters({ mangaSlug, domain }) {
  const db = await getDB();


  // 1. Correspondance exacte domain|slug
  const key = getMangaKey(domain, mangaSlug);
  if (db.mangas[key]) {
    return { chapters: db.mangas[key].chaptersRead };
  }


  // 2. Même slug, domaine différent (ex: même manga sur un autre site)
  const allKeys = Object.keys(db.mangas);
  const exactSlug = allKeys.find(k => k.endsWith(`|${mangaSlug}`));
  if (exactSlug) {
    return { chapters: db.mangas[exactSlug].chaptersRead };
  }


  // 3. Correspondance partielle du slug (l'un contient l'autre)
  // Ex: "infinite-mage" vs "infinite-mage-75e30c62" (suffixe ID)
  // Ex: "the-absolute-s-modern-life" vs "the-absolute-s-modern-life-chapitre"
  const partialMatch = allKeys.find(k => {
    const storedSlug = k.split('|')[1] || '';
    return storedSlug.startsWith(mangaSlug) || mangaSlug.startsWith(storedSlug);
  });
  if (partialMatch) {
    return { chapters: db.mangas[partialMatch].chaptersRead };
  }


  // 4. Correspondance floue : les premiers mots du slug
  // Ex: "the-absolute" matche "the-absolute-s-modern-life"
  const slugWords = mangaSlug.split('-').slice(0, 3).join('-');
  if (slugWords.length >= 6) {
    const fuzzyMatch = allKeys.find(k => {
      const storedSlug = k.split('|')[1] || '';
      return storedSlug.includes(slugWords) || slugWords.includes(storedSlug.split('-').slice(0, 3).join('-'));
    });
    if (fuzzyMatch) {
      return { chapters: db.mangas[fuzzyMatch].chaptersRead };
    }
  }


  return { chapters: [] };
}


// ──────────────────────────────────────────────
// RÉCUPÉRER TOUS LES MANGAS
// ──────────────────────────────────────────────


async function getAllMangas() {
  const db = await getDB();


  const list = Object.values(db.mangas).map(m => ({
    key: getMangaKey(m.domain, m.slug),
    slug: m.slug,
    title: m.title,
    domain: m.domain,
    chaptersRead: Array.isArray(m.chaptersRead) ? m.chaptersRead : [],
    totalRead: Array.isArray(m.chaptersRead) ? m.chaptersRead.length : 0,
    totalChapters: m.totalChapters || null,
    lastReadChapter: m.lastReadChapter,
    lastReadAt: m.lastReadAt,
    status: m.status || 'reading',
    notes: m.notes || ''
  }));


  list.sort((a, b) => {
    const ta = a.lastReadAt ? new Date(a.lastReadAt).getTime() : 0;
    const tb = b.lastReadAt ? new Date(b.lastReadAt).getTime() : 0;
    return tb - ta;
  });


  return { mangas: list };
}


// ──────────────────────────────────────────────
// SUPPRIMER UN CHAPITRE OU UN MANGA
// ──────────────────────────────────────────────


async function unmarkChapter({ mangaSlug, domain, chapterNumber }) {
  const db = await getDB();


  const allKeys = Object.keys(db.mangas);


  let key = getMangaKey(domain, mangaSlug);


  if (!db.mangas[key]) {
    key = allKeys.find(k => k.endsWith(`|${mangaSlug}`));
  }


  if (!db.mangas[key]) {
    key = allKeys.find(k => {
      const storedSlug = k.split('|')[1] || '';
      return storedSlug.startsWith(mangaSlug) || mangaSlug.startsWith(storedSlug);
    });
  }


  if (!db.mangas[key]) {
    const slugWords = mangaSlug.split('-').slice(0, 3).join('-');
    if (slugWords.length >= 6) {
      key = allKeys.find(k => {
        const storedSlug = k.split('|')[1] || '';
        return storedSlug.includes(slugWords) ||
          slugWords.includes(storedSlug.split('-').slice(0, 3).join('-'));
      });
    }
  }


  if (!key || !db.mangas[key]) {
    return { success: false, reason: "manga_not_found" };
  }


  const manga = db.mangas[key];
  const before = manga.chaptersRead.length;


  manga.chaptersRead = manga.chaptersRead.filter(c => c !== chapterNumber);


  if (manga.chaptersRead.length === before) {
    return { success: false, reason: "chapter_not_found" };
  }


  manga.lastReadChapter = manga.chaptersRead.length > 0
    ? Math.max(...manga.chaptersRead)
    : null;


  if (manga.chaptersRead.length === 0) {
    manga.lastReadAt = null;
  }


  await saveDB(db);
  updateBadgeCount();

  syncToDrive().catch(() => {});

  return { success: true };
}


async function deleteManga({ mangaSlug, domain }) {
  const db = await getDB();
  const key = getMangaKey(domain, mangaSlug);


  if (!db.mangas[key]) {
    return { success: false, reason: "manga_not_found" };
  }


  delete db.mangas[key];


  await saveDB(db);
  updateBadgeCount();

  syncToDrive().catch(() => {});

  return { success: true };
}


// ──────────────────────────────────────────────
// SYNCHRONISATION GOOGLE DRIVE (AppData folder)
// Gratuit, invisible pour l'utilisateur, limite 100MB
// ──────────────────────────────────────────────


const TOKEN_KEY = "drive_token";
const DRIVE_FILE_NAME = "manga_tracker_db.json";


let syncTimer = null;


// ───────── TOKEN ─────────


async function storeToken(accessToken, expiresIn = 3600) {
  const expiry = Date.now() + Math.max((expiresIn - 60) * 1000, 60 * 1000);


  return new Promise((resolve) => {
    chrome.storage.local.set(
      { [TOKEN_KEY]: { accessToken, expiry } },
      () => resolve({ success: true })
    );
  });
}


async function getStoredTokenData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(TOKEN_KEY, (res) => {
      resolve(res[TOKEN_KEY] || null);
    });
  });
}


async function getToken() {
  const data = await getStoredTokenData();


  if (!data || !data.accessToken || !data.expiry || data.expiry <= Date.now()) {
    return null;
  }


  return data.accessToken;
}


async function clearToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(TOKEN_KEY, () => resolve({ success: true }));
  });
}


// ───────── AUTO SYNC ─────────


function scheduleDriveSync() {
  if (syncTimer) clearTimeout(syncTimer);


  syncTimer = setTimeout(() => {
    syncToDrive().catch((err) => {
      console.warn("[Manga Tracker] Auto sync Drive échouée :", err);
    });
  }, 10000);
}


// ───────── DRIVE HELPERS ─────────


async function driveFetch(url, options = {}) {
  const token = await getToken();
  if (!token) {
    throw new Error("not_connected");
  }


  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`
  };


  const resp = await fetch(url, {
    ...options,
    headers
  });


  if (resp.status === 401) {
    await clearToken();
    throw new Error("not_connected");
  }


  return resp;
}


async function findDriveFile() {
  const q = encodeURIComponent(
    `name='${DRIVE_FILE_NAME}' and 'appDataFolder' in parents and trashed=false`
  );


  const resp = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)`
  );


  if (!resp.ok) {
    let errText = "";
    try {
      errText = await resp.text();
    } catch (_) {}
    console.error("[Manga Tracker] findDriveFile 403 body:", errText);
    throw new Error(`drive_find_failed_${resp.status}`);
  }


  const data = await resp.json();
  return data.files?.[0] || null;
}


async function readDriveFile(token, fileId) {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      }
    }
  );


  const raw = await resp.text();


  if (!resp.ok) {
    console.error("[Drive] read error", resp.status, raw);
    throw new Error(`drive_read_${resp.status}`);
  }


  if (!raw || !raw.trim()) {
    return null;
  }


  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("[Drive] invalid JSON:", raw);
    throw new Error("invalid_remote_json");
  }
}


async function writeDriveFile(token, fileId, data) {
  const metadata = fileId
    ? { name: DRIVE_FILE_NAME }
    : { name: DRIVE_FILE_NAME, parents: ["appDataFolder"] };


  const json = JSON.stringify(data);
  const boundary = "manga_tracker_boundary";


  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${json}\r\n` +
    `--${boundary}--`;


  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;


  const method = fileId ? "PATCH" : "POST";


  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });


  const raw = await resp.text();


  if (!resp.ok) {
    console.error("[Drive] write error", resp.status, raw);
    throw new Error(`drive_write_${resp.status}`);
  }


  return raw ? JSON.parse(raw) : { success: true };
}


// ───────── SYNC ─────────


async function checkDriveAuth() {
  const token = await getToken();
  return {
    connected: !!token
  };
}


async function syncToDrive() {
  const token = await getToken();
  if (!token) return { success: false, reason: "not_connected" };


  const db = await getDB();
  if (!db || typeof db !== "object" || !db.mangas) {
    return { success: false, reason: "invalid_local_db" };
  }


  const file = await findDriveFile();


  if (file) {
    await writeDriveFile(token, file.id, db);
  } else {
    await writeDriveFile(token, null, db);
  }


  return { success: true };
}


function mergeDBs(localDB, remoteDB) {
  const merged = {
    mangas: {},
    settings: {
      ...(remoteDB.settings || {}),
      ...(localDB.settings || {})
    },
    lastSync: new Date().toISOString(),
    version: Math.max(localDB.version || 1, remoteDB.version || 1)
  };


  const allKeys = new Set([
    ...Object.keys(localDB.mangas || {}),
    ...Object.keys(remoteDB.mangas || {})
  ]);


  for (const key of allKeys) {
    const local = localDB.mangas?.[key];
    const remote = remoteDB.mangas?.[key];


    if (!local && remote) {
      merged.mangas[key] = remote;
      continue;
    }


    if (local && !remote) {
      merged.mangas[key] = local;
      continue;
    }


    const localChapters = Array.isArray(local.chaptersRead) ? local.chaptersRead : [];
    const remoteChapters = Array.isArray(remote.chaptersRead) ? remote.chaptersRead : [];
    const mergedChapters = [...new Set([...localChapters, ...remoteChapters])].sort((a, b) => a - b);


    const localLast = local.lastReadAt ? new Date(local.lastReadAt).getTime() : 0;
    const remoteLast = remote.lastReadAt ? new Date(remote.lastReadAt).getTime() : 0;
    const newest = localLast >= remoteLast ? local : remote;


    merged.mangas[key] = {
      ...remote,
      ...local,
      ...newest,
      chaptersRead: mergedChapters,
      lastReadChapter: mergedChapters.length ? Math.max(...mergedChapters) : null,
      lastReadAt: newest.lastReadAt || local.lastReadAt || remote.lastReadAt || null,
      addedAt: local.addedAt || remote.addedAt || new Date().toISOString(),
      notes: local.notes || remote.notes || "",
      status: local.status || remote.status || "reading",
      totalChapters: Math.max(local.totalChapters || 0, remote.totalChapters || 0) || null
    };
  }


  return merged;
}


async function syncWithDrive() {
  try {
    const token = await getToken();
    if (!token) {
      return { success: false, reason: "not_connected" };
    }


    const localDB = await getDB();
    const file = await findDriveFile();


    if (!file) {
      await writeDriveFile(token, null, localDB);
      return {
        success: true,
        mode: "push_initial",
        mangasCount: Object.keys(localDB.mangas || {}).length
      };
    }


    const remoteDB = await readDriveFile(token, file.id);


    if (
      !remoteDB ||
      typeof remoteDB !== "object" ||
      !remoteDB.mangas ||
      typeof remoteDB.mangas !== "object"
    ) {
      await writeDriveFile(token, file.id, localDB);
      return {
        success: true,
        mode: "rewrite_remote",
        mangasCount: Object.keys(localDB.mangas || {}).length
      };
    }


    const merged = mergeDBs(localDB, remoteDB);


    await saveDB(merged);
    await writeDriveFile(token, file.id, merged);
    updateBadgeCount();


    return {
      success: true,
      mode: "merged",
      mangasCount: Object.keys(merged.mangas || {}).length
    };
  } catch (err) {
    console.error("[Manga Tracker] syncWithDrive error:", err);
    return { success: false, reason: err.message || "sync_failed" };
  }
}


async function syncFromDrive() {
  try {
    const token = await getToken();
    if (!token) return { success: false, reason: "not_connected" };


    const file = await findDriveFile(token);
    if (!file) return { success: false, reason: "no_file" };


    const remoteDB = await readDriveFile(token, file.id);


    if (!remoteDB) return { success: false, reason: "empty" };
    if (!remoteDB.mangas || typeof remoteDB.mangas !== "object") {
      return { success: false, reason: "invalid_remote_data" };
    }


    await saveDB(remoteDB);


    return {
      success: true,
      mangasCount: Object.keys(remoteDB.mangas || {}).length,
      mode: "replace_local"
    };
  } catch (err) {
    console.error("[Manga Tracker] syncFromDrive error:", err);
    return { success: false, reason: err.message || "sync_from_drive_failed" };
  }
}


// ───────── MESSAGES ─────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === "openPopupOnManga") {
      const { slug, domain } = request.data || {};
      await new Promise((resolve) => {
        chrome.storage.local.set(
          { _openManga: { slug, domain, ts: Date.now() } },
          resolve
        );
      });


      try {
        await chrome.action.openPopup();
      } catch (_) {}


      return { success: true };
    }


    const handlers = {
      checkForExtensionUpdate: async () => checkForExtensionUpdate(),

      getUpdateInfo: async () => {
        const info = await getUpdateInfo();
        return { success: true, info };
      },

      applyPendingUpdate: async () => applyPendingUpdate(),

      markAsRead: async () => {
        const result = await markAsRead(request.data);
        return result;
      },


      getReadChapters: async () => getReadChapters(request.data),


      getAllMangas: async () => getAllMangas(),


      unmarkChapter: async () => {
        const result = await unmarkChapter(request.data);
        return result;
      },


      deleteManga: async () => {
        const result = await deleteManga(request.data);
        return result;
      },


      getSettings: async () => getSettings(),


      saveSettings: async () => saveSettings(request.data),


      updateManga: async () => {
        const db = await getDB();
        const { mangaSlug, domain, ...fields } = request.data;
        const key = getMangaKey(domain, mangaSlug);
        if (!db.mangas[key]) return { success: false };
        Object.assign(db.mangas[key], fields);
        await saveDB(db);
        scheduleDriveSync();
        return { success: true };
      },


      markUpTo: async () => {
        const { mangaSlug, domain, mangaTitle, upToChapter, allChapters } = request.data;
        const db = await getDB();
        const key = getMangaKey(domain, mangaSlug);


        if (!db.mangas[key]) {
          db.mangas[key] = {
            slug: mangaSlug,
            title: mangaTitle,
            domain,
            chaptersRead: [],
            totalChapters: null,
            lastReadChapter: null,
            lastReadAt: null,
            addedAt: new Date().toISOString(),
            status: "reading",
            notes: ""
          };
        }


        const toMark = allChapters.filter(c => c <= upToChapter);
        const existing = new Set(db.mangas[key].chaptersRead);
        toMark.forEach(c => existing.add(c));


        db.mangas[key].chaptersRead = [...existing].sort((a, b) => a - b);
        db.mangas[key].lastReadChapter = Math.max(...db.mangas[key].chaptersRead);
        db.mangas[key].lastReadAt = new Date().toISOString();


        await saveDB(db);
        scheduleDriveSync();
        updateBadgeCount();


        return { success: true, count: toMark.length };
      },


      exportDB: async () => {
        const db = await getDB();
        return { success: true, data: db };
      },


      importDB: async () => {
        await saveDB(request.data);
        updateBadgeCount();
        return { success: true };
      },


      checkDriveAuth: async () => checkDriveAuth(),


      storeToken: async () => {
        const { accessToken, expiresIn } = request.data || {};
        if (!accessToken) {
          return { success: false, reason: "token_absent" };
        }
        await storeToken(accessToken, expiresIn || 3600);
        return { success: true };
      },


      clearDriveToken: async () => {
        await clearToken();
        return { success: true };
      },
      syncToDrive: async () => syncToDrive(),
      syncFromDrive: async () => syncFromDrive(),
      syncWithDrive: async () => syncWithDrive()
    };


    const handler = handlers[request.action];


    if (!handler) {
      return { success: false, reason: "unknown_action" };
    }


    return await handler();
  })()
    .then(sendResponse)
    .catch((err) => {
      console.error("[Manga Tracker] onMessage error:", err);
      sendResponse({ success: false, reason: err.message || "internal_error" });
    });


  return true;
});


// Sync au démarrage du service worker (nouvel appareil / redémarrage Chrome)
// ──────────────────────────────────────────────
// BADGE ICÔNE (nombre de mangas en lecture active)
// ──────────────────────────────────────────────
async function updateBadgeCount() {
  const updateInfo = await getUpdateInfo();

  if (updateInfo?.updateReady) {
    chrome.action.setBadgeText({ text: 'NEW' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
    return;
  }

  const db = await getDB();
  const reading = Object.values(db.mangas).filter(
    m => m.status === 'reading' || !m.status
  ).length;

  if (reading === 0) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: reading > 99 ? '99+' : String(reading) });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  }
}

chrome.runtime.onStartup.addListener(() => {
  syncInstalledVersionState().catch(() => {});
  setTimeout(syncToDrive, 3000);
  setTimeout(updateBadgeCount, 1000);
  setTimeout(() => {
    checkForExtensionUpdate().catch(() => {});
  }, 2000);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Manga Tracker] Extension installée / mise à jour');
  syncInstalledVersionState().catch(() => {});
  updateBadgeCount();
  checkForExtensionUpdate().catch(() => {});
});
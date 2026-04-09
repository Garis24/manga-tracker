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
const DRIVE_FILE_NAME = 'manga_tracker_sync.json';
const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

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
  return { success: true, chaptersRead: manga.chaptersRead };
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
    chaptersRead: m.chaptersRead,
    totalRead: m.chaptersRead.length,
    totalChapters: m.totalChapters || null,
    lastReadChapter: m.lastReadChapter,
    lastReadAt: m.lastReadAt,
    status: m.status || 'reading',
    notes: m.notes || ''
  }));
  // Trier par dernière lecture
  list.sort((a, b) => new Date(b.lastReadAt) - new Date(a.lastReadAt));
  return { mangas: list };
}

// ──────────────────────────────────────────────
// SUPPRIMER UN CHAPITRE OU UN MANGA
// ──────────────────────────────────────────────

async function unmarkChapter({ mangaSlug, domain, chapterNumber }) {
  const db = await getDB();
  const key = getMangaKey(domain, mangaSlug);
  if (!db.mangas[key]) return { success: false };

  db.mangas[key].chaptersRead = db.mangas[key].chaptersRead.filter(c => c !== chapterNumber);

  // Recalculer lastReadChapter
  const chapters = db.mangas[key].chaptersRead;
  db.mangas[key].lastReadChapter = chapters.length > 0 ? Math.max(...chapters) : null;

  await saveDB(db);
  scheduleDriveSync();
  return { success: true };
}

async function deleteManga({ mangaSlug, domain }) {
  const db = await getDB();
  const key = getMangaKey(domain, mangaSlug);
  delete db.mangas[key];
  await saveDB(db);
  scheduleDriveSync();
  updateBadgeCount();
  return { success: true };
}

// ──────────────────────────────────────────────
// SYNCHRONISATION GOOGLE DRIVE (AppData folder)
// Gratuit, invisible pour l'utilisateur, limite 100MB
// ──────────────────────────────────────────────

let syncTimer = null;

function scheduleDriveSync() {
  // Debounce : attend 10s d'inactivité avant de syncer
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(syncToDrive, 10000);
}

async function getDriveToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('Pas de token'));
      } else {
        resolve(token);
      }
    });
  });
}

async function getDriveTokenInteractive() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(chrome.runtime.lastError || new Error('Auth annulée'));
      } else {
        resolve(token);
      }
    });
  });
}

const AUTH_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('AUTH_TIMEOUT'));
    }, ms);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function openGoogleLoginTabFallback() {
  await chrome.tabs.create({
    url: 'https://accounts.google.com/'
  });
}

async function getDriveTokenInteractiveSafe() {
  try {
    return await withTimeout(getDriveTokenInteractive(), AUTH_TIMEOUT_MS);
  } catch (err) {
    await openGoogleLoginTabFallback();
    throw new Error('FALLBACK_TAB_OPENED');
  }
}


// Cherche l'ID du fichier de sync sur Drive
async function findDriveFile(token) {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${DRIVE_FILE_NAME}'&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await resp.json();
  if (data.files && data.files.length > 0) return data.files[0];
  return null;
}

// Lit le contenu du fichier Drive
async function readDriveFile(token, fileId) {
  const resp = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!resp.ok) return null;
  return await resp.json();
}

// Upload / Mise à jour du fichier Drive
async function writeDriveFile(token, fileId, data) {
  const content = JSON.stringify(data, null, 2);
  const metadata = { name: DRIVE_FILE_NAME, parents: fileId ? undefined : ['appDataFolder'] };

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const method = fileId ? 'PATCH' : 'POST';

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(fileId ? {} : metadata)], { type: 'application/json' }));
  form.append('file', new Blob([content], { type: 'application/json' }));

  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  return await resp.json();
}

// Merge intelligent de deux bases (local + drive)
function mergeDBs(local, remote) {
  const merged = { mangas: { ...local.mangas }, version: 1 };

  for (const [key, remoteManga] of Object.entries(remote.mangas || {})) {
    if (!merged.mangas[key]) {
      merged.mangas[key] = remoteManga;
    } else {
      // Fusionner les chapitres lus (union des deux sets)
      const localChapters = new Set(merged.mangas[key].chaptersRead);
      const remoteChapters = new Set(remoteManga.chaptersRead || []);
      const allChapters = [...new Set([...localChapters, ...remoteChapters])].sort((a, b) => a - b);

      merged.mangas[key].chaptersRead = allChapters;
      merged.mangas[key].lastReadChapter = allChapters.length > 0 ? Math.max(...allChapters) : null;

      // Garder le titre le plus récent / non-vide
      if (!merged.mangas[key].title || merged.mangas[key].title === 'Manga inconnu') {
        merged.mangas[key].title = remoteManga.title;
      }

      // Garder la date de dernière lecture la plus récente
      if (remoteManga.lastReadAt && (!merged.mangas[key].lastReadAt ||
        new Date(remoteManga.lastReadAt) > new Date(merged.mangas[key].lastReadAt))) {
        merged.mangas[key].lastReadAt = remoteManga.lastReadAt;
      }
    }
  }

  merged.lastSync = new Date().toISOString();
  return merged;
}

async function syncToDrive() {
  try {
    let token;
    try {
      token = await getDriveToken();
    } catch {
      // Pas connecté → skip silencieusement
      return { success: false, reason: 'non_authentifie' };
    }

    const localDB = await getDB();
    const existingFile = await findDriveFile(token);

    if (existingFile) {
      // Lire le fichier Drive et merger
      const remoteDB = await readDriveFile(token, existingFile.id);
      if (remoteDB) {
        const merged = mergeDBs(localDB, remoteDB);
        await saveDB(merged);
        await writeDriveFile(token, existingFile.id, merged);
      } else {
        await writeDriveFile(token, existingFile.id, localDB);
      }
    } else {
      // Premier upload
      await writeDriveFile(token, null, localDB);
    }

    console.log('[Manga Tracker] ☁️ Sync Google Drive réussie');
    return { success: true };
  } catch (err) {
    console.error('[Manga Tracker] Erreur sync Drive:', err);
    return { success: false, reason: err.message };
  }
}

// Sync depuis Drive vers local (utile au démarrage ou sur un nouvel appareil)
async function syncFromDrive() {
  try {
    const token = await getDriveTokenInteractiveSafe();
    const existingFile = await findDriveFile(token);

    if (!existingFile) {
      return { success: false, reason: 'Aucun fichier Drive trouvé' };
    }

    const remoteDB = await readDriveFile(token, existingFile.id);
    if (!remoteDB) {
      return { success: false, reason: 'Fichier Drive vide' };
    }

    const localDB = await getDB();
    const merged = mergeDBs(localDB, remoteDB);
    await saveDB(merged);

    return { success: true, mangasCount: Object.keys(merged.mangas).length };
  } catch (err) {
    return {
      success: false,
      reason: err.message === 'FALLBACK_TAB_OPENED'
        ? 'Connexion Google ouverte dans un onglet'
        : (err.message || 'Erreur de connexion Google Drive'),
      fallbackOpened: err.message === 'FALLBACK_TAB_OPENED'
    };
  }
}

// ──────────────────────────────────────────────
// LISTENER MESSAGES DEPUIS CONTENT.JS ET POPUP
// ──────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ouvrir le popup sur le détail d'un manga spécifique
  if (request.action === 'openPopupOnManga') {
    const { slug, domain } = request.data;
    // Stocker le manga à ouvrir, le popup le lira au démarrage
    chrome.storage.local.set({ _openManga: { slug, domain, ts: Date.now() } }, () => {
      chrome.action.openPopup().catch(() => {
        // openPopup() peut échouer si déjà ouvert ou selon la version Chrome
        // Dans ce cas on laisse juste le storage en place, l'utilisateur clique l'icône
      });
    });
    sendResponse({ success: true });
    return true;
  }

  const handlers = {
    markAsRead: () => markAsRead(request.data),
    getReadChapters: () => getReadChapters(request.data),
    getAllMangas: () => getAllMangas(),
    unmarkChapter: () => unmarkChapter(request.data),
    deleteManga: () => deleteManga(request.data),
    syncToDrive: () => syncToDrive(),
    syncFromDrive: () => syncFromDrive(),
    getSettings: () => getSettings(),
    saveSettings: () => saveSettings(request.data),
    // Mettre à jour statut, notes, totalChapters d'un manga
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
    // Marquer tous les chapitres jusqu'à X comme lus
    markUpTo: async () => {
      const { mangaSlug, domain, mangaTitle, upToChapter, allChapters } = request.data;
      const db = await getDB();
      const key = getMangaKey(domain, mangaSlug);
      if (!db.mangas[key]) {
        db.mangas[key] = {
          slug: mangaSlug, title: mangaTitle, domain,
          chaptersRead: [], totalChapters: null,
          lastReadChapter: null, lastReadAt: null,
          addedAt: new Date().toISOString(), status: 'reading', notes: ''
        };
      }
      const toMark = allChapters.filter(c => c <= upToChapter);
      const existing = new Set(db.mangas[key].chaptersRead);
      toMark.forEach(c => existing.add(c));
      db.mangas[key].chaptersRead = [...existing].sort((a,b) => a-b);
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
    }
  };

  const handler = handlers[request.action];
  if (handler) {
    handler().then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Garder le canal ouvert pour la réponse async
  }
});

// Sync au démarrage du service worker (nouvel appareil / redémarrage Chrome)
// ──────────────────────────────────────────────
// BADGE ICÔNE (nombre de mangas en lecture active)
// ──────────────────────────────────────────────
async function updateBadgeCount() {
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
  setTimeout(syncToDrive, 3000);
  setTimeout(updateBadgeCount, 1000);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Manga Tracker] Extension installée / mise à jour');
  updateBadgeCount();
});

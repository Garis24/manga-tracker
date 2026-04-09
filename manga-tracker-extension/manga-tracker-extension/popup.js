/**
 * MANGA TRACKER - Popup JS
 */

// ──────────────────────────────────────────────
// UTILITAIRES
// ──────────────────────────────────────────────

function sendMsg(action, data = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action, data }, (resp) => {
      if (chrome.runtime.lastError) resolve({ success: false });
      else resolve(resp);
    });
  });
}

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
  reading:   { label: '📖 En cours',   cls: 'status-reading' },
  completed: { label: '✅ Terminé',     cls: 'status-completed' },
  paused:    { label: '⏸ En pause',    cls: 'status-paused' },
  dropped:   { label: '❌ Abandonné',  cls: 'status-dropped' },
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
      const ch = parseFloat(chip.dataset.chapter);
      await sendMsg('unmarkChapter', {
        mangaSlug: selectedManga.slug,
        domain: selectedManga.domain,
        chapterNumber: ch
      });
      showToast(`Chapitre ${ch} marqué non lu`, 'success');
      await loadMangaList();
      // Rafraîchir l'objet sélectionné
      selectedManga = allMangas.find(m => m.key === selectedManga.key);
      if (selectedManga) renderChapterChips(selectedManga);
      else showView('view-main');
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
    await sendMsg('unmarkChapter', {
      mangaSlug: currentPageInfo.mangaSlug,
      domain: domain,
      chapterNumber: currentPageInfo.chapterNumber
    });
    currentIsRead = false;
    showToast(`Chapitre ${currentPageInfo.chapterNumber} marqué non lu`);
  } else {
    const resp = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
    await sendMsg('markAsRead', {
      mangaSlug: currentPageInfo.mangaSlug,
      mangaTitle: resp.mangaTitle || currentPageInfo.mangaSlug,
      chapterNumber: currentPageInfo.chapterNumber,
      domain: domain,
      url: tab.url,
      readAt: new Date().toISOString()
    });
    currentIsRead = true;
    showToast(`Chapitre ${currentPageInfo.chapterNumber} marqué lu`, 'success');
  }

  updateToggleBtn(document.getElementById('btn-toggle-read'), currentIsRead);
  await loadMangaList();
});

// ──────────────────────────────────────────────
// NAVIGATION
// ──────────────────────────────────────────────

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
  await sendMsg('updateManga', {
    mangaSlug: selectedManga.slug,
    domain: selectedManga.domain,
    status
  });
  selectedManga.status = status;
  await loadMangaList();
  showToast('Statut mis à jour', 'success');
});

// ── Notes ──
document.getElementById('btn-save-notes').addEventListener('click', async () => {
  if (!selectedManga) return;
  const notes = document.getElementById('detail-notes').value;
  await sendMsg('updateManga', {
    mangaSlug: selectedManga.slug,
    domain: selectedManga.domain,
    notes
  });
  showToast('Note enregistrée', 'success');
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

  await sendMsg('deleteManga', { mangaSlug: selectedManga.slug, domain: selectedManga.domain });
  showToast('Manga supprimé', 'success');
  await loadMangaList();
  showView('view-main');
  selectedManga = null;
});

// ──────────────────────────────────────────────
// SYNC GOOGLE DRIVE
// ──────────────────────────────────────────────

async function checkSyncStatus() {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-status-text');
  dot.className = 'sync-dot';
  text.textContent = 'Vérification…';

  try {
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (t) => {
        if (chrome.runtime.lastError || !t) reject();
        else resolve(t);
      });
    });
    dot.className = 'sync-dot connected';
    text.textContent = 'Connecté à Google Drive';
  } catch {
    dot.className = 'sync-dot';
    text.textContent = 'Non connecté';
  }
}

document.getElementById('btn-sync').addEventListener('click', async () => {
  const btn = document.getElementById('btn-sync');
  btn.style.opacity = '0.5';
  const resp = await sendMsg('syncToDrive');
  btn.style.opacity = '1';
  if (resp.success) showToast('Synchronisé avec Drive', 'success');
  else if (resp.reason === 'non_authentifie') showToast('Connectez Drive dans les paramètres');
  else showToast('Erreur de sync', 'error');
});

document.getElementById('btn-connect-drive').addEventListener('click', async () => {
  const dot = document.getElementById('sync-dot');
  const text = document.getElementById('sync-status-text');
  dot.className = 'sync-dot syncing';
  text.textContent = 'Connexion…';

  try {
    await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (t) => {
        if (chrome.runtime.lastError || !t) reject(chrome.runtime.lastError);
        else resolve(t);
      });
    });
    dot.className = 'sync-dot connected';
    text.textContent = 'Connecté à Google Drive';
    showToast('Google Drive connecté', 'success');
    // Sync immédiate
    await sendMsg('syncToDrive');
  } catch (err) {
    dot.className = 'sync-dot';
    text.textContent = 'Erreur de connexion';
    showToast('Connexion annulée ou refusée', 'error');
  }
});

document.getElementById('btn-force-sync').addEventListener('click', async () => {
  const resp = await sendMsg('syncToDrive');
  if (resp.success) showToast('Sync réussie', 'success');
  else showToast(resp.reason || 'Erreur', 'error');
});

document.getElementById('btn-import-drive').addEventListener('click', async () => {
  const resp = await sendMsg('syncFromDrive');
  if (resp.success) {
    showToast(`${resp.mangasCount} mangas importés depuis Drive`, 'success');
    await loadMangaList();
  } else {
    showToast(resp.reason || 'Erreur', 'error');
  }
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
    await loadMangaList();
    e.target.value = '';
  } catch {
    showToast('Fichier invalide', 'error');
  }
});

document.getElementById('btn-clear-all').addEventListener('click', async () => {
  if (!confirm('Effacer TOUTES les données de lecture ? Cette action est irréversible.')) return;
  await sendMsg('importDB', { mangas: {}, version: 1 });
  showToast('Données effacées');
  await loadMangaList();
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

  // Vérifier si on doit ouvrir directement un manga (clic sur badge vert)
  await checkOpenMangaRequest();
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

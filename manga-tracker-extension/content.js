/**
 * MANGA TRACKER - Content Script
 * Détecte automatiquement :
 * - Les pages de lecture de chapitres (ex: /manga/slug/chapitre-1/)
 * - Les pages de liste de chapitres d'un manga (ex: /manga/slug/)
 * Fonctionne sur TOUS les sites de scans
 */

// ──────────────────────────────────────────────
// PATTERNS DE DÉTECTION UNIVERSELS
// ──────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// PATTERNS CHAPITRE — ordre du plus spécifique au plus générique
// Groupe 1 = slug manga, Groupe 2 = numéro chapitre
// ─────────────────────────────────────────────────────────────────
const CHAPTER_URL_PATTERNS = [

  // ── AVEC MOT-CLÉ CHAPITRE DANS L'URL ──

  // /manga/slug/chapitre/163  ou  /manga/slug/chapter/133
  // → phenix-scans, asurascans, sushiscan, lelscans...
  /\/(?:manga|comics|series|webtoon|manhwa|manhua|oeuvre)\/([-\w]+)\/(?:chapitre?s?|chapters?|ch|chap)s?\/([\d.]+)/i,

  // /manga/slug/chapitre-163  ou  /manga/slug/chapter-133
  // → raijin-scans, scan-vf, mangas-origines...
  /\/(?:manga|comics|series|webtoon|manhwa|manhua|oeuvre)\/([-\w]+)\/(?:chapitre?s?|chapters?|ch|chap)s?-([\d.]+)/i,

  // /read/slug/chapter/163  ou  /read/slug/chapitre/163
  // → phenix-scans, bentomanga...
  /\/read\/([-\w]+)\/(?:chapitre?s?|chapters?|ch|chap)s?\/([\d.]+)/i,

  // /read/slug/chapter-163
  /\/read\/([-\w]+)\/(?:chapitre?s?|chapters?|ch|chap)s?-([\d.]+)/i,

  // ── AVEC SEGMENT DE LANGUE (/fr/, /en/, /vf/, /vostfr/) ──

  // /manga/slug/fr/871  → mangakawaii
  // /manga/slug/en/123
  /\/(?:manga|comics|series|webtoon|manhwa|manhua)\/([-\w]+)\/(?:fr|en|vf|vostfr|jp|es|pt|de|it|ru|ar|tr)\/(\d[\d.]*)/i,

  // ── NUMÉRIQUE DIRECT (sans mot-clé) ──

  // /read/slug/871  → rimu-scans (numéro seul à la fin)
  /\/read\/([-\w]+)\/(\d[\d.]*)\/?$/i,

  // /manga/slug/871  (numéro seul, section manga)
  /\/(?:manga|comics|series|webtoon|manhwa|manhua|oeuvre)\/([-\w]+)\/(\d[\d.]*)\/?$/i,

  // /slug/chapter-163  ou  /slug/chapitre-163  (format court sans section)
  // → lelscans, scan-fr...
  /\/([-\w]+)\/(?:chapitre?s?|chapters?|ch|chap)s?-([\d.]+)/i,

  // /slug/chapter/163  (format court avec segment)
  /\/([-\w]+)\/(?:chapitre?s?|chapters?|ch|chap)s?\/([\d.]+)/i,

  // ── FORMATS FICHIERS HTML ──

  // /lecture-en-ligne/Titre-Chapitre-12-FR_ID.html  (ex: scan-manga.com)
  // /anything/Titre-Chapitre-12-FR_123.html
  /[\/-][Cc]hapitre?-([\d.]+)[-_]/i,
  /[\/-][Cc]hapter-([\d.]+)[-_]/i,

  // Titre-Chapitre-12.html  (numéro juste avant .html)
  /-([\d.]+)\.html$/i,
];

// Patterns URL pour les pages de liste d'un manga
const MANGA_PAGE_PATTERNS = [
  /\/manga\/([-\w]+)\/?$/i,
  /\/series\/([-\w]+)\/?$/i,
  /\/webtoon\/([-\w]+)\/?$/i,
  /\/manhwa\/([-\w]+)\/?$/i,
  /\/manhua\/([-\w]+)\/?$/i,
  /\/comics\/([-\w]+)\/?$/i,          // asurascans
  /\/oeuvre\/([-\w]+)\/?$/i,          // mangas-origines
  /\/manga\/([-\w]+)(?:\/(?:fr|en|vf|vostfr))?\/?$/i,  // mangakawaii
  // scan-manga.com : /16580/The-Absolute-s-Modern-Life.html
  // Fichier .html sans segment "chapitre" dans le nom
  /\/\d+\/([-\w''.]+)\.html?$/i,
  // Autres formats /titre.html  ou  /titre/
  /\/([-\w]{4,})\.html?$/i,
];

// Sélecteurs pour trouver le titre du manga sur une page chapitre
const MANGA_TITLE_SELECTORS = [
  // Raijin-scans style
  '.breadcrumb a[href*="/manga/"]',
  'a[href*="/manga/"][class*="bread"]',
  // Génériques
  '.manga-title', '.series-title', '.chapter-manga-title',
  'h1 a[href*="/manga/"]',
  '.reader-header a', '.reading-title a',
  // Méta données
  'meta[property="og:title"]',
];

// Sélecteurs pour trouver les chapitres sur une page manga
const CHAPTER_LIST_SELECTORS = [
  // Madara / WordPress (raijin-scans, phenix-scans, etc.)
  'li.wp-manga-chapter a', '.wp-manga-chapter a',
  '.listing-chapters_wrap a', '.version-chap a',
  // mangas-origines.fr (/oeuvre/)
  '.chapters-list a', '.chapter-item a', '.chapters a',
  '[class*="chapters"] a', '[class*="chapter-list"] a',
  // asurascans (/comics/)
  '.eplister a', '.chlist a', 'ul.clstyle a',
  // rimu-scans (/read/)
  '.chapter-link', '.chaplink',
  // Générique tous sites
  '.chapter-row a', '[class*="chapter"] a',
  'ul li a[href*="/manga/"]',
  'ul li a[href*="/oeuvre/"]',
  'ul li a[href*="/comics/"]',
  'ul li a[href*="/read/"]',
];

// ──────────────────────────────────────────────
// DÉTECTION DE LA PAGE COURANTE
// ──────────────────────────────────────────────

function detectCurrentPage() {
  const url = window.location.href;
  const pathname = window.location.pathname;

  // Test : est-ce une page de lecture de chapitre ?
  for (const pattern of CHAPTER_URL_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) {
      // Patterns avec 2 groupes : match[1]=slug, match[2]=numéro
      if (match[2] !== undefined) {
        const num = parseFloat(match[2]);
        if (!isNaN(num) && num > 0 && num < 10000) {
          return {
            type: 'chapter',
            mangaSlug: cleanSlug(match[1]),
            chapterNumber: num,
            url: url
          };
        }
      }
      // Patterns avec 1 groupe (formats .html) : match[1]=numéro, slug depuis l'URL
      if (match[1] !== undefined && match[2] === undefined) {
        const num = parseFloat(match[1]);
        if (!isNaN(num) && num > 0 && num < 10000) {
          return {
            type: 'chapter',
            mangaSlug: slugFromHtmlUrl(pathname),
            chapterNumber: num,
            url: url
          };
        }
      }
    }
  }

  // Test : est-ce une page de liste de manga ?
  for (const pattern of MANGA_PAGE_PATTERNS) {
    const match = pathname.match(pattern);
    if (match) {
      return {
        type: 'manga',
        mangaSlug: cleanSlug(match[1]),
        url: url
      };
    }
  }

  return null;
}

// Extrait un slug depuis une URL de type fichier .html
// ex: /lecture-en-ligne/The-Absolute-s-Modern-Life-Chapitre-12-FR_536739.html
// → "the-absolute-s-modern-life"
// ex: /16580/The-Absolute-s-Modern-Life.html → "the-absolute-s-modern-life"
function slugFromHtmlUrl(pathname) {
  const filename = pathname.split('/').pop().replace(/\.html?$/i, '');
  // Supprimer le suffixe _ID numérique
  let clean = filename.replace(/_\d+$/, '');
  // Supprimer "Chapitre-X-FR" et variantes en fin
  clean = clean.replace(/[-_](?:chapitre?|chapter)[-_]?[\d.]+[-_]?(?:[A-Z]{2})?$/i, '');
  // Supprimer préfixe numérique type "16580/"
  clean = clean.replace(/^\d+[-_]/, '');
  return cleanSlug(clean);
}

function cleanSlug(slug) {
  return slug
    .toLowerCase()
    .replace(/\/$/, '')
    // Supprimer les suffixes d'ID hex (ex: asurascans "slug-a1b2c3d4")
    .replace(/-[0-9a-f]{6,10}$/, '')
    .trim();
}

// ──────────────────────────────────────────────
// EXTRACTION DU NOM DU MANGA
// ──────────────────────────────────────────────

function extractMangaTitle() {
  // Essayer les sélecteurs dans l'ordre
  for (const selector of MANGA_TITLE_SELECTORS) {
    if (selector.startsWith('meta')) {
      const meta = document.querySelector(selector);
      if (meta) {
        const content = meta.getAttribute('content');
        // Nettoyer : "Chapitre 1 - Nom Manga" → "Nom Manga"
        return cleanTitle(content);
      }
    } else {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
  }

  // Fallback : utiliser le titre de la page
  return cleanTitle(document.title);
}

function cleanTitle(title) {
  if (!title) return 'Manga inconnu';
  // Supprimer "Chapitre X", "Chapter X", le nom du site
  return title
    .replace(/\s*[-|–]\s*.*chapitre?.*$/i, '')
    .replace(/\s*[-|–]\s*.*chapter.*$/i, '')
    .replace(/\s*[-|–]\s*.*chap.*\d+.*$/i, '')
    .trim() || title.trim();
}

// ──────────────────────────────────────────────
// BADGES VISUELS SUR LA PAGE MANGA
// ──────────────────────────────────────────────

// Taille du badge chargée depuis les settings
let currentBadgeSize = 'medium';
chrome.runtime.sendMessage({ action: 'getSettings' }, (s) => {
  if (s?.badgeSize) currentBadgeSize = s.badgeSize;
});

const BADGE_SIZES = { small: '7px', medium: '10px', large: '14px' };

function injectBadges(readChapters, pageInfo) {
  if (!readChapters || readChapters.length === 0) return 0;

  const readSet = new Set(readChapters.map(c => parseFloat(c)));
  let badgesAdded = 0;

  // Passe 1 : sélecteurs CSS ciblés
  for (const selector of CHAPTER_LIST_SELECTORS) {
    const links = document.querySelectorAll(selector);
    if (links.length > 0) {
      links.forEach(link => {
        attachChapterLink(link, readSet, pageInfo);
        const chapterNum = extractChapterNumberFromLink(link);
        if (chapterNum !== null && readSet.has(chapterNum)) badgesAdded++;
      });
    }
  }

  // Passe 2 : fallback universel
  document.querySelectorAll('a[href]').forEach(link => {
    if (link.querySelector('.manga-tracker-badge')) return;
    const href = link.getAttribute('href') || '';
    if (!href || href === '#' || href.startsWith('javascript')) return;
    const chapterNum = extractChapterNumberFromHref(href);
    if (chapterNum !== null) {
      attachChapterLink(link, readSet, pageInfo);
      if (readSet.has(chapterNum)) badgesAdded++;
    }
  });

  return badgesAdded;
}

// Attache badge + clic droit sur un lien de chapitre
function attachChapterLink(link, readSet, pageInfo) {
  if (link.dataset.mtAttached) return;
  link.dataset.mtAttached = '1';

  const href = link.getAttribute('href') || '';
  const chapterNum = extractChapterNumberFromLink(link) || extractChapterNumberFromHref(href);
  if (chapterNum === null) return;

  // Badge vert si lu
  if (readSet && readSet.has(chapterNum)) {
    addReadBadge(link, chapterNum, pageInfo);
  }

  // Clic droit → menu "Marquer lus jusqu'à X"
  if (pageInfo) {
    link.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showMarkUpToMenu(link, chapterNum, pageInfo);
    });
  }
}

// Extrait le numéro de chapitre depuis une URL brute (pas un élément DOM)
function extractChapterNumberFromHref(href) {
  // Passe 1 : patterns explicites
  for (const pattern of CHAPTER_URL_PATTERNS) {
    const match = href.match(pattern);
    if (match && match[2]) {
      const num = parseFloat(match[2]);
      if (!isNaN(num) && num > 0 && num < 10000) return num;
    }
  }

  // Passe 2 : heuristique universelle
  // Cherche le dernier segment numérique signéficatif dans le chemin
  // Ex: /anything/slug/871  ou  /anything/871/
  try {
    const url = new URL(href, window.location.origin);
    const segments = url.pathname.split('/').filter(Boolean);

    // Ignorer si c'est une page d'accueil / liste sans numéro
    if (segments.length < 2) return null;

    // Chercher le dernier segment purement numérique (ou décimal)
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i];
      // Numéro pur ou décimal (ex: "871", "12.5")
      if (/^\d+(\.\d+)?$/.test(seg)) {
        const num = parseFloat(seg);
        // Rejeter les années (1900-2099) et les IDs trop grands
        if (num > 0 && num < 10000 && !(num >= 1900 && num <= 2099)) {
          return num;
        }
      }
      // Numéro préfixé par un mot-clé (ex: "chapter-871", "ch871")
      const prefixed = seg.match(/(?:chapitre?s?|chapters?|ch|chap)s?[-_]?(\d+\.?\d*)/i);
      if (prefixed) {
        const num = parseFloat(prefixed[1]);
        if (!isNaN(num) && num > 0 && num < 10000) return num;
      }
    }
  } catch (e) {}

  return null;
}

function extractChapterNumberFromLink(link) {
  const href = link.getAttribute('href') || '';
  const text = link.textContent || '';

  // Depuis l'URL
  for (const pattern of CHAPTER_URL_PATTERNS) {
    const match = href.match(pattern);
    if (match) return parseFloat(match[2]);
  }

  // Depuis le texte du lien
  const textMatch = text.match(/(?:chapitre?|chapter|ch\.?)\s*([\d.]+)/i);
  if (textMatch) return parseFloat(textMatch[1]);

  return null;
}

function addReadBadge(element, chapterNum, pageInfo) {
  if (element.querySelector('.manga-tracker-badge')) return;

  const size = BADGE_SIZES[currentBadgeSize] || '10px';

  const badge = document.createElement('span');
  badge.className = 'manga-tracker-badge';
  badge.setAttribute('data-chapter', chapterNum);
  const pi = pageInfo || detectCurrentPage();
  if (pi) {
    badge.setAttribute('data-slug', pi.mangaSlug);
    badge.setAttribute('data-domain', window.location.hostname);
  }

  badge.style.cssText = `
    display: inline-block;
    width: ${size};
    height: ${size};
    background: #22c55e;
    border-radius: 50%;
    margin-left: 6px;
    vertical-align: middle;
    box-shadow: 0 0 4px rgba(34, 197, 94, 0.6);
    flex-shrink: 0;
    cursor: pointer;
    position: relative;
  `;

  // ── TOOLTIP au hover ──
  badge.addEventListener('mouseenter', (e) => {
    showBadgeTooltip(badge, chapterNum);
  });
  badge.addEventListener('mouseleave', () => {
    hideBadgeTooltip();
  });

  // ── CLIC : ouvre le popup sur l'historique du manga ──
  badge.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({
      action: 'openPopupOnManga',
      data: {
        slug: badge.getAttribute('data-slug'),
        domain: badge.getAttribute('data-domain')
      }
    });
  });

  element.style.position = 'relative';
  element.appendChild(badge);
}

// ──────────────────────────────────────────────────
// BARRE DE PROGRESSION
// ──────────────────────────────────────────────────
function injectProgressBar(pageInfo, readCount, totalCount) {
  // Supprimer l'ancienne barre si elle existe
  document.getElementById('manga-tracker-progress')?.remove();

  if (readCount === 0) return;

  const pct = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : null;
  const label = totalCount > 0
    ? `${readCount} / ${totalCount} chapitres lus (${pct}%)`
    : `${readCount} chapitre${readCount > 1 ? 's' : ''} lu${readCount > 1 ? 's' : ''}`;

  const bar = document.createElement('div');
  bar.id = 'manga-tracker-progress';
  bar.innerHTML = `
    <div class="mtp-label">
      <span class="mtp-dot"></span>
      <span>${label}</span>
      ${ pct !== null ? `<div class="mtp-bar-outer"><div class="mtp-bar-inner" style="width:${pct}%"></div></div>` : '' }
    </div>
  `;

  // Trouver un bon endroit pour injecter (sous le titre h1 ou en haut du body)
  const target = document.querySelector('h1, h2, .manga-title, .post-title, .series-title') || document.body.firstElementChild;
  if (target && target.parentNode) {
    target.parentNode.insertBefore(bar, target.nextSibling);
  } else {
    document.body.prepend(bar);
  }
}

// ──────────────────────────────────────────────────
// MENU CONTEXTUEL "MARQUER LUS JUSQU'ICI"
// ──────────────────────────────────────────────────
let contextMenuEl = null;

function showMarkUpToMenu(link, chapterNum, pageInfo) {
  hideContextMenu();

  const menu = document.createElement('div');
  menu.id = 'manga-tracker-context-menu';
  menu.innerHTML = `
    <div class="mtcm-item" id="mtcm-mark-upto">
      <span class="mtcm-icon">✔</span>
      Marquer lus jusqu'au Ch. ${chapterNum}
    </div>
    <div class="mtcm-item mtcm-cancel" id="mtcm-cancel">
      <span class="mtcm-icon">✕</span>
      Annuler
    </div>
  `;

  document.body.appendChild(menu);

  const rect = link.getBoundingClientRect();
  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 4;
  left = Math.max(8, Math.min(left, window.innerWidth - 220));

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  menu.querySelector('#mtcm-mark-upto').addEventListener('click', async () => {
    hideContextMenu();
    const domain = window.location.hostname;
    const title = extractMangaTitle();
    const resp = await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'markUpTo',
        data: {
          mangaSlug: pageInfo.mangaSlug,
          domain,
          mangaTitle: title,
          upToChapter: chapterNum,
          allChapters: detectedChapterNumbers
        }
      }, resolve);
    });
    if (resp?.success) {
      loadBadgesForMangaPage(pageInfo);
    }
  });

  menu.querySelector('#mtcm-cancel').addEventListener('click', hideContextMenu);

  // Fermer si clic ailleurs
  setTimeout(() => {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 50);
}

function hideContextMenu() {
  document.getElementById('manga-tracker-context-menu')?.remove();
  contextMenuEl = null;
}

// ── TOOLTIP ──
let tooltipEl = null;

function showBadgeTooltip(badge, chapterNum) {
  hideBadgeTooltip();

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'manga-tracker-tooltip';
  tooltipEl.innerHTML = `
    <div class="mtt-top">
      <span class="mtt-dot"></span>
      <strong>Chapitre ${chapterNum} lu</strong>
    </div>
    <div class="mtt-bottom">Cliquer pour voir l’historique</div>
  `;

  document.body.appendChild(tooltipEl);

  // Positionner au-dessus du badge
  const rect = badge.getBoundingClientRect();
  const tw = tooltipEl.offsetWidth || 180;
  const th = tooltipEl.offsetHeight || 52;

  let left = rect.left + window.scrollX + rect.width / 2 - tw / 2;
  let top  = rect.top  + window.scrollY - th - 8;

  // Éviter débordement à droite/gauche
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  // Si ça déborde en haut, passer en dessous
  if (top < window.scrollY + 4) top = rect.bottom + window.scrollY + 8;

  tooltipEl.style.left = left + 'px';
  tooltipEl.style.top  = top  + 'px';

  // Forcer un reflow pour déclencher l’animation
  tooltipEl.offsetHeight;
  tooltipEl.classList.add('mtt-visible');
}

function hideBadgeTooltip() {
  if (tooltipEl) {
    tooltipEl.remove();
    tooltipEl = null;
  }
}

// Injecter le CSS global pour les badges
function injectStyles() {
  if (document.getElementById('manga-tracker-styles')) return;
  const style = document.createElement('style');
  style.id = 'manga-tracker-styles';
  style.textContent = `
    .manga-tracker-badge {
      display: inline-block !important;
      width: 10px !important;
      height: 10px !important;
      background: #22c55e !important;
      border-radius: 50% !important;
      margin-left: 6px !important;
      vertical-align: middle !important;
      box-shadow: 0 0 4px rgba(34, 197, 94, 0.6) !important;
      cursor: pointer !important;
      transition: transform 0.15s, box-shadow 0.15s !important;
    }
    .manga-tracker-badge:hover {
      transform: scale(1.4) !important;
      box-shadow: 0 0 8px rgba(34, 197, 94, 0.9) !important;
    }

    /* ── TOOLTIP ── */
    .manga-tracker-tooltip {
      position: absolute !important;
      z-index: 2147483647 !important;
      background: #1a1d2e !important;
      border: 1px solid rgba(34, 197, 94, 0.4) !important;
      border-radius: 8px !important;
      padding: 8px 12px !important;
      min-width: 170px !important;
      max-width: 220px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
      pointer-events: none !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      opacity: 0 !important;
      transform: translateY(4px) !important;
      transition: opacity 0.15s, transform 0.15s !important;
    }
    .manga-tracker-tooltip.mtt-visible {
      opacity: 1 !important;
      transform: translateY(0) !important;
    }
    .mtt-top {
      display: flex !important;
      align-items: center !important;
      gap: 7px !important;
      margin-bottom: 4px !important;
    }
    .mtt-dot {
      width: 8px !important;
      height: 8px !important;
      background: #22c55e !important;
      border-radius: 50% !important;
      flex-shrink: 0 !important;
      box-shadow: 0 0 4px rgba(34,197,94,0.7) !important;
    }
    .mtt-top strong {
      color: #e8eaf6 !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      line-height: 1.2 !important;
    }
    .mtt-bottom {
      color: #6366f1 !important;
      font-size: 11px !important;
      padding-left: 15px !important;
      line-height: 1.3 !important;
    }

    /* ── BARRE DE PROGRESSION ── */
    #manga-tracker-progress {
      margin: 10px 0 !important;
      padding: 8px 14px !important;
      background: #1a1d2e !important;
      border: 1px solid rgba(34,197,94,0.25) !important;
      border-radius: 8px !important;
      display: inline-flex !important;
      align-items: center !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
      max-width: 400px !important;
    }
    .mtp-label {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      flex-wrap: wrap !important;
    }
    .mtp-label > span:not(.mtp-dot) {
      color: #e8eaf6 !important;
      font-size: 12px !important;
      font-weight: 500 !important;
    }
    .mtp-dot {
      width: 8px !important;
      height: 8px !important;
      background: #22c55e !important;
      border-radius: 50% !important;
      flex-shrink: 0 !important;
    }
    .mtp-bar-outer {
      width: 80px !important;
      height: 5px !important;
      background: rgba(255,255,255,0.1) !important;
      border-radius: 10px !important;
      overflow: hidden !important;
    }
    .mtp-bar-inner {
      height: 100% !important;
      background: #22c55e !important;
      border-radius: 10px !important;
      transition: width 0.4s !important;
    }

    /* ── MENU CONTEXTUEL ── */
    #manga-tracker-context-menu {
      position: absolute !important;
      z-index: 2147483647 !important;
      background: #1a1d2e !important;
      border: 1px solid rgba(99,102,241,0.4) !important;
      border-radius: 8px !important;
      padding: 4px !important;
      min-width: 210px !important;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
    }
    .mtcm-item {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 12px !important;
      border-radius: 5px !important;
      cursor: pointer !important;
      font-size: 13px !important;
      color: #e8eaf6 !important;
      transition: background 0.12s !important;
    }
    .mtcm-item:hover { background: rgba(99,102,241,0.2) !important; }
    .mtcm-cancel { color: #ef4444 !important; }
    .mtcm-cancel:hover { background: rgba(239,68,68,0.15) !important; }
    .mtcm-icon {
      font-size: 11px !important;
      width: 16px !important;
      text-align: center !important;
    }
  `;
  document.head.appendChild(style);
}

// ──────────────────────────────────────────────
// ENREGISTREMENT AUTOMATIQUE DE LA LECTURE
// ──────────────────────────────────────────────

function autoRegisterChapter(pageInfo) {
  const mangaTitle = extractMangaTitle();
  const domain = window.location.hostname;

  chrome.runtime.sendMessage({
    action: 'markAsRead',
    data: {
      mangaSlug: pageInfo.mangaSlug,
      mangaTitle: mangaTitle,
      chapterNumber: pageInfo.chapterNumber,
      domain: domain,
      url: pageInfo.url,
      readAt: new Date().toISOString()
    }
  }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response && response.success) {
      console.log(`[Manga Tracker] ✅ Chapitre ${pageInfo.chapterNumber} de "${mangaTitle}" marqué comme lu`);
    }
  });
}

// ──────────────────────────────────────────────
// AFFICHAGE DES BADGES SUR PAGE MANGA
// ──────────────────────────────────────────────

let lastBadgeInjectTime = 0;

// Stocker tous les numéros de chapitres détectés sur la page pour "marquer jusqu'à"
let detectedChapterNumbers = [];

function loadBadgesForMangaPage(pageInfo) {
  const domain = window.location.hostname;

  chrome.runtime.sendMessage({
    action: 'getReadChapters',
    data: { mangaSlug: pageInfo.mangaSlug, domain }
  }, (response) => {
    if (chrome.runtime.lastError) return;
    if (!response || !response.chapters || response.chapters.length === 0) return;

    injectStyles();

    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    const RETRY_DELAY = 300;

    function tryInject() {
      const now = Date.now();
      if (now - lastBadgeInjectTime < 150) {
        setTimeout(tryInject, 200);
        return;
      }

      // Collecter tous les chapitres détectés sur la page
      collectDetectedChapters();

      const placed = injectBadges(response.chapters);
      if (placed > 0) {
        lastBadgeInjectTime = Date.now();
        // Mettre à jour la barre de progression
        injectProgressBar(pageInfo, response.chapters.length, detectedChapterNumbers.length);
        // Mettre à jour le totalChapters en BDD
        if (detectedChapterNumbers.length > 0) {
          chrome.runtime.sendMessage({
            action: 'updateManga',
            data: {
              mangaSlug: pageInfo.mangaSlug,
              domain: domain,
              totalChapters: detectedChapterNumbers.length
            }
          });
        }
      }

      attempts++;
      if ((!placed || placed === 0) && attempts < MAX_ATTEMPTS) {
        setTimeout(tryInject, RETRY_DELAY);
      }
    }
    tryInject();
  });
}

// Collecte tous les numéros de chapitres visibles dans la page
function collectDetectedChapters() {
  const nums = new Set();
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href') || '';
    const num = extractChapterNumberFromHref(href);
    if (num !== null) nums.add(num);
  });
  detectedChapterNumbers = [...nums].sort((a, b) => a - b);
}

// ──────────────────────────────────────────────
// INIT - Point d'entrée principal
// ──────────────────────────────────────────────

function init() {
  const pageInfo = detectCurrentPage();
  if (!pageInfo) return;

  if (pageInfo.type === 'chapter') {
    // On est en train de lire un chapitre → on l'enregistre
    autoRegisterChapter(pageInfo);
  } else if (pageInfo.type === 'manga') {
    // On est sur la page du manga → on affiche les badges
    loadBadgesForMangaPage(pageInfo);
    // Observer les ajouts de nouveaux noeuds DOM ("charger plus", pagination, lazy load)
    startChapterListObserver(pageInfo);
  }
}

// ──────────────────────────────────────────────────
// OBSERVER LISTE CHAPITRES (lazy load / "afficher plus" / pagination)
// ──────────────────────────────────────────────────
let chapterListObserver = null;

function startChapterListObserver(pageInfo) {
  if (chapterListObserver) {
    chapterListObserver.disconnect();
    chapterListObserver = null;
  }

  let observerTimer = null;

  chapterListObserver = new MutationObserver((mutations) => {
    // Déclencher si :
    // 1. De nouveaux liens <a> ont été ajoutés (lazy load, "afficher plus")
    // 2. Des noeuds ont été supprimés (le site a rechargé sa liste → badges effacés)
    const relevant = mutations.some(m => {
      const hasAddedLinks = [...m.addedNodes].some(n =>
        n.nodeType === 1 && (n.tagName === 'A' || n.querySelector?.('a'))
      );
      // Détecter si des badges ont été supprimés (le site a réécrit son DOM)
      const hadBadgesRemoved = [...m.removedNodes].some(n =>
        n.nodeType === 1 && (
          n.classList?.contains('manga-tracker-badge') ||
          n.querySelector?.('.manga-tracker-badge') ||
          n.tagName === 'A' || n.querySelector?.('a')
        )
      );
      return hasAddedLinks || hadBadgesRemoved;
    });

    if (!relevant) return;

    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      loadBadgesForMangaPage(pageInfo);
    }, 200);
  });

  chapterListObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// ──────────────────────────────────────────────────
// DÉTECTION CHANGEMENT D'URL — 4 méthodes combinées
// ──────────────────────────────────────────────────
let lastUrl = window.location.href;
let initDebounceTimer = null;

function onUrlChange() {
  const newUrl = window.location.href;
  if (newUrl === lastUrl) return;
  lastUrl = newUrl;

  // Debounce : évite plusieurs déclenchements simultanés
  clearTimeout(initDebounceTimer);
  initDebounceTimer = setTimeout(() => {
    // Stopper l'observer de la page précédente
    if (chapterListObserver) {
      chapterListObserver.disconnect();
      chapterListObserver = null;
    }
    hideBadgeTooltip();
    init();
  }, 500);
}

// Méthode 1 : History API (pushState / replaceState)
const _pushState = history.pushState.bind(history);
const _replaceState = history.replaceState.bind(history);
history.pushState = function(...args) {
  _pushState(...args);
  onUrlChange();
};
history.replaceState = function(...args) {
  _replaceState(...args);
  onUrlChange();
};

// Méthode 2 : popstate (boutons précédent / suivant)
window.addEventListener('popstate', onUrlChange);

// Méthode 3 : Observer sur <title> (certains frameworks ne touchent pas History API)
const titleEl = document.querySelector('title');
if (titleEl) {
  new MutationObserver(onUrlChange).observe(titleEl, { childList: true, characterData: true });
}

// Méthode 4 : Polling toutes les 500ms (dernier recours — capture tout le reste)
// Utilisé pour les sites comme rimu-scans qui utilisent leur propre routeur
setInterval(() => {
  if (window.location.href !== lastUrl) onUrlChange();
}, 500);

// ──────────────────────────────────────────────────
// RACCOURCI CLAVIER Alt+M → ouvre le popup
// ──────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'm' || e.key === 'M')) {
    e.preventDefault();
    chrome.runtime.sendMessage({ action: 'openPopupOnManga', data: {} });
  }
});

// Lancer après chargement DOM complet
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Écouter les messages du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    const pageInfo = detectCurrentPage();
    sendResponse({
      pageInfo: pageInfo,
      mangaTitle: pageInfo ? extractMangaTitle() : null,
      url: window.location.href
    });
    return true;
  }
  if (request.action === 'refreshBadges') {
    const pageInfo = detectCurrentPage();
    if (pageInfo && pageInfo.type === 'manga') {
      loadBadgesForMangaPage(pageInfo);
    }
    sendResponse({ success: true });
    return true;
  }
});

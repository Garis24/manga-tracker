# Manga Tracker — Extension Chrome

Suit automatiquement ta progression de lecture manga sur **tous les sites de scans**, avec synchronisation **Google Drive gratuite** entre tes appareils.

---

## Fonctionnalités

- ✅ Enregistrement automatique quand tu lis un chapitre
- 🟢 Cercle vert sur les chapitres déjà lus (page de liste du manga)
- 📱 Sync Google Drive (dossier caché `appData`, gratuit, 100 MB)
- 🔍 Recherche dans ta bibliothèque
- 📤 Export/Import JSON
- Fonctionne sur Raijin-scans, Scan-vf, Lelscans, Mangadex, et tous les sites Madara/WordPress

---

## Installation

### 1. Télécharger l'extension
Décompresse le dossier `manga-tracker-extension/` sur ton PC.

### 2. Créer le client Google OAuth (pour la sync Drive)

> Si tu ne veux pas la sync Drive, passe cette étape.

1. Va sur [Google Cloud Console](https://console.cloud.google.com/)
2. Crée un **nouveau projet** (ex: "MangaTracker")
3. Dans **API & Services → Bibliothèque** : active **Google Drive API**
4. Dans **API & Services → Identifiants** :
   - Clique **Créer des identifiants → ID client OAuth 2.0**
   - Type : **Extension Chrome**
   - Dans "ID d'application" : colle l'ID de ton extension (visible dans `chrome://extensions` après chargement)
   - Valide
5. Copie le **Client ID** généré (format `XXXXXXX.apps.googleusercontent.com`)
6. Ouvre `manifest.json` et remplace :
   ```json
   "client_id": "VOTRE_CLIENT_ID_GOOGLE.apps.googleusercontent.com"
   ```
   par ton vrai Client ID.

### 3. Charger l'extension dans Chrome

1. Va sur `chrome://extensions`
2. Active le **Mode développeur** (coin supérieur droit)
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne le dossier `manga-tracker-extension/`

---

## Utilisation

### Lire un chapitre
Navigue simplement sur n'importe quel site de scan → le chapitre est automatiquement enregistré.

### Voir les chapitres lus
Va sur la page du manga (ex: `https://raijin-scans.fr/manga/enigmatica/`) → les chapitres lus affichent un **point vert** à côté.

### Popup
Clique sur l'icône de l'extension pour :
- Voir le chapitre en cours et le marquer lu/non lu
- Parcourir ta bibliothèque
- Synchroniser avec Google Drive

---

## Synchronisation entre appareils (Google Drive)

La sync utilise le **dossier `appData` de Google Drive** :
- Invisible dans ton Drive (ne pollue pas tes fichiers)
- Gratuit (compte dans ta limite de 15 GB)
- Fusionne intelligemment les données des deux appareils

### Activer la sync
1. Ouvre le popup → icône ⚙️ Paramètres
2. Clique **Connecter Google Drive**
3. Accepte les permissions
4. C'est tout — la sync se fait automatiquement après chaque lecture

### Sur un nouvel appareil
1. Installe l'extension
2. Paramètres → **Importer depuis Drive**
3. Tout ton historique est restauré

---

## Sites compatibles

L'extension détecte automatiquement les URLs de type :
- `/manga/<slug>/chapitre-X/`
- `/manga/<slug>/chapter-X/`
- `/read/<slug>/ch-X/`
- Et de nombreuses variantes

Testé sur : Raijin-scans, Scan-VF, Lel-scans, MangaDex, MangaFire, Asura Scans, Flame Scans, et tout site basé sur **Madara (WordPress)**.

---

## Structure des fichiers

```
manga-tracker-extension/
├── manifest.json      — Config Manifest V3
├── content.js         — Détection page + badges verts
├── background.js      — Stockage + sync Google Drive
├── popup.html         — Interface utilisateur
├── popup.css          — Style
├── popup.js           — Logique popup
└── icons/             — Icônes (à ajouter)
```

---

## Icônes

Place des icônes PNG dans le dossier `icons/` :
- `icon16.png` (16×16)
- `icon48.png` (48×48)
- `icon128.png` (128×128)

Tu peux utiliser un emoji 📚 converti en PNG via [favicon.io](https://favicon.io/emoji-favicons/).

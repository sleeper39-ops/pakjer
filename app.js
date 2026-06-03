// PakJer Song Playlist & Chord System Core Application Logic

document.addEventListener('DOMContentLoaded', () => {

  const SECTION_NAME_PATTERN =
    'intro|verse|pre-?hook|hook|chorus|bridge|instru(?:ments?|ment|mental|mentals)?|interlude|solo|outro|outtro|coda|ending|ท่อน|อินโทร|เอาท์โทร|ดนตรี';

  const BRACKET_SECTION_TAG_RE = new RegExp(
    '^\\[(?:section:\\s*)?(?:' + SECTION_NAME_PATTERN + ')(?:\\s+\\d+)?\\]$',
    'i'
  );

  const LEADING_SECTION_TAG_RE = new RegExp(
    '^(\\[(?:section:\\s*)?(?:' + SECTION_NAME_PATTERN + ')(?:\\s+\\d+)?\\])([\\s\\S]*)$',
    'i'
  );

  // --- FIREBASE INITIALIZATION ---
  let dbSongs = null;
  let dbPlaylists = null;
  let dbTags = null;
  let firebaseActive = false;

  const firebaseConfig = {
    apiKey: "AIzaSyC0R6cx949e10XkpM62SEeAr87rUYXg-Nk",
    authDomain: "pakjer-71b0b.firebaseapp.com",
    databaseURL: "https://pakjer-71b0b-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "pakjer-71b0b",
    storageBucket: "pakjer-71b0b.firebasestorage.app",
    messagingSenderId: "1055197718278",
    appId: "1:1055197718278:web:373e52448c6979bb002087",
    measurementId: "G-GX7EXWP6HN"
  };

  try {
    if (typeof firebase !== 'undefined') {
      const fbApp = firebase.initializeApp(firebaseConfig);
      const db = firebase.database();
      dbSongs = db.ref('songs');
      dbPlaylists = db.ref('playlists');
      dbTags = db.ref('customTags');
      firebaseActive = true;
      console.log('Firebase initialized successfully.');
    } else {
      console.warn('Firebase library not found. Operating in local mode.');
    }
  } catch (error) {
    console.error('Firebase failed to initialize:', error);
  }

  // --- APPLICATION STATE ---
  let songs = [];
  let playlists = [];

  let currentSongId = null;
  let currentPlaylistId = null;
  let selectedTag = null;
  let currentKeyOffset = 0;
  let currentScaleScalar = 1.0;
  let customTags = [];
  let lastOcrScannedText = '';

  // Autoscroll State
  let isScrolling = false;
  let autoscrollSpeed = 20; // Pixels per second
  let lastScrollTime = 0;
  let scrollFrameId = null;

  // Metronome State
  let audioCtx = null;
  let isMetronomePlaying = false;
  let metronomeIntervalId = null;
  let metronomeBpm = 94;
  let currentBeat = 0;

  // Importer/Admin State
  let activeAdminSongId = null; // null means creating new
  let uploadedImageBase64 = null;
  let ocrDetectedKey = null;
  let ocrDetectedBpm = null;

  // Key scales for transposition matching Screenshot 3
  const KEY_SCALES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  function getPitchIndex(root) {
    let index = KEY_SCALES.indexOf(root);
    if (index === -1) {
      const sharpFlatAliases = {
        'C#': 'Db', 'Db': 'C#',
        'D#': 'Eb', 'Eb': 'D#',
        'F#': 'Gb', 'Gb': 'F#',
        'G#': 'Ab', 'Ab': 'G#',
        'A#': 'Bb', 'Bb': 'A#',
        'B#': 'C', 'Cb': 'B',
        'E#': 'F', 'Fb': 'E'
      };
      const alias = sharpFlatAliases[root.toUpperCase()];
      if (alias) {
        index = KEY_SCALES.indexOf(alias);
      }
    }
    return index;
  }

  function setAdminKeyValue(keyValue) {
    if (!adminKey) return;
    const keyOptionExists = Array.from(adminKey.options).some(opt => opt.value === keyValue);
    if (!keyOptionExists && keyValue) {
      const newOpt = document.createElement('option');
      newOpt.value = keyValue;
      newOpt.textContent = keyValue;
      adminKey.appendChild(newOpt);
    }
    adminKey.value = keyValue || 'C';
  }

  // --- CORE DOM ELEMENTS ---
  const views = {
    library: document.getElementById('view-library'),
    song: document.getElementById('view-song'),
    admin: document.getElementById('view-admin')
  };

  // Sidebar Elements
  const playlistList = document.getElementById('sidebar-playlist-list');
  const tagCloud = document.getElementById('sidebar-tag-cloud');
  const totalSongsCount = document.getElementById('total-songs-count');

  // Library Elements
  const songGrid = document.getElementById('song-grid');
  const searchInput = document.getElementById('search-input');

  // Song Viewer Elements
  const songTitle = document.getElementById('song-title');
  const songArtist = document.getElementById('song-artist');
  const songMetricTempo = document.getElementById('song-metric-tempo');
  const songSheetContent = document.getElementById('song-sheet-content');
  const songImageContainer = document.getElementById('song-image-container');
  const btnSongNavClose = document.getElementById('btn-song-nav-close');
  const btnSongNavPrev = document.getElementById('btn-song-nav-prev');
  const btnSongNavNext = document.getElementById('btn-song-nav-next');
  const appMainContent = document.querySelector('.app-main-content');

  // Controls Toolbar Elements
  const btnKeyDec = document.getElementById('btn-key-dec');
  const btnKeyInc = document.getElementById('btn-key-inc');
  const btnKeyTranspose = document.getElementById('btn-key-transpose');
  const btnAutoscroll = document.getElementById('btn-autoscroll');
  const autoscrollSpeedControl = document.getElementById('autoscroll-speed-control');
  const autoscrollSlider = document.getElementById('autoscroll-slider');
  const btnMetronome = document.getElementById('btn-metronome');
  const metronomePulse = document.getElementById('metronome-pulse');
  const btnTools = document.getElementById('btn-tools');
  const btnSections = document.getElementById('btn-sections');
  const sectionsMenuList = document.getElementById('sections-menu-list');

  // Admin View Elements
  const adminTitle = document.getElementById('admin-title');
  const adminArtist = document.getElementById('admin-artist');
  const adminKey = document.getElementById('admin-key');
  const adminTempo = document.getElementById('admin-tempo');
  const adminTime = null;
  const adminDuration = null;
  const adminTags = null;
  const adminContent = document.getElementById('admin-content');
  const adminImageUpload = document.getElementById('admin-image-upload');
  const adminPreviewContent = document.getElementById('admin-preview-content');
  const btnAdminSave = document.getElementById('btn-admin-save');
  const btnAdminCancel = document.getElementById('btn-admin-cancel');

  // OCR DOM Elements
  const ocrImageInput = document.getElementById('ocr-image-input');
  const btnOcrStart = document.getElementById('btn-ocr-start');
  const ocrStatusContainer = document.getElementById('ocr-status-container');
  const ocrStatusText = document.getElementById('ocr-status-text');
  const ocrPercentText = document.getElementById('ocr-percent-text');
  const ocrProgressBar = document.getElementById('ocr-progress-bar');
  const ocrInsertRow = document.getElementById('ocr-insert-row');
  const btnOcrInsert = document.getElementById('btn-ocr-insert');
  const ocrGeminiKey = document.getElementById('ocr-gemini-key');

  // Modals Elements
  const modals = {
    transpose: document.getElementById('modal-transpose'),
    share: document.getElementById('modal-share'),
    import: document.getElementById('modal-import'),
    playlist: document.getElementById('modal-playlist'),
    tags: document.getElementById('modal-tags')
  };
  const btnManageTags = document.getElementById('btn-manage-tags');
  const tagManagerNewInput = document.getElementById('tag-manager-new-input');
  const btnTagManagerAdd = document.getElementById('btn-tag-manager-add');
  const tagManagerList = document.getElementById('tag-manager-list');

  // Initialize Drag & Drop for Playlists
  function initSortable() {
    if (typeof Sortable === 'undefined' || !playlistList) return;

    Sortable.create(playlistList, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      delay: 500, // 0.5s long press to start dragging (supports iPad/Touch)
      delayOnTouchOnly: true,
      touchStartThreshold: 5,
      onEnd: function (evt) {
        // Reorder playlists array based on new DOM order
        const newOrderIds = Array.from(playlistList.querySelectorAll('.playlist-item'))
          .map(li => li.getAttribute('data-id'));
        
        const reorderedPlaylists = [];
        newOrderIds.forEach(id => {
          const pl = playlists.find(p => p.id === id);
          if (pl) reorderedPlaylists.push(pl);
        });

        // Update state and save
        playlists = reorderedPlaylists;
        savePlaylistsToStorage();
        console.log('Playlist reordered and saved.');
      }
    });
  }

  // --- INITIALIZATION ---
  function init() {
    loadDatabaseLocal(); // Load from localStorage first for instant display
    bindEvents();
    initSortable();

    // Load stored Gemini key
    const savedGeminiKey = localStorage.getItem('pakjer_gemini_key');
    if (savedGeminiKey && ocrGeminiKey) {
      ocrGeminiKey.value = savedGeminiKey;
    }

    renderSidebar();
    renderLibrary();
    showView('library');

    // Then sync from Firebase (cloud data overrides local)
    loadDatabaseFromFirebase();

    // Listen for real-time changes from Firebase
    setupFirebaseListeners();
  }

  // --- STATE PERSISTENCE ---

  // Step 1: Load from localStorage for instant boot
  function loadDatabaseLocal() {
    const storedSongs = localStorage.getItem('pakjer_songs');
    if (storedSongs) {
      try {
        songs = JSON.parse(storedSongs).filter(s => s && s.id);
      } catch (e) {
        songs = PRESEEDED_SONGS;
      }
    } else {
      songs = PRESEEDED_SONGS;
      localStorage.setItem('pakjer_songs', JSON.stringify(songs));
    }

    const storedPlaylists = localStorage.getItem('pakjer_playlists');
    if (storedPlaylists) {
      try {
        playlists = JSON.parse(storedPlaylists).map(pl => {
          if (pl) pl.songs = pl.songs || [];
          return pl;
        }).filter(pl => pl && pl.id);
      } catch (e) {
        playlists = [
          { id: 'favs', name: 'My Favorites ❤️', songs: ['cant-smile-without-you', '100-reason'] }
        ];
      }
    } else {
      playlists = [
        { id: 'favs', name: 'My Favorites ❤️', songs: ['cant-smile-without-you', '100-reason'] }
      ];
      localStorage.setItem('pakjer_playlists', JSON.stringify(playlists));
    }

    customTags = JSON.parse(localStorage.getItem('pakjer_custom_tags')) || [];
  }

  // Step 2: Load from Firebase and merge/override
  function loadDatabaseFromFirebase() {
    if (!firebaseActive) return;

    dbSongs.once('value').then(snapshot => {
      const data = snapshot.val();
      if (data) {
        const rawSongs = Array.isArray(data) ? data : Object.values(data);
        songs = rawSongs.filter(s => s && s.id);
        localStorage.setItem('pakjer_songs', JSON.stringify(songs));
        renderSidebar();
        renderLibrary();
      } else {
        // First time: push local data to Firebase
        pushAllSongsToFirebase();
      }
    }).catch(err => console.warn('Firebase songs load failed, using local:', err));

    dbPlaylists.once('value').then(snapshot => {
      const data = snapshot.val();
      if (data) {
        const rawPlaylists = Array.isArray(data) ? data : Object.values(data);
        playlists = rawPlaylists.map(pl => {
          if (pl) pl.songs = pl.songs || [];
          return pl;
        }).filter(pl => pl && pl.id);
        localStorage.setItem('pakjer_playlists', JSON.stringify(playlists));
        renderSidebar();
      } else {
        pushAllPlaylistsToFirebase();
      }
    }).catch(err => console.warn('Firebase playlists load failed, using local:', err));

    dbTags.once('value').then(snapshot => {
      const data = snapshot.val();
      if (data) {
        customTags = Array.isArray(data) ? data : Object.values(data);
        localStorage.setItem('pakjer_custom_tags', JSON.stringify(customTags));
        renderSidebar();
      } else {
        if (customTags.length > 0) {
          dbTags.set(customTags).catch(err => console.warn('Firebase tags push failed:', err));
        }
      }
    }).catch(err => console.warn('Firebase tags load failed, using local:', err));
  }

  // Step 3: Real-time listeners for live sync
  function setupFirebaseListeners() {
    if (!firebaseActive) return;

    dbSongs.on('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        const rawSongs = Array.isArray(data) ? data : Object.values(data);
        songs = rawSongs.filter(s => s && s.id);
        localStorage.setItem('pakjer_songs', JSON.stringify(songs));
        renderSidebar();
        renderLibrary();
      }
    });

    dbPlaylists.on('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        const rawPlaylists = Array.isArray(data) ? data : Object.values(data);
        playlists = rawPlaylists.map(pl => {
          if (pl) pl.songs = pl.songs || [];
          return pl;
        }).filter(pl => pl && pl.id);
        localStorage.setItem('pakjer_playlists', JSON.stringify(playlists));
        renderSidebar();
      }
    });

    dbTags.on('value', snapshot => {
      const data = snapshot.val();
      if (data) {
        customTags = Array.isArray(data) ? data : Object.values(data);
        localStorage.setItem('pakjer_custom_tags', JSON.stringify(customTags));
        renderSidebar();
      }
    });
  }

  // --- SAVE FUNCTIONS (write to both localStorage + Firebase) ---

  function pushAllSongsToFirebase() {
    if (!firebaseActive || !dbSongs) return;
    try {
      const songsObj = {};
      songs.forEach(s => {
        if (s && s.id) {
          songsObj[s.id] = s;
        }
      });
      dbSongs.set(songsObj).catch(err => console.warn('Firebase songs push failed:', err));
    } catch (e) {
      console.warn('Error pushing songs to Firebase:', e);
    }
  }

  function pushAllPlaylistsToFirebase() {
    if (!firebaseActive || !dbPlaylists) return;
    try {
      const plObj = {};
      playlists.forEach(pl => {
        if (pl && pl.id) {
          plObj[pl.id] = pl;
        }
      });
      dbPlaylists.set(plObj).catch(err => console.warn('Firebase playlists push failed:', err));
    } catch (e) {
      console.warn('Error pushing playlists to Firebase:', e);
    }
  }

  function saveSongsToStorage() {
    localStorage.setItem('pakjer_songs', JSON.stringify(songs));
    pushAllSongsToFirebase();
  }

  // --- SAVE FUNCTIONS (write to both localStorage + Firebase) ---

  function savePlaylistsToStorage() {
    localStorage.setItem('pakjer_playlists', JSON.stringify(playlists));
    pushAllPlaylistsToFirebase();
  }

  function saveCustomTagsToStorage() {
    localStorage.setItem('pakjer_custom_tags', JSON.stringify(customTags));
    if (firebaseActive && dbTags) {
      try {
        dbTags.set(customTags).catch(err => console.warn('Firebase tags save failed:', err));
      } catch (e) {
        console.warn('Error saving tags to Firebase:', e);
      }
    }
  }

  // --- EVENT BINDING ---
  function bindEvents() {
    // Logo Click (Back to Library)
    const logoContainer = document.querySelector('.logo-container');
    if (logoContainer) {
      logoContainer.addEventListener('click', () => {
        try {
          currentSongId = null;
          currentPlaylistId = null;
          selectedTag = null;
          if (searchInput) searchInput.value = '';
          document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
          document.querySelectorAll('.tag-chip').forEach(el => el.classList.remove('active'));
          renderSidebar();
          renderLibrary();
          showView('library');
        } catch (err) {
          console.error('Error in logo click:', err);
        }
      });
    }

    // Sidebar Home Section Click (Back to Library)
    const sidebarHomeBtn = document.getElementById('sidebar-home-btn');
    if (sidebarHomeBtn) {
      sidebarHomeBtn.addEventListener('click', () => {
        try {
          currentSongId = null;
          currentPlaylistId = null;
          selectedTag = null;
          if (searchInput) searchInput.value = '';
          document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
          if (tagCloud) {
            tagCloud.querySelectorAll('.tag-chip').forEach(el => el.classList.remove('active'));
          }
          renderSidebar();
          renderLibrary();
          showView('library');
        } catch (err) {
          console.error('Error in sidebarHomeBtn click:', err);
        }
      });
    }

    // Search Input
    searchInput.addEventListener('input', () => {
      renderLibrary();
    });

    // Font Scale Presets (Screenshot 2)
    document.querySelectorAll('.scale-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const scaleVal = parseFloat(e.currentTarget.dataset.scale);
        currentScaleScalar = scaleVal;
        songSheetContent.style.setProperty('--font-scale', scaleVal);
      });
    });

    // Controls Toolbar Bindings
    btnKeyDec.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustKeyOffset(-1);
    });
    btnKeyInc.addEventListener('click', (e) => {
      e.stopPropagation();
      adjustKeyOffset(1);
    });
    btnKeyTranspose.addEventListener('click', openTransposeModal);
    btnAutoscroll.addEventListener('click', toggleAutoscroll);
    autoscrollSlider.addEventListener('input', (e) => {
      autoscrollSpeed = parseInt(e.target.value);
    });
    btnMetronome.addEventListener('click', toggleMetronome);
    btnTools.addEventListener('click', openShareModal);

    if (btnSongNavClose) btnSongNavClose.addEventListener('click', closeSongView);
    if (btnSongNavPrev) btnSongNavPrev.addEventListener('click', () => navigateSong(-1));
    if (btnSongNavNext) btnSongNavNext.addEventListener('click', () => navigateSong(1));

    // Playlist Rename & Delete bindings
    document.getElementById('btn-edit-playlist-name').addEventListener('click', () => {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      if (!pl) return;
      const newName = prompt('แก้ไขชื่อเพลย์ลิสต์:', pl.name);
      if (newName && newName.trim()) {
        pl.name = newName.trim();
        savePlaylistsToStorage();
        renderSidebar();
        renderLibrary();
      }
    });

    document.getElementById('btn-delete-playlist').addEventListener('click', () => {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      if (!pl) return;
      if (confirm(`คุณแน่ใจว่าต้องการลบเพลย์ลิสต์ "${pl.name}" หรือไม่? (เพลงในคลังจะไม่สูญหาย)`)) {
        playlists = playlists.filter(p => p.id !== currentPlaylistId);
        savePlaylistsToStorage();
        currentPlaylistId = null;
        renderSidebar();
        renderLibrary();
      }
    });

    // Tag Sidebar Gear click
    if (btnManageTags) {
      btnManageTags.addEventListener('click', () => {
        openTagManager();
      });
    }

    // Tag Manager Add click
    if (btnTagManagerAdd) {
      btnTagManagerAdd.addEventListener('click', addCategoryFromManager);
    }

    // Section Jump Dropdown Toggle
    btnSections.addEventListener('click', (e) => {
      e.stopPropagation();
      sectionsMenuList.style.display = sectionsMenuList.style.display === 'flex' ? 'none' : 'flex';
    });

    document.addEventListener('click', () => {
      sectionsMenuList.style.display = 'none';
    });

    // Modals Close buttons
    document.querySelectorAll('.modal-close, .modal-cancel').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeAllModals();
      });
    });

    // Playlist Add Button in Sidebar
    document.getElementById('btn-add-playlist').addEventListener('click', () => {
      openModal('playlist');
    });

    // Playlist Save Button
    document.getElementById('btn-save-playlist').addEventListener('click', createNewPlaylist);

    // Admin Mode Toggles in header
    document.getElementById('btn-admin-dashboard').addEventListener('click', () => {
      openAdminCreator();
    });

    document.getElementById('btn-import-crawler').addEventListener('click', () => {
      openModal('import');
    });

    // Admin Form Events
    if (adminImageUpload) adminImageUpload.addEventListener('change', handleImageUpload);
    if (adminContent) adminContent.addEventListener('input', updateAdminPreview);
    if (btnAdminSave) {
      btnAdminSave.addEventListener('click', (e) => {
        try {
          saveAdminSong();
        } catch (err) {
          console.error('Error saving admin song:', err);
          alert('เกิดข้อผิดพลาดในการบันทึกเพลง: ' + err.message);
        }
      });
    }
    if (btnAdminCancel) {
      btnAdminCancel.addEventListener('click', () => {
        if (currentSongId) {
          showSong(currentSongId);
        } else {
          showView('library');
        }
      });
    }

    // Admin Delete button (inside editor)
    const btnAdminDelete = document.getElementById('btn-admin-delete');
    if (btnAdminDelete) {
      btnAdminDelete.addEventListener('click', () => {
        if (activeAdminSongId) {
          deleteSong(activeAdminSongId);
        }
      });
    }

    // Importer/Crawler Paste Events
    document.getElementById('btn-crawler-convert').addEventListener('click', handleCrawlerImport);

    // Storing Gemini API key
    ocrGeminiKey.addEventListener('input', () => {
      localStorage.setItem('pakjer_gemini_key', ocrGeminiKey.value.trim());
    });

    // OCR Action Events
    btnOcrStart.addEventListener('click', handleOcrExtraction);
    if (btnOcrInsert) {
      btnOcrInsert.addEventListener('click', () => {
        if (!lastOcrScannedText.trim()) {
          alert('ยังไม่มีข้อมูลที่สแกนได้ กรุณาสแกนรูปภาพก่อน');
          return;
        }
        insertOcrContentDirectly(lastOcrScannedText);
        btnOcrInsert.classList.remove('pulse-blink');
        if (ocrInsertRow) ocrInsertRow.style.display = 'none';
        lastOcrScannedText = '';
      });
    }
  }

  // Helper to insert chords or text into the admin editor content
  window.insertChordToEditor = function(chord) {
    if (!adminContent) return;

    let start = adminContent.selectionStart;
    let end = adminContent.selectionEnd;

    // If the cursor is at the very beginning (0/0) and the textarea is not empty,
    // default to appending at the end (ต่อท้าย)
    if (start === 0 && end === 0 && adminContent.value.length > 0) {
      start = adminContent.value.length;
      end = adminContent.value.length;
    }

    let insertText = chord;

    // Section helper buttons should insert as their own line
    // so renderer can detect section blocks/colors reliably.
    const sectionTagRegex = BRACKET_SECTION_TAG_RE;
    if (sectionTagRegex.test(chord.trim())) {
      const beforeText = adminContent.value.slice(0, start);
      const afterText = adminContent.value.slice(end);

      const needsLeadingNewline = beforeText.length > 0 && !beforeText.endsWith('\n');
      const needsTrailingNewline = afterText.length > 0 && !afterText.startsWith('\n');

      insertText =
        (needsLeadingNewline ? '\n' : '') +
        chord.trim() +
        '\n' +
        (needsTrailingNewline ? '\n' : '');
    }

    adminContent.focus();
    adminContent.setRangeText(insertText, start, end, 'end');

    // Place the cursor right after the newly inserted chord
    adminContent.selectionStart = adminContent.selectionEnd = start + insertText.length;

    // Trigger input event to update Live Preview in real-time
    adminContent.dispatchEvent(new Event('input'));
  };

  // --- ROUTING / VIEW CHANGING ---
  function showView(viewName) {
    // Reset running utilities when changing views
    if (viewName !== 'song') {
      stopAutoscroll();
      stopMetronome();
      document.querySelector('.app-container').classList.remove('viewing-song');
    } else {
      document.querySelector('.app-container').classList.add('viewing-song');
    }

    // Toggle active view elements
    Object.keys(views).forEach(key => {
      if (key === viewName) {
        views[key].classList.remove('hidden');
      } else {
        views[key].classList.add('hidden');
      }
    });
  }

  // --- SIDEBAR RENDERING ---
  function renderSidebar() {
    totalSongsCount.textContent = `${songs.length} เพลง`;

    // Toggle active state for home button
    const sidebarHomeBtnElement = document.getElementById('sidebar-home-btn');
    if (sidebarHomeBtnElement) {
      if (!currentPlaylistId && !selectedTag && !currentSongId) {
        sidebarHomeBtnElement.classList.add('active');
      } else {
        sidebarHomeBtnElement.classList.remove('active');
      }
    }

    // Render Playlists
    playlistList.innerHTML = '';
    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className = `playlist-item ${currentPlaylistId === pl.id ? 'active' : ''}`;
      li.setAttribute('data-id', pl.id); // Add data-id for Sortable reordering
      li.innerHTML = `
        <span>📂 ${escapeHtml(pl.name)}</span>
        <span class="playlist-count">${(pl.songs || []).length}</span>
      `;
      li.addEventListener('click', () => {
        currentPlaylistId = pl.id;
        selectedTag = null;
        currentSongId = null;
        document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        if (tagCloud) {
          tagCloud.querySelectorAll('.tag-chip').forEach(el => el.classList.remove('active'));
        }
        renderLibrary();
        showView('library');
      });
      playlistList.appendChild(li);
    });

    // Render Category Tags
    if (tagCloud) {
      tagCloud.innerHTML = '';
      const allTags = new Set();
      songs.forEach(s => {
        if (s.tags && Array.isArray(s.tags)) {
          s.tags.forEach(t => allTags.add(t));
        }
      });
      customTags.forEach(t => allTags.add(t));

      allTags.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = `tag-chip ${selectedTag === tag ? 'active' : ''}`;
        chip.textContent = `🏷️ ${tag}`;
        chip.addEventListener('click', () => {
          if (selectedTag === tag) {
            selectedTag = null; // Toggle off if clicked again
          } else {
            selectedTag = tag;
            currentPlaylistId = null; // mutually exclusive
            document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
          }
          renderSidebar();
          renderLibrary();
          showView('library');
        });
        tagCloud.appendChild(chip);
      });
    }
  }

  /** รายการเพลงตามลิสต์/แท็ก/คำค้นหา (ใช้กริดคลัง + ปุ่ม < > ในหน้าเพลง) */
  function getFilteredSongs() {
    const query = searchInput.value.toLowerCase().trim();
    let filteredSongs = songs;

    if (currentPlaylistId) {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      if (pl) {
        filteredSongs = filteredSongs.filter(s => s && (pl.songs || []).includes(s.id));
      }
    }

    if (selectedTag) {
      filteredSongs = filteredSongs.filter(s => s.tags && s.tags.includes(selectedTag));
    }

    if (query) {
      filteredSongs = filteredSongs.filter(s =>
        s.title.toLowerCase().includes(query) ||
        s.artist.toLowerCase().includes(query)
      );
    }

    // เรียงลำดับเพลงตามความเร็ว (Tempo) จากน้อยไปมาก
    filteredSongs.sort((a, b) => (a.tempo || 0) - (b.tempo || 0));

    return filteredSongs;
  }

  /** ชื่อลิสต์ทั้งหมดที่มีเพลงนี้อยู่ */
  function getPlaylistNamesForSong(songId) {
    return playlists
      .filter(pl => Array.isArray(pl.songs) && pl.songs.includes(songId))
      .map(pl => pl.name)
      .filter(Boolean);
  }

  function getSongNavigationList() {
    const filtered = getFilteredSongs();
    if (currentSongId && filtered.some(s => s.id === currentSongId)) return filtered;
    return songs;
  }

  function updateSongNavButtons() {
    const list = getSongNavigationList();
    const idx = list.findIndex(s => s.id === currentSongId);
    if (btnSongNavPrev) btnSongNavPrev.disabled = idx <= 0;
    if (btnSongNavNext) btnSongNavNext.disabled = idx < 0 || idx >= list.length - 1;
  }

  function navigateSong(delta) {
    const list = getSongNavigationList();
    const idx = list.findIndex(s => s.id === currentSongId);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= list.length) return;

    showSong(list[nextIdx].id);
    if (appMainContent) {
      appMainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function closeSongView() {
    stopAutoscroll();
    stopMetronome();
    currentSongId = null;
    renderSidebar();
    showView('library');
  }

  // --- LIBRARY / SEARCH RENDERING ---
  function renderLibrary() {
    const filteredSongs = getFilteredSongs();

    // Render title text and actions
    const plActions = document.getElementById('playlist-actions-container');
    const titleText = document.getElementById('library-title-text');
    const subtitleText = document.getElementById('library-subtitle-text');

    if (currentPlaylistId) {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      titleText.textContent = pl ? pl.name : 'ลิสต์เพลง';
      subtitleText.textContent = `รวมเพลงในลิสต์ทั้งหมด ${filteredSongs.length} เพลง`;
      plActions.classList.remove('hidden');
    } else if (selectedTag) {
      titleText.textContent = `หมวดหมู่: ${selectedTag}`;
      subtitleText.textContent = `รวมเพลงในหมวดหมู่ทั้งหมด ${filteredSongs.length} เพลง`;
      plActions.classList.add('hidden');
    } else {
      plActions.classList.add('hidden');
      titleText.textContent = 'คลังเพลงของฉัน';
      subtitleText.textContent = `ค้นหาคอร์ด จัดลิสต์เพลง และแชร์เพลงร่วมกันทั้งหมด ${filteredSongs.length} เพลง`;
    }

    // Render Song Grid
    songGrid.innerHTML = '';
    if (filteredSongs.length === 0) {
      let restoreBtnHtml = '';
      if (songs.length === 0) {
        restoreBtnHtml = `
          <div style="margin-top: 16px;">
            <button id="btn-restore-samples" class="btn" style="padding: 8px 16px; font-size: 13px;">
              🔄 คืนค่าเพลงตัวอย่าง (4 เพลง)
            </button>
          </div>
        `;
      }
      songGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <p style="font-size: 18px; margin-bottom: 8px;">ไม่พบผลลัพธ์เพลง</p>
          <small>ลองเปลี่ยนคำค้นหา หรือสร้างเพลงใหม่ได้เลยตอนนี้!</small>
          ${restoreBtnHtml}
        </div>
      `;

      const btnRestore = document.getElementById('btn-restore-samples');
      if (btnRestore) {
        btnRestore.onclick = () => {
          songs = PRESEEDED_SONGS;
          saveSongsToStorage();
          renderSidebar();
          renderLibrary();
        };
      }
      return;
    }

    filteredSongs.forEach(song => {
      const card = document.createElement('div');
      card.className = 'song-card';

      const playlistNames = !currentPlaylistId ? getPlaylistNamesForSong(song.id) : [];
      const playlistsHtml = playlistNames.length > 0
        ? `<div class="card-playlists" aria-label="อยู่ในลิสต์">${playlistNames
            .map(name => `<span class="card-playlist-tag">${escapeHtml(name)}</span>`)
            .join('')}</div>`
        : '';

      card.innerHTML = `
        <div class="song-card-body">
          <div class="card-title">${escapeHtml(song.title)}</div>
          <div class="card-artist">${escapeHtml(song.artist)}</div>
          ${playlistsHtml}
        </div>
        <div class="card-footer">
          <span class="card-key">${escapeHtml(song.key)}</span>
          <span>♩ ${song.tempo}</span>
        </div>
      `;

      card.addEventListener('click', () => {
        showSong(song.id);
      });

      songGrid.appendChild(card);
    });
  }

  // --- SONG VIEW RENDERING ---
  function showSong(songId) {
    const song = songs.find(s => s.id === songId);
    if (!song) return;

    currentSongId = songId;
    currentKeyOffset = 0; // Reset key transposing
    metronomeBpm = song.tempo; // Set metronome bpm

    // If metronome is currently ON, restart it so BPM matches the newly selected song.
    // (startMetronome computes intervalMs only when starting)
    if (isMetronomePlaying) {
      stopMetronome();
      startMetronome();
    }

    // Fill Hero Card Metadata
    songTitle.textContent = `${song.title} : ${song.artist}`;
    if (songArtist) songArtist.textContent = song.artist;

    // Metas
    if (songMetricTempo) {
      songMetricTempo.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/></svg> ♩ = ${song.tempo}`;
    }

    // Key selector text (G (Ori) etc.)
    updateKeyTransposeDisplay();

    // Admin edit trigger
    const editBtn = document.getElementById('btn-song-edit');
    if (editBtn) {
      editBtn.onclick = () => openAdminEditor(song);
    }

    // Delete song trigger (placed defensively)
    const deleteBtn = document.getElementById('btn-song-delete');
    if (deleteBtn) {
      deleteBtn.onclick = () => deleteSong(song.id);
    }

    // Add to Playlist picker trigger
    const addToPlBtn = document.getElementById('btn-song-add-playlist');
    if (addToPlBtn) {
      addToPlBtn.onclick = () => openAddToPlaylistModal(song.id);
    }

    // Render chords & lyrics content
    renderChordSheet(song);

    // Render image attachment
    if (song.imageBase64) {
      songImageContainer.innerHTML = `<img src="${song.imageBase64}" alt="Chord sheet backing image">`;
      songImageContainer.classList.remove('hidden');
    } else {
      songImageContainer.innerHTML = '';
      songImageContainer.classList.add('hidden');
    }

    renderSidebar();
    updateSongNavButtons();
    showView('song');
  }

  function isSectionHeaderLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return false;

    if (/^\[section:/i.test(trimmed)) return true;
    if (BRACKET_SECTION_TAG_RE.test(trimmed)) return true;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const inner = trimmed.slice(1, -1).trim();
      if (inner.includes('[') || inner.includes(']')) return false;
      const chordRegex = /^[A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?$/i;
      return !chordRegex.test(inner);
    }

    return isPlainSectionHeaderLine(trimmed);
  }

  function isPlainSectionHeaderLine(trimmed) {
    if (/^(ดนตรี|ท่อน|อินโทร|เอาท์โทร)(?:\s*[\d.:|\-]*)?$/i.test(trimmed)) return true;
    if (trimmed.length > 48 || /[ก-๙]/.test(trimmed)) return false;
    if (/[|]/.test(trimmed) && /[A-G][#b]?/i.test(trimmed)) return false;
    const sectionLabel = new RegExp(
      '^(?:' + SECTION_NAME_PATTERN + ')(?:\\s*[\\d.:|\\-]*)?$',
      'i'
    );
    return sectionLabel.test(trimmed);
  }

  function getSectionName(line) {
    const trimmed = line.trim();
    const sectionPrefixMatch = trimmed.match(/^\[section:\s*(.+)\]$/i);
    if (sectionPrefixMatch) {
      return sectionPrefixMatch[1].trim();
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).trim();
    }
    return trimmed;
  }

  /** Split "[Instruments] | G |" into header + remaining chord content on the same line. */
  function splitLineLeadingSectionHeader(line) {
    const trimmed = line.trim();
    const match = trimmed.match(LEADING_SECTION_TAG_RE);
    if (!match) return null;

    const header = match[1].trim();
    if (!isSectionHeaderLine(header)) return null;

    return {
      header,
      rest: match[2].trim()
    };
  }

  /** Intro/Outro → white, Instru → yellow, else → orange (no class). */
  function applySectionColorClass(sectionBlock, sectionName) {
    const lower = sectionName.toLowerCase().trim();
    const isInstru =
      /\b(instru(?:ments?|ment|mental|mentals)?|interlude|solo|instrumental|ดนตรี)\b/i.test(lower) ||
      /^instru/i.test(lower);
    const isIntro = /\b(intro|อินโทร)\b/i.test(lower) || /^intro$/i.test(lower);
    const isOutro =
      /\b(outro|outtro|coda|ending|เอาท์โทร|จบท้าย)\b/i.test(lower) ||
      /^outro$/i.test(lower) ||
      /^outtro$/i.test(lower);

    if (isInstru) {
      sectionBlock.classList.add('section-instruments');
    } else if (isIntro) {
      sectionBlock.classList.add('section-intro');
    } else if (isOutro) {
      sectionBlock.classList.add('section-outro');
    }
  }

  function appendSectionHeader(container, sectionsFound, headerLine, lineIndex) {
    const sectionName = getSectionName(headerLine);
    const sectionIndex = sectionsFound.length;
    sectionsFound.push({ name: sectionName, index: sectionIndex, lineIndex });

    const activeSectionBlock = document.createElement('div');
    activeSectionBlock.className = 'chord-section-block';
    activeSectionBlock.id = `song-section-${sectionIndex}`;
    applySectionColorClass(activeSectionBlock, sectionName);

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'section-block-header';
    sectionHeader.textContent = sectionName;
    activeSectionBlock.appendChild(sectionHeader);
    container.appendChild(activeSectionBlock);
    return activeSectionBlock;
  }

  function isLineWithLyrics(line) {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (isSectionHeaderLine(trimmed)) return false;

    if (line.includes('[') && line.includes(']')) {
      const parsed = splitBracketedLine(line);
      return parsed.lyricLine.trim() !== '';
    }

    return !isChordLine(line);
  }

  // --- RENDERING CHORD SHEET WITH TRANSPOSITION ---
  function renderChordSheet(song) {
    songSheetContent.innerHTML = '';
    const sectionsFound = renderSheetLines(songSheetContent, song.content || '', currentKeyOffset, song.key);
    renderSectionMenu(sectionsFound);
  }

  function renderSheetContentLine(parentContainer, line, lineIndex, lines, keyOffset, songKey) {
    const trimmedLine = line.trim();

    if (trimmedLine === '') {
      parentContainer.appendChild(document.createElement('br'));
      return lineIndex;
    }

    // Interleaved OCR pair: chord row directly above lyric row (100% scan fidelity)
    if (!line.includes('[') && isChordLine(line)) {
      const nextLine = (lineIndex + 1 < lines.length) ? lines[lineIndex + 1] : null;
      if (nextLine !== null && nextLine.trim() !== '' &&
          !isSectionHeaderLine(nextLine.trim()) &&
          !splitLineLeadingSectionHeader(nextLine.trim()) &&
          !isChordLine(nextLine) && !nextLine.includes('[')) {
        appendInterleavedPair(parentContainer, line, nextLine, keyOffset, songKey);
        return lineIndex + 1;
      }
    }

    if (line.includes('[') && line.includes(']')) {
      const parsed = splitBracketedLine(line);
      if (parsed.hasChords) {
        appendBracketedPair(parentContainer, parsed, keyOffset, songKey);
        return lineIndex;
      }
    }

    appendStandaloneLine(parentContainer, line, isChordLine(line), keyOffset, songKey);
    return lineIndex;
  }

  /**
   * Shared renderer — preserves OCR/interleaved spacing exactly on every view.
   * Interleaved scan (chord row + lyric row) is shown as-is without re-merging.
   */
  function renderSheetLines(container, content, keyOffset, songKey) {
    const lines = content.split('\n');
    const sectionsFound = [];
    let activeSectionBlock = null;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      const trimmedLine = line.trim();

      const splitHeader = splitLineLeadingSectionHeader(trimmedLine);
      if (splitHeader) {
        activeSectionBlock = appendSectionHeader(container, sectionsFound, splitHeader.header, lineIndex);
        if (splitHeader.rest) {
          lineIndex = renderSheetContentLine(
            activeSectionBlock,
            splitHeader.rest,
            lineIndex,
            lines,
            keyOffset,
            songKey
          );
        }
        continue;
      }

      if (isSectionHeaderLine(trimmedLine)) {
        activeSectionBlock = appendSectionHeader(container, sectionsFound, trimmedLine, lineIndex);
        continue;
      }

      const parentContainer = activeSectionBlock || container;
      lineIndex = renderSheetContentLine(parentContainer, line, lineIndex, lines, keyOffset, songKey);
    }

    return sectionsFound;
  }

  function appendInterleavedPair(parent, chordLine, lyricLine, keyOffset, songKey) {
    const pair = document.createElement('div');
    pair.className = 'chord-lyric-pair';

    const chordDiv = document.createElement('div');
    chordDiv.className = 'chord-only-line';
    chordDiv.textContent = transposeChordLine(chordLine, keyOffset, songKey);

    const lyricDiv = document.createElement('div');
    lyricDiv.className = 'lyric-only-line';
    lyricDiv.textContent = lyricLine;

    pair.appendChild(chordDiv);
    pair.appendChild(lyricDiv);
    parent.appendChild(pair);
  }

  function appendBracketedPair(parent, parsed, keyOffset, songKey) {
    const pair = document.createElement('div');
    pair.className = 'chord-lyric-pair';

    const chordDiv = document.createElement('div');
    chordDiv.className = 'chord-only-line';
    chordDiv.textContent = transposeChordLine(parsed.chordLine, keyOffset, songKey);
    pair.appendChild(chordDiv);

    const lyricText = parsed.lyricLine;
    if (lyricText.trim() !== '' && !isProgressionOnlyLyric(lyricText)) {
      const lyricDiv = document.createElement('div');
      lyricDiv.className = 'lyric-only-line';
      lyricDiv.textContent = lyricText;
      pair.appendChild(lyricDiv);
    }

    parent.appendChild(pair);
  }

  function isProgressionOnlyLyric(text) {
    return /^[\s|\-:()]+$/.test(text);
  }

  function appendStandaloneLine(parent, line, isChord, keyOffset, songKey) {
    const lineDiv = document.createElement('div');
    lineDiv.className = 'sheet-standalone-line ' + (isChord ? 'sheet-chord' : 'sheet-lyric');
    lineDiv.textContent = isChord ? transposeChordLine(line, keyOffset, songKey) : line;
    parent.appendChild(lineDiv);
  }

  // --- TRANSPOSE ENGINE MATHEMATICS ---
  function transposeChord(chord, offset, originalSongKey) {
    if (offset === 0) return chord;

    // Handle slashed bass notes (e.g., D/F#) by transposing separately
    if (chord.includes('/')) {
      const parts = chord.split('/');
      return transposeChord(parts[0], offset, originalSongKey) + '/' + transposeChord(parts[1], offset, originalSongKey);
    }

    // Capture Root note (with # or b) and Chord Modifiers (e.g. C#maj9 -> root: C#, mod: maj9)
    const chordPattern = /^([A-Ga-g][#b]?)(.*)$/;
    const match = chord.match(chordPattern);
    if (!match) return chord;

    const root = match[1].toUpperCase();
    const modifier = match[2];

    // Find current pitch value (index 0 - 11)
    let pitchIndex = getPitchIndex(root);

    if (pitchIndex === -1) return chord; // Fallback if still unrecognized

    // Add transposition offset
    let targetIndex = (pitchIndex + offset) % 12;
    if (targetIndex < 0) targetIndex += 12;

    const transposedRoot = KEY_SCALES[targetIndex];
    return transposedRoot + modifier;
  }

  // --- IN-PLACE CHORD ALIGNMENT HELPERS ---
  function isChordLine(line) {
    if (!line.trim()) return false;
    if (/[ก-๙]/.test(line)) return false;

    // Clean common section headers from the line to avoid misidentifying them as non-chords
    let cleanLine = line.replace(/(?:\b(?:intro|instru|outro|solo|verse|chorus|bridge|pre-chorus|hook)\b)/gi, '');

    const tokens = cleanLine.trim().split(/\s+/);
    let chordCount = 0;
    let otherCount = 0;
    const chordRegex = /^[A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?$/i;

    tokens.forEach(token => {
      const cleanToken = token.replace(/[|\-\(\)\:\[\]]/g, '').trim();
      if (!cleanToken) return;
      if (chordRegex.test(cleanToken)) {
        chordCount++;
      } else {
        otherCount++;
      }
    });

    return chordCount > 0 && chordCount >= otherCount;
  }

  function splitBracketedLine(line) {
    const segmentRegex = /\[([^\]]+)\]|([^\[]+)/g;
    let match;
    let chordLine = '';
    let lyricLine = '';

    function getVisualLength(str) {
      return str.replace(/[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/g, '').length;
    }

    while ((match = segmentRegex.exec(line)) !== null) {
      if (match[0] === '') break;

      if (match[1] !== undefined) {
        const chord = match[1];
        const targetVisualPos = getVisualLength(lyricLine);
        const currentChordVisualPos = getVisualLength(chordLine);

        if (currentChordVisualPos < targetVisualPos) {
          chordLine += ' '.repeat(targetVisualPos - currentChordVisualPos);
        } else if (currentChordVisualPos > targetVisualPos) {
          chordLine += ' ';
        }
        chordLine += chord;
      } else if (match[2] !== undefined) {
        lyricLine += match[2];
      }
    }

    return {
      hasChords: chordLine.trim().length > 0,
      chordLine,
      lyricLine
    };
  }

  function transposeChordLine(line, offset, originalKey) {
    if (offset === 0) return line;

    const chordRegex = /\b([A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?)(?=\s|\||\-|\(|\)|$)/gi;
    let match;
    const chords = [];

    while ((match = chordRegex.exec(line)) !== null) {
      chords.push({
        chord: match[1],
        index: match.index
      });
    }

    if (chords.length === 0) return line;

    let result = '';
    let currentPos = 0;

    chords.forEach(c => {
      const transposed = transposeChord(c.chord, offset, originalKey);

      if (currentPos > c.index) {
        result += ' ';
        currentPos = result.length;
      } else {
        result += ' '.repeat(c.index - currentPos);
        currentPos = c.index;
      }

      result += transposed;
      currentPos += transposed.length;
    });

    const lastChord = chords[chords.length - 1];
    const originalLastChordEnd = lastChord.index + lastChord.chord.length;
    if (originalLastChordEnd < line.length) {
      result += line.substring(originalLastChordEnd);
    }

    return result;
  }

  // --- TRANSPOSE UI MODAL GRID (Screenshot 3) ---
  function openTransposeModal() {
    const song = songs.find(s => s.id === currentSongId);
    if (!song) return;

    const gridContainer = document.getElementById('transpose-grid-container');
    gridContainer.innerHTML = '';

    const match = song.key.match(/^([A-G][#b]?)(.*)$/);
    const root = match ? match[1] : 'C';
    const modifier = match ? match[2] : '';
    const originalIndex = getPitchIndex(root);

    // Create 12 buttons inside transpose grid
    KEY_SCALES.forEach(key => {
      const keyIndex = KEY_SCALES.indexOf(key);

      let offset = keyIndex - originalIndex;
      if (offset > 6) offset -= 12;
      if (offset <= -6) offset += 12;

      const offsetText = offset === 0 ? 'Ori' : (offset > 0 ? `+${offset}` : `${offset}`);
      const keyName = key + modifier;

      const item = document.createElement('div');
      item.className = `key-grid-item ${currentKeyOffset === offset ? 'active' : ''}`;
      item.innerHTML = `
        <div class="key-name">${keyName}</div>
        <div class="key-offset">(${offsetText})</div>
      `;

      item.addEventListener('click', () => {
        currentKeyOffset = offset;
        btnKeyTranspose.querySelector('.transpose-display-val').textContent = `${keyName} (${offsetText})`;
        renderChordSheet(song);
        closeAllModals();
      });

      gridContainer.appendChild(item);
    });

    openModal('transpose');
  }

  // --- INTERACTIVE AUTOSCROLLER ENGINE ---
  function toggleAutoscroll() {
    if (isScrolling) {
      stopAutoscroll();
    } else {
      startAutoscroll();
    }
  }

  function startAutoscroll() {
    if (isScrolling) return;
    isScrolling = true;
    btnAutoscroll.classList.add('active');
    btnAutoscroll.querySelector('.btn-label').textContent = 'Stop Autoscroll';

    // Display Speed Range Slider
    autoscrollSpeedControl.classList.remove('hidden');

    lastScrollTime = performance.now();
    scrollFrameId = requestAnimationFrame(scrollStep);
  }

  function stopAutoscroll() {
    isScrolling = false;
    btnAutoscroll.classList.remove('active');
    btnAutoscroll.querySelector('.btn-label').textContent = 'Autoscroll';
    autoscrollSpeedControl.classList.add('hidden');
    if (scrollFrameId) cancelAnimationFrame(scrollFrameId);
    scrollFrameId = null;
  }

  function getMainScrollContainer() {
    const mainContent = document.querySelector('.app-main-content');
    return mainContent || document.scrollingElement || document.documentElement;
  }

  function scrollStep(timestamp) {
    if (!isScrolling) return;

    const elapsed = timestamp - lastScrollTime;
    lastScrollTime = timestamp;

    const mainContent = getMainScrollContainer();
    if (mainContent) {
      // Calculate pixels to scroll based on speed slider value (pixels/second)
      const speedPxPerSec = Math.max(1, Number(autoscrollSpeed) || 1);
      const scrollAmount = (speedPxPerSec * elapsed) / 1000;
      mainContent.scrollTop += scrollAmount;

      // Auto stop when reaching bottom
      const maxScrollTop = Math.max(0, mainContent.scrollHeight - mainContent.clientHeight);
      if (mainContent.scrollTop >= maxScrollTop - 1) {
        stopAutoscroll();
        return;
      }
    }

    scrollFrameId = requestAnimationFrame(scrollStep);
  }

  // --- SECTION NAVIGATION JUMPER ---
  function renderSectionMenu(sections) {
    sectionsMenuList.innerHTML = '';

    if (sections.length === 0) {
      btnSections.classList.add('hidden');
      return;
    }

    btnSections.classList.remove('hidden');

    // Populate label with first section name
    btnSections.querySelector('.section-val').textContent = sections[0].name;

    sections.forEach((sec, index) => {
      const btn = document.createElement('button');
      btn.className = 'section-menu-item';
      btn.textContent = sec.name;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Close dropdown
        sectionsMenuList.style.display = 'none';

        // Find section element
        const secElement = document.getElementById(`song-section-${index}`);
        if (secElement) {
          const scrollContainer = getMainScrollContainer();
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const elemRect = secElement.getBoundingClientRect();
            const targetScrollTop = scrollContainer.scrollTop + (elemRect.top - containerRect.top) - 10;

            scrollContainer.scrollTo({
              top: targetScrollTop,
              behavior: 'smooth'
            });
          } else {
            secElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          btnSections.querySelector('.section-val').textContent = sec.name;

          // Temporary flash visual pulse to show user where they are
          secElement.classList.add('highlighted-section');
          setTimeout(() => {
            secElement.classList.remove('highlighted-section');
          }, 1500);
        }
        sectionsMenuList.style.display = 'none';
      });

      sectionsMenuList.appendChild(btn);
    });
  }

  // --- WEB AUDIO API POWERED METRONOME ---
  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function toggleMetronome() {
    initAudio();
    if (isMetronomePlaying) {
      stopMetronome();
    } else {
      startMetronome();
    }
  }

  function startMetronome() {
    if (!audioCtx) return;
    isMetronomePlaying = true;
    btnMetronome.classList.add('active');
    btnMetronome.querySelector('.btn-label').textContent = 'Metronome (ON)';

    currentBeat = 0;
    const intervalMs = (60 / metronomeBpm) * 1000;

    playMetronomeTick(); // First beat immediately
    metronomeIntervalId = setInterval(playMetronomeTick, intervalMs);
  }

  function stopMetronome() {
    isMetronomePlaying = false;
    btnMetronome.classList.remove('active');
    btnMetronome.querySelector('.btn-label').textContent = 'Metronome';
    if (metronomeIntervalId) clearInterval(metronomeIntervalId);
    metronomePulse.classList.remove('active');
  }

  function playMetronomeTick() {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    // Beat 1 sounds higher pitched than Beats 2,3,4
    const isFirstBeat = currentBeat % 4 === 0;
    osc.frequency.value = isFirstBeat ? 1000 : 600;

    // Fast volume envelope decay
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.1);

    // Visual pulse sync flash
    metronomePulse.classList.add('active');
    setTimeout(() => {
      metronomePulse.classList.remove('active');
    }, 100);

    currentBeat++;
  }

  // --- PLAYLIST ACTIONS ---
  function createNewPlaylist() {
    const input = document.getElementById('playlist-name-input');
    const name = input.value.trim();
    if (!name) return;

    const id = 'pl_' + Date.now();
    const newPlaylist = {
      id: id,
      name: name,
      songs: []
    };

    playlists.push(newPlaylist);
    savePlaylistsToStorage();
    renderSidebar();

    input.value = '';
    closeAllModals();
  }

  function openAddToPlaylistModal(songId) {
    const container = document.getElementById('add-playlist-picker-list');
    container.innerHTML = '';

    playlists.forEach(pl => {
      if (!pl.songs) pl.songs = [];
      const isSongInPlaylist = pl.songs.includes(songId);
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

      row.innerHTML = `
        <span>${escapeHtml(pl.name)}</span>
        <button class="btn btn-secondary btn-sm" style="padding: 4px 10px; font-size: 12px;">
          ${isSongInPlaylist ? '❌ ลบออก' : '➕ เพิ่มเข้า'}
        </button>
      `;

      row.querySelector('button').onclick = () => {
        if (!pl.songs) pl.songs = [];
        if (isSongInPlaylist) {
          pl.songs = pl.songs.filter(id => id !== songId);
        } else {
          pl.songs.push(songId);
        }
        savePlaylistsToStorage();
        openAddToPlaylistModal(songId); // reload layout
        renderSidebar();
        renderLibrary();
      };

      container.appendChild(row);
    });

    // Make sure to set a footer to let them close the modal
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn btn-secondary';
    closeBtn.style.marginTop = '16px';
    closeBtn.style.width = '100%';
    closeBtn.textContent = 'เสร็จสิ้น';
    closeBtn.onclick = closeAllModals;
    container.appendChild(closeBtn);

    openModal('playlist');
    document.getElementById('modal-playlist').querySelector('.modal-title').textContent = 'จัดเข้าลิสต์เพลง';
    // hide name inputs
    document.getElementById('playlist-creator-inputs').classList.add('hidden');
    document.getElementById('add-playlist-picker-list').classList.remove('hidden');
  }

  // --- SHARE DIALOG (QR & WEB SHARE) ---
  function openShareModal() {
    const song = songs.find(s => s.id === currentSongId);
    if (!song) return;

    document.getElementById('share-song-title').textContent = song.title;

    // Generate Share Link (Encodes entire song object as base64 into hash!)
    const songString = JSON.stringify(song);
    const compressed = btoa(unescape(encodeURIComponent(songString)));
    const shareLink = `${window.location.origin}${window.location.pathname}#import=${compressed}`;

    // Web Share API
    const shareBtn = document.getElementById('btn-trigger-webshare');
    shareBtn.onclick = async () => {
      try {
        if (navigator.share) {
          await navigator.share({
            title: `แชร์คอร์ดเพลง - ${song.title}`,
            text: `แกะคอร์ด เปลี่ยนคีย์คอร์เพลง ${song.title} โดย ${song.artist} ได้ง่ายๆ!`,
            url: shareLink
          });
        } else {
          // clipboard copy fallback
          await navigator.clipboard.writeText(shareLink);
          alert('คัดลอกลิงก์สำหรับเปิดเพลงนี้ไปยัง Clipboard เรียบร้อยแล้ว!');
        }
      } catch (err) {
        console.error(err);
      }
    };

    // PNG file export
    const exportFileBtn = document.getElementById('btn-export-png-file');
    exportFileBtn.onclick = async () => {
      exportFileBtn.disabled = true;
      const originalText = exportFileBtn.innerHTML;
      exportFileBtn.innerHTML = '<span>⏳ กำลังสร้างรูปภาพ...</span>';
      try {
        const container = document.querySelector('.song-view-container');
        const canvasObj = await html2canvas(container, {
          backgroundColor: '#121212',
          scale: 2
        });
        const dataUrl = canvasObj.toDataURL('image/png');
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataUrl);
        downloadAnchor.setAttribute("download", `${song.id}-chord-sheet.png`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } catch (err) {
        console.error('Export PNG failed:', err);
        alert('เกิดข้อผิดพลาดในการสร้างไฟล์รูปภาพ');
      } finally {
        exportFileBtn.disabled = false;
        exportFileBtn.innerHTML = originalText;
      }
    };

    openModal('share');
  }

  // --- CRAWLER / IMPORTER ENGINE ---
  function handleCrawlerImport() {
    const rawHTML = document.getElementById('crawler-paste-area').value;
    if (!rawHTML.trim()) {
      alert('กรุณาวางเนื้อหาหน้าเว็บเพื่อทำการดึงคอร์ดเพลง!');
      return;
    }

    try {
      let title = "เพลงนำเข้าใหม่";
      let artist = "ไม่ระบุศิลปิน";
      let chordsText = "";

      // Smart Converter Algorithm
      // Detect if they pasted HTML or raw preformatted text
      if (rawHTML.includes('<') && rawHTML.includes('>')) {
        // Simple HTML parser
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHTML, 'text/html');

        // Try to extract title & artist
        const h1 = doc.querySelector('h1');
        if (h1) title = h1.textContent.trim();

        const h2 = doc.querySelector('h2');
        if (h2) artist = h2.textContent.trim();

        // Extract chords - chords are usually in <pre> tags
        const pres = doc.querySelectorAll('pre');
        if (pres.length > 0) {
          pres.forEach(pre => {
            chordsText += pre.textContent + '\n';
          });
        } else {
          // fallback to body text
          chordsText = doc.body.innerText;
        }
      } else {
        // raw plain text paste
        chordsText = rawHTML;

        // try to parse title/artist from first lines
        const lines = rawHTML.split('\n');
        if (lines.length > 0 && lines[0].includes(' - ')) {
          const parts = lines[0].split(' - ');
          artist = parts[0].trim();
          title = parts[1].trim();
        } else if (lines.length > 1) {
          title = lines[0].trim();
          artist = lines[1].trim();
        }
      }

      // Populate Admin editor fields with these extracted values!
      const bracketedContent = convertInterleavedToBrackets(chordsText);

      // Populate Admin editor fields with these extracted values!
      adminTitle.value = title;
      adminArtist.value = artist;
      setAdminKeyValue("C");
      adminTempo.value = 90;
      adminContent.value = bracketedContent;

      activeAdminSongId = null; // New song
      uploadedImageBase64 = null;

      closeAllModals();
      updateAdminPreview();
      showView('admin');
    } catch (err) {
      alert('การดึงคอร์ดเพลงขัดข้อง กรุณาลองใช้วิธีวางเฉพาะข้อความเนื้อร้องคอร์ดเพลง');
      console.error(err);
    }
  }

  // --- OCR IMAGE TO CHORD EXTRACTOR ENGINE ---
  function resetOcrUi() {
    lastOcrScannedText = '';
    if (ocrInsertRow) ocrInsertRow.style.display = 'none';
    if (btnOcrInsert) btnOcrInsert.classList.remove('pulse-blink');
  }

  function showOcrInsertReady(normalizedText) {
    lastOcrScannedText = normalizedText;
    if (ocrInsertRow) ocrInsertRow.style.display = 'block';
    if (btnOcrInsert) btnOcrInsert.classList.add('pulse-blink');
  }

  async function handleOcrExtraction() {
    const fileInput = ocrImageInput;
    const file = fileInput ? fileInput.files[0] : null;
    if (!file) {
      alert('กรุณาเลือกไฟล์รูปภาพก่อนเริ่มสแกนคอร์ด!');
      return;
    }

    resetOcrUi();
    await handleGeminiOcr(file);
  }

  async function handleGeminiOcr(file) {
    const apiKey = ocrGeminiKey.value.trim();
    if (!apiKey) {
      alert('กรุณากรอก Gemini API Key เพื่อเปิดใช้งานระบบสแกนอัจฉริยะ (100% Accuracy)\nสามารถขอรับคีย์ฟรีได้จากลิ้งก์ข้างช่องกรอกข้อมูล');
      return;
    }

    ocrStatusContainer.style.display = 'block';
    if (ocrInsertRow) ocrInsertRow.style.display = 'none';
    ocrStatusText.textContent = 'กำลังส่งวิเคราะห์ด้วย Gemini AI...';
    ocrPercentText.textContent = '10%';
    ocrProgressBar.style.width = '10%';
    btnOcrStart.disabled = true;

    // Simulate progress animation
    let progress = 10;
    const progressInterval = setInterval(() => {
      if (progress < 90) {
        progress += Math.floor(Math.random() * 8) + 2;
        if (progress > 90) progress = 90;
        ocrPercentText.textContent = `${progress}%`;
        ocrProgressBar.style.width = `${progress}%`;
      }
    }, 400);

    try {
      // 1. Read file as Base64 Data URL
      const base64DataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = err => reject(err);
        reader.readAsDataURL(file);
      });

      // Extract mime type and raw base64 data
      const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        throw new Error('ไม่สามารถแปลงรูปภาพให้อยู่ในรูปแบบ Base64 ได้');
      }
      const mimeType = matches[1];
      const base64Data = matches[2];

      // 2. Call Gemini API endpoint (using gemini-2.5-flash)
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const promptText = `You are a professional music transcription assistant.
Your task is to transcribe the lyrics and chords from the provided image of a chord sheet, and identify the starting key and estimated tempo (BPM).

CRITICAL LAYOUT RULES — match the printed sheet 100%:
- Use TWO separate lines for each lyric phrase: Line 1 = chord row, Line 2 = lyric row directly underneath.
- Preserve EXACT horizontal spacing with spaces so each chord sits above the correct syllable/word.
- Do NOT embed chords in brackets on the same line as lyrics.
- For chord-only rows (Intro, Outro, Instruments, progressions like "| G | Em |"), output a SINGLE line only.
- Preserve ALL blank lines and indentation exactly as in the image.
- Section labels on their own line as: [section: Intro], [section: Verse], etc.

Example output format:
[section: Verse]
G        Em       C
You know I can't smile without you
| Gmaj9 | Em7 |

You MUST return a JSON object with the exact structure:
{
  "key": "The starting key of the song (e.g., C, G, Am, F#m, Dm). If not explicitly written, analyze the chords to determine the key.",
  "bpm": "The tempo/speed of the song in BPM as an integer. If not explicitly written, estimate it based on the song's style or known recordings (default to 90 if completely unknown).",
  "transcription": "The full transcription using the two-line chord-above-lyric layout described above. Use \\n for newlines."
}

Ensure your response is valid JSON. Do NOT include markdown code block wrappers (like \`\`\`json) or extra text outside the JSON.`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: promptText
                },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                  }
                }
              ]
            }
          ]
        })
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        const errMsg = errJson.error ? errJson.error.message : 'API Response status code: ' + response.status;
        throw new Error(errMsg);
      }

      const resData = await response.json();

      let extractedText = '';
      if (resData.candidates && resData.candidates[0] && resData.candidates[0].content && resData.candidates[0].content.parts[0]) {
        extractedText = resData.candidates[0].content.parts[0].text;
      }

      if (!extractedText || !extractedText.trim()) {
        throw new Error('ไม่ได้รับข้อมูลผลลัพธ์กลับจาก Gemini AI');
      }

      // Clean markdown tags if the AI returned them despite the prompt
      let cleanedText = extractedText.trim();
      if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
      }

      let parsedJson = null;
      try {
        parsedJson = JSON.parse(cleanedText);
      } catch (e) {
        console.warn('Gemini response is not valid JSON, using regex fallback', e);
      }

      let transcriptionText = '';
      let detectedKey = null;
      let detectedBpm = null;

      if (parsedJson) {
        transcriptionText = parsedJson.transcription || '';
        detectedKey = parsedJson.key || null;
        detectedBpm = parseInt(parsedJson.bpm) || null;
      } else {
        // Fallback using Regex
        transcriptionText = cleanedText;
        
        // Attempt to extract transcription block from JSON-like text
        const transMatch = cleanedText.match(/"transcription"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"|\s*})/);
        if (transMatch) {
          transcriptionText = transMatch[1]
            .replace(/\\n/g, '\n')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
        }

        const keyMatch = cleanedText.match(/"key"\s*:\s*"([^"]+)"/);
        if (keyMatch) {
          detectedKey = keyMatch[1];
        }

        const bpmMatch = cleanedText.match(/"bpm"\s*:\s*"?(\d+)"?/);
        if (bpmMatch) {
          detectedBpm = parseInt(bpmMatch[1]);
        }
      }

      // Store in state variables
      ocrDetectedKey = detectedKey;
      ocrDetectedBpm = detectedBpm;
      
      let statusMsg = 'สแกนรูปภาพสำเร็จด้วย AI!';
      if (detectedKey || detectedBpm) {
        statusMsg += ` (พบคีย์ตั้งต้น: ${detectedKey || 'ไม่ระบุ'}, ความเร็ว: ${detectedBpm || 'ไม่ระบุ'} BPM)`;
      }
      ocrStatusText.textContent = statusMsg;
      ocrPercentText.textContent = '100%';
      ocrProgressBar.style.width = '100%';

      const normalized = normalizeOcrContentForDisplay(transcriptionText.trim());
      showOcrInsertReady(normalized);
    } catch (err) {
      clearInterval(progressInterval);
      alert('การแปลงคอร์ดด้วย Gemini AI ล้มเหลว: ' + err.message);
      console.error('Gemini AI Error:', err);
      ocrStatusText.textContent = 'การประมวลผลล้มเหลว';
    } finally {
      btnOcrStart.disabled = false;
    }
  }

  function insertOcrContentDirectly(text) {
    if (!text || !text.trim()) return;

    // Ask user for confirmation
    if (adminContent.value.trim() && !confirm('มีเนื้อหาเดิมอยู่ในตัวแก้ไขอยู่แล้ว ต้องการเขียนทับด้วยข้อมูลจาก OCR ใช่หรือไม่?')) {
      return;
    }

    // Both Local OCR and AI scan: preserve exact scanned layout (100% like the image)
    adminContent.value = normalizeOcrContentForDisplay(text);
    
    if (ocrDetectedKey) {
      setAdminKeyValue(ocrDetectedKey);
    }

    if (ocrDetectedBpm) {
      adminTempo.value = ocrDetectedBpm;
    }

    updateAdminPreview();
    ocrStatusContainer.style.display = 'none';
    ocrImageInput.value = '';
    resetOcrUi();
    alert('นำข้อมูล OCR และวิเคราะห์คีย์/ความเร็วเพลงเข้าสู่ตัวแก้ไขเรียบร้อยแล้ว!');
  }

  /**
   * Normalize OCR/AI output to interleaved chord-row + lyric-row layout for faithful display.
   * Bracket-inline lines (legacy AI format) are split into two rows without re-merging spacing.
   */
  function normalizeOcrContentForDisplay(text) {
    if (!text || !text.trim()) return text;

    const lines = text.split('\n');
    const output = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed === '') {
        output.push(line);
        continue;
      }

      const splitHeader = splitLineLeadingSectionHeader(trimmed);
      if (splitHeader) {
        output.push(splitHeader.header);
        if (splitHeader.rest) {
          output.push(splitHeader.rest);
        }
        continue;
      }

      if (isSectionHeaderLine(trimmed)) {
        output.push(line);
        continue;
      }

      // Bracket-inline line → split to chord row + lyric row (same as render preview)
      if (line.includes('[') && line.includes(']')) {
        const parsed = splitBracketedLine(line);
        if (parsed.hasChords) {
          output.push(parsed.chordLine);
          if (parsed.lyricLine.trim() !== '' && !isProgressionOnlyLyric(parsed.lyricLine)) {
            output.push(parsed.lyricLine);
          }
          continue;
        }
      }

      output.push(line);
    }

    return output.join('\n');
  }

  // --- THE MERGING CONVERTER ALGORITHM (Interleaved -> Bracketed) ---
  function convertInterleavedToBrackets(text) {
    const lines = text.split('\n');
    const processedLines = [];



    const sectionKeywords = ['intro', 'hook', 'verse', 'chorus', 'solo', 'outro', 'outtro', 'instruments', 'instrumental', 'bridge', 'อินโทร', 'ฮุค', 'ท่อนร้อง', 'ดนตรี'];

    for (let i = 0; i < lines.length; i++) {
      let current = lines[i];
      const next = (i + 1 < lines.length) ? lines[i + 1] : null;

      const trimmed = current.trim();
      let matchedKeyword = null;
      for (const kw of sectionKeywords) {
        const regex = new RegExp('^(' + kw + ')(?:[:\\s\\d\\-]||$)', 'i');
        const match = trimmed.match(regex);
        if (match) {
          matchedKeyword = match[1];
          break;
        }
      }

      if (matchedKeyword) {
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          // Already in brackets, keep as-is
        } else {
          const rest = trimmed.slice(matchedKeyword.length).trim();
          const cleanKeyword = matchedKeyword.trim();
          if (rest === '' || /^[0-9]+$/.test(rest)) {
            current = `[${trimmed}]`;
          } else {
            processedLines.push(`[${cleanKeyword}]`);
            current = rest.replace(/^[:\-\s/|]+/, '');
          }
        }
      }

      if (isChordLine(current)) {
        // If it's a chord line and has a lyric line directly underneath
        if (next && !isChordLine(next) && next.trim() !== '') {
          // Merge chords from 'current' inline inside brackets in 'next'
          const merged = mergeChordsIntoLyrics(current, next);
          processedLines.push(merged);
          i++; // Skip the next lyric line since we merged it!
        } else {
          // It's a chords-only progression line (like Intro: | C | Am |)
          // Simply wrap each separate chord in brackets
          const bracketedProgression = wrapStandaloneChords(current);
          processedLines.push(bracketedProgression);
        }
      } else {
        // General text or lyrics line without any chords on top
        // Copy as-is
        processedLines.push(current);
      }
    }

    return processedLines.join('\n');
  }

  function mergeChordsIntoLyrics(chordLine, lyricLine) {
    // Find all chord positions and names in the chord row
    const chords = [];
    const regex = /([A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?)/g;
    let match;

    while ((match = regex.exec(chordLine)) !== null) {
      chords.push({
        chord: match[1],
        visualCol: match.index // index in chordLine is exactly its visual column
      });
    }

    if (chords.length === 0) return lyricLine;

    // Helper to map visual column to char index in string
    function getCharIndexAtVisualCol(str, targetVisualCol) {
      let currentVisualCol = 0;
      let charIndex = 0;
      const combiningRegex = /[\u0e31\u0e34-\u0e3a\u0e47-\u0e4e]/;
      
      while (charIndex < str.length && currentVisualCol < targetVisualCol) {
        const char = str[charIndex];
        if (!combiningRegex.test(char)) {
          currentVisualCol++;
        }
        charIndex++;
      }
      
      while (charIndex < str.length && combiningRegex.test(str[charIndex])) {
        charIndex++;
      }
      
      return charIndex;
    }

    // Sort chords left-to-right
    chords.sort((a, b) => a.visualCol - b.visualCol);

    let result = '';
    let lyricCharPtr = 0;

    chords.forEach(c => {
      const targetCharIndex = getCharIndexAtVisualCol(lyricLine, c.visualCol);
      
      // Add text leading up to chord position
      if (targetCharIndex > lyricCharPtr && lyricCharPtr < lyricLine.length) {
        result += lyricLine.substring(lyricCharPtr, targetCharIndex);
        lyricCharPtr = targetCharIndex;
      }

      // Insert brackets chord
      result += `[${c.chord}]`;

      // If chord is placed beyond current lyrics bounds, pad with spacing
      if (targetCharIndex >= lyricLine.length && lyricCharPtr >= lyricLine.length) {
        result += ' ';
      }
    });

    // Add remaining lyrics text
    if (lyricCharPtr < lyricLine.length) {
      result += lyricLine.substring(lyricCharPtr);
    }

    return result;
  }

  function wrapStandaloneChords(line) {
    // Wrap chords inside progression bar lines e.g. | C | Am | -> | [C] | [Am] |
    const regex = /([A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?)/g;
    return line.replace(regex, '[$1]');
  }

  // --- ADMIN CREATOR / EDITOR ---
  function openAdminCreator() {
    activeAdminSongId = null;
    uploadedImageBase64 = null;

    adminTitle.value = '';
    adminArtist.value = '';
    setAdminKeyValue('C');
    adminTempo.value = '90';
    adminContent.value = '';

    if (adminImageUpload) adminImageUpload.value = '';

    ocrImageInput.value = '';
    ocrStatusContainer.style.display = 'none';
    btnOcrStart.disabled = false;
    ocrDetectedKey = null;
    ocrDetectedBpm = null;
    resetOcrUi();

    // Hide delete button for new songs
    const btnAdminDeleteCreator = document.getElementById('btn-admin-delete');
    if (btnAdminDeleteCreator) {
      btnAdminDeleteCreator.style.display = 'none';
    }

    updateAdminPreview();
    showView('admin');
  }

  function openAdminEditor(song) {
    activeAdminSongId = song.id;
    uploadedImageBase64 = song.imageBase64 || null;

    adminTitle.value = song.title || '';
    adminArtist.value = song.artist || '';
    setAdminKeyValue(song.key);
    adminTempo.value = song.tempo || 90;
    adminContent.value = song.content || '';

    if (adminImageUpload) adminImageUpload.value = '';

    ocrImageInput.value = '';
    ocrStatusContainer.style.display = 'none';
    btnOcrStart.disabled = false;
    ocrDetectedKey = null;
    ocrDetectedBpm = null;
    resetOcrUi();

    // Show delete button when editing an existing song
    const btnAdminDeleteEditor = document.getElementById('btn-admin-delete');
    if (btnAdminDeleteEditor) {
      btnAdminDeleteEditor.style.display = '';
    }

    updateAdminPreview();
    showView('admin');
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      uploadedImageBase64 = event.target.result;
      alert('อัพโหลดรูปภาพประกอบสำเร็จ! ระบบจะทำการเซฟเมื่อกดบันทึกเพลง');
    };
    reader.readAsDataURL(file);
  }

  function updateAdminPreview() {
    // Fake render preview in splitscreen admin dashboard
    const tempSong = {
      title: adminTitle.value || 'ชื่อเพลง',
      artist: adminArtist.value || 'ศิลปิน',
      key: adminKey.value || 'C',
      tempo: parseInt(adminTempo.value) || 90,
      content: adminContent.value || ''
    };

    const previewContainer = adminPreviewContent;
    previewContainer.innerHTML = '';

    // Create minimal mock song viewer layout in preview pane
    const header = document.createElement('div');
    header.style.marginBottom = '20px';
    header.innerHTML = `
      <h3 style="font-size:22px; font-family:var(--font-display); font-weight:700; margin-bottom:8px;">
        ${escapeHtml(tempSong.title)} : <span style="font-size:16px; color:var(--text-secondary); font-weight:500;">${escapeHtml(tempSong.artist)}</span>
      </h3>
      <span class="card-key">${tempSong.key}</span>
      <span style="font-size:12px; margin-left:10px; color:var(--text-muted);">♩ ${tempSong.tempo}</span>
    `;
    previewContainer.appendChild(header);

    const sheet = document.createElement('div');
    sheet.className = 'chord-sheet-container';
    sheet.style.padding = '16px';
    sheet.style.fontSize = '14px';
    sheet.id = 'admin-sheet-preview-scroller';

    renderSheetLines(sheet, tempSong.content, 0, tempSong.key);

    previewContainer.appendChild(sheet);
  }

  function saveAdminSong() {
    const title = adminTitle ? adminTitle.value.trim() : '';
    const artist = adminArtist ? adminArtist.value.trim() : '';
    if (!title || !artist) {
      alert('กรุณากรอกชื่อเพลงและชื่อศิลปิน!');
      return;
    }

    const key = adminKey ? adminKey.value.trim() : 'C';
    const tempo = adminTempo ? (parseInt(adminTempo.value) || 90) : 90;
    const timeSignature = adminTime ? adminTime.value.trim() : "4/4";
    const duration = adminDuration ? adminDuration.value.trim() : "0:00";
    const tags = adminTags ? adminTags.value.split(',').map(t => t.trim()).filter(t => t) : [];
    const content = adminContent ? adminContent.value : '';

    if (activeAdminSongId) {
      // Edit existing
      const songIndex = songs.findIndex(s => s.id === activeAdminSongId);
      if (songIndex !== -1) {
        songs[songIndex] = {
          ...songs[songIndex],
          title, artist, key, tempo, content,
          imageBase64: uploadedImageBase64
        };
        if (adminTime) songs[songIndex].timeSignature = timeSignature;
        if (adminDuration) songs[songIndex].duration = duration;
        if (adminTags) songs[songIndex].tags = tags;
      }
    } else {
      // Create new
      const id = title.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
      const newSong = {
        id, title, artist, key, tempo, timeSignature, duration, tags, content,
        imageBase64: uploadedImageBase64
      };
      songs.push(newSong);
    }

    saveSongsToStorage();
    renderSidebar();
    renderLibrary();

    // Redirect to active song
    const savedId = activeAdminSongId || (songs.length > 0 ? songs[songs.length - 1].id : null);
    if (savedId) {
      showSong(savedId);
    } else {
      showView('library');
    }
  }

  function deleteSong(songId) {
    if (!confirm('คุณแน่ใจว่าต้องการลบเพลงนี้ออกจาระบบอย่างถาวรใช่หรือไม่?')) return;

    songs = songs.filter(s => s.id !== songId);
    saveSongsToStorage();

    // Remove from playlists
    playlists.forEach(pl => {
      if (pl.songs) {
        pl.songs = pl.songs.filter(id => id !== songId);
      }
    });
    savePlaylistsToStorage();

    currentSongId = null;
    renderSidebar();
    renderLibrary();
    showView('library');
  }

  // --- IMPORT SONGS FROM URL HASH ON LAUNCH ---
  window.addEventListener('hashchange', checkUrlImport);

  function checkUrlImport() {
    const hash = window.location.hash;
    if (hash.startsWith('#import=')) {
      try {
        const compressed = hash.substring(8);
        const songString = decodeURIComponent(escape(atob(compressed)));
        const importedSong = JSON.parse(songString);

        if (importedSong && importedSong.id) {
          const urlParams = new URLSearchParams(window.location.search);
          const isDownloadMode = urlParams.get('download') === 'true';

          if (isDownloadMode) {
            // Import silently
            const exists = songs.find(s => s.id === importedSong.id);
            if (exists) {
              songs = songs.filter(s => s.id !== importedSong.id);
            }
            songs.push(importedSong);
            saveSongsToStorage();

            // Clean address bar to prevent infinite loops on reload
            try {
              window.history.replaceState(null, '', window.location.pathname);
            } catch (e) {
              window.location.hash = '';
            }

            renderSidebar();
            renderLibrary();
            showSong(importedSong.id);

            // Trigger auto download of PNG
            triggerAutoDownloadPng(importedSong);
          } else {
            // Confirm import
            if (confirm(`พบข้อมูลเพลงแชร์ร่วมกัน [${importedSong.title} - ${importedSong.artist}] ต้องการนำเข้าสู่คลังเพลงท้องถิ่นใช่หรือไม่?`)) {
              const exists = songs.find(s => s.id === importedSong.id);
              if (exists) {
                songs = songs.filter(s => s.id !== importedSong.id);
              }
              songs.push(importedSong);
              saveSongsToStorage();

              window.location.hash = '';

              renderSidebar();
              renderLibrary();
              showSong(importedSong.id);
            }
          }
        }
      } catch (err) {
        console.error('URL parse failed', err);
      }
    }
  }

  async function triggerAutoDownloadPng(song) {
    // Create beautiful loader overlay matching premium theme
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(18, 18, 18, 0.95)';
    overlay.style.backdropFilter = 'blur(10px)';
    overlay.style.display = 'flex';
    overlay.style.flexDirection = 'column';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.color = '#ffffff';
    overlay.style.fontFamily = 'var(--font-display)';

    overlay.innerHTML = `
      <div style="font-size: 40px; margin-bottom: 20px; animation: spin 2s linear infinite;">⏳</div>
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 8px; color: var(--accent-color);">กำลังดาวน์โหลดคอร์ดเพลง...</h2>
      <p style="color: var(--text-secondary); font-size: 14px;">ระบบกำลังสร้างไฟล์รูปภาพ PNG สำหรับเพลง "${escapeHtml(song.title)}"</p>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(overlay);

    // Wait a brief moment for the song sheet to render completely
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const container = document.querySelector('.song-view-container');
      const canvasObj = await html2canvas(container, {
        backgroundColor: '#121212',
        scale: 2
      });
      const dataUrl = canvasObj.toDataURL('image/png');
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataUrl);
      downloadAnchor.setAttribute("download", `${song.id}-chord-sheet.png`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err) {
      console.error('Auto Export PNG failed:', err);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดรูปภาพโดยอัตโนมัติ');
    } finally {
      overlay.remove();
    }
  }

  // Check on load
  setTimeout(checkUrlImport, 300);

  // --- MODAL TRIGGERS ---
  function openModal(modalId) {
    const m = modals[modalId];
    if (m) {
      // For playlist creator modal, reset views default states
      if (modalId === 'playlist') {
        document.getElementById('playlist-creator-inputs').classList.remove('hidden');
        document.getElementById('add-playlist-picker-list').classList.add('hidden');
        document.getElementById('modal-playlist').querySelector('.modal-title').textContent = 'สร้างลิสต์เพลงใหม่';
      }

      m.classList.add('active');
    }
  }

  function closeAllModals() {
    Object.values(modals).forEach(m => {
      m.classList.remove('active');
    });
  }



  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --- KEY TRANSPOSE ADJ ADJUSTMENTS ---
  function adjustKeyOffset(direction) {
    const song = songs.find(s => s.id === currentSongId);
    if (!song) return;

    currentKeyOffset += direction;
    // Wrap around 12 semitones (-5 to +6 range)
    if (currentKeyOffset < -5) currentKeyOffset += 12;
    if (currentKeyOffset > 6) currentKeyOffset -= 12;

    updateKeyTransposeDisplay();
    renderChordSheet(song);
  }

  function updateKeyTransposeDisplay() {
    const song = songs.find(s => s.id === currentSongId);
    if (!song) return;

    const match = song.key.match(/^([A-G][#b]?)(.*)$/);
    const root = match ? match[1] : 'C';
    const modifier = match ? match[2] : '';
    const originalIndex = getPitchIndex(root);

    let targetIndex = (originalIndex + currentKeyOffset) % 12;
    if (targetIndex < 0) targetIndex += 12;

    const targetKey = KEY_SCALES[targetIndex] + modifier;
    const offsetText = currentKeyOffset === 0 ? 'Ori' : (currentKeyOffset > 0 ? `+${currentKeyOffset}` : `${currentKeyOffset}`);

    btnKeyTranspose.querySelector('.transpose-display-val').textContent = `${targetKey} (${offsetText})`;
  }

  // --- TAG MANAGER OPERATIONS ---
  function openTagManager() {
    renderTagManagerList();
    openModal('tags');
  }

  function renderTagManagerList() {
    tagManagerList.innerHTML = '';

    // Combine all tags from songs and custom tags
    const allTags = new Set();
    songs.forEach(s => {
      if (s && s.tags && Array.isArray(s.tags)) {
        s.tags.forEach(t => allTags.add(t));
      }
    });
    customTags.forEach(t => allTags.add(t));

    if (allTags.size === 0) {
      tagManagerList.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:12px; padding:10px;">ไม่มีหมวดหมู่เพลงขณะนี้</div>`;
      return;
    }

    allTags.forEach(tag => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '6px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

      row.innerHTML = `
        <span style="font-size:14px; font-weight:500;">🏷️ ${escapeHtml(tag)}</span>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-secondary btn-sm" style="padding:4px 8px; font-size:11px;">✏️ แก้ไข</button>
          <button class="btn btn-danger btn-sm" style="padding:4px 8px; font-size:11px;">🗑️ ลบ</button>
        </div>
      `;

      const btns = row.querySelectorAll('button');

      // Rename category
      btns[0].onclick = () => {
        const newName = prompt('แก้ไขชื่อหมวดหมู่:', tag);
        if (newName && newName.trim() && newName.trim() !== tag) {
          const trimmed = newName.trim();

          // 1. Rename in songs tags
          songs.forEach(song => {
            if (song.tags.includes(tag)) {
              song.tags = song.tags.map(t => t === tag ? trimmed : t);
            }
          });
          saveSongsToStorage();

          // 2. Rename in custom tags
          if (customTags.includes(tag)) {
            customTags = customTags.map(t => t === tag ? trimmed : t);
            saveCustomTagsToStorage();
          }

          renderTagManagerList();
          renderSidebar();
          renderLibrary();
        }
      };

      // Delete category
      btns[1].onclick = () => {
        if (confirm(`คุณแน่ใจว่าต้องการลบหมวดหมู่ "${tag}" หรือไม่? (คำร้องคอร์ดเพลงจะไม่สูญหาย หมวดหมู่จะถูกถอดถอนออกจากทุกเพลง)`)) {
          // 1. Filter out from songs tags
          songs.forEach(song => {
            song.tags = song.tags.filter(t => t !== tag);
          });
          saveSongsToStorage();

          // 2. Filter out from custom tags
          customTags = customTags.filter(t => t !== tag);
          saveCustomTagsToStorage();

          if (selectedTag === tag) selectedTag = null; // Reset selection

          renderTagManagerList();
          renderSidebar();
          renderLibrary();
        }
      };

      tagManagerList.appendChild(row);
    });
  }

  function addCategoryFromManager() {
    const val = tagManagerNewInput.value.trim();
    if (!val) return;

    // Check if already exists in either songs or custom tags
    const allTags = new Set();
    songs.forEach(s => s.tags.forEach(t => allTags.add(t)));
    customTags.forEach(t => allTags.add(t));

    if (allTags.has(val)) {
      alert('หมวดหมู่นี้มีอยู่แล้วในระบบ!');
      return;
    }

    customTags.push(val);
    saveCustomTagsToStorage();

    tagManagerNewInput.value = '';
    renderTagManagerList();
    renderSidebar();
    renderLibrary();
  }

  // --- INITIALIZE START ---
  init();
});

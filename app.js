// PakJer Song Playlist & Chord System Core Application Logic

document.addEventListener('DOMContentLoaded', () => {
  // --- APPLICATION STATE ---
  let songs = [];
  let playlists = [];
  
  let currentSongId = null;
  let currentPlaylistId = null;
  let selectedTag = null;
  let currentKeyOffset = 0;
  let currentScaleScalar = 1.0;
  let customTags = [];
  let ocrMode = 'local'; // 'local' or 'ai'
  
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

  // Key scales for transposition matching Screenshot 3
  const KEY_SCALES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

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
  const ocrLanguageSelect = document.getElementById('ocr-language-select');
  const btnOcrStart = document.getElementById('btn-ocr-start');
  const ocrStatusContainer = document.getElementById('ocr-status-container');
  const ocrStatusText = document.getElementById('ocr-status-text');
  const ocrPercentText = document.getElementById('ocr-percent-text');
  const ocrProgressBar = document.getElementById('ocr-progress-bar');
  const ocrResultPreviewContainer = document.getElementById('ocr-result-preview-container');
  const ocrResultPreview = document.getElementById('ocr-result-preview');
  const btnOcrInsert = document.getElementById('btn-ocr-insert');

  const tabOcrLocal = document.getElementById('tab-ocr-local');
  const tabOcrAi = document.getElementById('tab-ocr-ai');
  const ocrLocalParams = document.getElementById('ocr-local-params');
  const ocrAiParams = document.getElementById('ocr-ai-params');
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

  // --- INITIALIZATION ---
  function init() {
    loadDatabase();
    bindEvents();
    
    // Load stored Gemini key
    const savedGeminiKey = localStorage.getItem('pakjer_gemini_key');
    if (savedGeminiKey && ocrGeminiKey) {
      ocrGeminiKey.value = savedGeminiKey;
    }

    renderSidebar();
    renderLibrary();
    showView('library');
  }

  // --- STATE PERSISTENCE ---
  function loadDatabase() {
    // Load Songs
    const storedSongs = localStorage.getItem('pakjer_songs');
    if (storedSongs) {
      songs = JSON.parse(storedSongs);
    } else {
      songs = PRESEEDED_SONGS;
      localStorage.setItem('pakjer_songs', JSON.stringify(songs));
    }

    // Load Playlists
    const storedPlaylists = localStorage.getItem('pakjer_playlists');
    if (storedPlaylists) {
      playlists = JSON.parse(storedPlaylists);
    } else {
      playlists = [
        { id: 'favs', name: 'My Favorites ❤️', songs: ['cant-smile-without-you', '100-reason'] }
      ];
      localStorage.setItem('pakjer_playlists', JSON.stringify(playlists));
    }
    // Load Custom tags
    customTags = JSON.parse(localStorage.getItem('pakjer_custom_tags')) || [];
  }

  function saveSongsToStorage() {
    localStorage.setItem('pakjer_songs', JSON.stringify(songs));
  }

  function savePlaylistsToStorage() {
    localStorage.setItem('pakjer_playlists', JSON.stringify(playlists));
  }

  // --- EVENT BINDING ---
  function bindEvents() {
    // Logo Click (Back to Library)
    document.querySelector('.logo-container').addEventListener('click', () => {
      currentSongId = null;
      currentPlaylistId = null;
      selectedTag = null;
      document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tag-chip').forEach(el => el.classList.remove('active'));
      renderLibrary();
      showView('library');
    });

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
    adminImageUpload.addEventListener('change', handleImageUpload);
    adminContent.addEventListener('input', updateAdminPreview);
    btnAdminSave.addEventListener('click', saveAdminSong);
    btnAdminCancel.addEventListener('click', () => {
      if (currentSongId) {
        showSong(currentSongId);
      } else {
        showView('library');
      }
    });

    // Importer/Crawler Paste Events
    document.getElementById('btn-crawler-convert').addEventListener('click', handleCrawlerImport);

    // OCR Mode Switcher
    tabOcrLocal.addEventListener('click', () => {
      ocrMode = 'local';
      tabOcrLocal.classList.add('active');
      tabOcrAi.classList.remove('active');
      ocrLocalParams.style.display = 'block';
      ocrAiParams.style.display = 'none';
    });

    tabOcrAi.addEventListener('click', () => {
      ocrMode = 'ai';
      tabOcrAi.classList.add('active');
      tabOcrLocal.classList.remove('active');
      ocrLocalParams.style.display = 'none';
      ocrAiParams.style.display = 'block';
    });

    // Storing Gemini API key
    ocrGeminiKey.addEventListener('input', () => {
      localStorage.setItem('pakjer_gemini_key', ocrGeminiKey.value.trim());
    });

    // OCR Action Events
    btnOcrStart.addEventListener('click', handleOcrExtraction);
    btnOcrInsert.addEventListener('click', insertOcrContentToEditor);
  }

  // --- ROUTING / VIEW CHANGING ---
  function showView(viewName) {
    // Reset running utilities when changing views
    if (viewName !== 'song') {
      stopAutoscroll();
      stopMetronome();
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

    // Render Playlists
    playlistList.innerHTML = '';
    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className = `playlist-item ${currentPlaylistId === pl.id ? 'active' : ''}`;
      li.innerHTML = `
        <span>📂 ${escapeHtml(pl.name)}</span>
        <span class="playlist-count">${pl.songs.length}</span>
      `;
      li.addEventListener('click', () => {
        currentPlaylistId = pl.id;
        selectedTag = null;
        currentSongId = null;
        document.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        document.querySelectorAll('.tag-chip').forEach(el => el.classList.remove('active'));
        renderLibrary();
        showView('library');
      });
      playlistList.appendChild(li);
    });

  }

  // --- LIBRARY / SEARCH RENDERING ---
  function renderLibrary() {
    const query = searchInput.value.toLowerCase().trim();
    
    // Filter songs
    let filteredSongs = songs;



    // Filter by Selected Sidebar Playlist
    if (currentPlaylistId) {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      if (pl) {
        filteredSongs = filteredSongs.filter(s => pl.songs.includes(s.id));
      }
    }

    // Filter by Text Query
    if (query) {
      filteredSongs = filteredSongs.filter(s => 
        s.title.toLowerCase().includes(query) || 
        s.artist.toLowerCase().includes(query)
      );
    }

    // Render title text and actions
    const plActions = document.getElementById('playlist-actions-container');
    const titleText = document.getElementById('library-title-text');
    const subtitleText = document.getElementById('library-subtitle-text');

    if (currentPlaylistId) {
      const pl = playlists.find(p => p.id === currentPlaylistId);
      titleText.textContent = pl ? pl.name : 'ลิสต์เพลง';
      subtitleText.textContent = `รวมเพลงในลิสต์ทั้งหมด ${filteredSongs.length} เพลง`;
      plActions.classList.remove('hidden');
    } else {
      plActions.classList.add('hidden');
      titleText.textContent = 'คลังเพลงของฉัน';
      subtitleText.textContent = `ค้นหาคอร์ด จัดลิสต์เพลง และแชร์เพลงร่วมกันทั้งหมด ${filteredSongs.length} เพลง`;
    }

    // Render Song Grid
    songGrid.innerHTML = '';
    if (filteredSongs.length === 0) {
      songGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          <p style="font-size: 18px; margin-bottom: 8px;">ไม่พบผลลัพธ์เพลง</p>
          <small>ลองเปลี่ยนคำค้นหา หรือสร้างเพลงใหม่ได้เลยตอนนี้!</small>
        </div>
      `;
      return;
    }

    filteredSongs.forEach(song => {
      const card = document.createElement('div');
      card.className = 'song-card';
      
      card.innerHTML = `
        <div>
          <div class="card-title">${escapeHtml(song.title)}</div>
          <div class="card-artist">${escapeHtml(song.artist)}</div>
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

    // Fill Hero Card Metadata
    songTitle.textContent = song.title;
    songArtist.textContent = song.artist;
    
    // Metas
    songMetricTempo.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/></svg> ♩ = ${song.tempo}`;
    
    // Key selector text (G (Ori) etc.)
    updateKeyTransposeDisplay();

    // Admin edit trigger
    const editBtn = document.getElementById('btn-song-edit');
    editBtn.onclick = () => openAdminEditor(song);

    // Delete song trigger
    const deleteBtn = document.getElementById('btn-song-delete');
    deleteBtn.onclick = () => deleteSong(song.id);

    // Add to Playlist picker trigger
    const addToPlBtn = document.getElementById('btn-song-add-playlist');
    addToPlBtn.onclick = () => openAddToPlaylistModal(song.id);

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

    showView('song');
  }

  // --- RENDERING CHORD SHEET WITH TRANSPOSITION ---
  function renderChordSheet(song) {
    const content = song.content || '';
    const lines = content.split('\n');
    
    songSheetContent.innerHTML = '';
    
    let activeSectionBlock = null;
    let sectionsFound = [];

    // Force monospaced pre-wrap rendering for perfect space alignment
    songSheetContent.style.fontFamily = 'var(--font-mono, monospace)';
    songSheetContent.style.whiteSpace = 'pre-wrap';

    lines.forEach((line, lineIndex) => {
      const trimmedLine = line.trim();
      
      // 1. Detect Section Header Line `[section: Name]`
      if (trimmedLine.startsWith('[section:') && trimmedLine.endsWith(']')) {
        const sectionName = trimmedLine.substring(9, trimmedLine.length - 1).trim();
        sectionsFound.push({ name: sectionName, lineIndex: lineIndex });
        
        activeSectionBlock = document.createElement('div');
        activeSectionBlock.className = 'chord-section-block';
        activeSectionBlock.id = `song-section-${sectionName.replace(/\s+/g, '-').toLowerCase()}`;
        
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'section-block-header';
        sectionHeader.textContent = sectionName;
        activeSectionBlock.appendChild(sectionHeader);
        
        songSheetContent.appendChild(activeSectionBlock);
        return;
      }

      // If no active section yet, add to general space
      const parentContainer = activeSectionBlock || songSheetContent;

      // 2. Empty Line
      if (trimmedLine === '') {
        parentContainer.appendChild(document.createElement('br'));
        return;
      }

      // 3. Process Line
      // Check if it contains bracketed chords
      if (line.includes('[') && line.includes(']')) {
        const parsed = splitBracketedLine(line);
        if (parsed.hasChords) {
          const chordLineDiv = document.createElement('div');
          chordLineDiv.className = 'chord-only-line';
          chordLineDiv.textContent = transposeChordLine(parsed.chordLine, currentKeyOffset, song.key);
          parentContainer.appendChild(chordLineDiv);
        }
        
        const lyricLineDiv = document.createElement('div');
        lyricLineDiv.className = 'lyric-only-line';
        lyricLineDiv.textContent = parsed.lyricLine;
        parentContainer.appendChild(lyricLineDiv);
      } else {
        if (isChordLine(line)) {
          const chordLineDiv = document.createElement('div');
          chordLineDiv.className = 'chord-only-line';
          chordLineDiv.textContent = transposeChordLine(line, currentKeyOffset, song.key);
          parentContainer.appendChild(chordLineDiv);
        } else {
          const lyricLineDiv = document.createElement('div');
          lyricLineDiv.className = 'lyric-only-line';
          lyricLineDiv.textContent = line;
          parentContainer.appendChild(lyricLineDiv);
        }
      }
    });

    // Populate Section Quick Jump Menu (Screenshot 5)
    renderSectionMenu(sectionsFound);
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
    const chordPattern = /^([A-G][#b]?)(.*)$/;
    const match = chord.match(chordPattern);
    if (!match) return chord;

    const root = match[1];
    const modifier = match[2];

    // Find current pitch value (index 0 - 11)
    let pitchIndex = KEY_SCALES.indexOf(root);
    
    // Handle cases where sharp notes might be represented as flats or vice versa
    if (pitchIndex === -1) {
      // mapping aliases
      const sharpFlatAliases = {
        'C#': 'Db', 'Db': 'C#',
        'D#': 'Eb', 'Eb': 'D#',
        'F#': 'Gb', 'Gb': 'F#',
        'G#': 'Ab', 'Ab': 'G#',
        'A#': 'Bb', 'Bb': 'A#',
        'B#': 'C',  'Cb': 'B',
        'E#': 'F',  'Fb': 'E'
      };
      const alias = sharpFlatAliases[root];
      if (alias) {
        pitchIndex = KEY_SCALES.indexOf(alias);
      }
    }

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
    
    const tokens = line.trim().split(/\s+/);
    let chordCount = 0;
    let otherCount = 0;
    const chordRegex = /^[A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?$/;
    
    tokens.forEach(token => {
      const cleanToken = token.replace(/[|/\-\(\)\:\[\]]/g, '').trim();
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
    const segmentRegex = /(?:\[([^\]]+)\])?([^\[]*)/g;
    let match;
    let chordLine = '';
    let lyricLine = '';
    
    while ((match = segmentRegex.exec(line)) !== null) {
      if (match[0] === '') break;
      const chord = match[1] || '';
      const text = match[2] || '';
      
      if (chord) {
        const targetPos = lyricLine.length;
        if (chordLine.length > targetPos) {
          chordLine += ' ' + chord;
        } else {
          chordLine += ' '.repeat(targetPos - chordLine.length) + chord;
        }
      }
      
      lyricLine += text;
    }
    
    return {
      hasChords: chordLine.trim().length > 0,
      chordLine,
      lyricLine
    };
  }

  function transposeChordLine(line, offset, originalKey) {
    if (offset === 0) return line;
    
    const chordRegex = /\b([A-G][#b]?(?:m|maj|dim|aug|sus|add|7|9|11|13)*(?:\/[A-G][#b]?)?)\b/g;
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

    // Create 12 buttons inside transpose grid
    KEY_SCALES.forEach(key => {
      const keyIndex = KEY_SCALES.indexOf(key);
      const originalIndex = KEY_SCALES.indexOf(song.key);
      
      let offset = keyIndex - originalIndex;
      if (offset > 6) offset -= 12;
      if (offset <= -6) offset += 12;

      const offsetText = offset === 0 ? 'Ori' : (offset > 0 ? `+${offset}` : `${offset}`);

      const item = document.createElement('div');
      item.className = `key-grid-item ${currentKeyOffset === offset ? 'active' : ''}`;
      item.innerHTML = `
        <div class="key-name">${key}</div>
        <div class="key-offset">(${offsetText})</div>
      `;

      item.addEventListener('click', () => {
        currentKeyOffset = offset;
        btnKeyTranspose.querySelector('.transpose-display-val').textContent = `${key} (${offsetText})`;
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
  }

  function scrollStep(timestamp) {
    if (!isScrolling) return;

    const elapsed = timestamp - lastScrollTime;
    lastScrollTime = timestamp;

    const mainContent = views.song;
    // Calculate pixels to scroll based on speed slider value (pixels/second)
    const scrollAmount = (autoscrollSpeed * elapsed) / 1000;
    mainContent.scrollTop += scrollAmount;

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

    sections.forEach(sec => {
      const btn = document.createElement('button');
      btn.className = 'section-menu-item';
      btn.textContent = sec.name;
      
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Find section element
        const secElement = document.getElementById(`song-section-${sec.name.replace(/\s+/g, '-').toLowerCase()}`);
        if (secElement) {
          secElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        if (isSongInPlaylist) {
          pl.songs = pl.songs.filter(id => id !== songId);
        } else {
          pl.songs.push(songId);
        }
        savePlaylistsToStorage();
        openAddToPlaylistModal(songId); // reload layout
        renderSidebar();
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

    // Render Canvas QR Code (Uses public qrcode generator API for actual scanning!)
    const canvas = document.getElementById('share-qr-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0,0,150,150);
    
    // Draw canvas placeholder while loading API QR code image
    ctx.fillStyle = 'var(--bg-input)';
    ctx.fillRect(0,0,150,150);
    ctx.fillStyle = 'var(--accent-color)';
    ctx.font = '12px var(--font-body)';
    ctx.textAlign = 'center';
    ctx.fillText('กำลังสร้าง QR Code...', 75, 75);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.clearRect(0,0,150,150);
      ctx.drawImage(img, 0, 0, 150, 150);
    };
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&color=ff5a1f&data=${encodeURIComponent(shareLink)}`;

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
      const bracketedContent = chordsText;

      // Populate Admin editor fields with these extracted values!
      adminTitle.value = title;
      adminArtist.value = artist;
      adminKey.value = "C"; // standard default
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
  async function handleOcrExtraction() {
    const file = ocrImageInput.files[0];
    if (!file) {
      alert('กรุณาเลือกไฟล์รูปภาพก่อนเริ่มสแกนคอร์ด!');
      return;
    }

    if (ocrMode === 'local') {
      await handleLocalOcr(file);
    } else {
      await handleGeminiOcr(file);
    }
  }

  async function handleLocalOcr(file) {
    const language = ocrLanguageSelect.value;

    // Reset progress UI
    ocrStatusContainer.style.display = 'block';
    ocrResultPreviewContainer.style.display = 'none';
    ocrStatusText.textContent = 'กำลังโหลดโมเดลสแกนข้อความ (OCR)...';
    ocrPercentText.textContent = '0%';
    ocrProgressBar.style.width = '0%';
    btnOcrStart.disabled = true;

    try {
      // Run Tesseract recognition with layout spacing options
      const result = await Tesseract.recognize(
        file,
        language,
        {
          logger: m => {
            if (m && m.status === 'recognizing text') {
              const progress = Math.round(m.progress * 100);
              ocrStatusText.textContent = 'กำลังแปลงรูปภาพเป็นข้อความ...';
              ocrPercentText.textContent = `${progress}%`;
              ocrProgressBar.style.width = `${progress}%`;
            } else if (m && m.status) {
              let statusMsg = 'กำลังเตรียมตัวสแกน...';
              if (m.status === 'loading tesseract core') statusMsg = 'กำลังโหลด Core สแกน...';
              if (m.status === 'initializing api') statusMsg = 'กำลังเริ่มระบบ AI OCR...';
              if (m.status === 'recognizing text') statusMsg = 'กำลังวิเคราะห์ข้อความ...';
              ocrStatusText.textContent = statusMsg;
            }
          },
          // Keep spacing characters preserved
          preserve_interword_spaces: '1'
        }
      );

      const rawText = result.data.text;
      if (!rawText || !rawText.trim()) {
        alert('ไม่สามารถถอดข้อความจากรูปภาพได้ กรุณาตรวจสอบว่ารูปภาพมีความชัดเจนและมีตัวหนังสือคอร์ด/เนื้อร้อง');
        ocrStatusContainer.style.display = 'none';
        btnOcrStart.disabled = false;
        return;
      }

      // Leave chords and lyrics independent (interleaved format)
      const convertedContent = rawText;

      // Show result preview
      ocrResultPreview.value = convertedContent;
      ocrResultPreviewContainer.style.display = 'block';
      ocrStatusText.textContent = 'สแกนรูปภาพสำเร็จ!';
      ocrPercentText.textContent = '100%';
      ocrProgressBar.style.width = '100%';
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการประมวลผล OCR: ' + err.message);
      console.error('OCR Error:', err);
      ocrStatusText.textContent = 'การประมวลผลล้มเหลว';
    } finally {
      btnOcrStart.disabled = false;
    }
  }

  async function handleGeminiOcr(file) {
    const apiKey = ocrGeminiKey.value.trim();
    if (!apiKey) {
      alert('กรุณากรอก Gemini API Key เพื่อเปิดใช้งานระบบสแกนอัจฉริยะ (100% Accuracy)\nสามารถขอรับคีย์ฟรีได้จากลิ้งก์ข้างช่องกรอกข้อมูล');
      return;
    }

    // Reset progress UI
    ocrStatusContainer.style.display = 'block';
    ocrResultPreviewContainer.style.display = 'none';
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
Your task is to transcribe the lyrics and chords from the provided image of a chord sheet.

CRITICAL RULES:
1. You MUST transcribe the sheet exactly as a space-aligned plain text chord sheet.
2. Put chords on their own lines, positioned with spaces EXACTLY above the lyric syllables where they are played, just like in the image.
   Example:
     C          G
     คนที่เคยมีกัน ผูกพันจริงใจ
3. Ensure 100% accurate transcription of chords (e.g. C, Dm, F#m, G/B), lyrics (Thai and English), spelling, and their relative positions. Do not mismatch or cluster the chords at the start of the line!
4. Organize structural sections by prepending them with '[section: Intro]', '[section: Verse]', '[section: Chorus]', '[section: Solo]', or '[section: Outro]' on their own lines.
5. Do NOT output markdown code blocks (like \`\`\`text or \`\`\`html), note explanations, or intro text. Just output the raw transcribed sheet.`;

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
      extractedText = extractedText.replace(/^```[a-zA-Z]*\n/, '').replace(/\n```$/, '');

      // Show result preview
      ocrResultPreview.value = extractedText.trim();
      ocrResultPreviewContainer.style.display = 'block';
      ocrStatusText.textContent = 'สแกนรูปภาพสำเร็จด้วย AI!';
      ocrPercentText.textContent = '100%';
      ocrProgressBar.style.width = '100%';
    } catch (err) {
      clearInterval(progressInterval);
      alert('การแปลงคอร์ดด้วย Gemini AI ล้มเหลว: ' + err.message);
      console.error('Gemini AI Error:', err);
      ocrStatusText.textContent = 'การประมวลผลล้มเหลว';
    } finally {
      btnOcrStart.disabled = false;
    }
  }

  function insertOcrContentToEditor() {
    const text = ocrResultPreview.value;
    if (!text.trim()) return;

    // Ask user for confirmation
    if (adminContent.value.trim() && !confirm('มีเนื้อหาเดิมอยู่ในตัวแก้ไขอยู่แล้ว ต้องการเขียนทับด้วยข้อมูลจาก OCR ใช่หรือไม่?')) {
      return;
    }

    adminContent.value = text;
    updateAdminPreview();
    alert('นำข้อมูล OCR เข้าสู่ตัวแก้ไขเรียบร้อยแล้ว!');
  }

  // --- THE MERGING CONVERTER ALGORITHM (Interleaved -> Bracketed) ---
  function convertInterleavedToBrackets(text) {
    const lines = text.split('\n');
    const processedLines = [];
    
    // Core helper: detects if line contains only chords and spacings (Intro chord rows, Solo progressions)
    function isChordLine(line) {
      if (!line.trim()) return false;
      
      // Chords lines only contain chord characters, bars |, slashes /, numbers and spaces
      // No standard long lyrics keywords (checking english length, and Thai block bounds)
      const sanitized = line.replace(/[A-G][#b]?(m|maj|dim|aug|sus|add|7|9|11|13)*(\/[A-G][#b]?)?/g, '')
                            .replace(/[\s\d|/\-\(\)\:\[\]]/g, '');
                            
      return sanitized.length === 0;
    }

    for (let i = 0; i < lines.length; i++) {
      const current = lines[i];
      const next = (i + 1 < lines.length) ? lines[i + 1] : null;

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
        index: match.index
      });
    }

    if (chords.length === 0) return lyricLine;

    // Reconstruct lyric line inserting brackets
    let result = '';
    let lyricPtr = 0;
    
    // Sort chords left-to-right
    chords.sort((a, b) => a.index - b.index);

    chords.forEach(c => {
      // Add text leading up to chord position
      if (c.index > lyricPtr && lyricPtr < lyricLine.length) {
        result += lyricLine.substring(lyricPtr, c.index);
        lyricPtr = c.index;
      }
      
      // Insert brackets chord
      result += `[${c.chord}]`;
      
      // If chord is placed beyond current lyrics bounds, pad with spacing
      if (c.index >= lyricLine.length && lyricPtr >= lyricLine.length) {
        result += ' ';
      }
    });

    // Add remaining lyrics text
    if (lyricPtr < lyricLine.length) {
      result += lyricLine.substring(lyricPtr);
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
    adminKey.value = 'C';
    adminTempo.value = '90';
    adminContent.value = `[section: Intro]
| [C] | [Am] | [F] | [G] |

[section: Verse]
[C] เนื้อเพลงท่อนร้อง [Am] คอร์ดวางในวงเล็บสี่เหลี่ยม
[F] จัดตำแหน่งและคำร้อง [G] ได้อย่างอิสระ`;
    
    adminImageUpload.value = '';
    
    // Reset OCR UI
    ocrImageInput.value = '';
    ocrStatusContainer.style.display = 'none';
    ocrResultPreviewContainer.style.display = 'none';
    ocrResultPreview.value = '';
    btnOcrStart.disabled = false;

    // Sync OCR tab UI with current state
    if (ocrMode === 'local') {
      tabOcrLocal.classList.add('active');
      tabOcrAi.classList.remove('active');
      ocrLocalParams.style.display = 'block';
      ocrAiParams.style.display = 'none';
    } else {
      tabOcrAi.classList.add('active');
      tabOcrLocal.classList.remove('active');
      ocrLocalParams.style.display = 'none';
      ocrAiParams.style.display = 'block';
    }

    updateAdminPreview();
    showView('admin');
  }

  function openAdminEditor(song) {
    activeAdminSongId = song.id;
    uploadedImageBase64 = song.imageBase64 || null;

    adminTitle.value = song.title || '';
    adminArtist.value = song.artist || '';
    adminKey.value = song.key || 'C';
    adminContent.value = song.content || '';
    
    adminImageUpload.value = '';

    // Reset OCR UI
    ocrImageInput.value = '';
    ocrStatusContainer.style.display = 'none';
    ocrResultPreviewContainer.style.display = 'none';
    ocrResultPreview.value = '';
    btnOcrStart.disabled = false;

    // Sync OCR tab UI with current state
    if (ocrMode === 'local') {
      tabOcrLocal.classList.add('active');
      tabOcrAi.classList.remove('active');
      ocrLocalParams.style.display = 'block';
      ocrAiParams.style.display = 'none';
    } else {
      tabOcrAi.classList.add('active');
      tabOcrLocal.classList.remove('active');
      ocrLocalParams.style.display = 'none';
      ocrAiParams.style.display = 'block';
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
      <h3 style="font-size:22px; font-family:var(--font-display); font-weight:700;">${escapeHtml(tempSong.title)}</h3>
      <p style="color:var(--text-secondary); margin-bottom:8px;">โดย ${escapeHtml(tempSong.artist)}</p>
      <span class="card-key">${tempSong.key}</span>
      <span style="font-size:12px; margin-left:10px; color:var(--text-muted);">♩ ${tempSong.tempo}</span>
    `;
    previewContainer.appendChild(header);

    const sheet = document.createElement('div');
    sheet.className = 'chord-sheet-container';
    sheet.style.padding = '16px';
    sheet.style.fontSize = '14px';
    sheet.style.lineHeight = '2';
    sheet.id = 'admin-sheet-preview-scroller';

    // Simple Render preview (Key offset = 0)
    sheet.style.fontFamily = 'var(--font-mono, monospace)';
    sheet.style.whiteSpace = 'pre-wrap';

    const lines = tempSong.content.split('\n');
    let activeBlock = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('[section:') && trimmed.endsWith(']')) {
        const sec = trimmed.substring(9, trimmed.length - 1).trim();
        activeBlock = document.createElement('div');
        activeBlock.className = 'chord-section-block';
        activeBlock.style.paddingLeft = '10px';
        const bh = document.createElement('div');
        bh.className = 'section-block-header';
        bh.style.fontSize = '11px';
        bh.textContent = sec;
        activeBlock.appendChild(bh);
        sheet.appendChild(activeBlock);
        return;
      }

      const parent = activeBlock || sheet;

      if (trimmed === '') {
        parent.appendChild(document.createElement('br'));
        return;
      }

      // Check if it contains bracketed chords
      if (line.includes('[') && line.includes(']')) {
        const parsed = splitBracketedLine(line);
        if (parsed.hasChords) {
          const chordLineDiv = document.createElement('div');
          chordLineDiv.className = 'chord-only-line';
          chordLineDiv.style.fontFamily = 'var(--font-mono, monospace)';
          chordLineDiv.style.whiteSpace = 'pre';
          chordLineDiv.textContent = parsed.chordLine;
          parent.appendChild(chordLineDiv);
        }
        
        const lyricLineDiv = document.createElement('div');
        lyricLineDiv.className = 'lyric-only-line';
        lyricLineDiv.style.fontFamily = 'var(--font-mono, monospace)';
        lyricLineDiv.textContent = parsed.lyricLine;
        parent.appendChild(lyricLineDiv);
      } else {
        if (isChordLine(line)) {
          const chordLineDiv = document.createElement('div');
          chordLineDiv.className = 'chord-only-line';
          chordLineDiv.style.fontFamily = 'var(--font-mono, monospace)';
          chordLineDiv.style.whiteSpace = 'pre';
          chordLineDiv.textContent = line;
          parent.appendChild(chordLineDiv);
        } else {
          const lyricLineDiv = document.createElement('div');
          lyricLineDiv.className = 'lyric-only-line';
          lyricLineDiv.style.fontFamily = 'var(--font-mono, monospace)';
          lyricLineDiv.textContent = line;
          parent.appendChild(lyricLineDiv);
        }
      }
    });

    previewContainer.appendChild(sheet);
  }

  function saveAdminSong() {
    const title = adminTitle.value.trim();
    const artist = adminArtist.value.trim();
    if (!title || !artist) {
      alert('กรุณากรอกชื่อเพลงและชื่อศิลปิน!');
      return;
    }

    const key = adminKey.value.trim();
    const tempo = parseInt(adminTempo.value) || 90;
    const timeSignature = adminTime.value.trim();
    const duration = adminDuration.value.trim();
    const tags = adminTags.value.split(',').map(t => t.trim()).filter(t => t);
    const content = adminContent.value;

    if (activeAdminSongId) {
      // Edit existing
      const songIndex = songs.findIndex(s => s.id === activeAdminSongId);
      if (songIndex !== -1) {
        songs[songIndex] = {
          ...songs[songIndex],
          title, artist, key, tempo, timeSignature, duration, tags, content,
          imageBase64: uploadedImageBase64
        };
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
    const savedId = activeAdminSongId || songs[songs.length - 1].id;
    showSong(savedId);
  }

  function deleteSong(songId) {
    if (!confirm('คุณแน่ใจว่าต้องการลบเพลงนี้ออกจาระบบอย่างถาวรใช่หรือไม่?')) return;
    
    songs = songs.filter(s => s.id !== songId);
    saveSongsToStorage();
    
    // Remove from playlists
    playlists.forEach(pl => {
      pl.songs = pl.songs.filter(id => id !== songId);
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
          // Confirm import
          if (confirm(`พบข้อมูลเพลงแชร์ร่วมกัน [${importedSong.title} - ${importedSong.artist}] ต้องการนำเข้าสู่คลังเพลงท้องถิ่นใช่หรือไม่?`)) {
            // Check if already exists
            const exists = songs.find(s => s.id === importedSong.id);
            if (exists) {
              songs = songs.filter(s => s.id !== importedSong.id);
            }
            songs.push(importedSong);
            saveSongsToStorage();
            
            // clear hash to prevent loops
            window.location.hash = '';
            
            renderSidebar();
            renderLibrary();
            showSong(importedSong.id);
          }
        }
      } catch (err) {
        console.error('URL parse failed', err);
      }
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

  // --- UTILITIES ---
  function isChordLine(line) {
    if (!line.trim()) return false;
    let sanitized = line.replace(/(?:\b(?:intro|instru|outro|solo|verse|chorus|bridge|pre-chorus|hook)\b)/gi, '');
    sanitized = sanitized.replace(/[A-G][#b]?(m|maj|dim|aug|sus|add|7|9|11|13)*(\/[A-G][#b]?)?/g, '')
                          .replace(/[\s\d|/\-\(\)\:\[\]]/g, '');
    return sanitized.length === 0;
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

    const originalIndex = KEY_SCALES.indexOf(song.key);
    let targetIndex = (originalIndex + currentKeyOffset) % 12;
    if (targetIndex < 0) targetIndex += 12;

    const targetKey = KEY_SCALES[targetIndex];
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
    songs.forEach(s => s.tags.forEach(t => allTags.add(t)));
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
            localStorage.setItem('pakjer_custom_tags', JSON.stringify(customTags));
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
          localStorage.setItem('pakjer_custom_tags', JSON.stringify(customTags));

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
    localStorage.setItem('pakjer_custom_tags', JSON.stringify(customTags));
    
    tagManagerNewInput.value = '';
    renderTagManagerList();
    renderSidebar();
    renderLibrary();
  }

  // --- INITIALIZE START ---
  init();
});

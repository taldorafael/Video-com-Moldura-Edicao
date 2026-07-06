/* =========================================================
   EDITOR VIDEO TEXTO — SCRIPT.JS
   Todo o processamento roda 100% no navegador.
   FFmpeg.wasm  -> extração de áudio
   Transformers.js (Whisper) -> transcrição local
   ========================================================= */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';

/* Config do Transformers.js: permitir cache no navegador (IndexedDB) */
env.allowLocalModels = false;
env.useBrowserCache = true;

/* ===================== ESTADO GLOBAL ===================== */

const state = {
  videoFile: null,
  videoURL: null,
  duration: 0,
  captions: [],          // { id, start, end, text, style, animation, x, y, words: [{word,start,end}] }
  selectedCaptionId: null,
  pxPerSecond: 60,       // zoom da timeline
  ffmpeg: null,
  ffmpegLoaded: false,
  asrPipeline: null,
  asrLoaded: false,
  isDraggingCaptionBox: false,
  isDraggingClip: false,
  isResizingClip: null,  // 'left' | 'right' | null
};

let idCounter = 1;
function nextId() {
  return 'cap_' + (idCounter++);
}

/* ===================== SHORTCUTS DOM ===================== */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  video: $('#videoPlayer'),
  dropZone: $('#dropZone'),
  inputVideo: $('#inputVideo'),
  btnUploadVideo: $('#btnUploadVideo'),
  captionOverlay: $('#captionOverlay'),
  videoStage: $('#videoStage'),
  dragHint: $('#dragHint'),

  btnPlayPause: $('#btnPlayPause'),
  iconPlay: $('#iconPlay'),
  iconPause: $('#iconPause'),
  seekBar: $('#seekBar'),
  timeCurrent: $('#timeCurrent'),
  timeDuration: $('#timeDuration'),
  btnMute: $('#btnMute'),
  volumeBar: $('#volumeBar'),

  timelineScroll: $('#timelineScroll'),
  timelineRuler: $('#timelineRuler'),
  timelineTrack: $('#timelineTrack'),
  playhead: $('#playhead'),
  btnZoomIn: $('#btnZoomIn'),
  btnZoomOut: $('#btnZoomOut'),

  captionList: $('#captionList'),
  btnAddCaption: $('#btnAddCaption'),
  btnGenerateCaptions: $('#btnGenerateCaptions'),
  selectLanguage: $('#selectLanguage'),

  progressWrap: $('#progressWrap'),
  progressText: $('#progressText'),
  progressPct: $('#progressPct'),
  progressFill: $('#progressFill'),

  editorEmpty: $('#editorEmpty'),
  editorForm: $('#editorForm'),
  fieldText: $('#fieldText'),
  fieldStart: $('#fieldStart'),
  fieldEnd: $('#fieldEnd'),
  btnDuplicateCaption: $('#btnDuplicateCaption'),
  btnDeleteCaption: $('#btnDeleteCaption'),
  fieldFont: $('#fieldFont'),
  fieldFontSize: $('#fieldFontSize'),
  fontSizeVal: $('#fontSizeVal'),
  fieldColor: $('#fieldColor'),
  fieldBgColor: $('#fieldBgColor'),
  fieldBgOpacity: $('#fieldBgOpacity'),
  bgOpacityVal: $('#bgOpacityVal'),
  fieldStrokeColor: $('#fieldStrokeColor'),
  fieldStrokeWidth: $('#fieldStrokeWidth'),
  strokeWidthVal: $('#strokeWidthVal'),
  fieldShadow: $('#fieldShadow'),
  shadowVal: $('#shadowVal'),
  fieldOpacity: $('#fieldOpacity'),
  opacityVal: $('#opacityVal'),
  fieldAnimation: $('#fieldAnimation'),

  btnDownloadJson: $('#btnDownloadJson'),
  btnDownloadSrt: $('#btnDownloadSrt'),
  btnImportJson: $('#btnImportJson'),
  inputImportJson: $('#inputImportJson'),
  btnExportVideo: $('#btnExportVideo'),
  btnClearProject: $('#btnClearProject'),

  modelModal: $('#modelModal'),
  modelModalTitle: $('#modelModalTitle'),
  modelModalSub: $('#modelModalSub'),
  modelProgressFill: $('#modelProgressFill'),

  toastContainer: $('#toastContainer'),
};

/* ===================== UTILITÁRIOS ===================== */

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function formatSrtTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds - Math.floor(seconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 3600);
}

function defaultStyle() {
  return {
    font: "'Inter', sans-serif",
    fontSize: 28,
    color: '#ffffff',
    bgColor: '#000000',
    bgOpacity: 60,
    strokeColor: '#000000',
    strokeWidth: 2,
    shadow: 4,
    opacity: 100,
    align: 'center',
  };
}

function createCaption(start, end, text) {
  return {
    id: nextId(),
    start,
    end,
    text: text || 'Novo texto',
    style: defaultStyle(),
    animation: 'fade',
    x: 50, // % posição horizontal
    y: 85, // % posição vertical
    words: null,
  };
}

function getSelectedCaption() {
  return state.captions.find(c => c.id === state.selectedCaptionId) || null;
}

function sortCaptions() {
  state.captions.sort((a, b) => a.start - b.start);
}

/* ===================== UPLOAD DE VÍDEO ===================== */

els.btnUploadVideo.addEventListener('click', () => els.inputVideo.click());
els.inputVideo.addEventListener('change', (e) => {
  if (e.target.files[0]) loadVideoFile(e.target.files[0]);
});

['dragenter', 'dragover'].forEach(evt => {
  els.dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.dropZone.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach(evt => {
  els.dropZone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.dropZone.classList.remove('drag-over');
  });
});
els.dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('video/')) {
    loadVideoFile(file);
  } else {
    showToast('Por favor solte um arquivo de vídeo válido.', 'error');
  }
});
els.dropZone.addEventListener('click', (e) => {
  if (e.target === els.dropZone) els.inputVideo.click();
});

function loadVideoFile(file) {
  state.videoFile = file;
  if (state.videoURL) URL.revokeObjectURL(state.videoURL);
  state.videoURL = URL.createObjectURL(file);
  els.video.src = state.videoURL;
  els.video.load();
  showToast(`Vídeo "${file.name}" carregado.`, 'success');
}

els.video.addEventListener('loadedmetadata', () => {
  state.duration = els.video.duration;
  els.timeDuration.textContent = formatTime(state.duration);
  buildTimelineRuler();
  renderTimelineClips();
});

/* ===================== PLAYER CONTROLS ===================== */

els.btnPlayPause.addEventListener('click', togglePlayPause);

function togglePlayPause() {
  if (!state.videoFile) return;
  if (els.video.paused) {
    els.video.play();
  } else {
    els.video.pause();
  }
}

els.video.addEventListener('play', () => {
  els.iconPlay.classList.add('hidden');
  els.iconPause.classList.remove('hidden');
});
els.video.addEventListener('pause', () => {
  els.iconPlay.classList.remove('hidden');
  els.iconPause.classList.add('hidden');
});

els.video.addEventListener('timeupdate', () => {
  if (!state.duration) return;
  const pct = (els.video.currentTime / state.duration) * 1000;
  els.seekBar.value = pct;
  els.timeCurrent.textContent = formatTime(els.video.currentTime);
  updatePlayhead();
  renderActiveCaptions();
});

els.seekBar.addEventListener('input', () => {
  if (!state.duration) return;
  const t = (els.seekBar.value / 1000) * state.duration;
  els.video.currentTime = t;
});

els.volumeBar.addEventListener('input', () => {
  els.video.volume = els.volumeBar.value / 100;
  els.video.muted = false;
});

els.btnMute.addEventListener('click', () => {
  els.video.muted = !els.video.muted;
  els.btnMute.style.color = els.video.muted ? 'var(--danger)' : '';
});

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlayPause();
  }
});

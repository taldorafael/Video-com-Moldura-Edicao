'use strict';

/* =====================================================
 * Video Frame Studio - Script Principal (VERSÃO ESTÁVEL 0.11.6)
 * Versão revisada: corrige vazamentos de memória, XSS via innerHTML,
 * tags <script> indevidas dentro de um arquivo .js, listeners duplicados,
 * falhas silenciosas em canvas "tainted" e centraliza utilitários comuns.
 * ===================================================== */

(function () {
  const FFmpegScript = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
  const JSZipScript = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const FabricScript = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js';

  // =====================================================
  // ESTADO GLOBAL
  // =====================================================
  const state = {
    ffmpeg: null,
    ffmpegLoaded: false,
    fetchFile: null,
    frameFile: null,
    frameOriginalImage: null,
    frameHolePreviewUrl: null,
    frameInfo: null,
    videos: [],
    processing: false,
    videoIdCounter: 0
  };

  const elements = {
    browserAlert: document.getElementById('browser-alert'),
    frameDropArea: document.getElementById('frame-drop-area'),
    frameInput: document.getElementById('frame-input'),
    framePreviewContainer: document.getElementById('frame-preview-container'),
    framePreview: document.getElementById('frame-preview'),
    frameName: document.getElementById('frame-name'),
    frameSize: document.getElementById('frame-size'),
    removeFrameBtn: document.getElementById('remove-frame-btn'),
    frameEditorWrap: document.getElementById('frame-editor-wrap'),
    areaBox: document.getElementById('area-box'),
    areaX: document.getElementById('area-x'),
    areaY: document.getElementById('area-y'),
    areaW: document.getElementById('area-w'),
    areaH: document.getElementById('area-h'),
    areaAutoBtn: document.getElementById('area-auto-btn'),
    areaResetBtn: document.getElementById('area-reset-btn'),
    videosDropArea: document.getElementById('videos-drop-area'),
    videosInput: document.getElementById('videos-input'),
    videosListSection: document.getElementById('videos-list-section'),
    videosList: document.getElementById('videos-list'),
    videosCount: document.getElementById('videos-count'),
    clearQueueBtn: document.getElementById('clear-queue-btn'),
    processAllBtn: document.getElementById('process-all-btn'),
    progressSection: document.getElementById('progress-section'),
    progressStatus: document.getElementById('progress-status'),
    overallProgressFill: document.getElementById('overall-progress-fill'),
    overallProgressText: document.getElementById('overall-progress-text'),
    overallProgressCount: document.getElementById('overall-progress-count'),
    resultsSection: document.getElementById('results-section'),
    resultsList: document.getElementById('results-list'),
    resultsCount: document.getElementById('results-count'),
    downloadAllBtn: document.getElementById('download-all-btn'),
    toastContainer: document.getElementById('toast-container'),
    warningBanner: document.getElementById('warning-banner'),
    warningBannerText: document.getElementById('warning-banner-text')
  };

  // =====================================================
  // UTILITÁRIOS GERAIS
  // =====================================================
  function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  function formatDuration(seconds) {
    if (!seconds || !isFinite(seconds)) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function generateId() {
    return `video_${++state.videoIdCounter}_${Date.now()}`;
  }

  function getVideoDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      const cleanup = () => URL.revokeObjectURL(url);
      video.onloadedmetadata = () => { resolve(video.duration); cleanup(); };
      video.onerror = () => { resolve(null); cleanup(); };
      video.src = url;
    });
  }

  function showToast(message, type = 'info') {
    if (!elements.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const iconSvg = type === 'success'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
      : type === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

    const iconWrap = document.createElement('span');
    iconWrap.innerHTML = iconSvg; // SVG estático, não contém dados do usuário
    const textSpan = document.createElement('span');
    textSpan.textContent = message; // texto sempre via textContent, evita XSS

    toast.appendChild(iconWrap.firstChild);
    toast.appendChild(textSpan);
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)));
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.dataset.src = src;
      script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
      script.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(script);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    downloadFile(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then((r) => r.blob());
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // =====================================================
  // CARREGAR IMAGEM A PARTIR DE ARQUIVO
  // =====================================================
  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => resolve(img);
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível carregar a imagem')); };
      img.src = url;
    });
  }

  // =====================================================
  // ANALISAR MOLDURA - Detectar área transparente
  // Recebe uma <img> já carregada (evita recarregar o arquivo toda vez).
  // Se a imagem não tiver transparência real, ou se o canvas não puder ser
  // lido (ex.: restrição de CORS), cai num retângulo central (margem de 10%)
  // que o usuário pode ajustar manualmente depois.
  // =====================================================
  function centeredFallback(width, height, margin = 0.1) {
    return {
      frameWidth: width,
      frameHeight: height,
      videoX: Math.floor(width * margin),
      videoY: Math.floor(height * margin),
      videoWidth: Math.floor(width * (1 - 2 * margin)),
      videoHeight: Math.floor(height * (1 - 2 * margin))
    };
  }

  function analyzeFrame(img) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);

    let imageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (err) {
      // Canvas "tainted" (ex.: imagem de outra origem) — usa retângulo central.
      console.warn('Não foi possível ler os pixels da moldura, usando área central padrão:', err);
      return centeredFallback(width, height);
    }

    const data = imageData.data;
    let minX = width, maxX = 0;
    let minY = height, maxY = 0;
    let hasTransparent = false;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        const alpha = data[(rowOffset + x) * 4 + 3];
        if (alpha < 10) {
          hasTransparent = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasTransparent || minX >= maxX || minY >= maxY) {
      return centeredFallback(width, height);
    }

    return {
      frameWidth: width,
      frameHeight: height,
      videoX: minX,
      videoY: minY,
      videoWidth: maxX - minX,
      videoHeight: maxY - minY
    };
  }

  // =====================================================
  // GERAR MOLDURA COM "FURO" TRANSPARENTE
  // Sempre parte da imagem ORIGINAL (nunca de uma versão já furada) e recorta
  // uma área 100% transparente exatamente na posição/tamanho definidos pelo
  // usuário no editor — independente da moldura já ter alpha real ali ou não.
  // É esse arquivo (não o PNG original) que é usado no FFmpeg e na prévia.
  // =====================================================
  function generateFrameWithHole(img, frameInfo) {
    return new Promise((resolve, reject) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = frameInfo.frameWidth;
        canvas.height = frameInfo.frameHeight;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, frameInfo.frameWidth, frameInfo.frameHeight);
        ctx.clearRect(frameInfo.videoX, frameInfo.videoY, frameInfo.videoWidth, frameInfo.videoHeight);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Falha ao gerar moldura com área transparente'));
        }, 'image/png');
      } catch (err) {
        reject(err);
      }
    });
  }

  // =====================================================
  // ATUALIZAR PRÉVIA VISUAL (mostra o furo de verdade na tela)
  // =====================================================
  async function refreshFramePreviewWithHole() {
    if (!state.frameOriginalImage || !state.frameInfo) return;
    try {
      const blob = await generateFrameWithHole(state.frameOriginalImage, state.frameInfo);
      const url = URL.createObjectURL(blob);
      const previousUrl = state.frameHolePreviewUrl;
      state.frameHolePreviewUrl = url;
      await new Promise((resolve) => {
        elements.framePreview.onload = () => {
          renderAreaBox();
          resolve();
        };
        elements.framePreview.src = url;
      });
      if (previousUrl) URL.revokeObjectURL(previousUrl);
    } catch (err) {
      console.error('Erro ao gerar prévia com área transparente:', err);
    }
  }

  // =====================================================
  // VERIFICAR SUPORTE A SHAREDARRAYBUFFER
  // =====================================================
  function checkSharedArrayBuffer() {
    if (typeof SharedArrayBuffer === 'undefined') {
      if (elements.warningBanner) elements.warningBanner.classList.remove('hidden');
      if (elements.browserAlert) elements.browserAlert.hidden = false;
      return false;
    }
    return true;
  }

  // =====================================================
  // FFmpeg - CARREGAR (VERSÃO 0.11.6 ESTÁVEL)
  // =====================================================
  let ffmpegLoadPromise = null;

  function loadFFmpeg() {
    if (state.ffmpegLoaded) return Promise.resolve();
    if (ffmpegLoadPromise) return ffmpegLoadPromise; // evita corrida se chamado 2x

    // O core padrão do @ffmpeg/ffmpeg 0.11.6 é single-thread e NÃO exige
    // SharedArrayBuffer para funcionar — por isso apenas avisamos o usuário
    // (banner informativo) em vez de bloquear o carregamento do FFmpeg.
    checkSharedArrayBuffer();

    ffmpegLoadPromise = (async () => {
      try {
        if (!window.FFmpeg) {
          await loadScriptOnce(FFmpegScript);
        }

        const { createFFmpeg, fetchFile } = window.FFmpeg;

        state.ffmpeg = createFFmpeg({
          log: false,
          progress: (p) => {
            const percent = Math.min(100, Math.max(0, p.ratio * 100));
            updateCurrentVideoProgress(percent);
          }
        });

        await state.ffmpeg.load();
        state.fetchFile = fetchFile;
        state.ffmpegLoaded = true;

        showToast('FFmpeg carregado com sucesso!', 'success');
      } catch (err) {
        console.error('Erro ao carregar FFmpeg:', err);
        showToast('Erro ao carregar o processador. Use Chrome/Edge via HTTPS.', 'error');
        ffmpegLoadPromise = null;
        throw err;
      }
    })();

    return ffmpegLoadPromise;
  }

  // =====================================================
  // UPLOAD DE MOLDURA
  // =====================================================
  function setupFrameUpload() {
    // O input#frame-input já cobre 100% da área da dropzone (posicionado em
    // cima, transparente) e por isso já abre o seletor de arquivo sozinho ao
    // ser clicado. NÃO adicionamos um clique extra no container, senão o
    // seletor de arquivo abre duas vezes por clique.

    elements.frameInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFrameFile(file);
    });

    setupDragDrop(elements.frameDropArea, (files) => {
      if (files.length > 0) handleFrameFile(files[0]);
    });

    elements.removeFrameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFrame();
    });
  }

  async function handleFrameFile(file) {
    if (!file.type.includes('png')) {
      showToast('A moldura deve ser um arquivo PNG', 'error');
      return;
    }

    state.frameFile = file;
    elements.frameName.textContent = file.name;
    elements.frameSize.textContent = formatBytes(file.size);
    elements.framePreviewContainer.classList.remove('hidden');
    elements.frameDropArea.classList.add('hidden');

    showToast('Carregando moldura...', 'info');

    try {
      const img = await loadImageFromFile(file);
      state.frameOriginalImage = img;
      state.frameInfo = analyzeFrame(img);
      clampFrameInfo();
      showToast(`Moldura carregada: ${state.frameInfo.frameWidth}x${state.frameInfo.frameHeight}px. Ajuste a área do vídeo abaixo.`, 'success');
      await refreshFramePreviewWithHole();
      syncAreaInputs();
    } catch (err) {
      console.error('Erro ao carregar moldura:', err);
      showToast('Erro ao carregar moldura', 'error');
      state.frameInfo = null;
      state.frameOriginalImage = null;
      elements.framePreview.src = URL.createObjectURL(file);
    }

    updateProcessButton();
  }

  function removeFrame() {
    state.frameFile = null;
    state.frameInfo = null;
    state.frameOriginalImage = null;
    if (state.frameHolePreviewUrl) {
      URL.revokeObjectURL(state.frameHolePreviewUrl);
      state.frameHolePreviewUrl = null;
    }
    elements.frameInput.value = '';
    elements.framePreview.src = '';
    elements.framePreviewContainer.classList.add('hidden');
    elements.frameDropArea.classList.remove('hidden');
    updateProcessButton();
  }

  function clampFrameInfo() {
    const fi = state.frameInfo;
    if (!fi) return;
    fi.videoWidth = Math.max(4, Math.min(fi.videoWidth, fi.frameWidth));
    fi.videoHeight = Math.max(4, Math.min(fi.videoHeight, fi.frameHeight));
    fi.videoX = Math.max(0, Math.min(fi.videoX, fi.frameWidth - fi.videoWidth));
    fi.videoY = Math.max(0, Math.min(fi.videoY, fi.frameHeight - fi.videoHeight));
  }

  function getEditorScale() {
    const img = elements.framePreview;
    const naturalW = img.naturalWidth || (state.frameInfo && state.frameInfo.frameWidth) || 1;
    const naturalH = img.naturalHeight || (state.frameInfo && state.frameInfo.frameHeight) || 1;
    const displayedW = img.clientWidth || naturalW;
    const displayedH = img.clientHeight || naturalH;
    return {
      scaleX: displayedW / naturalW,
      scaleY: displayedH / naturalH
    };
  }

  function renderAreaBox() {
    const fi = state.frameInfo;
    if (!fi) return;
    const { scaleX, scaleY } = getEditorScale();
    const box = elements.areaBox;
    box.style.left = `${fi.videoX * scaleX}px`;
    box.style.top = `${fi.videoY * scaleY}px`;
    box.style.width = `${fi.videoWidth * scaleX}px`;
    box.style.height = `${fi.videoHeight * scaleY}px`;
  }

  function syncAreaInputs() {
    const fi = state.frameInfo;
    if (!fi) return;
    elements.areaX.value = Math.round(fi.videoX);
    elements.areaY.value = Math.round(fi.videoY);
    elements.areaW.value = Math.round(fi.videoWidth);
    elements.areaH.value = Math.round(fi.videoHeight);
  }

  function updateFrameInfoFromInputs() {
    const fi = state.frameInfo;
    if (!fi) return;

    let x = parseInt(elements.areaX.value, 10);
    let y = parseInt(elements.areaY.value, 10);
    let w = parseInt(elements.areaW.value, 10);
    let h = parseInt(elements.areaH.value, 10);

    if (isNaN(x)) x = fi.videoX;
    if (isNaN(y)) y = fi.videoY;
    if (isNaN(w)) w = fi.videoWidth;
    if (isNaN(h)) h = fi.videoHeight;

    w = Math.max(4, Math.min(w, fi.frameWidth));
    h = Math.max(4, Math.min(h, fi.frameHeight));
    x = Math.max(0, Math.min(x, fi.frameWidth - w));
    y = Math.max(0, Math.min(y, fi.frameHeight - h));

    fi.videoX = x;
    fi.videoY = y;
    fi.videoWidth = w;
    fi.videoHeight = h;

    renderAreaBox();
    syncAreaInputs();
  }

  function setupAreaEditorEvents() {
    [elements.areaX, elements.areaY, elements.areaW, elements.areaH].forEach((input) => {
      input.addEventListener('change', () => {
        updateFrameInfoFromInputs();
        refreshFramePreviewWithHole();
      });
    });

    elements.areaAutoBtn.addEventListener('click', async () => {
      if (!state.frameOriginalImage) return;
      try {
        state.frameInfo = analyzeFrame(state.frameOriginalImage);
        clampFrameInfo();
        syncAreaInputs();
        await refreshFramePreviewWithHole();
        showToast('Área detectada automaticamente', 'success');
      } catch (err) {
        console.error('Erro ao detectar área:', err);
        showToast('Erro ao detectar área automaticamente', 'error');
      }
    });

    elements.areaResetBtn.addEventListener('click', async () => {
      const fi = state.frameInfo;
      if (!fi) return;
      const margin = 0.15;
      fi.videoX = Math.floor(fi.frameWidth * margin);
      fi.videoY = Math.floor(fi.frameHeight * margin);
      fi.videoWidth = Math.floor(fi.frameWidth * (1 - 2 * margin));
      fi.videoHeight = Math.floor(fi.frameHeight * (1 - 2 * margin));
      syncAreaInputs();
      await refreshFramePreviewWithHole();
    });

    elements.areaBox.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('area-handle')) return;
      e.preventDefault();
      startAreaDrag(e, 'move');
    });

    elements.areaBox.querySelectorAll('.area-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startAreaDrag(e, handle.dataset.handle);
      });
    });

    window.addEventListener('resize', debounce(() => {
      if (state.frameInfo) renderAreaBox();
    }, 100));
  }

  function startAreaDrag(startEvent, mode) {
    const fi = state.frameInfo;
    if (!fi) return;

    const { scaleX, scaleY } = getEditorScale();
    const startX = startEvent.clientX;
    const startY = startEvent.clientY;
    const startFrame = { x: fi.videoX, y: fi.videoY, w: fi.videoWidth, h: fi.videoHeight };
    const pointerId = startEvent.pointerId;

    try { elements.areaBox.setPointerCapture(pointerId); } catch (e) { /* noop */ }

    function onMove(e) {
      const dxNatural = (e.clientX - startX) / scaleX;
      const dyNatural = (e.clientY - startY) / scaleY;

      let { x, y, w, h } = startFrame;

      if (mode === 'move') {
        x = startFrame.x + dxNatural;
        y = startFrame.y + dyNatural;
      } else {
        if (mode.includes('w')) {
          x = startFrame.x + dxNatural;
          w = startFrame.w - dxNatural;
        }
        if (mode.includes('e')) {
          w = startFrame.w + dxNatural;
        }
        if (mode.includes('n')) {
          y = startFrame.y + dyNatural;
          h = startFrame.h - dyNatural;
        }
        if (mode.includes('s')) {
          h = startFrame.h + dyNatural;
        }
      }

      w = Math.max(4, w);
      h = Math.max(4, h);
      x = Math.max(0, Math.min(x, fi.frameWidth - w));
      y = Math.max(0, Math.min(y, fi.frameHeight - h));
      w = Math.min(w, fi.frameWidth - x);
      h = Math.min(h, fi.frameHeight - y);

      fi.videoX = x;
      fi.videoY = y;
      fi.videoWidth = w;
      fi.videoHeight = h;

      renderAreaBox();
      syncAreaInputs();
    }

    function onUp() {
      try { elements.areaBox.releasePointerCapture(pointerId); } catch (e) { /* noop */ }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      refreshFramePreviewWithHole();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // =====================================================
  // UPLOAD DE VÍDEOS
  // =====================================================
  function setupVideosUpload() {
    // Mesmo caso do input da moldura: o input#videos-input já cobre toda a
    // área da dropzone e abre o seletor sozinho, então nada de click() extra
    // aqui — isso é o que causava o seletor abrindo duas vezes.

    elements.videosInput.addEventListener('change', (e) => {
      handleVideoFiles(Array.from(e.target.files));
      elements.videosInput.value = '';
    });

    setupDragDrop(elements.videosDropArea, (files) => {
      const videoFiles = Array.from(files).filter((f) => f.type.startsWith('video/'));
      if (videoFiles.length > 0) handleVideoFiles(videoFiles);
    });
  }

  async function handleVideoFiles(files) {
    if (state.processing) {
      showToast('Aguarde o processamento atual terminar', 'info');
      return;
    }

    let addedCount = 0;

    for (const file of files) {
      if (!file.type.startsWith('video/')) {
        showToast(`"${file.name}" não é um vídeo válido`, 'error');
        continue;
      }

      const duration = await getVideoDuration(file);
      const video = {
        id: generateId(),
        file,
        name: file.name,
        size: file.size,
        duration,
        status: 'waiting',
        progress: 0,
        thumbUrl: null,
        outputBlob: null,
        outputUrl: null
      };

      state.videos.push(video);
      renderVideoItem(video);
      addedCount++;
    }

    updateVideosListUI();

    if (addedCount > 0) showToast(`${addedCount} vídeo(s) adicionado(s)`, 'success');
  }

  function renderVideoItem(video) {
    const item = document.createElement('li');
    item.className = 'video-entry';
    item.dataset.id = video.id;
    item.dataset.status = 'waiting';

    const thumbDiv = document.createElement('div');
    thumbDiv.className = 'video-thumb';
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.playsInline = true;
    video.thumbUrl = URL.createObjectURL(video.file);
    videoEl.src = video.thumbUrl;
    videoEl.addEventListener('loadeddata', () => {
      videoEl.currentTime = 1;
    });
    thumbDiv.appendChild(videoEl);

    const infoDiv = document.createElement('div');
    infoDiv.className = 'video-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'video-name';
    nameDiv.title = video.name;
    nameDiv.textContent = video.name; // textContent evita XSS via nome de arquivo

    const metaDiv = document.createElement('div');
    metaDiv.className = 'video-meta-line';
    metaDiv.textContent = `${formatBytes(video.size)} • ${formatDuration(video.duration)}`;

    const progressBar = document.createElement('div');
    progressBar.className = 'video-progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'fill';
    progressBar.appendChild(progressFill);

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(metaDiv);
    infoDiv.appendChild(progressBar);

    const statusDiv = document.createElement('div');
    statusDiv.className = 'video-status-badge status-pending';
    statusDiv.textContent = 'Aguardando';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-remove-video';
    removeBtn.title = 'Remover';
    removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    removeBtn.addEventListener('click', () => removeVideo(video.id));

    item.appendChild(thumbDiv);
    item.appendChild(infoDiv);
    item.appendChild(statusDiv);
    item.appendChild(removeBtn);
    elements.videosList.appendChild(item);
  }

  function removeVideo(id) {
    if (state.processing) {
      showToast('Não é possível remover durante o processamento', 'info');
      return;
    }

    const idx = state.videos.findIndex((v) => v.id === id);
    if (idx >= 0) {
      const video = state.videos[idx];
      if (video.outputUrl) URL.revokeObjectURL(video.outputUrl);
      if (video.thumbUrl) URL.revokeObjectURL(video.thumbUrl);
      state.videos.splice(idx, 1);
      const el = elements.videosList.querySelector(`[data-id="${id}"]`);
      if (el) el.remove();
      updateVideosListUI();
    }
  }

  function updateVideosListUI() {
    const count = state.videos.length;
    elements.videosCount.textContent = count;

    elements.videosListSection.classList.toggle('hidden', count === 0);

    updateProcessButton();
  }

  function updateProcessButton() {
    const hasFrame = !!state.frameFile;
    const hasVideos = state.videos.length > 0;
    elements.processAllBtn.disabled = !(hasFrame && hasVideos) || state.processing;
  }

  function setupDragDrop(area, onDrop) {
    ['dragenter', 'dragover'].forEach((evt) => {
      area.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        area.classList.add('drag-over');
      });
    });

    ['dragleave', 'drop'].forEach((evt) => {
      area.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        area.classList.remove('drag-over');
      });
    });

    area.addEventListener('drop', (e) => {
      const files = e.dataTransfer.files;
      if (files && files.length > 0) onDrop(files);
    });
  }

  // =====================================================
  // LIMPAR FILA
  // =====================================================
  function setupClearQueue() {
    elements.clearQueueBtn.addEventListener('click', () => {
      if (state.processing) {
        showToast('Não é possível limpar durante o processamento', 'info');
        return;
      }

      state.videos.forEach((v) => {
        if (v.outputUrl) URL.revokeObjectURL(v.outputUrl);
        if (v.thumbUrl) URL.revokeObjectURL(v.thumbUrl);
      });

      state.videos = [];
      elements.videosList.innerHTML = '';
      updateVideosListUI();
      showToast('Fila limpa', 'info');
    });
  }

  // =====================================================
  // PROCESSAMENTO
  // =====================================================
  function setupProcessAll() {
    elements.processAllBtn.addEventListener('click', async () => {
      if (state.processing) return;
      if (!state.frameFile || state.videos.length === 0) return;

      try {
        await loadFFmpeg();
      } catch (err) {
        return;
      }

      // Gera, a partir da moldura ORIGINAL, uma versão com um furo 100%
      // transparente exatamente na área que o usuário definiu no editor —
      // isso garante que o vídeo apareça ali mesmo que o PNG enviado não
      // tivesse transparência real nenhuma.
      let frameForProcessing = state.frameFile;
      if (state.frameOriginalImage && state.frameInfo) {
        try {
          frameForProcessing = await generateFrameWithHole(state.frameOriginalImage, state.frameInfo);
        } catch (err) {
          console.error('Erro ao preparar a moldura com área transparente:', err);
          showToast('Erro ao preparar a moldura. Tente ajustar a área novamente.', 'error');
          return;
        }
      }

      state.processing = true;
      updateProcessButton();

      elements.progressSection.classList.remove('hidden');
      elements.resultsSection.classList.remove('hidden');
      elements.resultsList.innerHTML = '';
      elements.downloadAllBtn.classList.add('hidden');

      updateOverallProgress(0);
      elements.progressStatus.textContent = 'Iniciando processamento...';

      let completedCount = 0;
      const total = state.videos.length;

      for (let i = 0; i < state.videos.length; i++) {
        const video = state.videos[i];

        if (video.status === 'completed') {
          completedCount++;
          continue;
        }

        elements.progressStatus.textContent = `Processando vídeo ${i + 1} de ${total}: ${video.name}`;
        setVideoStatus(video.id, 'processing');

        try {
          await processVideo(video, frameForProcessing);
          video.status = 'completed';
          setVideoStatus(video.id, 'done');
          addResultItem(video);
          completedCount++;
          showToast(`"${video.name}" processado com sucesso!`, 'success');
        } catch (err) {
          console.error('Erro ao processar vídeo:', err);
          video.status = 'error';
          setVideoStatus(video.id, 'error');
          showToast(`Erro ao processar "${video.name}": ${err.message || 'erro desconhecido'}`, 'error');
        }

        updateOverallProgress((completedCount / total) * 100);
      }

      state.processing = false;
      elements.progressStatus.textContent = 'Processamento concluído!';
      updateProcessButton();

      const successCount = state.videos.filter((v) => v.status === 'completed').length;
      elements.resultsCount.textContent = successCount;

      if (successCount > 0) elements.downloadAllBtn.classList.remove('hidden');

      showToast('Processamento finalizado!', 'success');
    });
  }

  // =====================================================
  // PROCESSAR VÍDEO - COM OVERLAY
  // =====================================================
  async function processVideo(video, frameSource) {
    const ffmpeg = state.ffmpeg;
    const fetchFile = state.fetchFile;
    const inputName = `input_${video.id}.mp4`;
    const frameName = `frame_${video.id}.png`;
    const outputName = `output_${video.id}.mp4`;

    await ffmpeg.FS('writeFile', inputName, await fetchFile(video.file));
    await ffmpeg.FS('writeFile', frameName, await fetchFile(frameSource || state.frameFile));

    const frameInfo = state.frameInfo;
    const duration = video.duration && isFinite(video.duration) ? video.duration : 3600;

    let command;

    // IMPORTANTE: a moldura (PNG com centro transparente) precisa ficar
    // POR CIMA do vídeo no overlay, senão o vídeo (opaco) cobre a arte da
    // moldura por inteiro e ela nunca aparece. O vídeo é a camada de baixo,
    // encaixado dentro da área transparente; a moldura é a camada de cima.
    if (!frameInfo) {
      command = [
        '-i', inputName,
        '-loop', '1',
        '-i', frameName,
        '-t', String(duration),
        '-filter_complex',
        '[1:v]format=rgba[frame];[0:v]scale=iw:ih[video];[video][frame]overlay=(W-w)/2:(H-h)/2:format=auto:eof_action=pass[out]',
        '-map', '[out]',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputName
      ];
    } else {
      command = [
        '-i', inputName,
        '-loop', '1',
        '-i', frameName,
        '-t', String(duration),
        '-filter_complex',
        `[0:v]scale=${frameInfo.videoWidth}:${frameInfo.videoHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${frameInfo.videoWidth}:${frameInfo.videoHeight}:(ow-iw)/2:(oh-ih)/2:black,` +
        `pad=${frameInfo.frameWidth}:${frameInfo.frameHeight}:${frameInfo.videoX}:${frameInfo.videoY}:black[video];` +
        `[1:v]scale=${frameInfo.frameWidth}:${frameInfo.frameHeight},format=rgba[frame];` +
        `[video][frame]overlay=0:0:format=auto:eof_action=pass[out]`,
        '-map', '[out]',
        '-map', '0:a?',
        '-c:a', 'copy',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outputName
      ];
    }

    try {
      await ffmpeg.run(...command);
      const data = ffmpeg.FS('readFile', outputName);
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      video.outputBlob = blob;
      video.outputUrl = URL.createObjectURL(blob);
      video.progress = 100;
      updateVideoProgressUI(video.id, 100);
    } finally {
      // Garante limpeza dos arquivos temporários mesmo se o processamento falhar.
      [inputName, frameName, outputName].forEach((name) => {
        try { ffmpeg.FS('unlink', name); } catch (e) { /* arquivo pode não existir */ }
      });
    }
  }

  function updateCurrentVideoProgress(percent) {
    const currentVideo = state.videos.find((v) => v.status === 'processing');
    if (!currentVideo) return;
    currentVideo.progress = percent;
    updateVideoProgressUI(currentVideo.id, percent);
  }

  function updateVideoProgressUI(id, percent) {
    const el = elements.videosList.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    const fill = el.querySelector('.fill');
    if (fill) fill.style.width = `${percent}%`;
  }

  function setVideoStatus(id, status) {
    const el = elements.videosList.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.dataset.status = status;

    const statusDiv = el.querySelector('.video-status-badge');
    if (!statusDiv) return;

    const labels = { waiting: 'Aguardando', processing: 'Processando', done: 'Pronto', error: 'Erro' };
    const classes = { waiting: 'status-pending', processing: 'status-active', done: 'status-complete', error: 'status-failed' };

    statusDiv.className = `video-status-badge ${classes[status]}`;
    statusDiv.textContent = labels[status];
  }

  function updateOverallProgress(percent) {
    percent = Math.min(100, Math.max(0, percent));
    elements.overallProgressFill.style.width = `${percent}%`;
    elements.overallProgressText.textContent = `${Math.round(percent)}%`;

    const completed = state.videos.filter((v) => v.status === 'done' || v.status === 'error').length;
    elements.overallProgressCount.textContent = `${completed} de ${state.videos.length} concluídos`;
  }

  // =====================================================
  // RESULTADOS
  // =====================================================
  function makeOutputName(video, suffixIfDuplicate) {
    const base = video.name.replace(/\.[^/.]+$/, '');
    return suffixIfDuplicate ? `${base}_framed_${suffixIfDuplicate}.mp4` : `${base}_framed.mp4`;
  }

  function addResultItem(video) {
    const item = document.createElement('li');
    item.className = 'result-entry';

    const outputName = makeOutputName(video);

    const iconDiv = document.createElement('div');
    iconDiv.className = 'result-icon';
    iconDiv.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    `;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'result-info';

    const nameDiv = document.createElement('div');
    nameDiv.className = 'result-name';
    nameDiv.title = outputName;
    nameDiv.textContent = outputName;

    const sizeDiv = document.createElement('div');
    sizeDiv.className = 'result-size';
    sizeDiv.textContent = formatBytes(video.outputBlob.size);

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(sizeDiv);

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'btn-download-single';
    downloadBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Baixar
    `;
    downloadBtn.addEventListener('click', () => downloadFile(video.outputUrl, outputName));

    item.appendChild(iconDiv);
    item.appendChild(infoDiv);
    item.appendChild(downloadBtn);
    elements.resultsList.appendChild(item);
  }

  function setupDownloadAll() {
    elements.downloadAllBtn.addEventListener('click', async () => {
      const completed = state.videos.filter((v) => v.status === 'completed' && v.outputBlob);
      if (completed.length === 0) return;

      elements.downloadAllBtn.disabled = true;
      const originalHTML = elements.downloadAllBtn.innerHTML;
      elements.downloadAllBtn.innerHTML = '<span class="spinner"></span> Gerando ZIP...';

      try {
        if (!window.JSZip) {
          await loadScriptOnce(JSZipScript);
        }

        const zip = new JSZip();
        const usedNames = new Set();
        for (const video of completed) {
          let outputName = makeOutputName(video);
          let counter = 2;
          while (usedNames.has(outputName)) {
            outputName = makeOutputName(video, counter);
            counter++;
          }
          usedNames.add(outputName);
          zip.file(outputName, video.outputBlob);
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        downloadBlob(zipBlob, `video-frame-studio-${Date.now()}.zip`);
        showToast('ZIP gerado com sucesso!', 'success');
      } catch (err) {
        console.error('Erro ao gerar ZIP:', err);
        showToast('Erro ao gerar arquivo ZIP', 'error');
      } finally {
        elements.downloadAllBtn.disabled = false;
        elements.downloadAllBtn.innerHTML = originalHTML;
      }
    });
  }

  // =====================================================
  // INICIALIZAÇÃO
  // =====================================================
  function init() {
    checkSharedArrayBuffer();
    setupFrameUpload();
    setupVideosUpload();
    setupAreaEditorEvents();
    setupClearQueue();
    setupProcessAll();
    setupDownloadAll();
    updateProcessButton();
  }

  init();

  // Expõe apenas o necessário para o módulo do editor de molduras (abaixo),
  // sem poluir o escopo global com todas as funções internas.
  window.VideoFrameStudio = {
    handleFrameFile,
    clampFrameInfo,
    syncAreaInputs,
    refreshFramePreviewWithHole,
    showToast,
    getState: () => state
  };
})();

/* =====================================================
 * TROCA DE ABAS + EDITOR DE MOLDURAS (Fabric.js)
 * ===================================================== */
(function () {
  const FabricScript = 'https://cdnjs.cloudflare.com/ajax/libs/fabric.js/5.3.0/fabric.min.js';

  // ---------- Troca de abas ----------
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');
  let editorInitialized = false;

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      tabButtons.forEach((b) => {
        const active = b.dataset.tab === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      tabPanels.forEach((p) => {
        p.classList.toggle('active', p.id === `tab-panel-${target}`);
      });
      if (target === 'editor' && !editorInitialized) {
        initEditor().catch((err) => {
          console.error('Erro ao iniciar editor:', err);
          toast('Erro ao carregar o editor', 'error');
        });
      }
    });
  });

  // ---------- Utilidades ----------
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === 'true') return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => reject(new Error(`Falha ao carregar ${src}`)));
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.dataset.src = src;
      s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
      s.onerror = () => reject(new Error(`Falha ao carregar ${src}`));
      document.head.appendChild(s);
    });
  }

  function toast(msg, type) {
    if (window.VideoFrameStudio && typeof window.VideoFrameStudio.showToast === 'function') {
      window.VideoFrameStudio.showToast(msg, type || 'info');
    }
  }

  function debounce(fn, wait) {
    let t = null;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  // ---------- Estado do editor ----------
  const ed = {
    canvas: null,
    width: 1080,
    height: 1080,
    viewScale: 1,
    snap: true,
    grid: false,
    history: [],
    historyIndex: -1,
    historyLock: false,
    videoAreaObj: null,
  };

  async function initEditor() {
    editorInitialized = true;
    toast('Carregando editor...', 'info');
    try {
      await loadScriptOnce(FabricScript);
    } catch (e) {
      toast('Não foi possível carregar o Fabric.js', 'error');
      editorInitialized = false;
      return;
    }

    const canvasEl = document.getElementById('ed-fabric-canvas');
    canvasEl.width = ed.width;
    canvasEl.height = ed.height;

    ed.canvas = new fabric.Canvas('ed-fabric-canvas', {
      backgroundColor: '#ffffff',
      preserveObjectStacking: true,
    });
    ed.canvas.setDimensions({ width: ed.width, height: ed.height });

    fitCanvasToViewport();
    window.addEventListener('resize', debounce(fitCanvasToViewport, 100));

    wireEditorControls();
    wireSelectionEvents();
    wireKeyboard();
    pushHistory();
    updateLayers();
    updatePropsPanel();
    updateSizeLabel();
    toast('Editor pronto!', 'success');
  }

  function fitCanvasToViewport() {
    if (!ed.canvas) return;
    const viewport = document.querySelector('.editor-canvas-viewport');
    if (!viewport) return;
    const availW = viewport.clientWidth - 80;
    const availH = viewport.clientHeight - 80;
    const scale = Math.min(availW / ed.width, availH / ed.height, 1);
    ed.viewScale = scale;
    const stage = document.getElementById('ed-canvas-stage');
    const upperCanvas = ed.canvas.upperCanvasEl;
    const lowerCanvas = ed.canvas.lowerCanvasEl;
    const displayW = ed.width * scale;
    const displayH = ed.height * scale;
    [lowerCanvas, upperCanvas].forEach((c) => {
      if (!c) return;
      c.style.width = `${displayW}px`;
      c.style.height = `${displayH}px`;
    });
    if (stage) {
      stage.style.width = `${displayW}px`;
      stage.style.height = `${displayH}px`;
    }
  }

  function updateSizeLabel() {
    const label = document.getElementById('ed-canvas-size-label');
    if (label) label.textContent = `${ed.width} × ${ed.height}px`;
  }

  // ---------- Histórico ----------
  function pushHistory() {
    if (!ed.canvas || ed.historyLock) return;
    const json = JSON.stringify(ed.canvas.toJSON(['isVideoArea', 'name']));
    ed.history = ed.history.slice(0, ed.historyIndex + 1);
    ed.history.push(json);
    if (ed.history.length > 50) ed.history.shift();
    ed.historyIndex = ed.history.length - 1;
    refreshUndoRedoButtons();
  }

  function refreshUndoRedoButtons() {
    const u = document.getElementById('ed-undo-btn');
    const r = document.getElementById('ed-redo-btn');
    if (u) u.disabled = ed.historyIndex <= 0;
    if (r) r.disabled = ed.historyIndex >= ed.history.length - 1;
  }

  function restoreHistory(idx) {
    if (idx < 0 || idx >= ed.history.length) return;
    ed.historyLock = true;
    ed.canvas.loadFromJSON(ed.history[idx], () => {
      ed.canvas.renderAll();
      ed.historyLock = false;
      ed.historyIndex = idx;
      ed.videoAreaObj = ed.canvas.getObjects().find((o) => o.isVideoArea) || null;
      updateLayers();
      updatePropsPanel();
      refreshUndoRedoButtons();
    });
  }

  function undo() { restoreHistory(ed.historyIndex - 1); }
  function redo() { restoreHistory(ed.historyIndex + 1); }

  // ---------- Adicionar objetos ----------
  function addImageFromFile(file, opts = {}) {
    const reader = new FileReader();
    reader.onload = (e) => {
      fabric.Image.fromURL(e.target.result, (img) => {
        const maxSide = Math.min(ed.width, ed.height) * 0.6;
        const scale = Math.min(maxSide / img.width, maxSide / img.height, 1);
        img.set({
          left: ed.width / 2,
          top: ed.height / 2,
          originX: 'center',
          originY: 'center',
          scaleX: scale,
          scaleY: scale,
          name: opts.name || file.name,
        });
        ed.canvas.add(img).setActiveObject(img);
        ed.canvas.renderAll();
      }, { crossOrigin: 'anonymous' });
    };
    reader.readAsDataURL(file);
  }

  function addText() {
    const t = new fabric.IText('Digite aqui', {
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      fontFamily: 'Inter', fontSize: 64, fill: '#111111', fontWeight: '700',
      name: 'Texto',
    });
    ed.canvas.add(t).setActiveObject(t);
    ed.canvas.renderAll();
  }

  function addRect() {
    const r = new fabric.Rect({
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      width: 300, height: 200,
      fill: '#10b981', stroke: '', strokeWidth: 0,
      name: 'Retângulo',
    });
    ed.canvas.add(r).setActiveObject(r);
  }

  function addCircle() {
    const c = new fabric.Circle({
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      radius: 120, fill: '#3b82f6',
      name: 'Círculo',
    });
    ed.canvas.add(c).setActiveObject(c);
  }

  function addLine() {
    const l = new fabric.Line([ed.width / 2 - 150, ed.height / 2, ed.width / 2 + 150, ed.height / 2], {
      stroke: '#111111', strokeWidth: 6, name: 'Linha',
    });
    ed.canvas.add(l).setActiveObject(l);
  }

  function addTriangle() {
    const t = new fabric.Triangle({
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      width: 240, height: 220, fill: '#f59e0b', name: 'Triângulo',
    });
    ed.canvas.add(t).setActiveObject(t);
  }

  function addStar() {
    const points = [];
    const spikes = 5;
    const outer = 130, inner = 55;
    for (let i = 0; i < spikes * 2; i++) {
      const rad = (i * Math.PI) / spikes - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      points.push({ x: Math.cos(rad) * r, y: Math.sin(rad) * r });
    }
    const s = new fabric.Polygon(points, {
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      fill: '#eab308', name: 'Estrela',
    });
    ed.canvas.add(s).setActiveObject(s);
  }

  function addGradient() {
    const r = new fabric.Rect({
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      width: 500, height: 300, name: 'Gradiente',
    });
    r.set('fill', new fabric.Gradient({
      type: 'linear',
      coords: { x1: 0, y1: 0, x2: 500, y2: 0 },
      colorStops: [
        { offset: 0, color: '#8b5cf6' },
        { offset: 1, color: '#10b981' },
      ],
    }));
    ed.canvas.add(r).setActiveObject(r);
  }

  function addVideoArea(shape) {
    // Remove existente
    if (ed.videoAreaObj) {
      ed.canvas.remove(ed.videoAreaObj);
      ed.videoAreaObj = null;
    }
    const w = Math.round(ed.width * 0.6);
    const h = shape === 'square' ? w : Math.round(ed.height * 0.6);
    const r = new fabric.Rect({
      left: ed.width / 2, top: ed.height / 2,
      originX: 'center', originY: 'center',
      width: w, height: h,
      fill: 'rgba(16,185,129,0.15)',
      stroke: '#10b981', strokeWidth: 4, strokeDashArray: [12, 8],
      name: '🎬 Área do Vídeo',
    });
    r.isVideoArea = true;
    ed.videoAreaObj = r;
    ed.canvas.add(r).setActiveObject(r);
    toast('Área do vídeo criada — arraste/redimensione ao gosto', 'success');
  }

  // ---------- Seleção & propriedades ----------
  function wireSelectionEvents() {
    ed.canvas.on('object:added', () => { updateLayers(); pushHistory(); });
    ed.canvas.on('object:removed', () => { updateLayers(); pushHistory(); });
    ed.canvas.on('object:modified', () => { pushHistory(); updatePropsPanel(); });
    ed.canvas.on('selection:created', updatePropsPanel);
    ed.canvas.on('selection:updated', updatePropsPanel);
    ed.canvas.on('selection:cleared', updatePropsPanel);
    ed.canvas.on('object:moving', snapToGrid);
    ed.canvas.on('object:scaling', snapToGrid);
  }

  function snapToGrid(e) {
    if (!ed.snap) return;
    const g = 10;
    const o = e.target;
    o.set({ left: Math.round(o.left / g) * g, top: Math.round(o.top / g) * g });
  }

  function updatePropsPanel() {
    const body = document.getElementById('ed-props-body');
    if (!body) return;
    const obj = ed.canvas && ed.canvas.getActiveObject();
    if (!obj) {
      body.innerHTML = '<div class="editor-empty-props">Selecione um elemento no canvas para editar suas propriedades.</div>';
      return;
    }
    const isText = obj.type === 'i-text' || obj.type === 'text' || obj.type === 'textbox';
    const hasFill = 'fill' in obj && typeof obj.fill === 'string';
    const hasStroke = 'stroke' in obj;
    let html = '';
    if (obj.isVideoArea) {
      html += `<div class="prop-row"><span class="video-area-tag">ÁREA DO VÍDEO</span></div>`;
    }
    html += `
      <div class="prop-row-inline">
        <div class="prop-row"><label class="prop-label">X</label><input class="prop-input" type="number" data-prop="left" value="${Math.round(obj.left)}"></div>
        <div class="prop-row"><label class="prop-label">Y</label><input class="prop-input" type="number" data-prop="top" value="${Math.round(obj.top)}"></div>
      </div>
      <div class="prop-row-inline">
        <div class="prop-row"><label class="prop-label">Largura</label><input class="prop-input" type="number" data-prop="width" value="${Math.round(obj.getScaledWidth())}"></div>
        <div class="prop-row"><label class="prop-label">Altura</label><input class="prop-input" type="number" data-prop="height" value="${Math.round(obj.getScaledHeight())}"></div>
      </div>
      <div class="prop-row"><label class="prop-label">Rotação (°)</label><input class="prop-input" type="number" data-prop="angle" value="${Math.round(obj.angle || 0)}"></div>
      <div class="prop-row"><label class="prop-label">Opacidade</label><input class="prop-input" type="range" min="0" max="1" step="0.05" data-prop="opacity" value="${obj.opacity ?? 1}"></div>
    `;
    if (hasFill) {
      html += `<div class="prop-row"><label class="prop-label">Preenchimento</label><input class="prop-color-input" type="color" data-prop="fill" value="${toHex(obj.fill)}"></div>`;
    }
    if (hasStroke) {
      html += `
        <div class="prop-row"><label class="prop-label">Contorno</label><input class="prop-color-input" type="color" data-prop="stroke" value="${toHex(obj.stroke || '#000000')}"></div>
        <div class="prop-row"><label class="prop-label">Espessura</label><input class="prop-input" type="number" min="0" step="1" data-prop="strokeWidth" value="${obj.strokeWidth || 0}"></div>
      `;
    }
    if (isText) {
      const textValue = (obj.text || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
      html += `
        <div class="prop-row"><label class="prop-label">Texto</label><input class="prop-input" data-prop="text" value="${textValue}"></div>
        <div class="prop-row"><label class="prop-label">Fonte</label>
          <select class="prop-select" data-prop="fontFamily">
            ${['Inter', 'Arial', 'Georgia', 'Times New Roman', 'Courier New', 'Impact', 'Verdana', 'Trebuchet MS'].map((f) => `<option${obj.fontFamily === f ? ' selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="prop-row-inline">
          <div class="prop-row"><label class="prop-label">Tamanho</label><input class="prop-input" type="number" data-prop="fontSize" value="${obj.fontSize || 32}"></div>
          <div class="prop-row"><label class="prop-label">Peso</label>
            <select class="prop-select" data-prop="fontWeight">
              ${['400', '500', '600', '700', '800'].map((w) => `<option${String(obj.fontWeight) === w ? ' selected' : ''}>${w}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="prop-row">
          <label class="prop-label">Alinhamento</label>
          <div class="prop-btn-toggle-group">
            ${['left', 'center', 'right'].map((a) => `<button type="button" class="prop-btn-toggle${obj.textAlign === a ? ' active' : ''}" data-textalign="${a}">${a === 'left' ? '⯇' : a === 'center' ? '☰' : '⯈'}</button>`).join('')}
          </div>
        </div>
      `;
    }
    body.innerHTML = html;

    body.querySelectorAll('[data-prop]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const prop = inp.dataset.prop;
        const val = inp.type === 'number' || inp.type === 'range' ? parseFloat(inp.value) : inp.value;
        if (prop === 'width') obj.set({ scaleX: val / obj.width });
        else if (prop === 'height') obj.set({ scaleY: val / obj.height });
        else obj.set(prop, val);
        if (prop === 'text' && obj.setCoords) obj.setCoords();
        ed.canvas.renderAll();
      });
      inp.addEventListener('change', () => pushHistory());
    });
    body.querySelectorAll('[data-textalign]').forEach((btn) => {
      btn.addEventListener('click', () => {
        obj.set('textAlign', btn.dataset.textalign);
        ed.canvas.renderAll();
        updatePropsPanel();
        pushHistory();
      });
    });
  }

  function toHex(color) {
    if (!color || typeof color !== 'string') return '#000000';
    if (color.startsWith('#')) return color.length === 7 ? color : '#000000';
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (m) return '#' + [1, 2, 3].map((i) => parseInt(m[i], 10).toString(16).padStart(2, '0')).join('');
    return '#000000';
  }

  // ---------- Camadas ----------
  function updateLayers() {
    const list = document.getElementById('ed-layers-list');
    if (!list || !ed.canvas) return;
    list.innerHTML = '';
    const objs = ed.canvas.getObjects().slice().reverse();
    const active = ed.canvas.getActiveObject();
    const fragment = document.createDocumentFragment();
    objs.forEach((o) => {
      const li = document.createElement('li');
      li.className = 'layer-item' + (o === active ? ' selected' : '');

      const icon = document.createElement('span');
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>';
      const label = document.createElement('span');
      label.textContent = o.name || o.type; // textContent evita XSS via nome de camada

      li.appendChild(icon.firstChild);
      li.appendChild(label);
      li.addEventListener('click', () => {
        ed.canvas.setActiveObject(o);
        ed.canvas.renderAll();
        updateLayers();
        updatePropsPanel();
      });
      fragment.appendChild(li);
    });
    list.appendChild(fragment);
  }

  // ---------- Teclado ----------
  function wireKeyboard() {
    document.addEventListener('keydown', (e) => {
      const panel = document.getElementById('tab-panel-editor');
      if (!panel || !panel.classList.contains('active')) return;
      const target = e.target;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
        e.preventDefault();
        redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const obj = ed.canvas.getActiveObject();
        if (obj) {
          ed.canvas.remove(obj);
          ed.canvas.discardActiveObject();
          ed.canvas.renderAll();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateActive();
      }
    });
  }

  function duplicateActive() {
    const obj = ed.canvas.getActiveObject();
    if (!obj) return;
    obj.clone((cloned) => {
      cloned.set({ left: (obj.left || 0) + 20, top: (obj.top || 0) + 20 });
      if (obj.isVideoArea) cloned.isVideoArea = false; // apenas uma área
      ed.canvas.add(cloned).setActiveObject(cloned);
      ed.canvas.renderAll();
    }, ['isVideoArea', 'name']);
  }

  // ---------- Controles / botões ----------
  function wireEditorControls() {
    // Formato
    document.getElementById('ed-format-select').addEventListener('change', (e) => {
      const [w, h] = e.target.value.split('x').map(Number);
      ed.width = w;
      ed.height = h;
      ed.canvas.setDimensions({ width: w, height: h });
      fitCanvasToViewport();
      updateSizeLabel();
      pushHistory();
    });

    // Adicionar imagem/logo
    const imgInput = document.getElementById('ed-image-input');
    document.getElementById('ed-add-image-btn').addEventListener('click', () => imgInput.click());
    imgInput.addEventListener('change', (e) => {
      if (e.target.files[0]) addImageFromFile(e.target.files[0]);
      e.target.value = '';
    });

    const logoInput = document.getElementById('ed-logo-input');
    document.getElementById('ed-add-logo-btn').addEventListener('click', () => logoInput.click());
    logoInput.addEventListener('change', (e) => {
      if (e.target.files[0]) addImageFromFile(e.target.files[0], { name: 'Logo' });
      e.target.value = '';
    });

    // Texto
    document.getElementById('ed-add-text-btn').addEventListener('click', addText);

    // Área do vídeo
    document.getElementById('ed-add-videoarea-btn').addEventListener('click', () => addVideoArea('rect'));
    document.getElementById('ed-videoarea-square-btn').addEventListener('click', () => addVideoArea('square'));
    document.getElementById('ed-videoarea-custom-btn').addEventListener('click', () => addVideoArea('rect'));

    // Elementos
    document.getElementById('ed-el-rect-btn').addEventListener('click', addRect);
    document.getElementById('ed-el-circle-btn').addEventListener('click', addCircle);
    document.getElementById('ed-el-line-btn').addEventListener('click', addLine);
    document.getElementById('ed-el-gradient-btn').addEventListener('click', addGradient);
    document.getElementById('ed-el-star-btn').addEventListener('click', addStar);
    document.getElementById('ed-el-triangle-btn').addEventListener('click', addTriangle);

    // Templates
    document.getElementById('ed-template-futebol-btn').addEventListener('click', loadFutebolTemplate);

    // Guias
    const gridBtn = document.getElementById('ed-toggle-grid-btn');
    gridBtn.addEventListener('click', () => {
      ed.grid = !ed.grid;
      gridBtn.classList.toggle('active', ed.grid);
      document.getElementById('ed-canvas-stage').classList.toggle('show-grid', ed.grid);
    });
    const snapBtn = document.getElementById('ed-toggle-snap-btn');
    snapBtn.addEventListener('click', () => {
      ed.snap = !ed.snap;
      snapBtn.classList.toggle('active', ed.snap);
    });

    // Projeto salvar/carregar
    document.getElementById('ed-save-project-btn').addEventListener('click', saveProject);
    const openInput = document.getElementById('ed-open-project-input');
    document.getElementById('ed-open-project-btn').addEventListener('click', () => openInput.click());
    openInput.addEventListener('change', (e) => {
      if (e.target.files[0]) loadProject(e.target.files[0]);
      e.target.value = '';
    });

    // Enviar para aplicador
    document.getElementById('ed-use-in-applier-btn').addEventListener('click', sendToApplier);

    // Toolbar
    document.getElementById('ed-undo-btn').addEventListener('click', undo);
    document.getElementById('ed-redo-btn').addEventListener('click', redo);
    document.getElementById('ed-front-btn').addEventListener('click', () => { const o = ed.canvas.getActiveObject(); if (o) { ed.canvas.bringToFront(o); pushHistory(); updateLayers(); } });
    document.getElementById('ed-forward-btn').addEventListener('click', () => { const o = ed.canvas.getActiveObject(); if (o) { ed.canvas.bringForward(o); pushHistory(); updateLayers(); } });
    document.getElementById('ed-backward-btn').addEventListener('click', () => { const o = ed.canvas.getActiveObject(); if (o) { ed.canvas.sendBackwards(o); pushHistory(); updateLayers(); } });
    document.getElementById('ed-back-btn').addEventListener('click', () => { const o = ed.canvas.getActiveObject(); if (o) { ed.canvas.sendToBack(o); pushHistory(); updateLayers(); } });
    document.getElementById('ed-duplicate-btn').addEventListener('click', duplicateActive);
    document.getElementById('ed-delete-btn').addEventListener('click', () => {
      const o = ed.canvas.getActiveObject();
      if (o) {
        ed.canvas.remove(o);
        ed.canvas.discardActiveObject();
        ed.canvas.renderAll();
      }
    });

    // Exportar
    document.getElementById('ed-export-png-transparent-btn').addEventListener('click', () => exportImage('png', true));
    document.getElementById('ed-export-png-btn').addEventListener('click', () => exportImage('png', false));
    document.getElementById('ed-export-jpg-btn').addEventListener('click', () => exportImage('jpeg', false));
    document.getElementById('ed-export-webp-btn').addEventListener('click', () => exportImage('webp', false));
    document.getElementById('ed-export-svg-btn').addEventListener('click', exportSVG);
  }

  // ---------- Templates ----------
  function loadFutebolTemplate() {
    ed.canvas.clear();
    ed.canvas.backgroundColor = '#0b3d1e';
    const top = new fabric.Rect({ left: 0, top: 0, width: ed.width, height: 140, fill: '#10b981', name: 'Faixa Topo' });
    const title = new fabric.IText('⚽ GOL!', {
      left: ed.width / 2, top: 70, originX: 'center', originY: 'center',
      fontFamily: 'Impact', fontSize: 82, fill: '#ffffff', name: 'Título',
    });
    const bot = new fabric.Rect({ left: 0, top: ed.height - 120, width: ed.width, height: 120, fill: '#111111', name: 'Faixa Base' });
    const subtitle = new fabric.IText('SEU TIME • #VAMOS', {
      left: ed.width / 2, top: ed.height - 60, originX: 'center', originY: 'center',
      fontFamily: 'Inter', fontWeight: '800', fontSize: 42, fill: '#10b981', name: 'Legenda',
    });
    const areaW = Math.round(ed.width * 0.8);
    const areaH = Math.round(ed.height - 320);
    const area = new fabric.Rect({
      left: ed.width / 2, top: ed.height / 2, originX: 'center', originY: 'center',
      width: areaW, height: areaH,
      fill: 'rgba(16,185,129,0.15)', stroke: '#10b981', strokeWidth: 4, strokeDashArray: [12, 8],
      name: '🎬 Área do Vídeo',
    });
    area.isVideoArea = true;
    ed.videoAreaObj = area;
    ed.canvas.add(top, area, title, bot, subtitle);
    ed.canvas.renderAll();
    pushHistory();
    toast('Template Futebol carregado', 'success');
  }

  // ---------- Salvar / Carregar ----------
  function saveProject() {
    const data = {
      width: ed.width,
      height: ed.height,
      canvas: ed.canvas.toJSON(['isVideoArea', 'name']),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `moldura-${Date.now()}.json`);
  }

  function loadProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        ed.width = data.width || 1080;
        ed.height = data.height || 1080;
        ed.canvas.setDimensions({ width: ed.width, height: ed.height });
        ed.canvas.loadFromJSON(data.canvas, () => {
          ed.canvas.renderAll();
          ed.videoAreaObj = ed.canvas.getObjects().find((o) => o.isVideoArea) || null;
          fitCanvasToViewport();
          updateSizeLabel();
          updateLayers();
          pushHistory();
          toast('Projeto carregado', 'success');
        });
      } catch (err) {
        console.error(err);
        toast('Arquivo inválido', 'error');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Exportar ----------
  function exportImage(format, transparent) {
    if (transparent) {
      // Renderiza sem o retângulo da área do vídeo → fica hole real transparente.
      renderPNGWithHole().then((blob) => downloadBlob(blob, `moldura-${Date.now()}.png`));
      return;
    }
    const wasBg = ed.canvas.backgroundColor;
    if (format === 'jpeg') ed.canvas.backgroundColor = ed.canvas.backgroundColor || '#ffffff';
    const dataUrl = ed.canvas.toDataURL({ format, quality: 0.95, multiplier: 1 });
    ed.canvas.backgroundColor = wasBg;
    dataUrlToBlob(dataUrl).then((blob) => downloadBlob(blob, `moldura-${Date.now()}.${format === 'jpeg' ? 'jpg' : format}`));
  }

  function exportSVG() {
    const svg = ed.canvas.toSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadBlob(blob, `moldura-${Date.now()}.svg`);
  }

  function renderPNGWithHole() {
    return new Promise((resolve) => {
      const va = ed.videoAreaObj;
      const originalBg = ed.canvas.backgroundColor;
      let hidden = false;
      if (va) {
        va.visible = false;
        hidden = true;
      }
      ed.canvas.backgroundColor = null;
      ed.canvas.renderAll();
      const dataUrl = ed.canvas.toDataURL({ format: 'png', multiplier: 1 });
      if (hidden) va.visible = true;
      ed.canvas.backgroundColor = originalBg;
      ed.canvas.renderAll();

      // Se existe uma área, força um clear real no bounding box (garante alpha 0)
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = ed.width;
        c.height = ed.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        if (va) {
          const b = va.getBoundingRect(true, true);
          ctx.clearRect(Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height));
        }
        c.toBlob((blob) => resolve(blob), 'image/png');
      };
      img.src = dataUrl;
    });
  }

  // ---------- Enviar para aba 1 ----------
  async function sendToApplier() {
    if (!ed.videoAreaObj) {
      toast('Crie uma "Área do Vídeo" no editor primeiro', 'error');
      return;
    }
    const blob = await renderPNGWithHole();
    const file = new File([blob], `moldura-editor-${Date.now()}.png`, { type: 'image/png' });

    // Trocar para aba 1
    document.getElementById('tab-btn-apply').click();

    // Alimentar o fluxo existente
    const vfs = window.VideoFrameStudio;
    if (vfs && typeof vfs.handleFrameFile === 'function') {
      await vfs.handleFrameFile(file);
      // Ajusta a área do vídeo baseando na bounding box no editor
      const b = ed.videoAreaObj.getBoundingRect(true, true);
      const state = vfs.getState();
      if (state && state.frameInfo) {
        state.frameInfo.videoX = Math.max(0, Math.round(b.left));
        state.frameInfo.videoY = Math.max(0, Math.round(b.top));
        state.frameInfo.videoWidth = Math.round(b.width);
        state.frameInfo.videoHeight = Math.round(b.height);
        vfs.clampFrameInfo();
        vfs.syncAreaInputs();
        await vfs.refreshFramePreviewWithHole();
      }
      toast('Moldura enviada para a Aba 1!', 'success');
    } else {
      toast('Fluxo do aplicador não encontrado', 'error');
    }
  }

  // ---------- Helpers download ----------
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function dataUrlToBlob(dataUrl) {
    return fetch(dataUrl).then((r) => r.blob());
  }
})();

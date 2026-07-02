// =====================================================
// Video Frame Studio - Script Principal (VERSÃO ESTÁVEL 0.11.6)
// =====================================================
const FFmpegScript = 'https://unpkg.com/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';

const state = {
  ffmpeg: null,
  ffmpegLoaded: false,
  fetchFile: null,
  frameFile: null,
  frameInfo: null,
  videos: [],
  processing: false,
  videoIdCounter: 0
};

const elements = {
  frameDropArea: document.getElementById('frame-drop-area'),
  frameInput: document.getElementById('frame-input'),
  framePreviewContainer: document.getElementById('frame-preview-container'),
  framePreview: document.getElementById('frame-preview'),
  frameName: document.getElementById('frame-name'),
  frameSize: document.getElementById('frame-size'),
  removeFrameBtn: document.getElementById('remove-frame-btn'),
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
// UTILITÁRIOS
// =====================================================
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
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
    video.onloadedmetadata = () => {
      resolve(video.duration);
      URL.revokeObjectURL(url);
    };
    video.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    video.src = url;
  });
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  const iconSvg = type === 'success'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
    : type === 'error'
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// =====================================================
// ANALISAR MOLDURA - Detectar área transparente
// =====================================================
async function analyzeFrame(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const data = imageData.data;
        let minX = img.width, maxX = 0;
        let minY = img.height, maxY = 0;
        let hasTransparent = false;

        for (let y = 0; y < img.height; y++) {
          for (let x = 0; x < img.width; x++) {
            const alpha = data[(y * img.width + x) * 4 + 3];
            if (alpha < 10) {
              hasTransparent = true;
              minX = Math.min(minX, x);
              maxX = Math.max(maxX, x);
              minY = Math.min(minY, y);
              maxY = Math.max(maxY, y);
            }
          }
        }

        if (!hasTransparent || minX >= maxX || minY >= maxY) {
          const margin = 0.1;
          resolve({
            frameWidth: img.width,
            frameHeight: img.height,
            videoX: Math.floor(img.width * margin),
            videoY: Math.floor(img.height * margin),
            videoWidth: Math.floor(img.width * (1 - 2 * margin)),
            videoHeight: Math.floor(img.height * (1 - 2 * margin))
          });
        } else {
          resolve({
            frameWidth: img.width,
            frameHeight: img.height,
            videoX: minX,
            videoY: minY,
            videoWidth: maxX - minX,
            videoHeight: maxY - minY
          });
        }
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// =====================================================
// VERIFICAR SUPORTE A SHAREDARRAYBUFFER
// =====================================================
function checkSharedArrayBuffer() {
  if (typeof SharedArrayBuffer === 'undefined') {
    elements.warningBanner.classList.remove('hidden');
    return false;
  }
  return true;
}

// =====================================================
// FFmpeg - CARREGAR (VERSÃO 0.11.6 ESTÁVEL)
// =====================================================
async function loadFFmpeg() {
  if (state.ffmpegLoaded) return;

  // O core padrão do @ffmpeg/ffmpeg 0.11.6 é single-thread e NÃO exige
  // SharedArrayBuffer para funcionar — por isso apenas avisamos o usuário
  // (banner informativo) em vez de bloquear o carregamento do FFmpeg.
  checkSharedArrayBuffer();

  try {
    if (!window.FFmpeg) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = FFmpegScript;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
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
    throw err;
  }
}

// =====================================================
// UPLOAD DE MOLDURA
// =====================================================
function setupFrameUpload() {
  elements.frameDropArea.addEventListener('click', (e) => {
    if (e.target.closest('#remove-frame-btn')) return;
    elements.frameInput.click();
  });
  
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
  const url = URL.createObjectURL(file);
  elements.framePreview.src = url;
  elements.frameName.textContent = file.name;
  elements.frameSize.textContent = formatBytes(file.size);
  elements.framePreviewContainer.classList.remove('hidden');
  elements.frameDropArea.classList.add('hidden');
  
  showToast('Analisando moldura...', 'info');
  
  try {
    state.frameInfo = await analyzeFrame(file);
    showToast(`Moldura analisada: ${state.frameInfo.frameWidth}x${state.frameInfo.frameHeight}px`, 'success');
  } catch (err) {
    console.error('Erro ao analisar moldura:', err);
    showToast('Erro ao analisar moldura', 'error');
    state.frameInfo = null;
  }
  
  updateProcessButton();
}

function removeFrame() {
  state.frameFile = null;
  state.frameInfo = null;
  elements.frameInput.value = '';
  elements.framePreview.src = '';
  elements.framePreviewContainer.classList.add('hidden');
  elements.frameDropArea.classList.remove('hidden');
  updateProcessButton();
}

// =====================================================
// UPLOAD DE VÍDEOS
// =====================================================
function setupVideosUpload() {
  elements.videosDropArea.addEventListener('click', () => {
    elements.videosInput.click();
  });
  
  elements.videosInput.addEventListener('change', (e) => {
    handleVideoFiles(Array.from(e.target.files));
    elements.videosInput.value = '';
  });
  
  setupDragDrop(elements.videosDropArea, (files) => {
    const videoFiles = Array.from(files).filter(f => f.type.startsWith('video/'));
    if (videoFiles.length > 0) handleVideoFiles(videoFiles);
  });
}

async function handleVideoFiles(files) {
  if (state.processing) {
    showToast('Aguarde o processamento atual terminar', 'info');
    return;
  }
  
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
      outputBlob: null,
      outputUrl: null
    };
    
    state.videos.push(video);
    renderVideoItem(video);
  }
  
  updateVideosListUI();
  
  if (files.length > 0) showToast(`${files.length} vídeo(s) adicionado(s)`, 'success');
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
  videoEl.src = URL.createObjectURL(video.file);
  videoEl.addEventListener('loadeddata', () => {
    videoEl.currentTime = 1;
  });
  thumbDiv.appendChild(videoEl);
  
  const infoDiv = document.createElement('div');
  infoDiv.className = 'video-info';
  infoDiv.innerHTML = `
    <div class="video-name" title="${video.name}">${video.name}</div>
    <div class="video-meta-line">${formatBytes(video.size)} • ${formatDuration(video.duration)}</div>
    <div class="video-progress-bar"><div class="fill"></div></div>
  `;
  
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
  
  const idx = state.videos.findIndex(v => v.id === id);
  if (idx >= 0) {
    if (state.videos[idx].outputUrl) URL.revokeObjectURL(state.videos[idx].outputUrl);
    state.videos.splice(idx, 1);
    const el = elements.videosList.querySelector(`[data-id="${id}"]`);
    if (el) el.remove();
    updateVideosListUI();
  }
}

function updateVideosListUI() {
  const count = state.videos.length;
  elements.videosCount.textContent = count;
  
  if (count === 0) elements.videosListSection.classList.add('hidden');
  else elements.videosListSection.classList.remove('hidden');
  
  updateProcessButton();
}

function updateProcessButton() {
  const hasFrame = !!state.frameFile;
  const hasVideos = state.videos.length > 0;
  elements.processAllBtn.disabled = !(hasFrame && hasVideos) || state.processing;
}

function setupDragDrop(area, onDrop) {
  ['dragenter', 'dragover'].forEach(evt => {
    area.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      area.classList.add('drag-over');
    });
  });
  
  ['dragleave', 'drop'].forEach(evt => {
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
elements.clearQueueBtn.addEventListener('click', () => {
  if (state.processing) {
    showToast('Não é possível limpar durante o processamento', 'info');
    return;
  }
  
  state.videos.forEach(v => {
    if (v.outputUrl) URL.revokeObjectURL(v.outputUrl);
  });
  
  state.videos = [];
  elements.videosList.innerHTML = '';
  updateVideosListUI();
  showToast('Fila limpa', 'info');
});

// =====================================================
// PROCESSAMENTO
// =====================================================
elements.processAllBtn.addEventListener('click', async () => {
  if (state.processing) return;
  if (!state.frameFile || state.videos.length === 0) return;
  
  try {
    await loadFFmpeg();
  } catch (err) {
    return;
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
      await processVideo(video);
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
  
  const successCount = state.videos.filter(v => v.status === 'completed').length;
  elements.resultsCount.textContent = successCount;
  
  if (successCount > 0) elements.downloadAllBtn.classList.remove('hidden');
  
  showToast('Processamento finalizado!', 'success');
});

// =====================================================
// PROCESSAR VÍDEO - COM OVERLAY
// =====================================================
async function processVideo(video) {
  const ffmpeg = state.ffmpeg;
  const fetchFile = state.fetchFile;
  const inputName = `input_${video.id}.mp4`;
  const frameName = `frame_${video.id}.png`;
  const outputName = `output_${video.id}.mp4`;
  
  await ffmpeg.FS('writeFile', inputName, await fetchFile(video.file));
  await ffmpeg.FS('writeFile', frameName, await fetchFile(state.frameFile));
  
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
  
  await ffmpeg.run(...command);
  
  const data = ffmpeg.FS('readFile', outputName);
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  video.outputBlob = blob;
  video.outputUrl = URL.createObjectURL(blob);
  
  try {
    ffmpeg.FS('unlink', inputName);
    ffmpeg.FS('unlink', frameName);
    ffmpeg.FS('unlink', outputName);
  } catch (e) {
    console.warn('Erro ao limpar arquivos temporários:', e);
  }
  
  video.progress = 100;
  updateVideoProgressUI(video.id, 100);
}

function updateCurrentVideoProgress(percent) {
  const currentVideo = state.videos.find(v => v.status === 'processing');
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
  
  const labels = {
    waiting: 'Aguardando',
    processing: 'Processando',
    done: 'Pronto',
    error: 'Erro'
  };
  
  const classes = {
    waiting: 'status-pending',
    processing: 'status-active',
    done: 'status-complete',
    error: 'status-failed'
  };
  
  statusDiv.className = `video-status-badge ${classes[status]}`;
  statusDiv.textContent = labels[status];
}

function updateOverallProgress(percent) {
  percent = Math.min(100, Math.max(0, percent));
  elements.overallProgressFill.style.width = `${percent}%`;
  elements.overallProgressText.textContent = `${Math.round(percent)}%`;
  
  const completed = state.videos.filter(v => v.status === 'done' || v.status === 'error').length;
  elements.overallProgressCount.textContent = `${completed} de ${state.videos.length} concluídos`;
}

// =====================================================
// RESULTADOS
// =====================================================
function addResultItem(video) {
  const item = document.createElement('li');
  item.className = 'result-entry';
  
  const outputName = video.name.replace(/\.[^/.]+$/, '') + '_framed.mp4';
  
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
  infoDiv.innerHTML = `
    <div class="result-name" title="${outputName}">${outputName}</div>
    <div class="result-size">${formatBytes(video.outputBlob.size)}</div>
  `;
  
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
  downloadBtn.addEventListener('click', () => {
    downloadFile(video.outputUrl, outputName);
  });
  
  item.appendChild(iconDiv);
  item.appendChild(infoDiv);
  item.appendChild(downloadBtn);
  elements.resultsList.appendChild(item);
}

function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

elements.downloadAllBtn.addEventListener('click', async () => {
  const completed = state.videos.filter(v => v.status === 'completed' && v.outputBlob);
  if (completed.length === 0) return;
  
  elements.downloadAllBtn.disabled = true;
  const originalHTML = elements.downloadAllBtn.innerHTML;
  elements.downloadAllBtn.innerHTML = '<span class="spinner"></span> Gerando ZIP...';
  
  try {
    if (!window.JSZip) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }
    
    const zip = new JSZip();
    const usedNames = new Set();
    for (const video of completed) {
      let outputName = video.name.replace(/\.[^/.]+$/, '') + '_framed.mp4';
      let counter = 2;
      while (usedNames.has(outputName)) {
        outputName = video.name.replace(/\.[^/.]+$/, '') + `_framed_${counter}.mp4`;
        counter++;
      }
      usedNames.add(outputName);
      zip.file(outputName, video.outputBlob);
    }
    
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    downloadFile(zipUrl, `video-frame-studio-${Date.now()}.zip`);
    setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);
    showToast('ZIP gerado com sucesso!', 'success');
    
  } catch (err) {
    console.error('Erro ao gerar ZIP:', err);
    showToast('Erro ao gerar arquivo ZIP', 'error');
  } finally {
    elements.downloadAllBtn.disabled = false;
    elements.downloadAllBtn.innerHTML = originalHTML;
  }
});

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// =====================================================
// INICIALIZAÇÃO
// =====================================================
function init() {
  checkSharedArrayBuffer();
  setupFrameUpload();
  setupVideosUpload();
  updateProcessButton();
}

init();

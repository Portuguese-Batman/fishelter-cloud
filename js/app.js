/* js/app.js - Integrado com PHP */

// Estado Global
let allFiles = [];
let activeUploadXhr = null;
let pendingDeleteFileName = null;
let deleteCountdownTimer = null;
let currentVisibleFiles = [];
let currentPreviewIndex = -1;
let currentPreviewFile = null;

// Gemini/Assistente IA
const GEMINI_API_KEY = 'AQ.Ab8RN6JEAlZ0QNzF2RgHs2acJP3B9FIm8Tj2OaGK5XBa8jqxsA';

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem('fishelter-theme', theme);

    const toggleButtons = document.querySelectorAll('[data-theme-toggle]');
    toggleButtons.forEach((button) => {
        const icon = button.querySelector('.theme-icon');
        if (icon) {
            icon.className = theme === 'dark' ? 'fas fa-sun theme-icon' : 'fas fa-moon theme-icon';
        }
        button.setAttribute('aria-pressed', String(theme === 'dark'));
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('fishelter-theme');
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = savedTheme || systemTheme;
    applyTheme(theme);

    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
        button.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(currentTheme);
        });
    });
}

function loadSettings() {
    try {
        return JSON.parse(localStorage.getItem('fishelter-settings') || '{}');
    } catch (err) {
        return {};
    }
}

function saveSettings(settings) {
    localStorage.setItem('fishelter-settings', JSON.stringify(settings));
}

function applySettings(settings) {
    const compact = Boolean(settings.compact);
    const reducedMotion = Boolean(settings.reducedMotion);

    document.body.classList.toggle('compact-view', compact);
    document.body.classList.toggle('reduced-motion', reducedMotion);

    const compactToggle = document.getElementById('settingsCompact');
    const motionToggle = document.getElementById('settingsMotion');
    if (compactToggle) compactToggle.checked = compact;
    if (motionToggle) motionToggle.checked = reducedMotion;
}

function initSettings() {
    const settings = loadSettings();
    applySettings(settings);

    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const compactToggle = document.getElementById('settingsCompact');
    const motionToggle = document.getElementById('settingsMotion');

    openSettingsBtn?.addEventListener('click', () => settingsModal?.classList.remove('hidden'));
    closeSettingsBtn?.addEventListener('click', () => settingsModal?.classList.add('hidden'));
    settingsModal?.addEventListener('click', (event) => {
        if (event.target === settingsModal) settingsModal.classList.add('hidden');
    });

    const persistSettings = () => {
        const nextSettings = {
            compact: compactToggle?.checked || false,
            reducedMotion: motionToggle?.checked || false
        };
        saveSettings(nextSettings);
        applySettings(nextSettings);
    };

    compactToggle?.addEventListener('change', persistSettings);
    motionToggle?.addEventListener('change', persistSettings);
}

// --- FUNÇÕES DE AUTENTICAÇÃO ---

async function checkAuth() {
    const res = await fetch('api/auth.php?action=check');
    const data = await res.json();

    if (data.isLoggedIn) {
        if (window.location.pathname.includes('login.html')) {
            window.location.href = 'dashboard.html';
        } else {
            document.getElementById('userDisplay').innerText = `Olá, ${data.user}`;
            loadFiles();
        }
    } else {
        if (window.location.pathname.includes('dashboard.html')) {
            window.location.href = 'login.html';
        }
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const errorMsg = document.getElementById('loginError');

    try {
        const res = await fetch('api/auth.php?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user, password: pass })
        });

        const data = await res.json();

        if (data.success) {
            const wrapper = document.querySelector('.login-wrapper');
            if (wrapper) {
                wrapper.classList.add('login-transitioning');
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1100);
            } else {
                window.location.href = 'dashboard.html';
            }
        } else {
            errorMsg.style.display = 'block';
            errorMsg.textContent = data.message || 'Erro no login';
        }
    } catch (err) {
        console.error(err);
        errorMsg.textContent = 'Erro de conexão com o servidor.';
        errorMsg.style.display = 'block';
    }
}

async function handleLogout() {
    await fetch('api/auth.php?action=logout');
    window.location.href = 'login.html';
}

// --- FUNÇÕES DO DASHBOARD (Ficheiros) ---

async function loadFiles() {
    try {
        const res = await fetch('api/files.php');
        const fetchedFiles = await res.json();
        allFiles = (fetchedFiles || []).map(normalizeFile);
        renderFiles(allFiles);

        const shareParam = new URLSearchParams(window.location.search).get('share');
        if (shareParam) {
            const sharedFile = allFiles.find((file) => file.name === shareParam);
            if (sharedFile) {
                openPreview(sharedFile);
                showToast('Imagem aberta a partir do link de partilha', 'info');
            }
        }

        updateStorageStats(allFiles);
    } catch (err) {
        console.error('Erro ao carregar ficheiros:', err);
    }
}

function getFileExtension(fileName) {
    return (fileName.split('.').pop() || '').toLowerCase();
}

function isImageFile(fileName) {
    const ext = getFileExtension(fileName);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext);
}

function isVideoFile(fileName) {
    const ext = getFileExtension(fileName);
    return ['mp4', 'webm', 'mov'].includes(ext);
}

function isPdfFile(fileName) {
    return getFileExtension(fileName) === 'pdf';
}

function loadFileMetadata() {
    try {
        return JSON.parse(localStorage.getItem('fishelter-file-meta') || '{}');
    } catch (err) {
        return {};
    }
}

const fileMetadataStore = loadFileMetadata();

function normalizeFile(file) {
    const storedMeta = fileMetadataStore[file.name] || {};
    return {
        ...file,
        title: storedMeta.title || file.name,
        description: storedMeta.description || '',
        album: storedMeta.album || 'Geral',
        starred: Boolean(storedMeta.starred),
        private: Boolean(storedMeta.private),
        shared: Boolean(storedMeta.shared),
        aiSummary: storedMeta.aiSummary || ''
    };
}

function persistFileMetadata(fileName, updates) {
    fileMetadataStore[fileName] = {
        ...(fileMetadataStore[fileName] || {}),
        ...updates
    };
    localStorage.setItem('fishelter-file-meta', JSON.stringify(fileMetadataStore));
    return fileMetadataStore[fileName];
}

function createFileVisual(file) {
    const media = document.createElement('div');
    media.className = 'card-media';

    const badge = document.createElement('span');
    badge.className = 'file-badge';
    badge.textContent = getFileExtension(file.name).toUpperCase() || 'FILE';
    media.appendChild(badge);

    if (isImageFile(file.name)) {
        const image = document.createElement('img');
        image.className = 'card-preview-image';
        image.src = file.url;
        image.alt = file.name;
        image.addEventListener('error', () => {
            media.innerHTML = '';
            media.appendChild(badge);
            const fallback = document.createElement('div');
            fallback.className = 'card-preview-fallback';
            fallback.innerHTML = '<i class="fas fa-image"></i>';
            media.appendChild(fallback);
        });
        media.appendChild(image);
    } else if (isVideoFile(file.name)) {
        const videoPreview = document.createElement('div');
        videoPreview.className = 'card-preview-fallback video';
        videoPreview.innerHTML = '<i class="fas fa-play"></i><span>Vídeo</span>';
        media.appendChild(videoPreview);
    } else if (isPdfFile(file.name)) {
        const pdfPreview = document.createElement('div');
        pdfPreview.className = 'card-preview-fallback pdf';
        pdfPreview.innerHTML = '<i class="fas fa-file-pdf"></i><span>PDF</span>';
        media.appendChild(pdfPreview);
    } else {
        const genericPreview = document.createElement('div');
        genericPreview.className = 'card-preview-fallback';
        genericPreview.innerHTML = `<i class="fas fa-file-alt"></i><span>${getFileExtension(file.name).toUpperCase() || 'FILE'}</span>`;
        media.appendChild(genericPreview);
    }

    return media;
}

function renderFiles(files) {
    currentVisibleFiles = Array.isArray(files) ? files : [];
    const grid = document.getElementById('fileGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    if (currentVisibleFiles.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    currentVisibleFiles.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.style.animationDelay = `${index * 60}ms`;

        const preview = document.createElement('div');
        preview.className = 'card-icon';
        preview.appendChild(createFileVisual(file));

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        const title = document.createElement('h4');
        title.textContent = file.title || file.name;

        const info = document.createElement('p');
        const statusText = [file.album || 'Geral', file.shared ? 'Partilhado' : 'Pessoal'].join(' • ');
        info.textContent = `${statusText} • ${file.size}`;

        const badgeRow = document.createElement('div');
        badgeRow.className = 'meta-badges';
        if (file.starred) badgeRow.innerHTML += '<span class="meta-chip"><i class="fas fa-star"></i> Destaque</span>';
        if (file.private) badgeRow.innerHTML += '<span class="meta-chip"><i class="fas fa-lock"></i> Privado</span>';
        if (file.shared) badgeRow.innerHTML += '<span class="meta-chip"><i class="fas fa-share-alt"></i> Partilhado</span>';

        meta.appendChild(title);
        meta.appendChild(info);
        if (badgeRow.children.length) meta.appendChild(badgeRow);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn-text file-action-btn delete';
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener('click', () => deleteFile(file.name));

        const downloadLink = document.createElement('a');
        downloadLink.className = 'btn-text file-action-btn download';
        downloadLink.href = file.url;
        downloadLink.target = '_blank';
        downloadLink.rel = 'noopener noreferrer';
        downloadLink.innerHTML = '<i class="fas fa-download"></i>';

        card.appendChild(preview);
        card.appendChild(meta);
        card.appendChild(deleteBtn);
        card.appendChild(downloadLink);

        card.addEventListener('click', (e) => {
            if (e.target.closest('button') || e.target.closest('a')) return;
            openPreview(file);
        });

        grid.appendChild(card);
    });
}

function handleUpload(files) {
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (let file of files) {
        formData.append('file', file);
    }

    const btn = document.getElementById('openUploadBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A enviar...';

    const progressPanel = document.getElementById('uploadProgressPanel');
    const dropZone = document.getElementById('dropZone');
    const progressFill = document.getElementById('uploadProgressFill');
    const progressText = document.getElementById('uploadProgressText');
    const progressLabel = document.getElementById('uploadProgressLabel');
    const resultMessage = document.getElementById('uploadResultMessage');
    const statusIcon = document.getElementById('uploadStatusIcon');

    progressPanel.classList.remove('hidden');
    dropZone.classList.add('hidden');
    resultMessage.classList.add('hidden');
    resultMessage.className = 'upload-result-message hidden';
    progressFill.style.width = '0%';
    progressFill.className = 'upload-progress-fill';
    progressText.textContent = '0%';
    progressLabel.textContent = 'A preparar o envio...';
    statusIcon.innerHTML = '<i class="fas fa-cloud-arrow-up"></i>';

    const xhr = new XMLHttpRequest();
    activeUploadXhr = xhr;

    xhr.open('POST', 'api/upload.php', true);

    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100);
            progressFill.style.width = `${percentage}%`;
            progressText.textContent = `${percentage}%`;
            progressLabel.textContent = percentage < 100 ? 'A enviar ficheiro...' : 'A finalizar envio...';
        } else {
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            progressLabel.textContent = 'A finalizar envio...';
        }
    };

    xhr.onload = () => {
        let data = { success: false, error: 'Erro inesperado no upload.' };

        try {
            data = JSON.parse(xhr.responseText);
        } catch (err) {
            console.error('Resposta inválida do upload:', err);
        }

        if (data.success) {
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            progressLabel.textContent = 'Envio concluído';
            statusIcon.innerHTML = '<i class="fas fa-check-circle"></i>';
            progressFill.classList.add('upload-progress-fill-success');
            resultMessage.className = 'upload-result-message success';
            resultMessage.innerHTML = '<i class="fas fa-check-circle"></i> Ficheiro enviado com sucesso';
            resultMessage.classList.remove('hidden');
            btn.innerHTML = '<i class="fas fa-check"></i> Enviado';

            setTimeout(() => {
                closeModal('uploadModal');
                loadFiles();
                btn.innerHTML = originalText;
            }, 900);
        } else {
            progressFill.classList.add('upload-progress-fill-error');
            statusIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
            progressLabel.textContent = 'Falha no envio';
            resultMessage.className = 'upload-result-message error';
            resultMessage.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${data.error || 'Não foi possível enviar o ficheiro.'}`;
            resultMessage.classList.remove('hidden');
            btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Falhou';
        }

        activeUploadXhr = null;
    };

    xhr.onerror = () => {
        progressFill.classList.add('upload-progress-fill-error');
        statusIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
        progressLabel.textContent = 'Falha de ligação';
        resultMessage.className = 'upload-result-message error';
        resultMessage.innerHTML = '<i class="fas fa-wifi"></i> A ligação caiu durante o envio.';
        resultMessage.classList.remove('hidden');
        btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Falhou';
        activeUploadXhr = null;
    };

    xhr.onabort = () => {
        progressFill.classList.add('upload-progress-fill-error');
        statusIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
        progressLabel.textContent = 'Envio cancelado';
        resultMessage.className = 'upload-result-message error';
        resultMessage.innerHTML = '<i class="fas fa-ban"></i> O envio foi cancelado.';
        resultMessage.classList.remove('hidden');
        btn.innerHTML = originalText;
        activeUploadXhr = null;
    };

    xhr.send(formData);
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const typeMap = {
        sucesso: { icon: '✓', className: 'toast-success' },
        erro: { icon: '✕', className: 'toast-error' },
        aviso: { icon: '⚠', className: 'toast-warning' },
        info: { icon: 'ℹ', className: 'toast-info' }
    };

    const selectedType = typeMap[type] || typeMap.info;
    const toast = document.createElement('div');
    toast.className = `toast ${selectedType.className}`;
    toast.innerHTML = `
        <span class="toast-icon">${selectedType.icon}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="Fechar notificação"><i class="fas fa-times"></i></button>
    `;

    container.appendChild(toast);

    const existingToasts = container.querySelectorAll('.toast');
    if (existingToasts.length > 3) {
        existingToasts[0].remove();
    }

    const closeToast = () => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 260);
    };

    toast.querySelector('.toast-close').addEventListener('click', closeToast);
    setTimeout(closeToast, 4000);
}

function getShareUrl(file) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    return `${baseUrl}?share=${encodeURIComponent(file.name)}`;
}

async function shareFile(file) {
    if (!file) return;

    const shareUrl = getShareUrl(file);

    try {
        if (navigator.share) {
            await navigator.share({
                title: file.title || file.name,
                text: `Veja ${file.title || file.name} no Fishelter Cloud`,
                url: shareUrl
            });
        } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copiado para a área de transferência', 'info');
        } else {
            window.prompt('Copie este link para partilhar', shareUrl);
        }

        persistFileMetadata(file.name, { shared: true });
        file.shared = true;
        renderFiles(currentVisibleFiles.length ? currentVisibleFiles : allFiles);
        populatePreviewPanel(file);
        showToast('Imagem partilhada com sucesso', 'sucesso');
    } catch (err) {
        if (err && err.name !== 'AbortError') {
            showToast('Não foi possível partilhar esta imagem', 'erro');
        }
    }
}

function openDeleteConfirm(fileName) {
    pendingDeleteFileName = fileName;
    document.getElementById('deleteFileName').textContent = fileName;
    document.getElementById('deleteConfirmModal').classList.remove('hidden');
    startDeleteCountdown();
}

function closeDeleteConfirm() {
    if (deleteCountdownTimer) {
        clearTimeout(deleteCountdownTimer);
        deleteCountdownTimer = null;
    }
    document.getElementById('deleteConfirmModal').classList.add('hidden');
    pendingDeleteFileName = null;
}

function startDeleteCountdown() {
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Apagar (2)';

    let remaining = 2;
    const tick = () => {
        remaining -= 1;
        if (remaining > 0) {
            confirmBtn.textContent = `Apagar (${remaining})`;
            deleteCountdownTimer = setTimeout(tick, 750);
        } else {
            confirmBtn.textContent = 'Apagar';
            confirmBtn.disabled = false;
            deleteCountdownTimer = null;
        }
    };

    deleteCountdownTimer = setTimeout(tick, 750);
}

async function deleteFile(fileName) {
    openDeleteConfirm(fileName);
}

async function confirmDeleteFile() {
    if (!pendingDeleteFileName) return;

    const fileName = pendingDeleteFileName;
    closeDeleteConfirm();

    try {
        const res = await fetch(`api/files.php?name=${encodeURIComponent(fileName)}`, { method: 'DELETE' });
        const data = await res.json();

        if (data.success) {
            loadFiles();
            showToast('Ficheiro apagado com sucesso', 'sucesso');
        } else {
            showToast(data.error || 'Não foi possível apagar o ficheiro.', 'erro');
        }
    } catch (err) {
        console.error('Erro ao apagar ficheiro:', err);
        showToast('Erro ao apagar o ficheiro.', 'erro');
    }
}

// Filtros na Sidebar
window.filterFiles = (type, btn) => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (type === 'all') {
        renderFiles(allFiles);
        document.getElementById('pageTitle').innerText = 'Todos os Ficheiros';
    } else {
        const filtered = allFiles.filter(f => f.type === type);
        renderFiles(filtered);
        document.getElementById('pageTitle').innerText = type.charAt(0).toUpperCase() + type.slice(1) + 's';
    }
};

async function updateStorageStats(files) {
    try {
        const res = await fetch('api/storage.php');
        const storage = await res.json();
        const percentage = Math.max(0, Math.min(100, storage.percentage || 0));
        const ring = document.getElementById('storageRing');
        const usageText = document.getElementById('storageUsageText');
        const storageText = document.getElementById('storageText');

        if (ring) {
            const radius = 46;
            const circumference = 2 * Math.PI * radius;
            ring.style.strokeDasharray = `${circumference}`;
            ring.style.strokeDashoffset = `${circumference}`;
            ring.style.stroke = percentage >= 85 ? '#ef4444' : percentage >= 60 ? '#f59e0b' : '#10b981';
            requestAnimationFrame(() => {
                ring.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
                ring.style.strokeDashoffset = `${circumference - (percentage / 100) * circumference}`;
            });
        }

        if (storageText) storageText.textContent = `${percentage}%`;
        if (usageText) usageText.textContent = `${storage.usedMb} MB de ${storage.limitGb} GB utilizados`;
    } catch (err) {
        console.error('Erro ao carregar estatísticas de armazenamento:', err);
    }
}

// Utilitários de Modal
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

function renderPreviewBody(file) {
    const body = document.getElementById('previewBody');
    if (!body) return;

    if (file && isImageFile(file.name)) {
        body.innerHTML = `<img src="${file.url}" alt="${file.name}">`;
    } else {
        body.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:0.75rem;color:#64748b;font-size:1rem;"><i class="fas fa-file-alt" style="font-size:3.2rem"></i><span>${file.name}</span></div>`;
    }
}

function renderAiSuggestions(file) {
    const summary = document.getElementById('previewAiSummary');
    const suggestionsList = document.getElementById('previewAiSuggestions');
    if (!summary || !suggestionsList) return;

    const prompts = [
        { label: 'Descrever automaticamente', action: 'description' },
        { label: 'Criar álbum de memórias', action: 'album' },
        { label: 'Sugestão de partilha', action: 'share' }
    ];

    const aiText = file && file.aiSummary ? file.aiSummary : 'A IA pode ajudar a organizar, descrever e sugerir ações para esta imagem.';
    summary.textContent = aiText;
    suggestionsList.innerHTML = prompts.map((item) => `<li><span>${item.label}</span><button type="button" data-action="${item.action}">${item.action === 'description' ? 'Aplicar' : 'Usar'}</button></li>`).join('');

    suggestionsList.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.action === 'description') {
                const nextDescription = `${file.title || file.name} — imagem com ótimo potencial para o álbum de memórias.`;
                persistFileMetadata(file.name, { description: nextDescription, aiSummary: 'Descrição criada automaticamente pela IA.' });
                file.description = nextDescription;
                file.aiSummary = 'Descrição criada automaticamente pela IA.';
                document.getElementById('previewDescriptionInput').value = nextDescription;
                renderAiSuggestions(file);
                showToast('Descrição sugerida pela IA aplicada', 'info');
            } else if (btn.dataset.action === 'album') {
                persistFileMetadata(file.name, { album: 'Memórias', aiSummary: 'Álbum sugerido pela IA: Memórias.' });
                file.album = 'Memórias';
                file.aiSummary = 'Álbum sugerido pela IA: Memórias.';
                document.getElementById('previewAlbumSelect').value = 'Memórias';
                renderAiSuggestions(file);
                showToast('Álbum sugerido pela IA aplicado', 'info');
            } else {
                persistFileMetadata(file.name, { shared: true, aiSummary: 'Partilha sugerida pela IA.' });
                file.shared = true;
                file.aiSummary = 'Partilha sugerida pela IA.';
                renderAiSuggestions(file);
                showToast('Partilha ativada para esta imagem', 'info');
            }
        });
    });
}

function populatePreviewPanel(file) {
    if (!file) return;
    document.getElementById('previewTitle').innerText = file.title || file.name;
    document.getElementById('previewNameInput').value = file.title || file.name;
    document.getElementById('previewDescriptionInput').value = file.description || '';
    document.getElementById('previewAlbumSelect').value = file.album || 'Geral';
    document.getElementById('previewStarInput').checked = Boolean(file.starred);
    document.getElementById('previewPrivateInput').checked = Boolean(file.private);
    renderPreviewBody(file);
    renderAiSuggestions(file);
}

function showPreviewAt(index) {
    const stack = currentVisibleFiles.length ? currentVisibleFiles : allFiles;
    if (!stack.length) return;
    currentPreviewIndex = (index + stack.length) % stack.length;
    currentPreviewFile = stack[currentPreviewIndex];
    populatePreviewPanel(currentPreviewFile);
    document.getElementById('previewModal').classList.remove('hidden');
}

function openPreview(file) {
    const stack = currentVisibleFiles.length ? currentVisibleFiles : allFiles;
    const index = stack.findIndex((item) => item.name === file.name);
    currentPreviewFile = stack[index] || file;
    currentPreviewIndex = index >= 0 ? index : 0;
    populatePreviewPanel(currentPreviewFile);
    document.getElementById('previewModal').classList.remove('hidden');
}

// -------------------------
// Assistente de Voz (SpeechRecognition + Gemini + SpeechSynthesis)
// -------------------------

function getSpeechRecognitionInstance() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SR ? new SR() : null;
}


function speakPtPT(text) {
    try {
        const synth = window.speechSynthesis;
        if (!synth) return;

        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-PT';
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        synth.speak(utterance);
    } catch (err) {
        console.error('Erro na síntese de voz:', err);
    }
}

function extractCreateFolderTag(text) {
    if (typeof text !== 'string') return null;
    const match = text.match(/\[CRIAR_PASTA:\s*([^\]]+)\s*\]/i);
    return match ? match[1].trim() : null;
}

async function callGeminiAssistant(userText) {
    const systemInstructions = [
        'Tu és o assistente do Fishelter Cloud (PAP) desenvolvido pelo Afonso para a disciplina PAP.',
        'Responde em português de Portugal.',
        'Quando o utilizador pedir para criar uma pasta ou álbum (ex: "criar pasta de fotos"),',
        'deves responder por voz e no final do texto incluir exatamente o padrão oculto:',
        '[CRIAR_PASTA: Nome da Pasta]',
        'onde Nome da Pasta é o nome que deves escolher/normalizar a partir do pedido do utilizador (sem inventar conteúdo).',
        'Não incluas qualquer outra variação do padrão. Mantém o marcador no final da resposta.'
    ].join('\n');

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + encodeURIComponent(GEMINI_API_KEY);

    const payload = {
        systemInstruction: { parts: [{ text: systemInstructions }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error('Erro Gemini: ' + res.status + ' ' + t);
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.map(p => p?.text).filter(Boolean).join('') || '';
}

async function handleAssistantCommandFromVoice(transcript) {
    const status = document.getElementById('status-assistente');
    const btn = document.getElementById('btn-assistente');

    if (status) status.textContent = 'A pensar...';
    btn?.setAttribute('disabled', 'true');

    try {
        const assistantText = await callGeminiAssistant(transcript);
        if (status) status.textContent = assistantText ? `IA: ${assistantText}` : 'IA sem resposta';

        // Detectar marcador e criar pasta
        const createName = extractCreateFolderTag(assistantText);
        if (createName) {
            await fetch('api/criar_pasta.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: 'nome_pasta=' + encodeURIComponent(createName)
            }).catch((err) => console.error('Erro ao criar pasta:', err));
        }

        // Eliminar / Partilhar via marcadores no fim (formatos ocultos)
        const deleteFileTag = (() => {
            const m = assistantText.match(/\[APAGAR_FICHEIRO:\s*([^\]]+)\s*\]/i);
            return m ? m[1].trim() : null;
        })();

        const shareFileTag = (() => {
            const m = assistantText.match(/\[PARTILHAR_FICHEIRO:\s*([^\]]+)\s*\]/i);
            return m ? m[1].trim() : null;
        })();

        if (deleteFileTag) {
            await deleteFile(deleteFileTag);
        }

        if (shareFileTag) {
            // procura no que carregámos; tenta por nome
            const target = allFiles.find(f => f.name === shareFileTag) || allFiles.find(f => (f.title || '').toLowerCase() === shareFileTag.toLowerCase());
            if (target) await shareFile(target);
        }

        // Falar sem marcadores
        const spokenText = assistantText
            .replace(/\[CRIAR_PASTA:\s*[^\]]+\s*\]/i, '')
            .replace(/\[APAGAR_FICHEIRO:\s*[^\]]+\s*\]/i, '')
            .replace(/\[PARTILHAR_FICHEIRO:\s*[^\]]+\s*\]/i, '')
            .trim();

        if (spokenText) speakPtPT(spokenText);
        else speakPtPT('Desculpa, não percebi bem. Podes repetir?');

    } catch (err) {
        console.error(err);
        if (status) status.textContent = 'Erro no assistente de voz.';
        speakPtPT('Desculpa, aconteceu um erro ao contactar a IA.');
    } finally {
        btn?.removeAttribute('disabled');
    }
}

function startVoiceRecognition() {
    const btn = document.getElementById('btn-assistente');
    const status = document.getElementById('status-assistente');
    if (status) status.textContent = 'A ouvir...';


    const SRInstance = getSpeechRecognitionInstance();
    if (!SRInstance) {
        if (status) status.textContent = 'Reconhecimento de voz não suportado neste navegador.';
        speakPtPT('O reconhecimento de voz não é suportado neste navegador.');
        return;
    }

    if (btn) btn.setAttribute('disabled', 'true');
    if (status) status.textContent = 'A ouvir...';

    SRInstance.lang = 'pt-PT';
    SRInstance.interimResults = false;
    SRInstance.maxAlternatives = 1;

    SRInstance.onresult = async (event) => {
        try {
            const transcript = event.results?.[0]?.[0]?.transcript || '';
            if (status && transcript && transcript.trim()) {
                status.textContent = `Ouvi: ${transcript.trim()}`;
            }

            if (!transcript.trim()) {
                if (status) status.textContent = 'Não percebi. Podes repetir?';
                speakPtPT('Desculpa, não percebi bem. Podes repetir?');
                return;
            }

            if (status) status.textContent = 'Compreendi. A pensar...';
            await handleAssistantCommandFromVoice(transcript);
        } catch (err) {
            console.error(err);
            if (status) status.textContent = 'Erro no reconhecimento de voz.';
            speakPtPT('Desculpa, aconteceu um erro no reconhecimento de voz.');
        } finally {
            btn?.removeAttribute('disabled');
        }
    };

    SRInstance.onerror = (event) => {
        console.error('SpeechRecognition error:', event);
        const msg = event?.error === 'not-allowed'
            ? 'Permissão negada para microfone.'
            : 'Não foi possível reconhecer a voz.';
        if (status) status.textContent = msg;
        speakPtPT('Não consegui reconhecer a tua voz.');
        btn?.removeAttribute('disabled');
    };

    SRInstance.onend = () => {
        btn?.removeAttribute('disabled');
    };

    try {
        SRInstance.start();
    } catch (e) {
        if (status) status.textContent = 'Já existe uma escuta em curso...';
        btn?.removeAttribute('disabled');
    }
}

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        checkAuth();
        return;
    }

    // Estamos no Dashboard
    checkAuth();
    initSettings();

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    const mobileHamburger = document.getElementById('mobileHamburger');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const mobileSearchToggle = document.getElementById('mobileSearchToggle');
    const searchBar = document.querySelector('.search-bar');

    const toggleSidebar = () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('open');
    };

    mobileHamburger?.addEventListener('click', toggleSidebar);
    sidebarOverlay?.addEventListener('click', toggleSidebar);
    document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => {
        if (window.innerWidth <= 768) {
            toggleSidebar();
        }
    }));

    mobileSearchToggle?.addEventListener('click', () => {
        searchBar?.classList.toggle('mobile-open');
    });

    document.addEventListener('click', (e) => {
        if (window.innerWidth > 768) return;
        if (!searchBar?.contains(e.target) && !mobileSearchToggle?.contains(e.target)) {
            searchBar?.classList.remove('mobile-open');
        }
    });

    // Upload
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');

    document.getElementById('openUploadBtn').addEventListener('click', () => {
        document.getElementById('uploadModal').classList.remove('hidden');
    });

    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleUpload(e.target.files));

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.background = '#eef2ff'; });
    dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.background = 'transparent'; });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.background = 'transparent';
        handleUpload(e.dataTransfer.files);
    });

    // Pesquisa
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allFiles.filter(f => f.name.toLowerCase().includes(term));
        renderFiles(filtered);
    });

    // Preview
    document.getElementById('previewPrevBtn')?.addEventListener('click', () => showPreviewAt(currentPreviewIndex - 1));
    document.getElementById('previewNextBtn')?.addEventListener('click', () => showPreviewAt(currentPreviewIndex + 1));
    document.getElementById('previewEditBtn')?.addEventListener('click', () => {
        document.getElementById('previewNameInput')?.focus();
        showToast('Edição ativada para esta imagem', 'info');
    });
    document.getElementById('previewShareBtn')?.addEventListener('click', () => {
        if (!currentPreviewFile) return;
        shareFile(currentPreviewFile);
    });
    document.getElementById('previewAssistantBtn')?.addEventListener('click', () => {
        if (currentPreviewFile) renderAiSuggestions(currentPreviewFile);
    });

    ['previewNameInput', 'previewDescriptionInput', 'previewAlbumSelect', 'previewStarInput', 'previewPrivateInput'].forEach((fieldId) => {
        const element = document.getElementById(fieldId);
        if (!element) return;
        element.addEventListener('input', () => {
            if (!currentPreviewFile) return;
            const updates = {};

            if (fieldId === 'previewNameInput') {
                updates.title = element.value;
                currentPreviewFile.title = element.value;
                document.getElementById('previewTitle').textContent = element.value;
            } else if (fieldId === 'previewDescriptionInput') {
                updates.description = element.value;
                currentPreviewFile.description = element.value;
            } else if (fieldId === 'previewAlbumSelect') {
                updates.album = element.value;
                currentPreviewFile.album = element.value;
            } else if (fieldId === 'previewStarInput') {
                updates.starred = element.checked;
                currentPreviewFile.starred = element.checked;
            } else if (fieldId === 'previewPrivateInput') {
                updates.private = element.checked;
                currentPreviewFile.private = element.checked;
            }

            persistFileMetadata(currentPreviewFile.name, updates);
            renderFiles(currentVisibleFiles.length ? currentVisibleFiles : allFiles);
        });
    });

    document.addEventListener('keydown', (event) => {
        const modal = document.getElementById('previewModal');
        if (modal?.classList.contains('hidden')) return;

        if (event.key === 'ArrowRight') {
            event.preventDefault();
            showPreviewAt(currentPreviewIndex + 1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            showPreviewAt(currentPreviewIndex - 1);
        }
    });

    // Assistente IA (voz)
    document.getElementById('btn-assistente')?.addEventListener('click', () => startVoiceRecognition());
});


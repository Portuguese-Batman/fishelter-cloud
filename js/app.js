/* js/app.js - Integrado com PHP */

// Estado Global
let allFiles = [];
let activeUploadXhr = null;
let pendingDeleteFileName = null;
let deleteCountdownTimer = null;
let currentVisibleFiles = [];
let currentPreviewIndex = -1;
let currentPreviewFile = null;

// Estado do Assistente IA
let aiConversationHistory = [];
let isAiProcessing = false;

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

// --- FUN├ç├òES DE AUTENTICA├ç├âO ---

async function checkAuth() {
    const res = await fetch('api/auth.php?action=check');
    const data = await res.json();

    if (data.isLoggedIn) {
        if (window.location.pathname.includes('login.html')) {
            window.location.href = 'dashboard.html';
        } else {
            document.getElementById('userDisplay').innerText = 'Olá, ' + data.user;
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
        errorMsg.textContent = 'Erro de conex├úo com o servidor.';
        errorMsg.style.display = 'block';
    }
}

async function handleLogout() {
    await fetch('api/auth.php?action=logout');
    window.location.href = 'login.html';
}

// --- FUN├ç├òES DO DASHBOARD (Ficheiros) ---

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
        videoPreview.innerHTML = '<i class="fas fa-play"></i><span>V├¡deo</span>';
        media.appendChild(videoPreview);
    } else if (isPdfFile(file.name)) {
        const pdfPreview = document.createElement('div');
        pdfPreview.className = 'card-preview-fallback pdf';
        pdfPreview.innerHTML = '<i class="fas fa-file-pdf"></i><span>PDF</span>';
        media.appendChild(pdfPreview);
    } else {
        const genericPreview = document.createElement('div');
        genericPreview.className = 'card-preview-fallback';
        genericPreview.innerHTML = '<i class="fas fa-file-alt"></i><span>' + (getFileExtension(file.name).toUpperCase() || 'FILE') + '</span>';
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
        card.style.animationDelay = (index * 60) + 'ms';

        const preview = document.createElement('div');
        preview.className = 'card-icon';
        preview.appendChild(createFileVisual(file));

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        const title = document.createElement('h4');
        title.textContent = file.title || file.name;

        const info = document.createElement('p');
        const statusText = [file.album || 'Geral', file.shared ? 'Partilhado' : 'Pessoal'].join(' \u2022 ');
        info.textContent = statusText + ' \u2022 ' + file.size;

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
            progressFill.style.width = percentage + '%';
            progressText.textContent = percentage + '%';
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
            console.error('Resposta inv├ílida do upload:', err);
        }

        if (data.success) {
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            progressLabel.textContent = 'Envio conclu├¡do';
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
            resultMessage.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + (data.error || 'N├úo foi poss├¡vel enviar o ficheiro.');
            resultMessage.classList.remove('hidden');
            btn.innerHTML = '<i class="fas fa-exclamation-circle"></i> Falhou';
        }

        activeUploadXhr = null;
    };

    xhr.onerror = () => {
        progressFill.classList.add('upload-progress-fill-error');
        statusIcon.innerHTML = '<i class="fas fa-times-circle"></i>';
        progressLabel.textContent = 'Falha de liga├º├úo';
        resultMessage.className = 'upload-result-message error';
        resultMessage.innerHTML = '<i class="fas fa-wifi"></i> A liga├º├úo caiu durante o envio.';
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

function showToast(message, type) {
    if (!type) type = 'info';
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const typeMap = {
        sucesso: { icon: '\u2713', className: 'toast-success' },
        erro: { icon: '\u2715', className: 'toast-error' },
        aviso: { icon: '\u26A0', className: 'toast-warning' },
        info: { icon: '\u2139', className: 'toast-info' }
    };

    const selectedType = typeMap[type] || typeMap.info;
    const toast = document.createElement('div');
    toast.className = 'toast ' + selectedType.className;
    toast.innerHTML = '<span class="toast-icon">' + selectedType.icon + '</span><span class="toast-message">' + message + '</span><button class="toast-close" aria-label="Fechar notifica├º├úo"><i class="fas fa-times"></i></button>';

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
    const baseUrl = window.location.origin + window.location.pathname;
    return baseUrl + '?share=' + encodeURIComponent(file.name);
}

async function shareFile(file) {
    if (!file) return;

    const shareUrl = getShareUrl(file);

    try {
        if (navigator.share) {
            await navigator.share({
                title: file.title || file.name,
                text: 'Veja ' + (file.title || file.name) + ' no Fishelter Cloud',
                url: shareUrl
            });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showToast('Link copiado para a ├írea de transfer├¬ncia', 'info');
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
            showToast('N├úo foi poss├¡vel partilhar esta imagem', 'erro');
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
    if (!confirmBtn) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Apagar (2)';
    confirmBtn.onclick = null;

    let remaining = 2;

    const tick = () => {
        remaining -= 1;
        if (remaining > 0) {
            confirmBtn.textContent = 'Apagar (' + remaining + ')';
            deleteCountdownTimer = setTimeout(tick, 750);
        } else {
            confirmBtn.textContent = 'Apagar';
            confirmBtn.disabled = false;
            confirmBtn.onclick = confirmDeleteFile;
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

    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        confirmBtn.disabled = true;
    }

    try {
        const res = await fetch('api/files.php?name=' + encodeURIComponent(fileName), { method: 'DELETE' });
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json() : { success: false, error: await res.text().catch(() => '') };

        if (data.success) {
            await loadFiles();
            showToast('Ficheiro apagado com sucesso', 'sucesso');
        } else {
            showToast(data.error || 'N├úo foi poss├¡vel apagar o ficheiro.', 'erro');
        }
    } catch (err) {
        console.error('Erro ao apagar ficheiro:', err);
        showToast('Erro ao apagar o ficheiro.', 'erro');
    } finally {
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Apagar';
        }
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
            ring.style.strokeDasharray = '' + circumference;
            ring.style.strokeDashoffset = '' + circumference;
            ring.style.stroke = percentage >= 85 ? '#ef4444' : percentage >= 60 ? '#f59e0b' : '#10b981';
            requestAnimationFrame(() => {
                ring.style.transition = 'stroke-dashoffset 1.5s ease-in-out';
                ring.style.strokeDashoffset = '' + (circumference - (percentage / 100) * circumference);
            });
        }

        if (storageText) storageText.textContent = percentage + '%';
        if (usageText) usageText.textContent = storage.usedMb + ' MB de ' + storage.limitGb + ' GB utilizados';
    } catch (err) {
        console.error('Erro ao carregar estat├¡sticas de armazenamento:', err);
    }
}

// Utilit├írios de Modal
window.closeModal = (id) => document.getElementById(id).classList.add('hidden');

function renderPreviewBody(file) {
    const body = document.getElementById('previewBody');
    if (!body) return;

    if (file && isImageFile(file.name)) {
        body.innerHTML = '<img src="' + file.url + '" alt="' + file.name + '">';
    } else {
        body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;gap:0.75rem;color:#64748b;font-size:1rem;"><i class="fas fa-file-alt" style="font-size:3.2rem"></i><span>' + file.name + '</span></div>';
    }
}

function renderAiSuggestions(file) {
    const summary = document.getElementById('previewAiSummary');
    const suggestionsList = document.getElementById('previewAiSuggestions');
    if (!summary || !suggestionsList) return;

    const prompts = [
        { label: 'Descrever automaticamente', action: 'description' },
        { label: 'Criar ├ílbum de mem├│rias', action: 'album' },
        { label: 'Sugest├úo de partilha', action: 'share' }
    ];

    const aiText = file && file.aiSummary ? file.aiSummary : 'A IA pode ajudar a organizar, descrever e sugerir a├º├Áes para esta imagem.';
    summary.textContent = aiText;
    suggestionsList.innerHTML = prompts.map((item) => '<li><span>' + item.label + '</span><button type="button" data-action="' + item.action + '">' + (item.action === 'description' ? 'Aplicar' : 'Usar') + '</button></li>').join('');

    suggestionsList.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.dataset.action === 'description') {
                const nextDescription = (file.title || file.name) + ' \u2014 imagem com ├│timo potencial para o ├ílbum de mem├│rias.';
                persistFileMetadata(file.name, { description: nextDescription, aiSummary: 'Descri├º├úo criada automaticamente pela IA.' });
                file.description = nextDescription;
                file.aiSummary = 'Descri├º├úo criada automaticamente pela IA.';
                document.getElementById('previewDescriptionInput').value = nextDescription;
                renderAiSuggestions(file);
                showToast('Descri├º├úo sugerida pela IA aplicada', 'info');
            } else if (btn.dataset.action === 'album') {
                persistFileMetadata(file.name, { album: 'Mem├│rias', aiSummary: '├ülbum sugerido pela IA: Mem├│rias.' });
                file.album = 'Mem├│rias';
                file.aiSummary = '├ülbum sugerido pela IA: Mem├│rias.';
                document.getElementById('previewAlbumSelect').value = 'Mem├│rias';
                renderAiSuggestions(file);
                showToast('├ülbum sugerido pela IA aplicado', 'info');
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
// Assistente IA - Proxy Seguro via Backend (api/ai.php)
// -------------------------

async function callAiApi(message, isVoice) {
    if (isAiProcessing) return;
    isAiProcessing = true;

    var chatInput = document.getElementById('aiChatInput');
    var sendBtn = document.getElementById('aiSendBtn');
    var statusEl = document.getElementById('status-assistente');
    var voiceBtn = document.getElementById('btn-assistente');

    if (chatInput) chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (voiceBtn) voiceBtn.setAttribute('disabled', 'true');

    if (statusEl && isVoice) statusEl.textContent = 'A pensar...';
    showAiTypingIndicator(true);

    if (!isVoice && message.trim()) {
        appendChatMessage(message, 'user');
    }

    try {
        var payload = {
            message: message.trim(),
            history: aiConversationHistory.slice(-20)
        };

        var res = await fetch('api/ai.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            var errText = await res.text().catch(function() { return ''; });
            throw new Error('Erro do servidor: ' + res.status + ' ' + errText);
        }

        var data = await res.json();

        if (data.needsConfig) {
            var configMsg = data.text || 'A API Gemini precisa de configuracao.';
            appendChatMessage(configMsg, 'ai');
            if (isVoice && statusEl) statusEl.textContent = 'Precisa de configurar a chave Gemini.';
            speakPtPT('Preciso que configures a chave da API Gemini no ficheiro de configuracao.');
            sessionStorage.setItem('ai_config_needed', 'true');
            return;
        }

        var text = data.text || 'Nao percebi. Podes reformular?';

        aiConversationHistory.push({ role: 'user', text: message.trim() });
        aiConversationHistory.push({ role: 'model', text: text });

        if (aiConversationHistory.length > 50) {
            aiConversationHistory = aiConversationHistory.slice(-50);
        }

        try {
            sessionStorage.setItem('ai_history', JSON.stringify(aiConversationHistory));
        } catch (e) {}

        appendChatMessage(text, 'ai');

        if (isVoice && statusEl) {
            statusEl.textContent = text.length > 80 ? 'IA respondeu. Ouve o audio ou ve o chat.' : 'IA: ' + text;
        } else if (statusEl) {
            statusEl.textContent = 'Pronto para ajudar. Clique no microfone ou escreva no chat.';
        }

        if (isVoice) speakPtPT(text);

        if (data.action && data.action.result) {
            var actionName = data.action.name;
            var actionResult = data.action.result;
            if (actionResult.success) {
                if (['apagar_ficheiro', 'criar_pasta'].indexOf(actionName) !== -1) {
                    await loadFiles();
                }
                if (actionName === 'apagar_ficheiro') {
                    showToast(actionResult.message || 'Ficheiro apagado com sucesso.', 'sucesso');
                } else if (actionName === 'criar_pasta') {
                    showToast('Pasta "' + actionResult.pasta + '" criada com sucesso.', 'sucesso');
                } else if (actionName === 'partilhar_ficheiro') {
                    showToast('Link de partilha gerado para "' + actionResult.ficheiro + '".', 'info');
                }
            } else if (actionResult.error) {
                showToast(actionResult.error, 'aviso');
            }
        }

    } catch (err) {
        console.error('Erro no assistente IA:', err);
        var errorMsg = err.message || 'Erro ao contactar o assistente.';
        appendChatMessage(errorMsg, 'ai');
        if (isVoice && statusEl) statusEl.textContent = 'Erro: ' + errorMsg;
        if (statusEl && !isVoice) statusEl.textContent = 'Erro de ligacao. Tenta novamente.';
        speakPtPT('Desculpa, ocorreu um erro ao contactar o assistente.');
    } finally {
        isAiProcessing = false;
        if (chatInput) { chatInput.disabled = false; chatInput.focus(); }
        if (sendBtn) sendBtn.disabled = false;
        if (voiceBtn) voiceBtn.removeAttribute('disabled');
        showAiTypingIndicator(false);
    }
}

function getSpeechRecognitionInstance() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SR ? new SR() : null;
}

function speakPtPT(text) {
    try {
        var synth = window.speechSynthesis;
        if (!synth) return;
        synth.cancel();
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-PT';
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        synth.speak(utterance);
    } catch (err) {
        console.error('Erro na sintese de voz:', err);
    }
}

function startVoiceRecognition() {
    var btn = document.getElementById('btn-assistente');
    var status = document.getElementById('status-assistente');
    if (status) status.textContent = 'A ouvir...';

    var SRInstance = getSpeechRecognitionInstance();
    if (!SRInstance) {
        if (status) status.textContent = 'Reconhecimento de voz nao suportado neste navegador.';
        speakPtPT('O reconhecimento de voz nao e suportado neste navegador.');
        return;
    }

    if (btn) btn.setAttribute('disabled', 'true');

    SRInstance.lang = 'pt-PT';
    SRInstance.interimResults = false;
    SRInstance.maxAlternatives = 1;

    SRInstance.onresult = async function(event) {
        try {
            var transcript = event.results[0][0].transcript || '';
            if (status && transcript.trim()) {
                status.textContent = 'Ouvi: "' + transcript.trim() + '"';
            }
            if (!transcript.trim()) {
                if (status) status.textContent = 'Nao percebi. Podes repetir?';
                speakPtPT('Desculpa, nao percebi bem. Podes repetir?');
                return;
            }
            await callAiApi(transcript.trim(), true);
        } catch (err) {
            console.error(err);
            if (status) status.textContent = 'Erro no reconhecimento de voz.';
            speakPtPT('Desculpa, aconteceu um erro no reconhecimento de voz.');
        } finally {
            if (btn) btn.removeAttribute('disabled');
        }
    };

    SRInstance.onerror = function(event) {
        console.error('SpeechRecognition error:', event);
        var msg = event.error === 'not-allowed'
            ? 'Permissao negada para microfone.'
            : 'Nao foi possivel reconhecer a voz.';
        if (status) status.textContent = msg;
        speakPtPT('Nao consegui reconhecer a tua voz.');
        if (btn) btn.removeAttribute('disabled');
    };

    SRInstance.onend = function() {
        if (btn) btn.removeAttribute('disabled');
    };

    try {
        SRInstance.start();
    } catch (e) {
        if (status) status.textContent = 'Ja existe uma escuta em curso...';
        if (btn) btn.removeAttribute('disabled');
    }
}

// -------------------------
// Chat por Texto (Interface)
// -------------------------

function toggleChatPanel() {
    var panel = document.getElementById('aiChatPanel');
    if (!panel) return;
    var isOpen = panel.classList.toggle('open');
    if (isOpen) {
        var input = document.getElementById('aiChatInput');
        if (input) input.focus();
        scrollChatToBottom();
    }
}

function sendChatMessage() {
    var input = document.getElementById('aiChatInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text || isAiProcessing) return;
    input.value = '';
    var panel = document.getElementById('aiChatPanel');
    if (panel && !panel.classList.contains('open')) {
        panel.classList.add('open');
    }
    callAiApi(text, false);
}

function appendChatMessage(text, role) {
    var messages = document.getElementById('aiChatMessages');
    if (!messages) return;

    var div = document.createElement('div');
    div.className = 'chat-message ' + role + '-message';

    var avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.innerHTML = role === 'user'
        ? '<i class="fas fa-user"></i>'
        : '<i class="fas fa-robot"></i>';

    var bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    var processedText = text
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');

    bubble.innerHTML = processedText;

    var time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    bubble.appendChild(time);

    div.appendChild(avatar);
    div.appendChild(bubble);
    messages.appendChild(div);

    scrollChatToBottom();
}

function showAiTypingIndicator(show) {
    var indicator = document.getElementById('aiTypingIndicator');
    if (!indicator) return;
    if (show) {
        indicator.classList.remove('hidden');
        scrollChatToBottom();
    } else {
        indicator.classList.add('hidden');
    }
}

function scrollChatToBottom() {
    var messages = document.getElementById('aiChatMessages');
    if (messages) {
        messages.scrollTop = messages.scrollHeight;
    }
}

function clearAiHistory() {
    aiConversationHistory = [];
    try {
        sessionStorage.removeItem('ai_history');
    } catch (e) {}
    var messages = document.getElementById('aiChatMessages');
    if (messages) messages.innerHTML = '';
    var status = document.getElementById('status-assistente');
    if (status) status.textContent = 'Conversa reiniciada. Como posso ajudar?';
    appendChatMessage('Ola! A conversa foi reiniciada. Como posso ajudar-te hoje?', 'ai');
}

function restoreAiHistory() {
    try {
        var saved = sessionStorage.getItem('ai_history');
        if (saved) {
            aiConversationHistory = JSON.parse(saved);
            if (aiConversationHistory.length > 0) {
                var messagesEl = document.getElementById('aiChatMessages');
                if (messagesEl) {
                    messagesEl.innerHTML = '';
                    var recent = aiConversationHistory.slice(-6);
                    for (var i = 0; i < recent.length; i++) {
                        var msg = recent[i];
                        var role = msg.role === 'user' ? 'user' : 'ai';
                        appendChatMessage(msg.text, role);
                    }
                    var status = document.getElementById('status-assistente');
                    if (status) status.textContent = 'Continuando conversa anterior. Como posso ajudar?';
                }
            }
        }
    } catch (e) {}
}

// --- INICIALIZACAO ---

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
        showToast('Edicao ativada para esta imagem', 'info');
    });
    document.getElementById('previewShareBtn')?.addEventListener('click', () => {
        if (!currentPreviewFile) return;
        shareFile(currentPreviewFile);
    });
    document.getElementById('previewAssistantBtn')?.addEventListener('click', () => {
        if (currentPreviewFile) renderAiSuggestions(currentPreviewFile);
    });

    // --- Chat IA (texto) ---
    const chatToggleBtn = document.getElementById('aiChatToggle');
    if (chatToggleBtn) {
        chatToggleBtn.addEventListener('click', toggleChatPanel);
    }

    const chatSendBtn = document.getElementById('aiSendBtn');
    if (chatSendBtn) {
        chatSendBtn.addEventListener('click', sendChatMessage);
    }

    const chatInput = document.getElementById('aiChatInput');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    const chatClearBtn = document.getElementById('aiChatClearBtn');
    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', clearAiHistory);
    }

    // Restaurar historico da sessao anterior
    restoreAiHistory();

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

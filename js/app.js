/* js/app.js - Integrado com PHP */

// Estado Global
let allFiles = [];
let activeUploadXhr = null;
let pendingDeleteFileName = null;
let deleteCountdownTimer = null;

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
    // Verificar sessão no PHP
    const res = await fetch('api/auth.php?action=check');
    const data = await res.json();
    
    if (data.isLoggedIn) {
        if (window.location.pathname.includes('login.html')) {
            window.location.href = 'dashboard.html';
        } else {
            document.getElementById('userDisplay').innerText = `Olá, ${data.user}`;
            loadFiles(); // Carregar ficheiros se estiver no dashboard
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
        allFiles = await res.json();
        renderFiles(allFiles);
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
    const grid = document.getElementById('fileGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    if (files.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    files.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.style.animationDelay = `${index * 60}ms`;

        const preview = document.createElement('div');
        preview.className = 'card-icon';
        preview.appendChild(createFileVisual(file));

        const meta = document.createElement('div');
        meta.className = 'card-meta';

        const title = document.createElement('h4');
        title.textContent = file.name;

        const info = document.createElement('p');
        info.textContent = `${file.size} • ${file.date}`;

        meta.appendChild(title);
        meta.appendChild(info);

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

    // Feedback visual no botão de upload
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
    // Atualizar classe active
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
function openPreview(file) {
    const modal = document.getElementById('previewModal');
    document.getElementById('previewTitle').innerText = file.name;
    const body = document.getElementById('previewBody');
    
    if(file.type === 'image') {
        body.innerHTML = `<img src="${file.url}" style="max-height:300px; max-width:100%">`;
    } else {
        body.innerHTML = `<i class="fas fa-file-alt" style="font-size:4rem; color:#cbd5e1"></i>`;
    }
    
    modal.classList.remove('hidden');
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        checkAuth();
    } else {
        // Estamos no Dashboard
        checkAuth(); // Verifica se tem sessão, senão chuta para login
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
    }
});
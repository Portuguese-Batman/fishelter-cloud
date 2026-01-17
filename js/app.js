/* js/app.js - Integrado com PHP */

// Estado Global
let allFiles = [];

// --- FUNÇÕES DE AUTENTICAÇÃO ---

async function checkAuth() {
    // Verificar sessão no PHP
    const res = await fetch('api/auth.php?action=check');
    const data = await res.json();
    
    if (data.isLoggedIn) {
        if (window.location.pathname.includes('index.html') || window.location.pathname === '/') {
            window.location.href = 'dashboard.html';
        } else {
            document.getElementById('userDisplay').innerText = `Olá, ${data.user}`;
            loadFiles(); // Carregar ficheiros se estiver no dashboard
        }
    } else {
        if (window.location.pathname.includes('dashboard.html')) {
            window.location.href = 'index.html';
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
            window.location.href = 'dashboard.html';
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
    window.location.href = 'index.html';
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

function renderFiles(files) {
    const grid = document.getElementById('fileGrid');
    const empty = document.getElementById('emptyState');
    grid.innerHTML = '';

    if (files.length === 0) {
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    files.forEach(file => {
        // Ícone baseado no tipo
        let iconHtml = '';
        if (file.type === 'image') {
            iconHtml = `<img src="${file.url}" alt="${file.name}">`;
        } else if (file.type === 'video') {
            iconHtml = '<i class="fas fa-video"></i>';
        } else {
            iconHtml = '<i class="fas fa-file-alt"></i>';
        }

        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="card-icon">${iconHtml}</div>
            <div class="card-meta">
                <h4>${file.name}</h4>
                <p>${file.size} • ${file.date}</p>
            </div>
            <button onclick="deleteFile('${file.name}')" class="btn-text" style="position:absolute; bottom:10px; right:10px; color:var(--danger)">
                <i class="fas fa-trash"></i>
            </button>
            <a href="${file.url}" target="_blank" class="btn-text" style="position:absolute; bottom:10px; right:40px; color:var(--primary)">
                <i class="fas fa-download"></i>
            </a>
        `;
        // Ao clicar, abre preview (pode ser expandido depois)
        card.addEventListener('click', (e) => {
            if(e.target.closest('button') || e.target.closest('a')) return;
            openPreview(file);
        });
        
        grid.appendChild(card);
    });
}

async function handleUpload(files) {
    const formData = new FormData();
    for(let file of files) {
        formData.append('file', file);
    }

    // Feedback visual simples
    const btn = document.getElementById('openUploadBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> A enviar...';

    try {
        const res = await fetch('api/upload.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if(data.success) {
            closeModal('uploadModal');
            loadFiles(); // Recarregar lista
        } else {
            alert('Erro: ' + data.error);
        }
    } catch (err) {
        alert('Erro no upload.');
    } finally {
        btn.innerHTML = originalText;
    }
}

async function deleteFile(fileName) {
    if(!confirm('Tem certeza que deseja apagar este ficheiro?')) return;
    
    await fetch(`api/files.php?name=${encodeURIComponent(fileName)}`, { method: 'DELETE' });
    loadFiles();
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

function updateStorageStats(files) {
    // Calculo simples de tamanho (string manipulation por simplicidade neste contexto)
    let totalMB = 0;
    files.forEach(f => {
        totalMB += parseFloat(f.size);
    });
    
    const maxGB = 2.0; // Limite ficticio de 2GB
    const totalGB = totalMB / 1024;
    const percentage = Math.min((totalGB / maxGB) * 100, 100);
    
    document.querySelector('.progress-fill').style.width = percentage + '%';
    document.getElementById('storageText').innerText = Math.round(percentage) + '%';
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
    const loginForm = document.getElementById('loginForm');
    
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
        checkAuth(); // Verifica se já está logado para redirecionar
    } else {
        // Estamos no Dashboard
        checkAuth(); // Verifica se tem sessão, senão chuta para login
        
        document.getElementById('logoutBtn').addEventListener('click', handleLogout);
        
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
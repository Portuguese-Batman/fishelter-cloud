// script.js

// 1. Simulação de Login (apenas para veres a dashboard sem backend real ainda)
function loginSimulado() {
    // Isto cria um cookie falso ou recarrega a pagina simulando sessão
    // Num ambiente real, o PHP faria isto.
    // Para testares agora, vamos recarregar a página com um parâmetro
    // Em produção, remove isto.
    document.cookie = "PHPSESSID=simulacao; path=/"; 
    // Nota: Como não tenho backend PHP real aqui a correr, 
    // terás de comentar a lógica do PHP no index.php se não estiveres num servidor
    // OU simplesmente altera a linha: $loggedin = true; no topo do index.php para testar.
    alert("Login Simulado! (Altera $loggedin = true no index.php para ver a dashboard)");
}

// 2. Lógica de Seleção de Ficheiros
function selectCard(card) {
    card.classList.toggle('selected');
    updateToolbar();
}

function updateToolbar() {
    const selected = document.querySelectorAll('.file-card.selected');
    const toolbar = document.getElementById('contextToolbar');
    const countSpan = document.getElementById('selectedCount');
    
    if (selected.length > 0) {
        toolbar.classList.remove('hidden');
        toolbar.style.display = 'flex'; // Força o flex
        countSpan.textContent = selected.length;
    } else {
        toolbar.classList.add('hidden');
        toolbar.style.display = 'none';
    }
}

// 3. Menu Mobile
const menuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');

if(menuBtn){
    menuBtn.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
    
    // Fechar sidebar ao clicar fora (opcional)
    document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !menuBtn.contains(e.target) && sidebar.classList.contains('active')) {
            sidebar.classList.remove('active');
        }
    });
}
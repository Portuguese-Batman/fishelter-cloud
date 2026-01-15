<?php
// Simulação de sessão (no futuro ligarás isto à base de dados)
session_start();
$loggedin = true; 

// Logout simples
if (isset($_GET['logout'])) {
    session_destroy();
    header("Location: index.php");
    exit();
}
?>
<!DOCTYPE html>
<html lang="pt">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Fishelter Cloud</title>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="style.css">
</head>
<body>

<?php if (!$loggedin): ?>
    
    <div class="login-wrapper">
        <div class="login-card">
            <div style="margin-bottom: 20px; font-size: 2rem; color: var(--primary);">
                <i class="fa-solid fa-cloud"></i>
            </div>
            <h2 style="margin-bottom: 10px;">Bem-vindo de volta</h2>
            <p style="color: #666; margin-bottom: 20px;">Acede aos teus ficheiros em qualquer lugar.</p>
            
            <form id="loginForm" onsubmit="event.preventDefault(); loginSimulado();">
                <input type="text" placeholder="Email ou Utilizador" required>
                <input type="password" placeholder="Palavra-passe" required>
                <button type="submit" class="btn btn-primary" style="width: 100%; justify-content: center;">Entrar</button>
            </form>
            <div style="margin-top: 15px; font-size: 0.9rem;">
                <a href="#" style="color: var(--primary);">Esqueceste a senha?</a>
            </div>
        </div>
    </div>

<?php else: ?>

    <div class="app-container">
        
        <?php include 'includes/sidebar.php'; ?>

        <main class="main-content">
            <?php include 'includes/header.php'; ?>

            <div style="margin-bottom: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">
                <i class="fa-solid fa-house"></i> / Documentos / <strong>Projecto A</strong>
            </div>

            <div id="contextToolbar" class="hidden" style="background: var(--primary); color: white; padding: 10px 20px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
                <span><span id="selectedCount">0</span> selecionados</span>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-ghost" style="color: white;"><i class="fa-solid fa-download"></i> Baixar</button>
                    <button class="btn btn-ghost" style="color: white;"><i class="fa-solid fa-trash"></i> Apagar</button>
                </div>
            </div>

            <div class="file-grid" id="fileGrid">
                <div class="file-card" onclick="selectCard(this)">
                    <div class="preview-box">
                        <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=300&q=80" alt="Paisagem">
                    </div>
                    <div class="file-info">
                        <h4>viagem_japao.jpg</h4>
                        <span>2.4 MB</span>
                    </div>
                </div>

                <div class="file-card" onclick="selectCard(this)">
                    <div class="preview-box">
                        <i class="fa-solid fa-file-pdf file-icon" style="color: #ef4444;"></i>
                    </div>
                    <div class="file-info">
                        <h4>contrato_final.pdf</h4>
                        <span>150 KB</span>
                    </div>
                </div>
                 <div class="file-card" onclick="selectCard(this)">
                    <div class="preview-box">
                        <i class="fa-solid fa-file-word file-icon" style="color: #2563eb;"></i>
                    </div>
                    <div class="file-info">
                        <h4>tese_rascunho.docx</h4>
                        <span>45 KB</span>
                    </div>
                </div>
            </div>
        </main>
    </div>

<?php endif; ?>

<script src="script.js"></script>
</body>
</html>

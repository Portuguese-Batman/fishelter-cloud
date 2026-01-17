<?php
session_start();
require_once __DIR__ . '/db.php';

if (!isset($_SESSION['user_id'])) sendJson(['error' => 'Login necessário'], 403);

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['file'])) {
    $uploadDir = __DIR__ . '/../uploads/';
    
    // Criar diretoria se não existir
    if (!file_exists($uploadDir)) mkdir($uploadDir, 0777, true);

    $fileName = basename($_FILES['file']['name']);
    // Adicionar timestamp para evitar sobrescrever ficheiros com mesmo nome
    $targetFile = $uploadDir . time() . '_' . $fileName;

    if (move_uploaded_file($_FILES['file']['tmp_name'], $targetFile)) {
        sendJson(['success' => true]);
    } else {
        sendJson(['error' => 'Falha ao mover ficheiro. Verifique permissões da pasta.'], 500);
    }
}
?>
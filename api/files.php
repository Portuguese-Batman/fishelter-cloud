<?php
session_start();
require_once __DIR__ . '/db.php';

// Segurança: Apenas logados
if (!isset($_SESSION['user_id'])) {
    sendJson(['error' => 'Não autorizado'], 403);
}

$uploadDir = __DIR__ . '/../uploads/';
$webUploadPath = 'uploads/'; // Caminho relativo para o frontend

// LISTAR FICHEIROS
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $files = [];
    if (is_dir($uploadDir)) {
        $scan = scandir($uploadDir);
        foreach ($scan as $file) {
            if ($file === '.' || $file === '..') continue;
            
            $filePath = $uploadDir . $file;
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            
            // Determinar tipo
            $type = 'document';
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) $type = 'image';
            if (in_array($ext, ['mp4', 'webm', 'mov'])) $type = 'video';

            $files[] = [
                'name' => $file,
                'type' => $type,
                'size' => round(filesize($filePath) / 1024 / 1024, 2) . ' MB', // Tamanho em MB
                'url'  => $webUploadPath . $file,
                'date' => date("d/m/Y", filemtime($filePath))
            ];
        }
    }
    sendJson($files);
}

// APAGAR FICHEIRO
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $filename = $_GET['name'] ?? '';
    // Segurança básica contra Directory Traversal
    $filename = basename($filename); 
    
    if (file_exists($uploadDir . $filename)) {
        unlink($uploadDir . $filename);
        sendJson(['success' => true]);
    } else {
        sendJson(['error' => 'Ficheiro não encontrado'], 404);
    }
}
?>
<?php
// api/criar_pasta.php
header('Content-Type: application/json; charset=utf-8');

// Requisitos mínimos de segurança
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método não permitido.']);
    exit;
}

$raw = $_POST['nome_pasta'] ?? '';
$raw = is_string($raw) ? $raw : '';

// Sanitização robusta:
// - remove espaços extremos
// - remove barras e backslashes
// - restringe a caracteres seguros
// - evita nomes vazios
$name = trim($raw);
$name = str_replace(["\\", '/', '\0'], '', $name);
$name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name);
$name = preg_replace('/[^a-zA-Z0-9\-_.\u00C0-\u00FF\s]/u', '', $name);
$name = preg_replace('/\s+/u', ' ', $name);

// limitar tamanho para evitar abuso
if (mb_strlen($name, 'UTF-8') > 80) {
    $name = mb_substr($name, 0, 80, 'UTF-8');
    $name = trim($name);
}

if ($name === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Nome da pasta inválido.']);
    exit;
}

// Caminho uploads (relativo ao projeto, seguro)
// Procura por ./uploads no mesmo nível do diretório api
$baseDir = dirname(__DIR__); // .../pap-main
$uploadsDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';

if (!is_dir($uploadsDir)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Diretoria de uploads não existe.']);
    exit;
}

// Evitar traversal adicional (mesmo com sanitização)
if (str_contains($name, '..')) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Nome de pasta inválido.']);
    exit;
}

$targetDir = $uploadsDir . DIRECTORY_SEPARATOR . $name;

try {
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0755, false)) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Não foi possível criar a pasta.']);
            exit;
        }
    }

    echo json_encode(['success' => true]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erro ao criar pasta: ' . $e->getMessage()]);
}


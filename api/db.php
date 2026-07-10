<?php
// Configurações de Base de Dados
// No ficheiro api/db.php
define('DB_HOST', 'localhost');
define('DB_USER', 'admin_site');
define('DB_PASS', 'endyprincesa'); // Garante que esta senha está correta!
define('DB_NAME', 'nuvem_caseira');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

try {
    $conn = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
    $conn->set_charset("utf8mb4");
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Erro de conexão com a base de dados']);
    exit;
}

// Função auxiliar para respostas JSON
function sendJson($data, $status = 200) {
    header('Content-Type: application/json');
    http_response_code($status);
    echo json_encode($data);
    exit;
}
?>  

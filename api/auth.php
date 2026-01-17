<?php
session_start();
require_once __DIR__ . '/db.php';

$action = $_GET['action'] ?? '';

// 1. LOGIN
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'login') {
    $input = json_decode(file_get_contents('php://input'), true);
    $user = $input['username'] ?? '';
    $pass = $input['password'] ?? '';

    $stmt = $conn->prepare("SELECT id, nome, senha FROM usuarios WHERE nome = ?");
    $stmt->bind_param("s", $user);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($row = $result->fetch_assoc()) {
        if (password_verify($pass, $row['senha'])) {
            $_SESSION['user_id'] = $row['id'];
            $_SESSION['user_name'] = $row['nome'];
            sendJson(['success' => true, 'user' => $row['nome']]);
        }
    }
    
    sendJson(['success' => false, 'message' => 'Credenciais inválidas'], 401);
}

// 2. CHECK SESSION (Verificar se está logado ao carregar a pág)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && $action === 'check') {
    if (isset($_SESSION['user_id'])) {
        sendJson(['isLoggedIn' => true, 'user' => $_SESSION['user_name']]);
    } else {
        sendJson(['isLoggedIn' => false]);
    }
}

// 3. LOGOUT
if ($action === 'logout') {
    session_destroy();
    sendJson(['success' => true]);
}
?>
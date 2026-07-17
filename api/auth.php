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
    // Encerra e limpa a sessão (para evitar que cookies persistam)
    $_SESSION = [];

    if (session_id() !== '' || isset($_COOKIE[session_name()])) {
        // Tenta invalidar o cookie da sessão
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'],
                (bool)$params['secure'],
                (bool)$params['httponly']
            );
        }
    }

    session_destroy();
    sendJson(['success' => true]);
}

// 4. REGISTO (Adiciona isto no final do ficheiro)
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $action === 'register') {
    $input = json_decode(file_get_contents('php://input'), true);
    $user = $input['username'] ?? '';
    $pass = $input['password'] ?? '';

    if (empty($user) || empty($pass)) {
        sendJson(['success' => false, 'message' => 'Dados incompletos'], 400);
    }

    // Cria o hash seguro que o password_verify exige
    $hashedPass = password_hash($pass, PASSWORD_DEFAULT);

    $stmt = $conn->prepare("INSERT INTO usuarios (nome, senha) VALUES (?, ?)");
    $stmt->bind_param("ss", $user, $hashedPass);
    
    if ($stmt->execute()) {
        sendJson(['success' => true, 'message' => 'Utilizador criado com sucesso!']);
    } else {
        sendJson(['success' => false, 'message' => 'Erro: Utilizador já existe'], 409);
    }
}
?>

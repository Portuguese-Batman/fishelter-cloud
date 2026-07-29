<?php
/**
 * api/ai.php - Assistente IA Profissional com Function Calling
 *
 * Arquitetura segura:
 *   Browser (app.js) -> api/ai.php (PHP) -> Gemini 2.5 Flash API
 *                                            -> Tools PHP (files, storage, etc.)
 *                                            -> Resposta natural
 *
 * Requisitos:
 *   - PHP 8.2+
 *   - Extensao JSON (nativa no PHP)
 *   - allow_url_fopen = On (no php.ini)
 *
 * @author Afonso (PAP)
 * @version 3.4
 */

// ================================================================
// DEBUG INICIAL ABSOLUTO (antes de qualquer require)
// ================================================================
$debugFile = '/tmp/ai_debug.txt';
file_put_contents($debugFile, "=== INICIO api/ai.php ===\n", FILE_APPEND);
file_put_contents($debugFile, "1. SCRIPT START: " . date('Y-m-d H:i:s') . "\n", FILE_APPEND);

// ================================================================
// FUNCOES DE FALLBACK PARA mb_* (defensive, sem fatal error)
// ================================================================
if (!function_exists('safe_substr')) {
    function safe_substr($str, $start, $length = null) {
        if (function_exists('mb_substr')) {
            return $length === null ? mb_substr($str, $start) : mb_substr($str, $start, $length, 'UTF-8');
        }
        return $length === null ? substr($str, $start) : substr($str, $start, $length);
    }
}
if (!function_exists('safe_strlen')) {
    function safe_strlen($str) {
        if (function_exists('mb_strlen')) {
            return mb_strlen($str, 'UTF-8');
        }
        return strlen($str);
    }
}
if (!function_exists('safe_strtolower')) {
    function safe_strtolower($str) {
        if (function_exists('mb_strtolower')) {
            return mb_strtolower($str, 'UTF-8');
        }
        return strtolower($str);
    }
}
if (!function_exists('safe_stripos')) {
    function safe_stripos($haystack, $needle) {
        if (function_exists('mb_stripos')) {
            return mb_stripos($haystack, $needle, 0, 'UTF-8');
        }
        return stripos($haystack, $needle);
    }
}

// ================================================================
// CONFIGURACAO INICIAL
// ================================================================
file_put_contents($debugFile, "2. Antes de session_start()\n", FILE_APPEND);
session_start();
file_put_contents($debugFile, "3. Depois de session_start()\n", FILE_APPEND);

require_once __DIR__ . '/db.php';
file_put_contents($debugFile, "4. Depois de require_once db.php\n", FILE_APPEND);

require_once __DIR__ . '/config.php';
file_put_contents($debugFile, "5. Depois de require_once config.php\n", FILE_APPEND);

header('Content-Type: application/json; charset=utf-8');

$GLOBALS['_ai_start_time'] = microtime(true);

// ================================================================
// LOGGING
// ================================================================
define('AI_LOG_FILE', __DIR__ . '/../logs/ai.log');

$logDirCheck = is_dir(dirname(AI_LOG_FILE)) ? 'SIM' : 'NAO';
$logDirWritable = is_writable(dirname(AI_LOG_FILE)) ? 'SIM' : 'NAO';
file_put_contents($debugFile, "6. AI_LOG_FILE=" . AI_LOG_FILE . " dir_exists={$logDirCheck} dir_writable={$logDirWritable}\n", FILE_APPEND);

function aiLog(string $message, array $context = []): void {
    $logDir = dirname(AI_LOG_FILE);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $timestamp = date('Y-m-d H:i:s');
    $contextStr = !empty($context) ? ' | ' . json_encode($context, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR) : '';
    $line = "[{$timestamp}] {$message}{$contextStr}" . PHP_EOL;
    $written = @file_put_contents(AI_LOG_FILE, $line, FILE_APPEND | LOCK_EX);
    if ($written === false) {
        $err = error_get_last();
        file_put_contents('/tmp/ai_debug.txt', "aiLog FALHOU: " . ($err['message'] ?? 'erro desconhecido') . "\n", FILE_APPEND);
    }
}

file_put_contents($debugFile, "7. Antes do primeiro aiLog()\n", FILE_APPEND);

// ---- DEBUG: Log para ficheiro normal alem do aiLog ----
file_put_contents(AI_LOG_FILE, "[" . date('Y-m-d H:i:s') . "] [INICIO] Script iniciado | PHP=" . PHP_VERSION . " | allow_url_fopen=" . ini_get('allow_url_fopen') . "\n", FILE_APPEND);

aiLog('Ambiente', [
    'PHP_VERSION' => PHP_VERSION,
    'allow_url_fopen' => ini_get('allow_url_fopen'),
    'GEMINI_API_KEY defined' => defined('GEMINI_API_KEY') ? 'SIM' : 'NAO'
]);

file_put_contents($debugFile, "8. Primeiro aiLog() executado com sucesso\n", FILE_APPEND);

// ================================================================
// SEGURANCA
// ================================================================
file_put_contents($debugFile, "9. Verificando autenticacao...\n", FILE_APPEND);

if (!isset($_SESSION['user_id'])) {
    file_put_contents($debugFile, "10a. ERRO: user_id nao definido na sessao\n", FILE_APPEND);
    http_response_code(403);
    echo json_encode(['error' => 'Nao autorizado']);
    exit;
}

file_put_contents($debugFile, "10. user_id OK: " . $_SESSION['user_id'] . "\n", FILE_APPEND);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    file_put_contents($debugFile, "11a. ERRO: metodo nao POST: " . $_SERVER['REQUEST_METHOD'] . "\n", FILE_APPEND);
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

file_put_contents($debugFile, "11. Metodo POST OK\n", FILE_APPEND);

// ================================================================
// LER INPUT
// ================================================================
$inputRaw = file_get_contents('php://input');
file_put_contents($debugFile, "12. Input raw length: " . strlen($inputRaw) . "\n", FILE_APPEND);

$input = json_decode($inputRaw, true);
if (!$input) {
    file_put_contents($debugFile, "13a. ERRO: JSON invalido\n", FILE_APPEND);
    http_response_code(400);
    echo json_encode(['error' => 'JSON invalido']);
    exit;
}

file_put_contents($debugFile, "13. JSON decodificado OK\n", FILE_APPEND);

$userMessage = isset($input['message']) ? trim($input['message']) : '';
$history = $input['history'] ?? [];

if ($userMessage === '') {
    file_put_contents($debugFile, "14a. ERRO: Mensagem vazia\n", FILE_APPEND);
    http_response_code(400);
    echo json_encode(['error' => 'Mensagem vazia']);
    exit;
}

file_put_contents($debugFile, "14. Mensagem OK: " . safe_substr($userMessage, 0, 50) . "\n", FILE_APPEND);

$confirmWords = ['sim', 'confirmar', 'yes', 'ok', 'okay', 'pode apagar', 'pode criar', 'confirmo', 'estou certo'];

// ================================================================
// VERIFICAR CONFIRMACAO PENDENTE
// ================================================================
if (isset($_SESSION['ai_pending_action'])) {
    file_put_contents($debugFile, "15. Acao pendente encontrada\n", FILE_APPEND);
    $lowerMsg = safe_strtolower(trim($userMessage));
    $isAffirmative = false;
    foreach ($confirmWords as $word) {
        if ($lowerMsg === $word || strpos($lowerMsg, $word) !== false) {
            $isAffirmative = true;
            break;
        }
    }

    if ($isAffirmative) {
        $pending = $_SESSION['ai_pending_action'];
        unset($_SESSION['ai_pending_action']);

        $toolResult = executeTool($pending['name'], $pending['args']);

        if (!isset($_SESSION['ai_conversation'])) {
            $_SESSION['ai_conversation'] = array();
        }
        $_SESSION['ai_conversation'][] = array('role' => 'user', 'text' => $userMessage);

        $pendingContents = buildContents($_SESSION['ai_conversation'], '');

        $pendingContents[] = array(
            'role'  => 'model',
            'parts' => array(array(
                'functionCall' => array(
                    'name' => $pending['name'],
                    'args' => $pending['args']
                )
            ))
        );

        $pendingContents[] = array(
            'role'  => 'user',
            'parts' => array(array(
                'functionResponse' => array(
                    'name'     => $pending['name'],
                    'response' => $toolResult
                )
            ))
        );

        $geminiResult = callGemini($pendingContents, array(array('functionDeclarations' => getToolDeclarations())));

        $finalText = 'Acao concluida com sucesso.';
        if (!isset($geminiResult['error'])) {
            if (isset($geminiResult['candidates'][0]['content']['parts'][0]['text'])) {
                $finalText = trim($geminiResult['candidates'][0]['content']['parts'][0]['text']);
            }
        } else {
            $finalText = $geminiResult['message'] ?? 'Erro ao processar confirmacao.';
        }

        $_SESSION['ai_conversation'][] = array('role' => 'model', 'text' => $finalText);
        $_SESSION['ai_conversation'] = array_slice($_SESSION['ai_conversation'], -20);

        echo json_encode(array(
            'success'               => true,
            'text'                  => $finalText,
            'history'               => $_SESSION['ai_conversation'],
            'action'                => array(
                'name'   => $pending['name'],
                'result' => $toolResult
            ),
            'requiresConfirmation'  => false
        ), JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        exit;
    }

    unset($_SESSION['ai_pending_action']);
}

// ================================================================
// CONVERSATION MEMORY (SESSION)
// ================================================================
if (!isset($_SESSION['ai_conversation'])) {
    $_SESSION['ai_conversation'] = array();
}

if (!empty($history)) {
    $_SESSION['ai_conversation'] = array_slice($history, -20);
}

file_put_contents($debugFile, "16. Historico: " . count($_SESSION['ai_conversation']) . " itens\n", FILE_APPEND);

// ================================================================
// TOOLS - EXECUTADAS LOCALMENTE
// ================================================================

function toolListarFicheiros(string $filter = 'all'): array {
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        return array('success' => true, 'files' => array(), 'total' => 0);
    }
    $files = array();
    $scan = scandir($uploadDir);
    foreach ($scan as $file) {
        if ($file === '.' || $file === '..') continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $type = 'document';
        if (in_array($ext, array('jpg','jpeg','png','gif','webp','svg'))) $type = 'image';
        elseif (in_array($ext, array('mp4','webm','mov'))) $type = 'video';
        if ($filter !== 'all' && $type !== $filter) continue;
        $files[] = array(
            'name' => $file,
            'type' => $type,
            'size' => round(filesize($uploadDir . $file) / 1024, 1) . ' KB',
            'date' => date('d/m/Y H:i', filemtime($uploadDir . $file))
        );
    }
    return array('success' => true, 'files' => $files, 'total' => count($files));
}

function toolPesquisarFicheiros(string $query): array {
    if ($query === '') return toolListarFicheiros('all');
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        return array('success' => true, 'files' => array(), 'total' => 0);
    }
    $results = array();
    foreach (scandir($uploadDir) as $file) {
        if ($file === '.' || $file === '..') continue;
        if (safe_stripos($file, $query) === false) continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $type = 'document';
        if (in_array($ext, array('jpg','jpeg','png','gif','webp','svg'))) $type = 'image';
        elseif (in_array($ext, array('mp4','webm','mov'))) $type = 'video';
        $results[] = array(
            'name' => $file,
            'type' => $type,
            'size' => round(filesize($uploadDir . $file) / 1024, 1) . ' KB'
        );
    }
    return array('success' => true, 'files' => $results, 'total' => count($results));
}

function toolCriarPasta(string $nome): array {
    $baseDir = dirname(__DIR__);
    $uploadsDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
    if (!is_dir($uploadsDir)) {
        return array('success' => false, 'error' => 'Diretoria de uploads nao existe');
    }
    $name = trim(preg_replace('/[^a-zA-Z0-9\-_.\s]/u', '', str_replace(array("\\", '/', "\0"), '', $nome)));
    $name = trim(preg_replace('/\s+/u', ' ', $name));
    if ($name === '' || safe_strlen($name) > 80) {
        return array('success' => false, 'error' => 'Nome de pasta invalido');
    }
    if (strpos($name, '..') !== false) {
        return array('success' => false, 'error' => 'Nome de pasta invalido');
    }
    $target = $uploadsDir . DIRECTORY_SEPARATOR . $name;
    if (is_dir($target)) {
        return array('success' => false, 'error' => 'A pasta "' . $name . '" ja existe');
    }
    if (@mkdir($target, 0755)) {
        return array('success' => true, 'pasta' => $name);
    }
    return array('success' => false, 'error' => 'Nao foi possivel criar a pasta');
}

function toolApagarFicheiro(string $nome): array {
    $filename = basename($nome);
    $file = __DIR__ . '/../uploads/' . $filename;
    if (!file_exists($file)) {
        return array('success' => false, 'error' => 'Ficheiro nao encontrado: ' . $filename);
    }
    if (@unlink($file)) {
        return array('success' => true, 'ficheiro' => $filename, 'message' => 'Ficheiro apagado com sucesso');
    }
    return array('success' => false, 'error' => 'Nao foi possivel apagar o ficheiro');
}

function toolPartilharFicheiro(string $nome): array {
    $uploadDir = __DIR__ . '/../uploads/';
    $filename = basename($nome);
    if (!file_exists($uploadDir . $filename)) {
        return array('success' => false, 'error' => 'Ficheiro nao encontrado');
    }
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    $url = $protocol . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $base . '/uploads/' . rawurlencode($filename);
    return array('success' => true, 'ficheiro' => $filename, 'url' => $url);
}

function toolInfoArmazenamento(): array {
    $uploadDir = __DIR__ . '/../uploads/';
    $limitGb = 2;
    $usedBytes = 0;
    $fileCount = 0;
    if (is_dir($uploadDir)) {
        $files = glob($uploadDir . '*');
        if (is_array($files)) {
            $fileCount = count($files);
            $usedBytes = array_sum(array_map(function ($path) {
                return is_file($path) ? filesize($path) : 0;
            }, $files));
        }
    }
    $usedMb = round($usedBytes / 1024 / 1024, 2);
    $usedGb = round($usedBytes / 1024 / 1024 / 1024, 4);
    $percentage = min(100, max(0, round(($usedBytes / ($limitGb * 1024 * 1024 * 1024)) * 100)));
    return array(
        'success'    => true,
        'usedBytes'  => $usedBytes,
        'usedMb'     => $usedMb,
        'usedGb'     => $usedGb,
        'limitGb'    => $limitGb,
        'percentage' => $percentage,
        'fileCount'  => $fileCount
    );
}

// ================================================================
// FUNCTION DECLARATIONS (Formato oficial Gemini API)
// ================================================================

function getToolDeclarations(): array {
    return array(
        array(
            'name'        => 'listar_ficheiros',
            'description' => 'Lista todos os ficheiros da nuvem. Opcionalmente filtra por tipo: all, image, video, document.',
            'parameters'  => array(
                'type'       => 'object',
                'properties' => array(
                    'filter' => array(
                        'type'        => 'string',
                        'enum'        => array('all', 'image', 'video', 'document'),
                        'description' => 'Filtro opcional para tipo de ficheiro (all, image, video, document)'
                    )
                )
            )
        ),
        array(
            'name'        => 'pesquisar_ficheiros',
            'description' => 'Pesquisa ficheiros na nuvem por nome.',
            'parameters'  => array(
                'type'       => 'object',
                'properties' => array(
                    'query' => array(
                        'type'        => 'string',
                        'description' => 'Termo para pesquisar no nome dos ficheiros'
                    )
                ),
                'required' => array('query')
            )
        ),
        array(
            'name'        => 'criar_pasta',
            'description' => 'Cria uma nova pasta no diretorio de uploads para organizar ficheiros.',
            'parameters'  => array(
                'type'       => 'object',
                'properties' => array(
                    'nome' => array(
                        'type'        => 'string',
                        'description' => 'Nome da pasta a criar'
                    )
                ),
                'required' => array('nome')
            )
        ),
        array(
            'name'        => 'apagar_ficheiro',
            'description' => 'Apaga permanentemente um ficheiro da nuvem. Requer confirmacao do utilizador antes de executar.',
            'parameters'  => array(
                'type'       => 'object',
                'properties' => array(
                    'nome' => array(
                        'type'        => 'string',
                        'description' => 'Nome do ficheiro a apagar'
                    )
                ),
                'required' => array('nome')
            )
        ),
        array(
            'name'        => 'partilhar_ficheiro',
            'description' => 'Gera um link de partilha publico para um ficheiro.',
            'parameters'  => array(
                'type'       => 'object',
                'properties' => array(
                    'nome' => array(
                        'type'        => 'string',
                        'description' => 'Nome do ficheiro a partilhar'
                    )
                ),
                'required' => array('nome')
            )
        ),
        array(
            'name'        => 'info_armazenamento',
            'description' => 'Mostra o espaco de armazenamento utilizado, disponivel e numero de ficheiros.',
            'parameters'  => array(
                'type'       => 'object',
                'properties' => new stdClass()
            )
        )
    );
}

// ================================================================
// EXECUTOR DE FERRAMENTAS
// ================================================================

function executeTool(string $name, array $args): array {
    switch ($name) {
        case 'listar_ficheiros':
            return toolListarFicheiros($args['filter'] ?? 'all');
        case 'pesquisar_ficheiros':
            return toolPesquisarFicheiros($args['query'] ?? '');
        case 'criar_pasta':
            return toolCriarPasta($args['nome'] ?? '');
        case 'apagar_ficheiro':
            return toolApagarFicheiro($args['nome'] ?? '');
        case 'partilhar_ficheiro':
            return toolPartilharFicheiro($args['nome'] ?? '');
        case 'info_armazenamento':
            return toolInfoArmazenamento();
        default:
            return array('success' => false, 'error' => 'Ferramenta desconhecida: ' . $name);
    }
}

// ================================================================
// CHAMADA A API GEMINI
// ================================================================

function callGemini(array $contents, array $tools = null): array {
    $apiKey = defined('GEMINI_API_KEY') ? GEMINI_API_KEY : '';
    $defaultKey = 'AIzaSyAquiVaTuaChaveGemini';

    if (empty($apiKey) || $apiKey === $defaultKey) {
        return array(
            'error'   => 'API_KEY_INVALID',
            'message' => 'A chave da API Gemini nao esta configurada. Edite o ficheiro api/config.php com a sua chave.'
        );
    }

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . $apiKey;

    $payload = array(
        'contents'         => $contents,
        'generationConfig' => array(
            'temperature'     => 0.7,
            'maxOutputTokens' => 2048
        )
    );

    if ($tools !== null && !empty($tools)) {
        $payload['tools'] = $tools;
    }

    $jsonPayload = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    if ($jsonPayload === false) {
        $errMsg = 'Falha ao codificar JSON: ' . json_last_error_msg();
        file_put_contents('/tmp/ai_debug.txt', "callGemini: JSON encode failed: {$errMsg}\n", FILE_APPEND);
        aiLog('ERRO callGemini', array('error' => $errMsg));
        return array('error' => 'PAYLOAD_ERROR', 'message' => $errMsg);
    }

    // LOG: Payload enviado (JSON completo)
    aiLog('PAYLOAD ENVIADO', array('payload' => $jsonPayload));

    file_put_contents('/tmp/ai_debug.txt', "callGemini: A enviar request para Gemini API (payload size: " . strlen($jsonPayload) . ")\n", FILE_APPEND);

    // LOG: JSON enviado para debug
    file_put_contents('/tmp/ai_debug.txt', "callGemini JSON ENVIADO:\n" . $jsonPayload . "\n", FILE_APPEND);

    $context = stream_context_create(array(
        'http' => array(
            'method'          => 'POST',
            'header'          => "Content-Type: application/json\r\n",
            'content'         => $jsonPayload,
            'timeout'         => 30,
            'ignore_errors'   => true
        )
    ));

    $response = @file_get_contents($url, false, $context);

    $httpCode = 0;
    if (isset($http_response_header) && is_array($http_response_header)) {
        foreach ($http_response_header as $header) {
            if (preg_match('/^HTTP\/\d\.\d\s+(\d+)/', $header, $matches)) {
                $httpCode = (int)$matches[1];
                break;
            }
        }
    }

    $elapsed = round(microtime(true) - $GLOBALS['_ai_start_time'], 3);

    file_put_contents('/tmp/ai_debug.txt', "callGemini: HTTP {$httpCode} elapsed={$elapsed}s\n", FILE_APPEND);

    // LOG: HTTP STATUS
    aiLog('HTTP STATUS', array('status' => $httpCode, 'elapsed' => $elapsed));

    // LOG: Resposta completa da Google
    if ($response === false || $response === '') {
        aiLog('RESPOSTA COMPLETA GOOGLE', array('response' => '(resposta vazia ou false)'));
    } else {
        aiLog('RESPOSTA COMPLETA GOOGLE', array('response' => $response));
        file_put_contents('/tmp/ai_debug.txt', "callGemini JSON RECEBIDO:\n" . $response . "\n", FILE_APPEND);
    }

    if ($response === false || $response === '') {
        $errMsg = ($response === false)
            ? 'Nao foi possivel contactar a API Gemini. Timeout ou falha de conexao.'
            : 'A API Gemini devolveu uma resposta vazia.';
        file_put_contents('/tmp/ai_debug.txt', "callGemini: {$errMsg}\n", FILE_APPEND);
        return array('error' => 'HTTP_ERROR', 'message' => $errMsg);
    }

    $data = json_decode($response, true);
    if ($data === null) {
        $jsonErr = json_last_error_msg();
        file_put_contents('/tmp/ai_debug.txt', "callGemini: JSON decode error: {$jsonErr}\n", FILE_APPEND);
        aiLog('ERRO JSON RECEBIDO', array('error' => $jsonErr));
        return array('error' => 'INVALID_JSON', 'message' => 'A API Gemini devolveu uma resposta invalida. Erro JSON: ' . $jsonErr);
    }

    // LOG: JSON recebido decodificado
    aiLog('JSON RECEBIDO DECODIFICADO', array('data_keys' => array_keys($data)));

    // Verificar promptFeedback
    if (isset($data['promptFeedback'])) {
        $promptFeedback = $data['promptFeedback'];
        aiLog('PROMPT FEEDBACK', array('promptFeedback' => $promptFeedback));
        // Se estiver bloqueado, reportar ao utilizador
        if (isset($promptFeedback['blockReason'])) {
            return array(
                'error'   => 'BLOCKED',
                'message' => 'O pedido foi bloqueado pela Gemini. Motivo: ' . $promptFeedback['blockReason']
            );
        }
    }

    // Verificar error.message da API
    if (isset($data['error']['message'])) {
        $errorMsg = $data['error']['message'];
        aiLog('ERRO API GEMINI', array('error' => $errorMsg));
        file_put_contents('/tmp/ai_debug.txt', "callGemini: API error: {$errorMsg}\n", FILE_APPEND);

        if (stripos($errorMsg, 'API_KEY') !== false || $httpCode === 403) {
            return array('error' => 'API_KEY_INVALID', 'message' => 'A chave da API Gemini e invalida. Verifique o ficheiro api/config.php. Detalhe: ' . $errorMsg);
        }
        return array('error' => 'API_ERROR', 'message' => 'Erro da API Gemini: ' . $errorMsg);
    }

    if ($httpCode === 403) {
        return array(
            'error'   => 'API_KEY_INVALID',
            'message' => 'A chave da API Gemini e invalida ou nao tem permissoes. Verifique o ficheiro api/config.php.'
        );
    }

    if ($httpCode === 400) {
        $errorMsg = isset($data['error']['message']) ? $data['error']['message'] : 'Erro de requisicao invalida';
        return array('error' => 'API_ERROR', 'message' => 'Erro da API Gemini (HTTP 400): ' . $errorMsg);
    }

    if ($httpCode === 429) {
        return array('error' => 'RATE_LIMIT', 'message' => 'Limite de requisicoes excedido. Tente novamente mais tarde.');
    }

    if ($httpCode >= 500) {
        return array('error' => 'SERVER_ERROR', 'message' => 'O servidor Gemini esta temporariamente indisponivel (HTTP ' . $httpCode . '). Tente novamente mais tarde.');
    }

    if (!isset($data['candidates']) || !isset($data['candidates'][0])) {
        $blockReason = isset($data['promptFeedback']['blockReason']) ? $data['promptFeedback']['blockReason'] : 'desconhecido';
        file_put_contents('/tmp/ai_debug.txt', "callGemini: NO_CANDIDATES reason={$blockReason}\n", FILE_APPEND);
        return array('error' => 'NO_CANDIDATES', 'message' => 'A IA nao conseguiu processar o pedido (motivo: ' . $blockReason . ').');
    }

    return $data;
}

// ================================================================
// CONSTRUIR ARRAY CONTENTS
// ================================================================

function buildContents(array $history, string $userMessage): array {
    $contents = array();

    foreach ($history as $msg) {
        if (!isset($msg['role']) || !isset($msg['text'])) continue;
        $role = $msg['role'];
        if ($role !== 'user' && $role !== 'model') continue;
        $text = trim($msg['text']);
        if ($text === '') continue;
        $contents[] = array(
            'role'  => $role,
            'parts' => array(array('text' => $text))
        );
    }

    if ($userMessage !== '') {
        $contents[] = array(
            'role'  => 'user',
            'parts' => array(array('text' => $userMessage))
        );
    }

    return $contents;
}

// ================================================================
// PROCESSAR FUNCTION CALLING EM LOOP
// ================================================================

function processWithGemini(array $contents): array {
    $tools = array(
        array('functionDeclarations' => getToolDeclarations())
    );

    $maxRounds = 5;
    $finalText = '';
    $executedAction = null;
    $needsConfig = false;

    for ($round = 1; $round <= $maxRounds; $round++) {
        file_put_contents('/tmp/ai_debug.txt', "processWithGemini: Round {$round}/{$maxRounds}\n", FILE_APPEND);

        $result = callGemini($contents, $tools);

        if (isset($result['error'])) {
            $isKeyInvalid = ($result['error'] === 'API_KEY_INVALID');
            file_put_contents('/tmp/ai_debug.txt', "processWithGemini: Erro no round {$round}: " . $result['error'] . "\n", FILE_APPEND);
            return array(
                'text'                 => $result['message'],
                'needsConfig'          => $isKeyInvalid,
                'action'               => null,
                'requiresConfirmation' => false
            );
        }

        $candidate = isset($result['candidates'][0]) ? $result['candidates'][0] : null;
        if ($candidate === null) {
            file_put_contents('/tmp/ai_debug.txt', "processWithGemini: Candidato nulo no round {$round}\n", FILE_APPEND);
            return array(
                'text'                 => 'A IA nao conseguiu processar o pedido.',
                'action'               => null,
                'requiresConfirmation' => false
            );
        }

        $part = isset($candidate['content']['parts'][0]) ? $candidate['content']['parts'][0] : null;
        if ($part === null) {
            $finishReason = isset($candidate['finishReason']) ? $candidate['finishReason'] : 'unknown';
            file_put_contents('/tmp/ai_debug.txt', "processWithGemini: Part nulo, finishReason={$finishReason}\n", FILE_APPEND);
            if ($finishReason === 'SAFETY') {
                return array(
                    'text'                 => 'Nao posso responder a essa pergunta por questoes de seguranca.',
                    'action'               => null,
                    'requiresConfirmation' => false
                );
            }
            return array(
                'text'                 => 'Nao foi possivel gerar uma resposta (finishReason: ' . $finishReason . ').',
                'action'               => null,
                'requiresConfirmation' => false
            );
        }

        // --- FUNCTION CALL ---
        if (isset($part['functionCall'])) {
            $funcName = $part['functionCall']['name'];
            $funcArgs = isset($part['functionCall']['args']) ? $part['functionCall']['args'] : array();

            if (is_object($funcArgs)) {
                $funcArgs = (array)$funcArgs;
            }

            file_put_contents('/tmp/ai_debug.txt', "processWithGemini: FunctionCall {$funcName} args=" . json_encode($funcArgs) . "\n", FILE_APPEND);

            $destructiveOps = array('apagar_ficheiro', 'criar_pasta');
            if (in_array($funcName, $destructiveOps)) {
                $_SESSION['ai_pending_action'] = array(
                    'name' => $funcName,
                    'args' => $funcArgs
                );

                $actionLabels = array(
                    'apagar_ficheiro' => 'apagar o ficheiro',
                    'criar_pasta'     => 'criar a pasta'
                );
                $targetName = isset($funcArgs['nome']) ? $funcArgs['nome'] : '';
                $label = isset($actionLabels[$funcName]) ? $actionLabels[$funcName] : 'executar esta acao';

                file_put_contents('/tmp/ai_debug.txt', "processWithGemini: A pedir confirmacao para {$funcName}\n", FILE_APPEND);

                return array(
                    'requiresConfirmation' => true,
                    'action'               => $funcName,
                    'parameters'           => $funcArgs,
                    'text'                 => "Tem a certeza que deseja {$label} '{$targetName}'?",
                    'history'              => isset($_SESSION['ai_conversation']) ? $_SESSION['ai_conversation'] : array()
                );
            }

            $toolResult = executeTool($funcName, $funcArgs);
            $executedAction = array(
                'name'   => $funcName,
                'result' => $toolResult
            );

            $contents[] = array(
                'role'  => 'model',
                'parts' => array(array(
                    'functionCall' => array(
                        'name' => $funcName,
                        'args' => $funcArgs
                    )
                ))
            );

            $contents[] = array(
                'role'  => 'user',
                'parts' => array(array(
                    'functionResponse' => array(
                        'name'     => $funcName,
                        'response' => $toolResult
                    )
                ))
            );

            continue;
        }

        // --- RESPOSTA DE TEXTO ---
        if (isset($part['text'])) {
            $finalText = trim($part['text']);
            file_put_contents('/tmp/ai_debug.txt', "processWithGemini: Texto obtido no round {$round}: " . safe_substr($finalText, 0, 100) . "\n", FILE_APPEND);
            break;
        }

        break;
    }

    if ($finalText === '') {
        $finalText = 'Nao consegui processar o seu pedido. Pode reformular?';
        file_put_contents('/tmp/ai_debug.txt', "processWithGemini: Texto vazio, a usar fallback\n", FILE_APPEND);
    }

    // Retornar apenas os dados, sem echo nem atualizacao de historico aqui
    return array(
        'text'                 => $finalText,
        'action'               => $executedAction,
        'needsConfig'          => $needsConfig,
        'requiresConfirmation' => false,
        'history'              => null
    );
}

// ================================================================
// EXECUCAO PRINCIPAL
// ================================================================

try {
    // Construir contents a partir do historico e mensagem do utilizador
    $contents = buildContents($_SESSION['ai_conversation'], $userMessage);

    // Processar com Gemini
    $result = processWithGemini($contents);

    // Se requer confirmacao, retornar resposta sem atualizar historico
    if (isset($result['requiresConfirmation']) && $result['requiresConfirmation']) {
        $totalTime = round(microtime(true) - $GLOBALS['_ai_start_time'], 3);
        aiLog('Resposta de confirmacao enviada', array(
            'action'     => $result['action'] ?? 'desconhecida',
            'total_time' => $totalTime
        ));

        echo json_encode(array(
            'success'               => true,
            'text'                  => $result['text'],
            'action'                => $result['action'] ?? null,
            'parameters'            => $result['parameters'] ?? null,
            'requiresConfirmation'  => true,
            'history'               => $result['history'] ?? $_SESSION['ai_conversation']
        ), JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
        exit;
    }

    // Atualizar historico da sessao
    $_SESSION['ai_conversation'][] = array('role' => 'user', 'text' => $userMessage);
    if (!empty($result['text'])) {
        $_SESSION['ai_conversation'][] = array('role' => 'model', 'text' => $result['text']);
    }
    $_SESSION['ai_conversation'] = array_slice($_SESSION['ai_conversation'], -20);

    // Construir resposta final
    $response = array(
        'success'               => true,
        'text'                  => $result['text'],
        'history'               => $_SESSION['ai_conversation'],
        'action'                => $result['action'] ?? null,
        'requiresConfirmation'  => false
    );

    if (isset($result['needsConfig']) && $result['needsConfig']) {
        $response['needsConfig'] = true;
    }

    $totalTime = round(microtime(true) - $GLOBALS['_ai_start_time'], 3);
    aiLog('Resposta enviada ao frontend', array(
        'text_length'          => safe_strlen($response['text']),
        'has_action'           => ($response['action'] !== null),
        'requires_confirmation' => $response['requiresConfirmation'],
        'total_time'           => $totalTime
    ));

    echo json_encode($response, JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);

} catch (Throwable $e) {
    $errorMsg = 'Excecao: ' . $e->getMessage() . ' em ' . $e->getFile() . ':' . $e->getLine();
    aiLog('EXCEPCAO NAO TRATADA', array('error' => $errorMsg));
    file_put_contents('/tmp/ai_debug.txt', "EXCEPCAO: {$errorMsg}\n", FILE_APPEND);
    http_response_code(500);
    echo json_encode(array(
        'success' => false,
        'error'   => 'Erro interno do servidor.'
    ), JSON_UNESCAPED_UNICODE | JSON_PARTIAL_OUTPUT_ON_ERROR);
}


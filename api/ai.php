<?php
/**
 * api/ai.php - Assistente IA Profissional com Function Calling
 * 
 * Arquitetura segura:
 *   Browser (app.js) → api/ai.php (PHP) → Gemini 2.5 Flash API
 *                                            → Tools PHP (files, storage, etc.)
 *                                            → Resposta natural
 * 
 * Requisitos:
 *   - PHP 7.2+
 *   - Extensão JSON (nativa no PHP)
 *   - allow_url_fopen = On (no php.ini)
 * 
 * @author Afonso (PAP)
 * @version 3.0
 */

// ---- Configuração Inicial ----
session_start();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

$GLOBALS['_ai_start_time'] = microtime(true);

// ---- Logging ----
define('AI_LOG_FILE', __DIR__ . '/../logs/ai.log');

function aiLog(string $message, array $context = []): void {
    $logDir = dirname(AI_LOG_FILE);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $timestamp = date('Y-m-d H:i:s');
    $contextStr = !empty($context) ? ' | ' . json_encode($context, JSON_UNESCAPED_UNICODE) : '';
    $line = "[{$timestamp}] {$message}{$contextStr}" . PHP_EOL;
    @file_put_contents(AI_LOG_FILE, $line, FILE_APPEND | LOCK_EX);
}

// ---- Segurança ----
if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Nao autorizado']);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

// ---- Ler input ----
$input = json_decode(file_get_contents('php://input'), true);
if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON invalido']);
    exit;
}

$userMessage = isset($input['message']) ? trim($input['message']) : '';
$history = $input['history'] ?? [];

// ---- Mensagem obrigatoria ----
if ($userMessage === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Mensagem vazia']);
    exit;
}

// ---- Palavras de confirmacao (para respostas do utilizador) ----
$confirmWords = ['sim', 'confirmar', 'yes', 'ok', 'okay', 'pode apagar', 'pode criar', 'confirmo', 'estou certo'];

// ---- Verificar confirmacao pendente via conversa natural ----
if (isset($_SESSION['ai_pending_action'])) {
    $lowerMsg = mb_strtolower(trim($userMessage));
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

        aiLog('Confirmacao executada', [
            'action' => $pending['name'],
            'args'   => $pending['args'],
            'status' => $toolResult['success'] ? 'sucesso' : 'falha'
        ]);

        // Adicionar a confirmacao do utilizador ao historico
        if (!isset($_SESSION['ai_conversation'])) {
            $_SESSION['ai_conversation'] = [];
        }
        $_SESSION['ai_conversation'][] = ['role' => 'user', 'text' => $userMessage];

        // Construir contents com o functionCall e functionResponse e reenviar ao Gemini
        $pendingContents = buildContents($_SESSION['ai_conversation'], '');

        // Adicionar functionCall ao contents
        $pendingContents[] = [
            'role'  => 'model',
            'parts' => [[
                'functionCall' => [
                    'name' => $pending['name'],
                    'args' => (object)$pending['args']
                ]
            ]]
        ];

        // Adicionar functionResponse ao contents
        $pendingContents[] = [
            'role'  => 'user',
            'parts' => [[
                'functionResponse' => [
                    'name' => $pending['name'],
                    'response' => [
                        'name'    => $pending['name'],
                        'content' => $toolResult
                    ]
                ]
            ]]
        ];

        // Chamar Gemini para gerar resposta natural
        $geminiResult = callGemini($pendingContents, [
            ['functionDeclarations' => getToolDeclarations()]
        ]);

        $finalText = 'Acao concluida com sucesso.';
        if (!isset($geminiResult['error'])) {
            $candidate = $geminiResult['candidates'][0] ?? null;
            if ($candidate && isset($candidate['content']['parts'][0]['text'])) {
                $finalText = trim($candidate['content']['parts'][0]['text']);
            }
        }

        $_SESSION['ai_conversation'][] = ['role' => 'model', 'text' => $finalText];
        $_SESSION['ai_conversation'] = array_slice($_SESSION['ai_conversation'], -20);

        echo json_encode([
            'success'               => true,
            'text'                  => $finalText,
            'history'               => $_SESSION['ai_conversation'],
            'action'                => [
                'name'   => $pending['name'],
                'result' => $toolResult
            ],
            'requiresConfirmation'  => false
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Se o utilizador nao confirmou, limpar accao pendente e continuar normalmente
    unset($_SESSION['ai_pending_action']);
}

// ---- Conversation memory (session) ----
if (!isset($_SESSION['ai_conversation'])) {
    $_SESSION['ai_conversation'] = [];
}

// Usar historico do frontend se fornecido, ou da sessaoo
if (!empty($history)) {
    $_SESSION['ai_conversation'] = array_slice($history, -20);
}

aiLog('Mensagem recebida', [
    'msg'           => mb_substr($userMessage, 0, 120),
    'history_items' => count($_SESSION['ai_conversation'])
]);

// ============================================================
// FERRAMENTAS (TOOLS) - Executadas localmente em PHP
// ============================================================

function toolListarFicheiros(string $filter = 'all'): array {
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        return ['success' => true, 'files' => [], 'total' => 0];
    }
    $files = [];
    $scan = scandir($uploadDir);
    foreach ($scan as $file) {
        if ($file === '.' || $file === '..') continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $type = 'document';
        if (in_array($ext, ['jpg','jpeg','png','gif','webp','svg'])) $type = 'image';
        elseif (in_array($ext, ['mp4','webm','mov'])) $type = 'video';
        if ($filter !== 'all' && $type !== $filter) continue;
        $files[] = [
            'name' => $file,
            'type' => $type,
            'size' => round(filesize($uploadDir . $file) / 1024, 1) . ' KB',
            'date' => date('d/m/Y H:i', filemtime($uploadDir . $file))
        ];
    }
    return ['success' => true, 'files' => $files, 'total' => count($files)];
}

function toolPesquisarFicheiros(string $query): array {
    if ($query === '') return toolListarFicheiros('all');
    $uploadDir = __DIR__ . '/../uploads/';
    if (!is_dir($uploadDir)) {
        return ['success' => true, 'files' => [], 'total' => 0];
    }
    $results = [];
    foreach (scandir($uploadDir) as $file) {
        if ($file === '.' || $file === '..') continue;
        if (mb_stripos($file, $query) === false) continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $type = 'document';
        if (in_array($ext, ['jpg','jpeg','png','gif','webp','svg'])) $type = 'image';
        elseif (in_array($ext, ['mp4','webm','mov'])) $type = 'video';
        $results[] = [
            'name' => $file,
            'type' => $type,
            'size' => round(filesize($uploadDir . $file) / 1024, 1) . ' KB'
        ];
    }
    return ['success' => true, 'files' => $results, 'total' => count($results)];
}

function toolCriarPasta(string $nome): array {
    $baseDir = dirname(__DIR__);
    $uploadsDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
    if (!is_dir($uploadsDir)) {
        return ['success' => false, 'error' => 'Diretoria de uploads nao existe'];
    }
    $name = trim(preg_replace('/[^a-zA-Z0-9\-_.\s]/u', '', str_replace(["\\", '/', "\0"], '', $nome)));
    $name = trim(preg_replace('/\s+/u', ' ', $name));
    if ($name === '' || mb_strlen($name) > 80) {
        return ['success' => false, 'error' => 'Nome de pasta invalido'];
    }
    if (strpos($name, '..') !== false) {
        return ['success' => false, 'error' => 'Nome de pasta invalido'];
    }
    $target = $uploadsDir . DIRECTORY_SEPARATOR . $name;
    if (is_dir($target)) {
        return ['success' => false, 'error' => 'A pasta "' . $name . '" ja existe'];
    }
    if (@mkdir($target, 0755)) {
        return ['success' => true, 'pasta' => $name];
    }
    return ['success' => false, 'error' => 'Nao foi possivel criar a pasta'];
}

function toolApagarFicheiro(string $nome): array {
    $filename = basename($nome);
    $file = __DIR__ . '/../uploads/' . $filename;
    if (!file_exists($file)) {
        return ['success' => false, 'error' => 'Ficheiro nao encontrado: ' . $filename];
    }
    if (@unlink($file)) {
        aiLog('Apagado pela IA', ['file' => $filename]);
        return ['success' => true, 'ficheiro' => $filename, 'message' => 'Ficheiro apagado com sucesso'];
    }
    return ['success' => false, 'error' => 'Nao foi possivel apagar o ficheiro'];
}

function toolPartilharFicheiro(string $nome): array {
    $uploadDir = __DIR__ . '/../uploads/';
    $filename = basename($nome);
    if (!file_exists($uploadDir . $filename)) {
        return ['success' => false, 'error' => 'Ficheiro nao encontrado'];
    }
    $protocol = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $base = rtrim(dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '')), '/');
    $url = $protocol . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . $base . '/uploads/' . rawurlencode($filename);
    return ['success' => true, 'ficheiro' => $filename, 'url' => $url];
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
    return [
        'success'    => true,
        'usedBytes'  => $usedBytes,
        'usedMb'     => $usedMb,
        'usedGb'     => $usedGb,
        'limitGb'    => $limitGb,
        'percentage' => $percentage,
        'fileCount'  => $fileCount
    ];
}

// ============================================================
// FUNCTION DECLARATIONS FOR GEMINI API (Formato oficial Gemini)
// ============================================================

function getToolDeclarations(): array {
    return [
        [
            'name'        => 'listar_ficheiros',
            'description' => 'Lista todos os ficheiros da nuvem. Opcionalmente filtra por tipo: all, image, video, document.',
            'parameters'  => [
                'type'       => 'object',
                'properties' => [
                    'filter' => [
                        'type'        => 'string',
                        'enum'        => ['all', 'image', 'video', 'document'],
                        'description' => 'Filtro opcional para tipo de ficheiro (all, image, video, document)'
                    ]
                ]
            ]
        ],
        [
            'name'        => 'pesquisar_ficheiros',
            'description' => 'Pesquisa ficheiros na nuvem por nome.',
            'parameters'  => [
                'type'       => 'object',
                'properties' => [
                    'query' => [
                        'type'        => 'string',
                        'description' => 'Termo para pesquisar no nome dos ficheiros'
                    ]
                ],
                'required' => ['query']
            ]
        ],
        [
            'name'        => 'criar_pasta',
            'description' => 'Cria uma nova pasta no diretorio de uploads para organizar ficheiros.',
            'parameters'  => [
                'type'       => 'object',
                'properties' => [
                    'nome' => [
                        'type'        => 'string',
                        'description' => 'Nome da pasta a criar'
                    ]
                ],
                'required' => ['nome']
            ]
        ],
        [
            'name'        => 'apagar_ficheiro',
            'description' => 'Apaga permanentemente um ficheiro da nuvem. Requer confirmacao do utilizador antes de executar.',
            'parameters'  => [
                'type'       => 'object',
                'properties' => [
                    'nome' => [
                        'type'        => 'string',
                        'description' => 'Nome do ficheiro a apagar'
                    ]
                ],
                'required' => ['nome']
            ]
        ],
        [
            'name'        => 'partilhar_ficheiro',
            'description' => 'Gera um link de partilha publico para um ficheiro.',
            'parameters'  => [
                'type'       => 'object',
                'properties' => [
                    'nome' => [
                        'type'        => 'string',
                        'description' => 'Nome do ficheiro a partilhar'
                    ]
                ],
                'required' => ['nome']
            ]
        ],
        [
            'name'        => 'info_armazenamento',
            'description' => 'Mostra o espaco de armazenamento utilizado, disponivel e numero de ficheiros.',
            'parameters'  => [
                'type'       => 'object',
                'properties' => new stdClass()
            ]
        ]
    ];
}

// ============================================================
// EXECUTOR DE FERRAMENTAS
// ============================================================

function executeTool(string $name, array $args): array {
    aiLog('Ferramenta executada', ['tool' => $name, 'args' => $args]);

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
            return ['success' => false, 'error' => 'Ferramenta desconhecida: ' . $name];
    }
}

// ============================================================
// CHAMADA À API GEMINI (sem cURL, sem curl_init)
// ============================================================

function callGemini(array $contents, array $tools = null): array {
    $apiKey = defined('GEMINI_API_KEY') ? GEMINI_API_KEY : '';
    if (empty($apiKey) || $apiKey === 'AIzaSyAquiVaTuaChaveGemini') {
        return [
            'error'   => 'API_KEY_INVALID',
            'message' => 'A chave da API Gemini nao esta configurada. Edite o ficheiro api/config.php com a sua chave.'
        ];
    }

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' . $apiKey;

    $payload = [
        'contents'         => $contents,
        'generationConfig' => [
            'temperature'     => 0.7,
            'maxOutputTokens' => 2048
        ]
    ];

    if ($tools !== null && !empty($tools)) {
        $payload['tools'] = $tools;
    }

    $jsonPayload = json_encode($payload);

    aiLog('Pedido a API Gemini', [
        'contents_count' => count($contents),
        'payload_size'   => strlen($jsonPayload),
        'has_tools'      => $tools !== null && !empty($tools)
    ]);

    $context = stream_context_create([
        'http' => [
            'method'          => 'POST',
            'header'          => "Content-Type: application/json\r\n",
            'content'         => $jsonPayload,
            'timeout'         => 30,
            'ignore_errors'   => true
        ]
    ]);

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

    // Timeout ou falha de conexao
    if ($response === false) {
        aiLog('Falha de conexao a API Gemini', ['http_code' => $httpCode, 'elapsed' => $elapsed]);
        return [
            'error'   => 'HTTP_ERROR',
            'message' => 'Nao foi possivel contactar a API Gemini. Verifique a sua conexao ou tente novamente.'
        ];
    }

    // Tentar decodificar JSON
    $data = json_decode($response, true);
    if ($data === null) {
        aiLog('JSON invalido da API Gemini', [
            'http_code'       => $httpCode,
            'response_snippet' => mb_substr($response, 0, 300),
            'elapsed'         => $elapsed
        ]);
        return [
            'error'   => 'INVALID_JSON',
            'message' => 'A API Gemini devolveu uma resposta invalida.'
        ];
    }

    aiLog('Resposta da API Gemini', [
        'http_code'      => $httpCode,
        'has_candidates' => isset($data['candidates']),
        'elapsed'        => $elapsed
    ]);

    // Erro 403 / 400 (chave invalida, etc.)
    if ($httpCode === 403 || $httpCode === 400) {
        $errorMsg = $data['error']['message'] ?? 'Erro desconhecido';
        if (stripos($errorMsg, 'API_KEY') !== false || $httpCode === 403) {
            return [
                'error'   => 'API_KEY_INVALID',
                'message' => 'A chave da API Gemini e invalida. Verifique o ficheiro api/config.php.'
            ];
        }
        return [
            'error'   => 'API_ERROR',
            'message' => 'Erro da API Gemini: ' . $errorMsg
        ];
    }

    // Rate limit
    if ($httpCode === 429) {
        return [
            'error'   => 'RATE_LIMIT',
            'message' => 'Limite de requisicoes excedido. Tente novamente mais tarde.'
        ];
    }

    // Erro interno do servidor Gemini
    if ($httpCode >= 500) {
        return [
            'error'   => 'SERVER_ERROR',
            'message' => 'O servidor Gemini esta temporariamente indisponivel. Tente novamente mais tarde.'
        ];
    }

    // Sem candidatos (bloqueado por seguranca, etc.)
    if (!isset($data['candidates']) || !isset($data['candidates'][0])) {
        $blockReason = $data['promptFeedback']['blockReason'] ?? 'desconhecido';
        aiLog('Resposta sem candidatos', ['block_reason' => $blockReason]);
        return [
            'error'   => 'NO_CANDIDATES',
            'message' => 'A IA nao conseguiu processar o pedido (motivo: ' . $blockReason . ').'
        ];
    }

    return $data;
}

// ============================================================
// CONSTRUIR ARRAY CONTENTS PARA A API GEMINI
// ============================================================

function buildContents(array $history, string $userMessage): array {
    $contents = [];

    // Adicionar historico
    foreach ($history as $msg) {
        if (!isset($msg['role']) || !isset($msg['text'])) continue;
        $role = $msg['role'];
        if ($role !== 'user' && $role !== 'model') continue;
        $text = trim($msg['text']);
        if ($text === '') continue;
        $contents[] = [
            'role'  => $role,
            'parts' => [['text' => $text]]
        ];
    }

    // Adicionar mensagem atual do utilizador
    if ($userMessage !== '') {
        $contents[] = [
            'role'  => 'user',
            'parts' => [['text' => $userMessage]]
        ];
    }

    return $contents;
}

// ============================================================
// PROCESSAR FUNCTION CALLING EM LOOP
// ============================================================

function processWithGemini(array $contents): array {
    $tools = [
        ['functionDeclarations' => getToolDeclarations()]
    ];

    $maxRounds = 5;
    $finalText = '';
    $executedAction = null;

    for ($round = 1; $round <= $maxRounds; $round++) {
        $result = callGemini($contents, $tools);

        // Erro da API
        if (isset($result['error'])) {
            $isKeyInvalid = ($result['error'] === 'API_KEY_INVALID');
            return [
                'text'                 => $result['message'] ?? 'Erro ao contactar a IA.',
                'needsConfig'          => $isKeyInvalid,
                'action'               => null,
                'requiresConfirmation' => false
            ];
        }

        $candidate = $result['candidates'][0] ?? null;
        if ($candidate === null) {
            return [
                'text'                 => 'A IA nao conseguiu processar o pedido.',
                'action'               => null,
                'requiresConfirmation' => false
            ];
        }

        $part = $candidate['content']['parts'][0] ?? null;
        if ($part === null) {
            $finishReason = $candidate['finishReason'] ?? 'unknown';
            if ($finishReason === 'SAFETY') {
                return [
                    'text'                 => 'Nao posso responder a essa pergunta por questoes de seguranca.',
                    'action'               => null,
                    'requiresConfirmation' => false
                ];
            }
            return [
                'text'                 => 'Nao foi possivel gerar uma resposta.',
                'action'               => null,
                'requiresConfirmation' => false
            ];
        }

        // ---- Function Call detectado ----
        if (isset($part['functionCall'])) {
            $funcName = $part['functionCall']['name'];
            $funcArgs = $part['functionCall']['args'] ?? [];

            // Operacoes destrutivas necessitam confirmacao
            $destructiveOps = ['apagar_ficheiro', 'criar_pasta'];
            if (in_array($funcName, $destructiveOps)) {
                $_SESSION['ai_pending_action'] = [
                    'name' => $funcName,
                    'args' => $funcArgs
                ];

                $actionLabels = [
                    'apagar_ficheiro' => 'apagar o ficheiro',
                    'criar_pasta'     => 'criar a pasta'
                ];
                $targetName = $funcArgs['nome'] ?? '';
                $label = $actionLabels[$funcName] ?? 'executar esta acao';

                return [
                    'requiresConfirmation' => true,
                    'action'               => $funcName,
                    'parameters'           => $funcArgs,
                    'text'                 => "Tem a certeza que deseja {$label} '{$targetName}'?",
                    'history'              => $_SESSION['ai_conversation'] ?? []
                ];
            }

            // Executar ferramenta nao destrutiva
            $toolResult = executeTool($funcName, $funcArgs);

            $executedAction = [
                'name'   => $funcName,
                'result' => $toolResult
            ];

            // Adicionar functionCall ao historico da conversa
            $contents[] = [
                'role'  => 'model',
                'parts' => [[
                    'functionCall' => [
                        'name' => $funcName,
                        'args' => (object)$funcArgs
                    ]
                ]]
            ];

            // Adicionar functionResponse ao historico
            $contents[] = [
                'role'  => 'user',
                'parts' => [[
                    'functionResponse' => [
                        'name' => $funcName,
                        'response' => [
                            'name'    => $funcName,
                            'content' => $toolResult
                        ]
                    ]
                ]]
            ];

            continue;
        }

        // ---- Resposta de texto ----
        if (isset($part['text'])) {
            $finalText = trim($part['text']);
            break;
        }

        // Seguranca: se nao for functionCall nem text, sair
        break;
    }

    // Fallback se nao houve texto
    if ($finalText === '') {
        $finalText = 'Nao consegui processar o seu pedido. Pode reformular?';
    }

    // Atualizar historico da sessao
    if (!empty($GLOBALS['userMessage'])) {
        $_SESSION['ai_conversation'][] = ['role' => 'user', 'text' => $GLOBALS['userMessage']];
    }
    $_SESSION['ai_conversation'][] = ['role' => 'model', 'text' => $finalText];

    // Manter apenas as ultimas 20 mensagens
    $_SESSION['ai_conversation'] = array_slice($_SESSION['ai_conversation'], -20);

    return [
        'text'                 => $finalText,
        'action'               => $executedAction,
        'requiresConfirmation' => false
    ];
}

// ============================================================
// EXECUCAO PRINCIPAL
// ============================================================

$GLOBALS['userMessage'] = $userMessage;

// Construir contents a partir do historico + mensagem atual
$contents = buildContents($_SESSION['ai_conversation'], $userMessage);

// Processar com Gemini Function Calling
$result = processWithGemini($contents);

// Construir resposta JSON consistente
$response = [
    'success'               => true,
    'text'                  => $result['text'],
    'history'               => $_SESSION['ai_conversation'],
    'action'                => $result['action'] ?? null,
    'requiresConfirmation'  => $result['requiresConfirmation'] ?? false
];

if (isset($result['needsConfig']) && $result['needsConfig']) {
    $response['needsConfig'] = true;
}

$totalTime = round(microtime(true) - $GLOBALS['_ai_start_time'], 3);
aiLog('Resposta enviada ao frontend', [
    'text_length'          => mb_strlen($response['text']),
    'has_action'           => $response['action'] !== null,
    'requires_confirmation' => $response['requiresConfirmation'],
    'total_time'           => $totalTime
]);

echo json_encode($response, JSON_UNESCAPED_UNICODE);


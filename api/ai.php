<?php
/**
 * api/ai.php - Assistente IA com Function Calling (Backend Seguro)
 * 
 * Fluxo:
 * 1. Recebe mensagem do utilizador + histórico
 * 2. Envia para Gemini com tools (function calling)
 * 3. Se Gemini pedir execução de ação → executa localmente
 * 4. Envia resultado da ação de volta para Gemini
 * 5. Devolve resposta final ao frontend
 */

session_start();
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

// --- SEGURANÇA: Apenas utilizadores autenticados ---
if (!isset($_SESSION['user_id'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Não autorizado']);
    exit;
}

// --- APENAS POST ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$userMessage = trim($input['message'] ?? '');
$history = $input['history'] ?? [];
$actionResult = $input['actionResult'] ?? null;

if ($userMessage === '' && !$actionResult) {
    http_response_code(400);
    echo json_encode(['error' => 'Mensagem vazia']);
    exit;
}

// --- FUNÇÕES DE EXECUÇÃO DE AÇÕES ---

/**
 * Listar ficheiros com filtro opcional
 */
function toolListarFicheiros($filter = 'all') {
    $uploadDir = __DIR__ . '/../uploads/';
    $files = [];
    if (!is_dir($uploadDir)) {
        return ['success' => true, 'files' => [], 'message' => 'Nenhum ficheiro encontrado.'];
    }
    $scan = scandir($uploadDir);
    foreach ($scan as $file) {
        if ($file === '.' || $file === '..') continue;
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $type = 'document';
        if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) $type = 'image';
        if (in_array($ext, ['mp4', 'webm', 'mov'])) $type = 'video';
        if ($filter !== 'all' && $type !== $filter) continue;
        $files[] = [
            'name' => $file,
            'type' => $type,
            'size' => round(filesize($uploadDir . $file) / 1024 / 1024, 2) . ' MB',
            'date' => date("d/m/Y", filemtime($uploadDir . $file))
        ];
    }
    return ['success' => true, 'files' => $files, 'total' => count($files)];
}

/**
 * Pesquisar ficheiros por nome
 */
function toolPesquisarFicheiros($query) {
    $uploadDir = __DIR__ . '/../uploads/';
    $results = [];
    if (!is_dir($uploadDir)) return ['success' => true, 'files' => []];
    $scan = scandir($uploadDir);
    foreach ($scan as $file) {
        if ($file === '.' || $file === '..') continue;
        if (stripos($file, $query) !== false) {
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            $type = 'document';
            if (in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp'])) $type = 'image';
            if (in_array($ext, ['mp4', 'webm', 'mov'])) $type = 'video';
            $results[] = [
                'name' => $file,
                'type' => $type,
                'size' => round(filesize($uploadDir . $file) / 1024 / 1024, 2) . ' MB'
            ];
        }
    }
    return ['success' => true, 'files' => $results, 'total' => count($results)];
}

/**
 * Criar pasta
 */
function toolCriarPasta($nome) {
    $baseDir = dirname(__DIR__);
    $uploadsDir = $baseDir . DIRECTORY_SEPARATOR . 'uploads';
    if (!is_dir($uploadsDir)) {
        return ['success' => false, 'error' => 'Diretoria de uploads não existe.'];
    }
    $name = trim($nome);
    $name = str_replace(["\\", '/', '\0'], '', $name);
    $name = preg_replace('/[^a-zA-Z0-9\-_.\s]/u', '', $name);
    $name = trim(preg_replace('/\s+/u', ' ', $name));
    if ($name === '' || mb_strlen($name) > 80) {
        return ['success' => false, 'error' => 'Nome de pasta inválido.'];
    }
    $targetDir = $uploadsDir . DIRECTORY_SEPARATOR . $name;
    if (is_dir($targetDir)) {
        return ['success' => false, 'error' => 'A pasta já existe.', 'pasta' => $name];
    }
    if (mkdir($targetDir, 0755, false)) {
        return ['success' => true, 'pasta' => $name];
    }
    return ['success' => false, 'error' => 'Não foi possível criar a pasta.'];
}

/**
 * Apagar ficheiro (requer confirmação do utilizador)
 */
function toolApagarFicheiro($nome) {
    $uploadDir = __DIR__ . '/../uploads/';
    $filename = basename($nome);
    if (file_exists($uploadDir . $filename)) {
        if (unlink($uploadDir . $filename)) {
            return ['success' => true, 'ficheiro' => $filename, 'message' => "Ficheiro {$filename} apagado com sucesso."];
        }
        return ['success' => false, 'error' => 'Erro ao apagar ficheiro.'];
    }
    return ['success' => false, 'error' => 'Ficheiro não encontrado.', 'ficheiro' => $filename];
}

/**
 * Obter link de partilha para um ficheiro
 */
function toolPartilharFicheiro($nome) {
    $uploadDir = __DIR__ . '/../uploads/';
    $filename = basename($nome);
    if (!file_exists($uploadDir . $filename)) {
        return ['success' => false, 'error' => 'Ficheiro não encontrado.'];
    }
    $shareUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? 'https' : 'http')
        . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost')
        . dirname(dirname($_SERVER['SCRIPT_NAME']))
        . '/uploads/' . rawurlencode($filename);
    return ['success' => true, 'ficheiro' => $filename, 'url' => $shareUrl];
}

/**
 * Informação de armazenamento
 */
function toolInfoArmazenamento() {
    $uploadDir = __DIR__ . '/../uploads/';
    $limitGb = 2;
    $usedBytes = 0;
    if (is_dir($uploadDir)) {
        $files = glob($uploadDir . '*');
        if (is_array($files)) {
            $usedBytes = array_sum(array_map(function ($path) {
                return is_file($path) ? filesize($path) : 0;
            }, $files));
        }
    }
    $usedMb = round($usedBytes / 1024 / 1024, 2);
    $percentage = min(100, max(0, round(($usedBytes / ($limitGb * 1024 * 1024 * 1024)) * 100)));
    $fileCount = is_dir($uploadDir) ? count(array_diff(scandir($uploadDir), ['.', '..'])) : 0;
    return [
        'usedMb' => $usedMb,
        'limitGb' => $limitGb,
        'percentage' => $percentage,
        'fileCount' => $fileCount
    ];
}

/**
 * Obter informação sobre o projeto PAP
 */
function toolInfoProjeto($pergunta = '') {
    $info = [
        'nome' => 'Fishelter Cloud',
        'autor' => 'Afonso',
        'disciplina' => 'PAP (Prova de Aptidão Profissional)',
        'descricao' => 'Sistema de armazenamento na nuvem pessoal com assistente IA integrado.',
        'tecnologias' => [
            'Frontend' => 'HTML, CSS, JavaScript',
            'Backend' => 'PHP com MySQL',
            'IA' => 'Google Gemini API com Function Calling',
            'Estilo' => 'Design moderno com modo escuro e responsivo'
        ],
        'funcionalidades' => [
            'Upload e gestão de ficheiros',
            'Galeria com preview',
            'Autenticação segura',
            'Assistente IA com chat texto e voz',
            'Organização por álbuns',
            'Pesquisa de ficheiros',
            'Partilha de ficheiros',
            'PWA (Progressive Web App)'
        ]
    ];
    return $info;
}

// --- SYSTEM PROMPT ---
$systemPrompt = <<<'PROMPT'
Tu és o **Fishelter AI**, o assistente inteligente do Fishelter Cloud, um sistema de armazenamento na nuvem pessoal.

**Regras fundamentais:**
1. Respondes SEMPRE em português de Portugal, com tom simpático e profissional.
2. Podes conversar sobre qualquer tema (és um assistente geral), MAS também sabes tudo sobre o projeto Fishelter Cloud.
3. Quando o utilizador pedir **ações no sistema** (apagar, criar pasta, listar, pesquisar, partilhar, etc.), deves usar as ferramentas disponíveis.
4. Para **ações destrutivas** (apagar ficheiros), deves primeiro perguntar ao utilizador se tem a certeza ANTES de chamar a ferramenta.
5. Mantém as respostas concisas e naturais.
6. Se não tiveres a certeza sobre algo, pergunta ao utilizador em vez de inventar.

**Contexto do projeto:**
- Nome: Fishelter Cloud
- Autor: Afonso
- Disciplina: PAP (Prova de Aptidão Profissional)
- Funcionalidades: Upload de ficheiros, galeria, preview, autenticação, IA com voz e texto, organização por álbuns, partilha, PWA.
PROMPT;

// --- DEFINIÇÃO DAS FERRAMENTAS (TOOLS) PARA FUNCTION CALLING ---
$tools = [
    [
        'name' => 'listar_ficheiros',
        'description' => 'Lista todos os ficheiros do utilizador, com filtro opcional por tipo (all, image, video, document)',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'filter' => [
                    'type' => 'string',
                    'enum' => ['all', 'image', 'video', 'document'],
                    'description' => 'Filtro por tipo de ficheiro'
                ]
            ],
            'required' => []
        ]
    ],
    [
        'name' => 'pesquisar_ficheiros',
        'description' => 'Pesquisa ficheiros pelo nome',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'query' => [
                    'type' => 'string',
                    'description' => 'Termo de pesquisa (nome do ficheiro)'
                ]
            ],
            'required' => ['query']
        ]
    ],
    [
        'name' => 'criar_pasta',
        'description' => 'Cria uma nova pasta no diretório de uploads',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'nome' => [
                    'type' => 'string',
                    'description' => 'Nome da pasta a criar'
                ]
            ],
            'required' => ['nome']
        ]
    ],
    [
        'name' => 'apagar_ficheiro',
        'description' => 'APAGAR um ficheiro. ATENÇÃO: Esta ação é destrutiva! Deves sempre confirmar com o utilizador ANTES de chamar esta função.',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'nome' => [
                    'type' => 'string',
                    'description' => 'Nome exato do ficheiro a apagar'
                ]
            ],
            'required' => ['nome']
        ]
    ],
    [
        'name' => 'partilhar_ficheiro',
        'description' => 'Gera um link de partilha para um ficheiro',
        'parameters' => [
            'type' => 'object',
            'properties' => [
                'nome' => [
                    'type' => 'string',
                    'description' => 'Nome do ficheiro a partilhar'
                ]
            ],
            'required' => ['nome']
        ]
    ],
    [
        'name' => 'info_armazenamento',
        'description' => 'Mostra informação sobre o espaço de armazenamento utilizado e disponível',
        'parameters' => [
            'type' => 'object',
            'properties' => (object)[],
            'required' => []
        ]
    ],
    [
        'name' => 'info_projeto',
        'description' => 'Fornece informação sobre o projeto Fishelter Cloud (PAP)',
        'parameters' => [
            'type' => 'object',
            'properties' => (object)[],
            'required' => []
        ]
    ]
];

// --- CHAMADA À API GEMINI ---
function callGemini($messages, $tools) {
    $apiKey = GEMINI_API_KEY;
    if (empty($apiKey) || $apiKey === 'AIzaSyAquiVaTuaChaveGemini') {
        return [
            'text' => '⚠️ A chave da API Gemini não foi configurada. 
            
Para configurar:
1. Acede a https://aistudio.google.com/app/apikey
2. Clica em "Create API Key"
3. Copia a chave (começa por AIzaSy...)
4. Abre o ficheiro `api/config.php`
5. Substitui `AIzaSyAquiVaTuaChaveGemini` pela tua chave real

Após configurares a chave, o assistente funcionará normalmente!',
            'needs_config' => true
        ];
    }

    $url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' . urlencode($apiKey);

    // Preparar contents com histórico
    $contents = [];
    foreach ($messages as $msg) {
        $role = $msg['role'] === 'assistant' ? 'model' : 'user';
        $contents[] = [
            'role' => $role,
            'parts' => [
                ['text' => $msg['text']]
            ]
        ];
    }

    $payload = [
        'contents' => $contents,
        'tools' => [
            ['functionDeclarations' => $tools]
        ],
        'generationConfig' => [
            'temperature' => 0.7,
            'maxOutputTokens' => 800
        ]
    ];

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_TIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => true
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return ['text' => 'Erro de conexão com a API Gemini: ' . $error];
    }

    if ($httpCode !== 200) {
        $errorBody = json_decode($response, true);
        $errorMsg = $errorBody['error']['message'] ?? 'Erro HTTP ' . $httpCode;
        return ['text' => 'A API Gemini respondeu com erro: ' . $errorMsg];
    }

    $data = json_decode($response, true);
    if (!$data || !isset($data['candidates'][0])) {
        return ['text' => 'Resposta inesperada da API Gemini. Tenta novamente.'];
    }

    $candidate = $data['candidates'][0];
    $part = $candidate['content']['parts'][0] ?? null;

    if (!$part) {
        return ['text' => 'Não obtive resposta. Tenta reformular a pergunta.'];
    }

    // Verificar se é function call
    if (isset($part['functionCall'])) {
        return [
            'functionCall' => $part['functionCall'],
            'text' => null
        ];
    }

    // É resposta de texto normal
    return [
        'text' => $part['text'] ?? 'Não percebi. Podes repetir?',
        'functionCall' => null
    ];
}

// --- EXECUTAR AÇÃO SOLICITADA PELA IA ---
function executeFunctionCall($functionCall) {
    $name = $functionCall['name'];
    $args = $functionCall['args'] ?? [];

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

        case 'info_projeto':
            return toolInfoProjeto($args['pergunta'] ?? '');

        default:
            return ['error' => 'Ferramenta desconhecida: ' . $name];
    }
}

// --- FUNÇÃO PARA FORMATAR RESULTADO DE AÇÃO COMO TEXTO PARA A IA ---
function formatActionResultForAi($functionName, $result) {
    $json = json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    return "Resultado da operação '{$functionName}':\n{$json}\n\nCom base neste resultado, dá uma resposta natural ao utilizador em português de Portugal.";
}

// --- PROCESSAR MENSAGEM ---

try {
    // Construir histórico de mensagens para o Gemini
    $messages = [];

    // Mensagem de sistema
    $messages[] = [
        'role' => 'user',
        'parts' => [['text' => $systemPrompt]]
    ];
    $messages[] = [
        'role' => 'model',
        'parts' => [['text' => 'Compreendi as regras. Estou pronto para ajudar o utilizador em português de Portugal, usando as ferramentas disponíveis quando necessário.']]
    ];

    // Adicionar histórico da conversa (máx 20 mensagens para não exceder token)
    $historyLimit = array_slice($history, -18);
    foreach ($historyLimit as $msg) {
        $messages[] = [
            'role' => $msg['role'],
            'parts' => [['text' => $msg['text']]]
        ];
    }

    // Se veio resultado de uma ação anterior (fluxo function calling)
    if ($actionResult) {
        $messages[] = [
            'role' => 'function',
            'parts' => [['text' => $actionResult]]
        ];
    } else {
        // Mensagem do utilizador
        $messages[] = [
            'role' => 'user',
            'parts' => [['text' => $userMessage]]
        ];
    }

    // Chamar Gemini
    $geminiResponse = callGemini($messages, $tools);

    // Se tem needs_config, devolver erro específico
    if (isset($geminiResponse['needs_config']) && $geminiResponse['needs_config']) {
        echo json_encode([
            'text' => $geminiResponse['text'],
            'needsConfig' => true
        ]);
        exit;
    }

    // Se for function call, executar e retornar para frontend reenviar
    if ($geminiResponse['functionCall']) {
        $functionCall = $geminiResponse['functionCall'];
        $result = executeFunctionCall($functionCall);
        
        // Para ações destrutivas (apagar), a IA já confirmou antes de chamar
        // Agora formatamos o resultado e damos ao utilizador
        $actionText = formatActionResultForAi($functionCall['name'], $result);

        // Se a ação foi bem sucedida, registar nos metadados da sessão
        if ($functionCall['name'] === 'apagar_ficheiro' && $result['success']) {
            // Log para debug
            error_log("[AI] Ficheiro apagado pela IA: " . ($result['ficheiro'] ?? ''));
        }

        // Enviar resultado da ação de volta ao Gemini para obter resposta final
        // Mas vamos fazer uma segunda chamada em vez de ciclo no frontend
        $messages[] = [
            'role' => 'model',
            'parts' => [['text' => json_encode(['functionCall' => $functionCall])]]
        ];
        $messages[] = [
            'role' => 'user',
            'parts' => [['text' => $actionText]]
        ];

        $finalResponse = callGemini($messages, $tools);
        
        echo json_encode([
            'text' => $finalResponse['text'] ?? 'Ação executada com sucesso.',
            'action' => [
                'name' => $functionCall['name'],
                'args' => $functionCall['args'],
                'result' => $result
            ]
        ]);
        exit;
    }

    // Resposta normal de texto
    echo json_encode([
        'text' => $geminiResponse['text'] ?? 'Não percebi. Podes reformular?',
        'action' => null
    ]);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'text' => 'Ocorreu um erro interno no servidor. Tenta novamente.',
        'error' => $e->getMessage()
    ]);
}
?>


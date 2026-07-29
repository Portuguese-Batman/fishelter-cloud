<?php
/**
 * Configurações seguras da API (NÃO expor ao frontend)
 * 
 * AVISO: Este ficheiro contém a chave da API Gemini.
 * Deve estar protegido pelo .htaccess para não ser acessível diretamente.
 * 
 * Como obter uma chave Gemini:
 * 1. Acede a https://aistudio.google.com/app/apikey
 * 2. Faz login com conta Google
 * 3. Clica em "Create API Key"
 * 4. Copia a chave (começa por AIzaSy...)
 * 5. Substitui abaixo
 */

define('GEMINI_API_KEY', 'AIzaSyAquiVaTuaChaveGemini'); // <-- SUBSTITUIR pela chave real

/**
 * Se estiveres a usar variáveis de ambiente (recomendado em produção),
 * comenta a linha acima e descomenta esta:
 * 
 * define('GEMINI_API_KEY', getenv('GEMINI_API_KEY') ?: '');
 */
?>


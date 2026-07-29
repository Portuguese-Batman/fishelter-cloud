# TODO - Implementação do Assistente IA (Function Calling via Backend)

## ✅ 1. Criar `api/ai.php` - Backend Proxy com Function Calling
- [x] Configuração da API key Gemini (segura no servidor) - `api/config.php`
- [x] System prompt com contexto do projeto
- [x] Definição das ferramentas (tools) para function calling
- [x] Execução das ações PHP (apagar, criar pasta, listar, pesquisar, partilhar, info)
- [x] Fluxo: mensagem → Gemini → tool call → PHP executa → resposta final

## ✅ 2. Atualizar `js/app.js`
- [x] Remover `GEMINI_API_KEY` exposta no frontend
- [x] Criar `callAiApi(message, history)` para chamar `api/ai.php`
- [x] Integrar chat por texto
- [x] Manter voz (Speech-to-Text) a funcionar pela nova API
- [x] Adicionar memória da conversa (sessionStorage)
- [x] Mostrar "A escrever..." enquanto IA processa

## ✅ 3. Atualizar `dashboard.html`
- [x] Adicionar botão de chat (ao lado do microfone)
- [x] Painel de chat com input, mensagens, typing indicator
- [x] Input de texto com Enter para enviar
- [x] Botão para limpar conversa

## ✅ 4. Atualizar `css/style.css`
- [x] Estilos do chat: balões, input, cabeçalho
- [x] Animação "A escrever..." (typing dots)
- [x] Responsivo no mobile
- [x] Botão de chat estilo consistente com o microfone

## ✅ 5. Criação de `api/config.php`
- [x] Ficheiro de configuração seguro (fora do acesso direto)
- [x] Chave da API Gemini protegida no servidor

## 📋 Pendente - Configuração necessária
- [ ] O utilizador precisa de configurar a chave Gemini em `api/config.php`
  - Aceder a https://aistudio.google.com/app/apikey
  - Criar API Key
  - Colar em `api/config.php` substituindo `AIzaSyAquiVaTuaChaveGemini`


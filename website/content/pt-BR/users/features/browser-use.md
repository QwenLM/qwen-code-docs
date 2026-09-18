# Browser Use

O Browser Use permite que o Qwen Code trabalhe com páginas no seu navegador Chrome, usando suas abas existentes e sessões já autenticadas.

## Uso

Use macOS ou Linux com Chrome 125 ou posterior. **Instale e ative a extensão Qwen para Chrome no perfil do Chrome que deseja usar.** A extensão é obrigatória e não é instalada pelo pacote do Qwen Code. Ainda não há publicação na Chrome Web Store. Compile-a a partir do diretório `packages/chrome-extension` do repositório do Qwen Code seguindo o [README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme), depois abra `chrome://extensions`, ative o modo Desenvolvedor, escolha **Load unpacked** e selecione o diretório `dist/extension` compilado.

Descreva sua tarefa no navegador diretamente, por exemplo:

> Read my open dashboard and summarize today's orders.

O Qwen seleciona a skill Browser Use quando apropriado. Se uma dependência de runtime precisar de configuração no primeiro uso, o Qwen irá orientá-lo e poderá pedir que você reinicie. Não é necessário uma extensão Qwen separada para o Browser Use nem um processo `qwen serve`.

## Desativar

Use `/skills` para desativar o **browser-use**. Isso oculta a skill do modelo, mas não desconecta uma sessão de navegador existente nem remove instruções já carregadas em uma conversa.

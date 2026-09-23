# Browser Use

O Browser Use permite que o Qwen Code trabalhe com páginas no seu navegador Chrome, usando suas abas existentes e sessões já autenticadas.

## Uso

Use macOS ou Linux com Chrome 125 ou posterior e Qwen Code 0.24.2 ou posterior (verifique com `qwen --version`). **Instale a [extensão Qwen Code na Chrome Web Store](https://chromewebstore.google.com/detail/qwen-code/hdhmmjclhibojdddmancfgbkleahfaph) no perfil do Chrome que deseja usar.** A extensão é obrigatória e não é instalada pelo pacote do Qwen Code. O Chrome a mantém atualizada após a instalação.

**Use uma cópia da extensão por perfil.** Se você carregou anteriormente a versão descompactada, remova ou desative essa cópia em `chrome://extensions` antes de usar a versão da loja. Com ambas ativadas, o Qwen vê dois navegadores para o mesmo perfil e pode se conectar a qualquer um.

Se a Chrome Web Store informar que a extensão não está disponível na sua região, compile-a a partir do código-fonte: siga o [README](https://github.com/QwenLM/qwen-code/tree/main/packages/chrome-extension#readme) do diretório `packages/chrome-extension` no repositório do Qwen Code, depois abra `chrome://extensions`, ative o modo Desenvolvedor, escolha **Load unpacked** e selecione o diretório `dist/extension` compilado.

Descreva sua tarefa no navegador diretamente, por exemplo:

> Leia meu painel aberto e resuma os pedidos de hoje.

O Qwen seleciona a skill Browser Use quando apropriado. A primeira tarefa no navegador registra automaticamente um pequeno programa de conexão local no seu diretório de usuário; as tarefas subsequentes o reutilizam. O Qwen confirma a conexão com a extensão antes de operar as páginas. Se não conseguir conectar, abra o Chrome e verifique se o Qwen Code é 0.24.2 ou posterior e se a extensão está ativada no perfil desejado, depois tente novamente. Se uma dependência de runtime precisar de configuração no primeiro uso, o Qwen irá orientá-lo e poderá pedir que você reinicie. Não é necessário uma extensão Qwen separada para o Browser Use nem um processo `qwen serve`.

## Desativar

Use `/skills` para desativar o **browser-use**. Isso oculta a skill do modelo, mas não desconecta uma sessão de navegador existente nem remove instruções já carregadas em uma conversa.

# Atualizações npm em segundo plano

## Problema

A CLI publicada é dividida em código em chunks JavaScript com hash de
conteúdo. Executar `npm install -g` a partir de uma sessão ativa substitui
esses chunks no lugar, então um import dinâmico posterior no processo antigo
pode falhar com `ERR_MODULE_NOT_FOUND`. Adiar a instalação até a saída da
sessão evita corrupção, mas transforma uma atualização em segundo plano em um
atraso no momento da saída e não dá nenhum benefício aos usuários até que
eles saiam da sessão.

## Design

Para instalações npm globais graváveis, a verificação de atualização
pós-renderização instala a versão resolvida exata sob um diretório derivado do
launcher global:

```text
~/.qwen/updates/npm/<launcher-id>/versions/<version>/
```

A verificação de versão executa o npm no seu contexto global e a instalação
preparada usa um prefixo isolado. O comando preparado preserva explicitamente
a configuração global original do npm, então mudar o prefixo não troca
configurações de registro ou autenticação entre a descoberta e a instalação.

O launcher resolve `QWEN_HOME` dos mesmos arquivos `.env` com escopo de home
antes de selecionar uma versão. Isso mantém o caminho de bootstrap alinhado
com o armazenamento da CLI mesmo que o carregador completo de ambiente rode
depois.

A instalação e a ativação rodam em um worker desacoplado, então sair da TUI
não interrompe uma atualização já em andamento. Depois que o npm sai com
sucesso, o worker verifica o nome do pacote, versão, bundle e launcher, então
escreve atomicamente um ponteiro `active.json` ao lado das versões daquele
launcher. O pacote npm global não é modificado. O processo já em execução e
quaisquer comandos filhos que ele inicie permanecem fixados ao seu build
original. Na próxima invocação, o launcher estável lê o ponteiro e inicia o
diretório de versão verificado.

Cada launcher npm global tem seu próprio ponteiro e payloads de versão, então
instalações sob diferentes prefixos npm ou nvm podem compartilhar `~/.qwen`
sem sobrescrever umas às outras ou compartilhar dependências. Uma atualização
concorrente mais lenta não pode substituir uma versão ativa mais nova.

Uma instalação incompleta nunca altera o ponteiro ativo. Antes da ativação, o
worker valida o manifesto instalado e executa um smoke test do launcher. Um
ponteiro ausente, malformado ou com launcher incompatível é ignorado e o
pacote npm original permanece como fallback. O ponteiro também registra o
pacote base e a identidade do launcher, então uma instalação global explícita
posterior do npm substitui a versão gerenciada. Como o launcher não é
substituído por atualizações gerenciadas, os campos existentes de
`active.json` são um contrato de compatibilidade: mudanças futuras podem
adicionar campos, mas não devem removê-los ou reinterpretá-los.

Diretórios de versão são retidos porque uma sessão antiga ainda viva pode
carregar a partir deles. A limpeza é intencionalmente adiada até que o uso de
disco mostre que um coletor baseado em lease é necessário.

## Escopo

Isto altera as atualizações automáticas apenas para instalações npm. Outros
gerenciadores de pacotes e arquivos autônomos mantêm o comportamento existente
seguro para saída até que tenham um layout equivalente de instalação com
versão imutável.

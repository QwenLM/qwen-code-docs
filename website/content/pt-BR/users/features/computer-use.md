# Computer Use

O Qwen Code inclui uma skill `computer-use` que ensina o modelo a operar aplicativos de desktop através de dois pacotes instalados separadamente:

```text
skill computer-use integrada
  -> @qwen-code/node-repl-mcp
  -> @qwen-code/cua-sdk/computer-use
  -> backend nativo de acessibilidade cua-driver
```

O Qwen Code não empacota o servidor MCP, o SDK ou o driver nativo. A skill instala os pacotes externos automaticamente quando estão ausentes.

> [!warning]
>
> O Computer Use pode ler a UI de aplicativos e controlar a entrada de mouse e teclado. Use-o apenas em ambientes confiáveis e revise as aprovações do MCP com cuidado.

## Configuração automática

Node.js 22 ou posterior e npm são necessários.

No primeiro uso, a skill executa estes comandos por conta própria:

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.1.6
npm install --no-save --package-lock=false @qwen-code/cua-sdk@0.20.11
```

Reinicie o Qwen Code após o servidor MCP ser adicionado pela primeira vez. A skill então retoma a tarefa de desktop através do `node_repl`.

A instalação do SDK deixa o `package.json` e o lockfile inalterados, mas escreve no `node_modules` do workspace. Seu postinstall baixa e verifica o payload nativo para a plataforma atual.

Remover a configuração do MCP ou a instalação do SDK do workspace desativa o caminho de execução; não há fallback legado.

## Uso

Peça ao Qwen Code para usar `$computer-use` para a tarefa de desktop. Após o bootstrap, ele usa o fluxo de trabalho de aplicativo no macOS:

1. vincula o aplicativo com `computer.getApp(nameOrIdentifierOrPath)`;
2. lê `app.getState()` para texto de acessibilidade compacto, seguido de atualizações incrementais automáticas;
3. executa uma ou mais ações usando os IDs curtos de elemento nesse texto;
4. busca o estado mais recente antes de decidir o que fazer a seguir; e
5. fecha o cliente SDK e reseta o REPL apenas quando nenhum outro estado persistente for necessário.

O driver é o único componente que computa diffs de observação. O código do modelo usa os métodos tipados do SDK e não despacha nomes arbitrários de ferramentas do driver. O handle do aplicativo rastreia a janela atual e os diálogos, mantém a identidade nativa do elemento internamente e delega a entrada ao driver nativo. O código do modelo não escolhe modos de primeiro plano ou segundo plano. Ações não confirmadas não são reproduzidas. `getState()` pode abrir um aplicativo parado descoberto; as ações nunca o reiniciam. As APIs exatas de janela existentes permanecem disponíveis no Windows e Linux.

```js
const app = await computer.getApp('Microsoft Excel');
nodeRepl.write((await app.getState()).text);
// Use an element ID from the returned state.
await app.click(37);
await app.typeText('hello');
nodeRepl.write((await app.getState()).text);
```

Atualize o estado após abrir ou fechar um diálogo antes de reutilizar IDs de elemento. Cada atualização de estado do App captura a screenshot atual internamente. O retorno padrão a mantém oculta; solicite-a explicitamente com `app.getState({ includeScreenshot: true })` quando o modelo precisar da imagem.

## Permissões

O Node REPL é um servidor MCP que executa JavaScript escrito pelo modelo com autoridade Node.js ordinária. Suas chamadas seguem o [fluxo de aprovação MCP](./approval-mode.md) normal do Qwen Code. O SDK também impõe autorização nativa.

No macOS, a observação de acessibilidade e a entrada requerem permissão de Accessibility. Screenshots também requerem permissão de Screen Recording. O macOS pode atribuir a concessão ao terminal ou IDE que iniciou o Qwen Code. Windows e Linux usam suas facilidades de acessibilidade e entrada de plataforma.

## Solução de problemas

- Se o `node_repl` ainda estiver indisponível após a configuração automática, reinicie o Qwen Code e verifique o servidor com `qwen mcp list`.
- Se a importação do SDK ainda falhar após a configuração automática, confirme que o Qwen Code está sendo executado no workspace onde o pacote foi instalado.
- Após um timeout, cancelamento, reset ou crash do kernel, faça o bootstrap do cliente SDK novamente e solicite estado fresco.

## Veja também

- [Skills](./skills.md)
- [Servidores MCP](./mcp.md)
- [Modo de aprovação](./approval-mode.md)
- [Sandboxing](./sandbox.md)

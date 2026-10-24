# Computer Use

O Computer Use é executado através do servidor MCP REPL Node independente. Sua primeira chamada `js` carrega o `cua` global e exibe a documentação para a plataforma atual. O Computer Use e o Browser Use não requerem mais skills empacotadas.

```text
Qwen Code / qualquer cliente MCP
  -> @qwen-code/node-repl-mcp (js, js_reset)
  -> @qwen-code/cua-sdk/runtime
     -> Qwen CUA Driver nativo (aplicativos de desktop)
     -> @qwen-code/browser-use (extensão de navegador Qwen)
```

## Configuração

Node.js 22 ou posterior e npm são necessários. Registre o servidor MCP e reinicie o Qwen Code:

```bash
qwen mcp add --scope user node-repl npx -y @qwen-code/node-repl-mcp@0.26.0
```

O servidor instala o SDK correspondente e o SDK do navegador como dependências. O payload do SDK nativo é baixado para a plataforma atual e verificado em relação aos checksums SHA-256 da release correspondente. Ele é armazenado em cache fora do pacote npm; nenhum comando de bootstrap de SDK do workspace é necessário. A versão 0.26.0 é um alvo de desenvolvimento local até que sua release seja publicada.

O Windows usa entrega de entrada comum por padrão e não instala um worker UIAccess. Optar por UIAccess com `CUA_DRIVER_USE_UIACCESS=1` requer um worker assinado em `Program Files\Qwen\CuaDriver`; instale o SDK a partir de um terminal elevado com essa variável definida. Um worker não assinado não pode habilitar UIAccess; não ignore a verificação de assinatura. Releases antigos não assinados precisam de uma nova release assinada do driver para UIAccess, não de uma reinstalação da mesma versão.

## Tarefas de aplicativos

```js
var app = await cua.getApp('Microsoft Excel');
// Use um ID curto do estado AX exibido automaticamente.
await app.click(37);
await app.typeText('hello');
await app.getAXState();
```

`getApp` exibe o texto AX completo sem imagem. `getAXState` exibe os diffs subsequentes. `getScreenshot` captura apenas a janela atual; `getAXStateAndScreenshot` captura ambos. As observações retornam strings e exibem a si mesmas; `{emit:false}` suprime a saída. Solicite um screenshot antes de usar coordenadas `{x,y}`, que são pixels no screenshot atual dessa janela.

O driver resolve aplicativos/janelas, possui os IDs curtos e coordenadas atuais, e escolhe a entrega de entrada. O macOS usa acessibilidade e eventos direcionados. Windows e Linux tentam a entrega em segundo plano primeiro e usam entrada em primeiro plano apenas após uma recusa que prova que nada foi enviado. A entrada em primeiro plano para quando a atividade física do usuário é detectada; ela restaura o aplicativo anterior apenas se o usuário não tiver mudado para outro. Um reconhecimento de despacho não prova que a UI mudou: observe antes de tentar novamente.

O Linux suporta X11, incluindo aplicativos X11 sob XWayland. Aplicativos Wayland nativos não são suportados. Passe DISPLAY, XAUTHORITY e o bus de sessão de acessibilidade do desktop para o servidor.

## Tarefas de desktop e navegador

Use a interface de desktop explícita para tarefas de tela cheia:

```js
await cua.desktop.getScreenshot();
await cua.desktop.click({ x: 300, y: 200 }, { key: 'shift' });
```

As coordenadas de desktop são pixels no screenshot mais recente do display primário. A entrada de desktop controla o desktop visível em primeiro plano e pode mover o ponteiro real. Para teclas pressionadas, sempre use `try/finally` com `cua.desktop.keyDown(key)` e `keyUp(key)`. As teclas pressionadas pertencem à sessão de chamada e são liberadas no reset/graceful end. Enquanto segura as teclas, use `keyDown/keyUp` para acordes e ações de ponteiro de desktop sem modificadores explícitos; libere-as antes de texto, atalhos comuns ou entrada de aplicativo. O término abrupto do processo do SO não pode garantir a limpeza.

```js
var browser = await cua.getBrowser('Chrome');
// A documentação do navegador e as abas são exibidas na primeira seleção.
var tab = await cua.getTab('TAB_ID', { browser: 'Chrome' });
await tab.playwright.domSnapshot();
```

`getBrowser`, `getTab` e `createBrowserTab` retornam os handles existentes do SDK browser-use do repositório. Siga a documentação do runtime do navegador selecionado e conecte a extensão de navegador Qwen como antes. A integração não adiciona API de janelas do navegador, diff de DOM ou novo suporte a Windows.

## Permissões e ciclo de vida

O servidor executa JavaScript com permissões ordinárias do Node.js e segue o fluxo de aprovação MCP do cliente. No macOS, Accessibility é necessária para observação de entrada/AX e Screen Recording para screenshots; Automation pode ser solicitada para salvamento de documentos/renomeação no Finder. As concessões pertencem à cadeia de responsabilidade do SO do processo host. No Windows, o daemon instalado normal usa o caminho existente de UAC/logon-task; os aplicativos que ele lança usam um token derivado do seu próprio token na integridade de usuário normal. UIAccess é opcional: definir explicitamente `CUA_DRIVER_USE_UIACCESS=1` requer um worker assinado confiável em Program Files e falha se indisponível. A instalação padrão do npm não prepara esse worker nem requer sua assinatura.

`js` completa em uma chamada e tem um timeout padrão de 30 segundos. Um timeout pode deixar efeitos externos; observe antes de tentar novamente. `js_reset` descarta bindings e fecha graciosamente a sessão nativa/do navegador proprietária. Após a compactação do contexto, chame `cua.rewriteDocumentation()` antes de continuar.

## Relay de desktop remoto

Para uma configuração existente de relay de desktop macOS, instale seu servidor correspondente:

```bash
npx -y @qwen-code/node-repl-mcp@0.26.0 desktop-relay install
```

Isso usa o socket launchd local existente em `127.0.0.1:47821`. Em uma Web Shell segura, escolha **Use this computer** e depois **Connect this computer**. O desktop solicita cada conexão. O daemon remoto deve habilitar `QWEN_SERVE_CLIENT_MCP_OVER_WS=1`.

## MCP direto e solução de problemas

`qwen-cua-driver mcp` expõe as mesmas 19 operações nativas do Computer Use diretamente. As chamadas de aplicativo usam `app`; as chamadas compatíveis com desktop usam `scope:"desktop"`. `key_down/key_up` são apenas de desktop. As ferramentas nativas avançadas permanecem disponíveis através do opt-in do host `CUA_DRIVER_EXTRA_TOOLS=1`.

Se o servidor estiver indisponível, verifique `qwen mcp list` e reinicie o cliente após adicioná-lo. Se a captura falhar, verifique a sessão de desktop atual e as permissões do SO. Se o download nativo falhar, verifique a versão/checksum exata da release ou forneça um payload correspondente construído localmente através de `QWEN_CUA_SDK_NATIVE_DIR`. Um desktop bloqueado não pode fornecer evidência de aceitação de GUI.

Veja [Servidores MCP](./mcp.md), [Modo de Aprovação](./approval-mode.md) e [Sandboxing](./sandbox.md).

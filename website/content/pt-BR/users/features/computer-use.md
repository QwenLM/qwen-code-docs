# Computer Use

O Qwen Code inclui ferramentas de **Computer Use** integradas que permitem ao agente controlar seu desktop — clicar, digitar, rolar, abrir aplicativos, ler o conteúdo das janelas e capturar screenshots. Isso transforma o Qwen Code em um agente de automação de desktop geral, não apenas um assistente de código confinado ao terminal.

O Computer Use é alimentado pelo driver nativo [`cua-driver`](https://github.com/trycua/cua). As ferramentas são registradas como ferramentas diferidas (carregadas sob demanda) sob o prefixo `computer_use__`, ocupando espaço no prompt apenas quando o modelo realmente as utiliza.

> [!warning]
>
> O Computer Use dá ao agente controle do mouse, teclado e janelas, e permite que ele leia o conteúdo da tela. Use apenas com prompts confiáveis e, quando possível, em um ambiente isolado ou descartável. As ferramentas de ação (click, type, drag, etc.) passam pelo [fluxo de aprovação](./approval-mode.md) normal; ferramentas somente leitura, como listar janelas, podem ser executadas sem prompt.

## Ativando e desativando

O Computer Use vem **ativado por padrão**. As ferramentas `computer_use__*` são registradas automaticamente na inicialização.

Para desativá-lo completamente — o que também impede o download ou a inicialização do driver nativo — defina `tools.computerUse.enabled` como `false` no `settings.json`:

```jsonc
{
  "tools": {
    "computerUse": {
      "enabled": false,
    },
  },
}
```

Essa configuração requer reinicialização para entrar em vigor.

## Primeira execução e o driver nativo

Na primeira vez que o agente invoca uma ferramenta de Computer Use, o Qwen Code baixa um binário `cua-driver` fixado e assinado (~20 MB) para `~/.qwen/computer-use/` e o inicia como um processo local. Binários pré-compilados estão disponíveis para macOS (Apple Silicon e Intel), Linux (x86_64) e Windows (x86_64).

### Permissões no macOS

No macOS, a automação de desktop requer duas permissões do sistema:

- **Accessibility** — para ler o estado de janelas/UI e sintetizar entrada
- **Screen Recording** — para capturar screenshots

No primeiro uso, o driver orienta você a conceder essas permissões por meio das caixas de diálogo padrão do sistema macOS. O agente também pode verificar o status das permissões sob demanda (ferramenta `check_permissions`). Como o macOS atribui as permissões ao processo _responsável_, pode ser necessário concedê-las ao terminal ou IDE que iniciou o Qwen Code.

## O que o agente pode fazer

Toda a superfície de ferramentas do `cua-driver` é exposta. Destaques:

| Categoria       | Ferramentas (seleção)                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Mouse           | `click`, `double_click`, `right_click`, `drag`, `move_cursor`, `scroll`              |
| Teclado         | `type_text`, `press_key`, `hotkey`                                                   |
| Janelas / UI    | `list_windows`, `get_window_state`, `get_accessibility_tree`, `set_value`, `zoom`    |
| Aplicativos     | `launch_app`, `list_apps`, `bring_to_front`, `kill_app`                              |
| Páginas do navegador | `page` (executar JavaScript, ler texto, consultar o DOM, clicar em elementos)   |
| Screenshots     | `get_window_state` (captura um PNG), `page`                                          |
| Gravação        | `start_recording`, `stop_recording`, `replay_trajectory` (gravar/replay de uma sessão) |
| Sessões         | `start_session`, `end_session`, controles do overlay do cursor do agente             |

Ações endereçadas por elemento são preferíveis a coordenadas de pixel brutas: `get_window_state` retorna uma renderização em Markdown da árvore de acessibilidade da janela, com um `element_index` estável para cada elemento acionável, que as ferramentas de entrada podem atingir diretamente.

O suporte é mais completo no macOS; algumas ferramentas são específicas de plataforma (por exemplo, `bring_to_front` é exclusivo do Windows, e `launch_app` destina-se a aplicativos do macOS).

## Configuração

Todas as configurações do Computer Use ficam em `tools.computerUse` no `settings.json`. Consulte a [referência de configurações](../configuration/settings.md) para a lista completa.

| Configuração                            | Tipo    | Padrão   | Descrição                                                                                                                                                                                                                                                |
| --------------------------------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools.computerUse.enabled`             | boolean | `true`   | Registra as ferramentas `computer_use__*`. Quando `false`, o driver nunca é baixado nem iniciado.                                                                                                                                                         |
| `tools.computerUse.maxImageDimension`   | number  | `-1`     | Limite de pixels no maior lado para screenshots. `-1` mantém o padrão do driver (1568); `0` desativa o redimensionamento (resolução total); um valor positivo limita o maior lado. Limites menores reduzem o custo de tokens de visão. Override via env: `QWEN_COMPUTER_USE_MAX_IMAGE_DIMENSION`. |
| `tools.computerUse.idleTimeoutMs`       | number  | `300000` | Milissegundos para manter o processo do driver ativo após a última chamada `computer_use__*` (padrão: 5 minutos). `0` mantém o driver ativo até o Qwen Code ser encerrado.                                                                                |

Todas as três configurações requerem reinicialização para entrar em vigor.

## Veja também

- [Modo de aprovação](./approval-mode.md) — como as execuções de ferramentas são controladas
- [Sandbox](./sandbox.md) — isolando o que as ferramentas podem acessar
- [Referência de configurações](../configuration/settings.md) — o esquema completo `tools.computerUse.*`

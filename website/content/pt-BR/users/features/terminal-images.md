# Imagens no Terminal

O Qwen Code pode exibir partes de imagem de respostas do assistente e resultados de ferramentas concluídos diretamente na TUI interativa do terminal. Este caminho de exibição é separado da renderização de Markdown e se comporta da mesma forma nos modos `render` e `raw` do Markdown.

## Onde as Imagens Aparecem

Nas respostas do assistente, texto e imagens mantêm sua ordem original. As linhas de ferramentas mostram o texto do resultado seguido por imagens para resultados bem-sucedidos, falhos e cancelados.

Outras superfícies de saída, incluindo headless, ACP, daemon/Web Shell e integrações de IDE, não renderizam partes de imagem. Os canais WeChat (weixin), WeCom e DingTalk ainda podem entregar arquivos de imagem gerados pelo agente através do fluxo de marcador `[IMAGE: ...]`; outros canais de IM atualmente não entregam imagens de saída.

## Suporte do Terminal

| Ambiente                                                       | Exibição de imagem                                                                        |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| TTY Kitty ou Ghostty direto, sem tmux ou SSH                   | Posicionamento nativo de imagem do terminal                                               |
| Outros terminais com `chafa` instalado                         | Prévia ANSI de 256 cores, incluindo em sessões iTerm2, Warp, tmux e SSH                   |
| Sem renderizador compatível, ou modo leitor de tela (partes de imagem inline) | Texto determinístico como `[image: 1024x768 png]` em vez de uma sequência de imagem do terminal |

## Limites e Fallbacks

Prévias em pixels inline atualmente requerem dados PNG válidos dentro dos limites de exibição: 64 megapixels no total e no máximo 1.000.000 pixels por lado. Outros formatos de imagem, PNGs inválidos e PNGs inline que excedam esses limites permanecem visíveis como placeholders de texto.

Payloads de imagem inline maiores que 8 MiB não são renderizados em pixels. A maioria dos payloads excedentes é descartada antes de entrar no histórico da TUI, enquanto payloads marginalmente acima do limite podem permanecer como placeholders de texto porque a admissão é baseada no tamanho codificado. Cada resposta do assistente ou linha de ferramenta exibe no máximo quatro imagens e reporta o restante com um marcador como `[+2 more images]`.

## Histórico de Sessão e Memória

Partes de imagem de ferramentas são salvas com seus resultados e podem ser reconstruídas após retomada de sessão. Imagens do assistente são renderizadas ao vivo, mas atualmente não são persistidas, então `--continue` e `--resume` restauram o texto do assistente sem essas imagens.

Para limitar a memória em sessões longas ou com muitas imagens, a TUI pode substituir imagens exibidas mais antigas por marcadores como `[Old assistant image content cleared]` ou `[Old tool result content cleared]`. Isso afeta apenas a visualização ao vivo. Partes de imagem de ferramentas permanecem no registro da sessão e reaparecem após a retomada.

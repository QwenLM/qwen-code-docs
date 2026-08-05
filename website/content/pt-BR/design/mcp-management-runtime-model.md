# Modelo de runtime de gerenciamento de MCP

A configuração de MCP é a fonte durável de verdade. Cada sessão de CLI ou Web
continua sendo dona de um runtime MCP independente, então a CLI não depende de
um processo de gerenciamento de workspace.

A página de gerenciamento Web pode criar um runtime de gerenciamento opcional
para operações de status e gerenciamento. Operações que alteram configuração
persistem primeiro, então reconciliam todo runtime vivo no mesmo processo ACP.
Uma sessão posterior carrega a configuração persistida normalmente.

O status de gerenciamento é lido do gerenciador de clientes do runtime de
gerenciamento, não do mapa de status de compatibilidade de todo o processo. O
mapa de compatibilidade permanece inalterado para consumidores CLI existentes.
Reconexões de pool compartilhado reiniciam a entrada do pool; reconexões sem
pool redescobrem o servidor em cada runtime vivo.

A proveniência do servidor permanece distinta: configurações de usuário,
configurações de workspace, `.mcp.json` de projeto e extensões. Desativar
servidores de projeto ou workspace escreve a exclusão nas configurações locais
do workspace sem modificar o arquivo de projeto compartilhado.

# Caminhos de Instalação de Skills do Workspace

Data: 2026-07-13

## Contrato

Cada skill retornado por `GET /workspace/skills` e
`GET /workspaces/:workspace/skills` inclui `installedPath`, o
`SkillConfig.filePath` absoluto existente que aponta para seu arquivo `SKILL.md`.
O valor é copiado como armazenado; a camada de status não resolve symlinks nem o
canoniza novamente.

## Compatibilidade

Este é um campo aditivo da v1. O daemon atual sempre o emite, enquanto a bridge
ACP e os tipos públicos de status do SDK TypeScript o mantêm opcional para que os
clientes permaneçam compatíveis com daemons mais antigos. A versão do protocolo e
a lista de capabilities não mudam.

## Fluxo de Dados

`SkillManager.listSkills()` fornece os registros `SkillConfig`. A função
compartilhada `mapSkillConfigToStatus()` copia `filePath` para `installedPath`.
Tanto o snapshot ACP ao vivo quanto o fallback local do daemon usam esse mapper,
então skills de projeto, usuário, bundled, extensão, extensão inativa e
desabilitados têm o mesmo formato. O serviço de status do workspace encaminha esse
resultado compartilhado para ambas as formas de rota.

## Fronteira de Redação

O mapper de status permanece uma allowlist explícita de metadata. Ele expõe o
caminho de arquivo de instalação, mas não o corpo do skill, hooks, `skillRoot` ou
qualquer outra configuração de skill. Esta alteração não adiciona comportamento de UI.

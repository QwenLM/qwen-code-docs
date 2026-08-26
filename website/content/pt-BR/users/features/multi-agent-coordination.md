# Multi-Agent Coordination

O Qwen Code pode coordenar vários teammates com o runtime experimental Agent Team. Teammates recebem tarefas separadas, compartilham uma lista de tarefas, trocam mensagens e aparecem nas abas existentes do Agent View. O `/coordinate` define os workers de investigação para um conjunto de ferramentas read-only obrigatório e pode colocar um writer em uma Git worktree pertencente ao líder.

## Habilitar o Agent Team

Defina `experimental.agentTeam` como `true` nas configurações do Qwen Code e reinicie, ou inicie o Qwen Code com `QWEN_CODE_ENABLE_AGENT_TEAM=1`.

## Executar uma tarefa coordenada

Use o skill integrado com um objetivo:

```text
/coordinate investigate the authentication regression and propose the smallest fix
```

O líder cria uma equipe, atribui até três workstreams independentes e usa as ferramentas de equipe existentes para mensagens e estado de tarefas. As conversas e aprovações dos teammates permanecem visíveis pela UI existente do Agent View. Teammates read-only não podem executar comandos shell nem escrever arquivos. Se implementação for necessária, o líder pode criar uma Git worktree e fixar um teammate writer nela; o líder permanece a única autoridade de merge para o branch atual.

Se o Agent Team estiver desabilitado, o `/coordinate` ainda pode usar agentes foreground comuns para investigação paralela read-only. Esse fallback é delegação, não uma equipe colaborativa: os workers reportam apenas ao líder.

## Escolhendo o modo multi-agente correto

| Modo                          | Use para                                                      | Comunicação                          | Comportamento do workspace                                |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| `/coordinate` com Agent Team  | Diferentes workstreams contribuindo para um resultado          | Tarefas compartilhadas e mensagens entre teammates | Workers read-only obrigatórios; writer opcional em worktree única |
| Subagents                     | Tarefas delegadas pequenas                                      | Worker reporta ao pai                | Depende do agente selecionado                             |
| Arena                         | Vários modelos competindo na mesma tarefa                       | Agentes não colaboram                | Worktrees isoladas; um vencedor é selecionado             |
| Herdr                         | Coordenar diferentes produtos CLI ou sessões de terminal remoto | Controle externo no nível do terminal | Gerenciado fora do Qwen Code                              |

O fluxo de trabalho atual reutiliza deliberadamente o runtime Agent Team in-process e a UI do Agent View. Teammates normalmente herdam o modelo da session, embora uma definição de agente possa sobrescrevê-lo. Sessions PTY independentes persistentes, workers de fornecedores cruzados e attach remoto são preocupações de produto separadas e não são implementados pelo `/coordinate`.

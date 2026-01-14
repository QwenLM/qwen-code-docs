# IDEs JetBrains

> As IDEs JetBrains fornecem suporte nativo para assistentes de codificação AI através do Agent Client Protocol (ACP). Essa integração permite que você utilize o Qwen Code diretamente dentro da sua IDE JetBrains com sugestões de código em tempo real.

### Recursos

- **Experiência nativa de agente**: Painel integrado de assistente de IA dentro da sua IDE JetBrains
- **Agent Client Protocol**: Suporte completo ao ACP, permitindo interações avançadas com a IDE
- **Gerenciamento de símbolos**: Mencione arquivos com # para adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso às conversas anteriores dentro da IDE

### Requisitos

- IDE JetBrains com suporte a ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- Qwen Code CLI instalado

### Instalação

1. Instale o Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra seu IDE JetBrains e navegue até a janela de ferramenta do AI Chat.

3. Clique no menu com 3 pontos no canto superior direito e selecione **Configure ACP Agent**, e configure o Qwen Code com as seguintes configurações:

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/path/to/qwen",
      "args": ["--acp"],
      "env": {}
    }
  }
}
```

4. O agente Qwen Code agora deve estar disponível no painel do Assistente de IA

![Qwen Code no AI Chat do JetBrains](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Solução de problemas

### Agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Verifique se sua versão do IDE JetBrains suporta ACP
- Reinicie seu IDE JetBrains

### Qwen Code não está respondendo

- Verifique sua conexão com a internet
- Verifique se o CLI funciona executando `qwen` no terminal
- [Registre um problema no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
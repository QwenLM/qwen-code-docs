# IDEs da JetBrains

> As IDEs da JetBrains oferecem suporte nativo para assistentes de codificação com IA por meio do Agent Client Protocol (ACP). Essa integração permite usar o Qwen Code diretamente na sua IDE da JetBrains com sugestões de código em tempo real.

### Recursos

- **Experiência nativa de agente**: Painel integrado de assistente de IA na sua IDE da JetBrains
- **Agent Client Protocol**: Suporte completo ao ACP, permitindo interações avançadas com a IDE
- **Gerenciamento de símbolos**: Use `#` para mencionar arquivos e adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso a conversas anteriores diretamente na IDE

### Requisitos

- IDE da JetBrains com suporte a ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- Qwen Code CLI instalado

### Instalação

#### Instalar pelo ACP Registry (Recomendado)

1. Instale o Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra sua IDE da JetBrains e navegue até a janela de ferramentas AI Chat.

3. Clique em **Add ACP Agent** e, em seguida, clique em **Install**.

   ![Install](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Para usuários que utilizam o JetBrains AI Assistant e/ou outros agentes ACP, clique em **Install From ACP Registry** na lista de agentes e instale o Qwen Code ACP.

   ![Add from Agents List](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. O agente Qwen Code agora deve estar disponível no painel AI Assistant.

   ![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Instalação manual (para versões mais antigas das IDEs da JetBrains)

1. Instale o Qwen Code CLI:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra sua IDE da JetBrains e navegue até a janela de ferramentas AI Chat.

3. Clique no menu de três pontos no canto superior direito, selecione **Configure ACP Agent** e configure o Qwen Code com as seguintes definições:

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

4. O agente Qwen Code agora deve estar disponível no painel AI Assistant

![Qwen Code in JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Solução de problemas

### Agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Verifique se a versão da sua IDE da JetBrains oferece suporte a ACP
- Reinicie sua IDE da JetBrains

### Qwen Code não responde

- Verifique sua conexão com a internet
- Confirme se a CLI está funcionando executando `qwen` no terminal
- [Abra uma issue no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
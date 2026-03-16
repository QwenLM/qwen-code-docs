# IDEs JetBrains

> As IDEs JetBrains oferecem suporte nativo para assistentes de programação com IA por meio do Agent Client Protocol (ACP). Essa integração permite usar o Qwen Code diretamente dentro da sua IDE JetBrains, com sugestões de código em tempo real.

### Recursos

- **Experiência nativa com agentes**: Painel integrado de assistente de IA dentro da sua IDE JetBrains
- **Agent Client Protocol**: Suporte completo ao ACP, habilitando interações avançadas com a IDE
- **Gerenciamento de símbolos**: Use `#` para mencionar arquivos e adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso às conversas anteriores diretamente na IDE

### Requisitos

- IDE JetBrains com suporte ao ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- CLI do Qwen Code instalado

### Instalação

#### Instalar do Registro ACP (Recomendado)

1. Instale a CLI do Qwen Code:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra seu IDE JetBrains e navegue até a janela da ferramenta AI Chat.

3. Clique em **Adicionar Agente ACP**, depois clique em **Instalar**.

   ![Instalar](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Para usuários que utilizam o JetBrains AI Assistant e/ou outros agentes ACP, clique em **Instalar do Registro ACP** na lista de agentes e, em seguida, instale o agente ACP do Qwen Code.

   ![Adicionar da Lista de Agentes](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. O agente Qwen Code agora deve estar disponível no painel do AI Assistant.

   ![Qwen Code no AI Chat do JetBrains](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Instalação manual (para versões mais antigas das IDEs JetBrains)

1. Instale a CLI do Qwen Code:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra sua IDE JetBrains e navegue até a janela da ferramenta AI Chat.

3. Clique no menu de três pontos no canto superior direito e selecione **Configurar agente ACP**, configurando o Qwen Code com as seguintes configurações:

```json
{
  "agent_servers": {
    "qwen": {
      "command": "/caminho/para/qwen",
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
- Certifique-se de que sua versão do JetBrains IDE suporta ACP
- Reinicie sua IDE JetBrains

### Qwen Code não está respondendo

- Verifique sua conexão com a internet  
- Verifique se a CLI está funcionando executando `qwen` no terminal  
- [Abra um problema no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
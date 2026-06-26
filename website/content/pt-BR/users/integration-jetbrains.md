# JetBrains IDEs

> As IDEs JetBrains oferecem suporte nativo para assistentes de codificação de IA através do Agent Client Protocol (ACP). Esta integração permite usar o Qwen Code diretamente na sua IDE JetBrains com sugestões de código em tempo real.

### Funcionalidades

- **Experiência de agente nativa**: Painel de assistente de IA integrado na sua IDE JetBrains
- **Agent Client Protocol**: Suporte completo para ACP, permitindo interações avançadas com a IDE
- **Gerenciamento de símbolos**: Mencione arquivos com # para adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso a conversas anteriores dentro da IDE

### Requisitos

- IDE JetBrains com suporte a ACP (IntelliJ IDEA, WebStorm, PyCharm, etc.)
- CLI do Qwen Code instalada

### Instalação

#### Instalar a partir do Registro ACP (Recomendado)

1. Instale a CLI do Qwen Code:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra sua IDE JetBrains e navegue até a janela de ferramenta AI Chat.

3. Clique em **Add ACP Agent**, depois em **Install**.

   ![Instalação](https://img.alicdn.com/imgextra/i4/O1CN01qNdPCW1y8AcqxRgCy_!!6000000006533-2-tps-2490-1788.png)

   Para usuários que utilizam o JetBrains AI Assistant e/ou outros agentes ACP, clique em **Install From ACP Registry** na lista de Agentes e instale o Qwen Code ACP.

   ![Adicionar da Lista de Agentes](https://img.alicdn.com/imgextra/i2/O1CN01ZyOugP26BOKzNgZXx_!!6000000007623-2-tps-479-523.png)

4. O agente Qwen Code agora deve estar disponível no painel AI Assistant.

   ![Qwen Code no JetBrains AI Chat](https://img.alicdn.com/imgextra/i4/O1CN013kAVE41XVzbIZOxyv_!!6000000002930-2-tps-3188-2170.png)

#### Instalação Manual (para versões mais antigas das IDEs JetBrains)

1. Instale a CLI do Qwen Code:

   ```bash
   npm install -g @qwen-code/qwen-code
   ```

2. Abra sua IDE JetBrains e navegue até a janela de ferramenta AI Chat.

3. Clique no menu de três pontos no canto superior direito e selecione **Configure ACP Agent** e configure o Qwen Code com as seguintes configurações:

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

![Qwen Code no JetBrains AI Chat](https://img.alicdn.com/imgextra/i3/O1CN01ZxYel21y433Ci6eg0_!!6000000006524-2-tps-2774-1494.png)

## Solução de Problemas

### Agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Certifique-se de que sua versão da IDE JetBrains suporta ACP
- Reinicie sua IDE JetBrains

### Qwen Code não responde

- Verifique sua conexão com a internet
- Verifique se a CLI funciona executando `qwen` no terminal
- [Abra uma issue no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
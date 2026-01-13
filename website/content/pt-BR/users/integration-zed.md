# Editor Zed

> O Editor Zed fornece suporte nativo para assistentes de programação com IA por meio do Agent Control Protocol (ACP). Essa integração permite que você utilize o Qwen Code diretamente na interface do Zed com sugestões de código em tempo real.

![Visão Geral do Editor Zed](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Recursos

- **Experiência nativa com agente**: Painel integrado de assistente de IA dentro da interface do Zed
- **Protocolo Cliente Agente**: Suporte completo ao ACP, permitindo interações avançadas com IDEs
- **Gerenciamento de arquivos**: Mencione arquivos com @ para adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso às conversas anteriores dentro do Zed

### Requisitos

- Editor Zed (versão mais recente recomendada)
- CLI do Qwen Code instalado

### Instalação

1. Instale o Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Baixe e instale o [Editor Zed](https://zed.dev/)

3. No Zed, clique no **botão de configurações** no canto superior direito, selecione **"Adicionar agente"**, escolha **"Criar um agente personalizado"** e adicione a seguinte configuração:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Integração Qwen Code](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Solução de problemas

### Agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Verifique se a configuração JSON é válida
- Reinicie o Editor Zed

### Qwen Code não responde

- Verifique sua conexão com a internet
- Verifique se o CLI funciona executando `qwen` no terminal
- [Registre um problema no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
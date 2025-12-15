# Zed Editor

> O Zed Editor oferece suporte nativo para assistentes de codificação com IA por meio do Protocolo de Controle do Agente (ACP). Essa integração permite que você utilize o Qwen Code diretamente na interface do Zed com sugestões de código em tempo real.

![Visão Geral do Zed Editor](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Recursos

- **Experiência nativa com agente**: Painel de assistente de IA integrado à interface do Zed
- **Protocolo de Controle do Agente**: Suporte completo ao ACP, permitindo interações avançadas com a IDE
- **Gerenciamento de arquivos**: Use @ para mencionar arquivos e adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso às conversas anteriores dentro do Zed

### Requisitos

- Zed Editor (recomenda-se a versão mais recente)
- CLI do Qwen Code instalada

### Instalação

1. Instale o Qwen Code CLI:

   ```bash
   npm install -g qwen-code
   ```

2. Baixe e instale o [Zed Editor](https://zed.dev/)

3. No Zed, clique no **botão de configurações** no canto superior direito, selecione **"Add agent"**, escolha **"Create a custom agent"** e adicione a seguinte configuração:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--experimental-acp"],
  "env": {}
}
```

![Integração do Qwen Code](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Solução de Problemas

### Agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Verifique se a configuração JSON é válida
- Reinicie o Zed Editor

### Qwen Code não responde

- Verifique sua conexão com a internet
- Confirme se o CLI funciona executando `qwen` no terminal
- [Abra uma issue no GitHub](https://github.com/qwenlm/qwen-code/issues) caso o problema persista
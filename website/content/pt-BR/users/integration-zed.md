# Zed Editor

> O Zed Editor oferece suporte nativo para assistentes de codificação com IA por meio do Agent Client Protocol (ACP). Essa integração permite que você use o Qwen Code diretamente na interface do Zed com sugestões de código em tempo real.

![Zed Editor Overview](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Recursos

- **Experiência nativa de agente**: Painel integrado de assistente de IA na interface do Zed
- **Agent Client Protocol**: Suporte completo ao ACP, permitindo interações avançadas com a IDE
- **Gerenciamento de arquivos**: Mencione arquivos com `@` para adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso a conversas anteriores dentro do Zed

### Requisitos

- Zed Editor (recomenda-se a versão mais recente)
- Qwen Code CLI instalado

### Instalação

#### Instalar pelo ACP Registry (Recomendado)

1. Instale o Qwen Code CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Baixe e instale o [Zed Editor](https://zed.dev/)

3. No Zed, clique no **botão de configurações** no canto superior direito, selecione **"Add agent"**, escolha **"Install from Registry"**, localize o **Qwen Code** e clique em **Install**.

   ![ACP Registry](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code ACP Installed](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Instalação manual

1. Instale o Qwen Code CLI:

```bash
npm install -g @qwen-code/qwen-code
```

2. Baixe e instale o [Zed Editor](https://zed.dev/)

3. No Zed, clique no **botão de configurações** no canto superior direito, selecione **"Add agent"**, escolha **"Create a custom agent"** e adicione a seguinte configuração:

```json
"Qwen Code": {
  "type": "custom",
  "command": "qwen",
  "args": ["--acp"],
  "env": {}
}
```

![Qwen Code Integration](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Solução de problemas

### O agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Verifique se a configuração JSON é válida
- Reinicie o Zed Editor

### O Qwen Code não responde

- Verifique sua conexão com a internet
- Verifique se a CLI está funcionando executando `qwen` no terminal
- [Abra uma issue no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
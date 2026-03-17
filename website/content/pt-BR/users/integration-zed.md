# Editor Zed

> O Editor Zed oferece suporte nativo para assistentes de programação com IA por meio do Agent Client Protocol (ACP). Essa integração permite usar o Qwen Code diretamente na interface do Zed, com sugestões de código em tempo real.

![Visão Geral do Editor Zed](https://img.alicdn.com/imgextra/i1/O1CN01aAhU311GwEoNh27FP_!!6000000000686-2-tps-3024-1898.png)

### Recursos

- **Experiência nativa com agentes**: Painel integrado de assistente de IA na interface do Zed
- **Agent Client Protocol**: Suporte completo ao ACP, permitindo interações avançadas com o IDE
- **Gerenciamento de arquivos**: Mencione arquivos com `@` para adicioná-los ao contexto da conversa
- **Histórico de conversas**: Acesso às conversas anteriores dentro do Zed

### Requisitos

- Editor Zed (versão mais recente recomendada)
- CLI do Qwen Code instalado

### Instalação

#### Instalar do Registro ACP (Recomendado)

1. Instale a CLI do Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
```

2. Baixe e instale o [Editor Zed](https://zed.dev/)

3. No Zed, clique no **botão de configurações** no canto superior direito, selecione **"Adicionar agente"**, escolha **"Instalar do Registro"**, localize **Qwen Code** e, em seguida, clique em **Instalar**.

   ![Registro ACP](https://img.alicdn.com/imgextra/i4/O1CN0186ybL61EeG35fHFjy_!!6000000000376-2-tps-3056-1705.png)

   ![Qwen Code instalado via ACP](https://img.alicdn.com/imgextra/i1/O1CN01OXHhoR1J8irAvjs8F_!!6000000000984-2-tps-1247-703.png)

#### Instalação manual

1. Instale a CLI do Qwen Code:

```bash
npm install -g @qwen-code/qwen-code
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

![Integração do Qwen Code](https://img.alicdn.com/imgextra/i1/O1CN013s61L91dSE1J7MTgO_!!6000000003734-2-tps-2592-1234.png)

## Solução de problemas

### Agente não aparece

- Execute `qwen --version` no terminal para verificar a instalação
- Verifique se a configuração JSON é válida
- Reinicie o editor Zed

### O Qwen Code não responde

- Verifique sua conexão com a internet
- Confirme se a CLI funciona executando `qwen` no terminal
- [Abra um problema no GitHub](https://github.com/qwenlm/qwen-code/issues) se o problema persistir
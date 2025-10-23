# Qwen Code CLI

Dentro do Qwen Code, `packages/cli` é o frontend para os usuários enviarem e receberem prompts com o Qwen e outros modelos de IA e suas ferramentas associadas. Para uma visão geral geral do Qwen Code

## Navegando nesta seção

- **[Autenticação](./authentication.md):** Um guia para configurar autenticação com Qwen OAuth e provedores compatíveis com OpenAI.
- **[Comandos](./commands.md):** Uma referência para os comandos do Qwen Code CLI (ex.: `/help`, `/tools`, `/theme`).
- **[Configuração](./configuration.md):** Um guia para personalizar o comportamento do Qwen Code CLI usando arquivos de configuração.
- **[Temas](./themes.md)**: Um guia para customizar a aparência do CLI com diferentes temas.
- **[Tutoriais](tutorials.md)**: Um tutorial mostrando como usar o Qwen Code para automatizar uma tarefa de desenvolvimento.

## Modo não interativo

O Qwen Code pode ser executado em modo não interativo, o que é útil para scripting e automação. Neste modo, você envia entrada para o CLI via pipe, ele executa o comando e depois encerra.

O exemplo a seguir envia um comando para o Qwen Code a partir do seu terminal:

```bash
echo "What is fine tuning?" | qwen
```

Você também pode usar a flag `--prompt` ou `-p`:

```bash
qwen -p "What is fine tuning?"
```

Para documentação completa sobre uso headless, scripting, automação e exemplos avançados, consulte o guia **[Headless Mode](../headless.md)**.
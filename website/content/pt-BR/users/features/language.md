# Internacionalização (i18n) e Idioma

O Qwen Code foi criado para fluxos de trabalho multilíngues: ele oferece localização da interface do usuário (i18n/l10n) na CLI, permite escolher o idioma da saída do assistente e suporta pacotes personalizados de idioma para a interface do usuário.

## Visão geral

Do ponto de vista do usuário, a “internacionalização” do Qwen Code abrange várias camadas:

| Capacidade / Configuração | O que controla                                                                 | Onde é armazenada                 |
| -------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| `/language ui`             | Texto da interface do usuário no terminal (menus, mensagens do sistema, prompts) | `~/.qwen/settings.json`          |
| `/language output`         | Idioma em que a IA responde (uma preferência de saída, não uma tradução da IU)   | `~/.qwen/output-language.md`     |
| Pacotes personalizados de idioma para a IU | Substitui ou estende as traduções internas da interface do usuário              | `~/.qwen/locales/*.js`           |

## Idioma da Interface do Usuário

Esta é a camada de localização (i18n/l10n) da interface de linha de comando (CLI): ela controla o idioma dos menus, mensagens de prompt e mensagens do sistema.

### Definindo o Idioma da Interface do Usuário

Use o comando `/language ui`:

```bash
/language ui zh-CN    # Chinês
/language ui en-US    # Inglês
/language ui ru-RU    # Russo
/language ui de-DE    # Alemão
/language ui ja-JP    # Japonês
```

Aliases também são suportados:

```bash
/language ui zh       # Chinês
/language ui en       # Inglês
/language ui ru       # Russo
/language ui de       # Alemão
/language ui ja       # Japonês
```

### Detecção Automática

Na primeira inicialização, o Qwen Code detecta sua localidade do sistema e define automaticamente o idioma da interface do usuário.

Ordem de prioridade para detecção:

1. Variável de ambiente `QWEN_CODE_LANG`
2. Variável de ambiente `LANG`
3. Localidade do sistema via API JavaScript Intl
4. Padrão: Inglês

## Idioma da Saída do LLM

O idioma da saída do LLM controla em qual idioma o assistente de IA responde, independentemente do idioma em que você digita suas perguntas.

### Como Funciona

O idioma da saída do modelo de linguagem grande (LLM) é controlado por um arquivo de regra em `~/.qwen/output-language.md`. Esse arquivo é automaticamente incluído no contexto do LLM durante a inicialização, instruindo-o a responder no idioma especificado.

### Detecção Automática

Na primeira inicialização, caso o arquivo `output-language.md` não exista, o Qwen Code cria um automaticamente com base na localidade do seu sistema. Por exemplo:

- Localidade do sistema `zh` cria uma regra para respostas em chinês  
- Localidade do sistema `en` cria uma regra para respostas em inglês  
- Localidade do sistema `ru` cria uma regra para respostas em russo  
- Localidade do sistema `de` cria uma regra para respostas em alemão  
- Localidade do sistema `ja` cria uma regra para respostas em japonês

### Configuração Manual

Use `/language output <idioma>` para alterar:

```bash
/language output Chinês
/language output Inglês
/language output Japonês
/language output Alemão
```

Qualquer nome de idioma funciona. O modelo de linguagem grande (LLM) será instruído a responder nesse idioma.

> [!note]
>
> Após alterar o idioma de saída, reinicie o Qwen Code para que a alteração entre em vigor.

### Localização do Arquivo

```
~/.qwen/output-language.md
```

## Configuração

### Via Diálogo de Configurações

1. Execute `/settings`
2. Encontre "Idioma" em Geral
3. Selecione seu idioma preferido para a interface do usuário

### Via Variável de Ambiente

```bash
export QWEN_CODE_LANG=zh
```

Isso influencia a detecção automática na inicialização inicial (se você ainda não definiu um idioma para a interface do usuário e o arquivo `output-language.md` ainda não existe).

## Pacotes de Idioma Personalizados

Para traduções da interface do usuário, você pode criar pacotes de idioma personalizados em `~/.qwen/locales/`:

- Exemplo: `~/.qwen/locales/es.js` para o espanhol  
- Exemplo: `~/.qwen/locales/fr.js` para o francês

O diretório do usuário tem precedência sobre as traduções embutidas.

> [!tip]
>
> Contribuições são bem-vindas! Se você quiser melhorar as traduções embutidas ou adicionar novos idiomas.  
> Para um exemplo concreto, veja [PR #1238: feat(i18n): adicionar suporte ao idioma russo](https://github.com/QwenLM/qwen-code/pull/1238).

### Formato do Pacote de Idioma

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Olá',
  Settings: 'Configurações',
  // ... mais traduções
};
```

## Comandos Relacionados

- `/language` — Mostra as configurações atuais de idioma  
- `/language ui [lang]` — Define o idioma da interface do usuário  
- `/language output <language>` — Define o idioma de saída do modelo LLM  
- `/settings` — Abre o diálogo de configurações
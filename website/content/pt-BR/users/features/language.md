# Internacionalização (i18n) e Idioma

O Qwen Code foi desenvolvido para fluxos de trabalho multilíngues: ele oferece suporte à localização da interface (i18n/l10n) na CLI, permite escolher o idioma de saída do assistente e possibilita o uso de pacotes de idioma personalizados para a UI.

## Visão geral

Do ponto de vista do usuário, a “internacionalização” do Qwen Code abrange várias camadas:

| Recurso / Configuração     | O que controla                                                       | Onde é armazenado                 |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `/language ui`           | Texto da UI do terminal (menus, mensagens do sistema, prompts)                     | `~/.qwen/settings.json`      |
| `/language output`       | Idioma em que a IA responde (uma preferência de saída, não tradução da UI) | `~/.qwen/output-language.md` |
| Pacotes de idioma personalizados para a UI | Substitui/estende as traduções de UI integradas                             | `~/.qwen/locales/*.js`       |

## Idioma da UI

Esta é a camada de localização da UI da CLI (i18n/l10n): ela controla o idioma dos menus, prompts e mensagens do sistema.

### Definindo o idioma da UI

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

### Detecção automática

Na primeira inicialização, o Qwen Code detecta o locale do seu sistema e define o idioma da UI automaticamente.

Prioridade de detecção:

1. Variável de ambiente `QWEN_CODE_LANG`
2. Variável de ambiente `LANG`
3. Locale do sistema via API Intl do JavaScript
4. Padrão: Inglês

## Idioma de saída do LLM

O idioma de saída do LLM controla em qual idioma o assistente de IA responde, independentemente do idioma em que você digita suas perguntas.

### Como funciona

O idioma de saída do LLM é controlado por um arquivo de regras em `~/.qwen/output-language.md`. Esse arquivo é incluído automaticamente no contexto do LLM durante a inicialização, instruindo-o a responder no idioma especificado.

### Detecção automática

Na primeira inicialização, se nenhum arquivo `output-language.md` existir, o Qwen Code criará um automaticamente com base no locale do seu sistema. Por exemplo:

- Locale do sistema `zh` cria uma regra para respostas em chinês
- Locale do sistema `en` cria uma regra para respostas em inglês
- Locale do sistema `ru` cria uma regra para respostas em russo
- Locale do sistema `de` cria uma regra para respostas em alemão
- Locale do sistema `ja` cria uma regra para respostas em japonês

### Configuração manual

Use `/language output <language>` para alterar:

```bash
/language output Chinese
/language output English
/language output Japanese
/language output German
```

Qualquer nome de idioma funciona. O LLM será instruído a responder nesse idioma.

> [!note]
>
> Após alterar o idioma de saída, reinicie o Qwen Code para que a alteração tenha efeito.

### Localização do arquivo

```
~/.qwen/output-language.md
```

## Configuração

### Pela caixa de diálogo de configurações

1. Execute `/settings`
2. Encontre "Language" em General
3. Selecione seu idioma de UI preferido

### Por variável de ambiente

```bash
export QWEN_CODE_LANG=zh
```

Isso influencia a detecção automática na primeira inicialização (se você ainda não definiu um idioma de UI e nenhum arquivo `output-language.md` existe).

## Pacotes de idioma personalizados

Para traduções da UI, você pode criar pacotes de idioma personalizados em `~/.qwen/locales/`:

- Exemplo: `~/.qwen/locales/es.js` para espanhol
- Exemplo: `~/.qwen/locales/fr.js` para francês

O diretório do usuário tem precedência sobre as traduções integradas.

> [!tip]
>
> Contribuições são bem-vindas! Se você quiser melhorar as traduções integradas ou adicionar novos idiomas.
> Para um exemplo concreto, consulte [PR #1238: feat(i18n): add Russian language support](https://github.com/QwenLM/qwen-code/pull/1238).

### Formato do pacote de idioma

```javascript
// ~/.qwen/locales/es.js
export default {
  Hello: 'Hola',
  Settings: 'Configuracion',
  // ... more translations
};
```

## Comandos relacionados

- `/language` - Exibe as configurações de idioma atuais
- `/language ui [lang]` - Define o idioma da UI
- `/language output <language>` - Define o idioma de saída do LLM
- `/settings` - Abre a caixa de diálogo de configurações
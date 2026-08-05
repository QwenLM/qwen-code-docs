# Roteamento multimodal de turno completo

## Escopo

Isto implementa apenas a Fase 1 de #6988: quando o modelo primário é
somente texto, um modelo de visão explicitamente capaz de agente pode tratar
o turno completo que contém imagens.

Não adiciona estado de rota persistente, recuperação de sessão, resumos
visuais duráveis, referências de imagem estáveis, limpeza de mídia histórica
ou reinspeção posterior de imagens.

## Gate de capability

O roteamento de turno completo requer capability tanto de imagem quanto de
agente:

```json
{
  "id": "vision-agent",
  "capabilities": {
    "vision": true,
    "agent": true
  }
}
```

Uma capability `agent` ausente ou falsa mantém o comportamento existente de
transcrição do Vision Bridge.

## Roteamento

- Se o primário aceita imagens, usa o caminho existente do modelo primário.
- Se o modelo de visão selecionado não é capaz de agente, transcreve pelo
  Vision Bridge e responde no primário.
- Se o modelo de visão selecionado é capaz de agente, mantém as partes de
  imagem originais e define um seletor de modelo exato local ao turno.
- O provider, modelo e endpoint exatos são reutilizados para retries de
  provider, execução de ferramentas, continuações de resultado de ferramenta
  e continuações de ACP Stop Hook bloqueante.
- A execução de ferramenta headless recebe a mesma visão de runtime que o
  modelo de imagem selecionado; drenagens de fila de notificação e cron
  permanecem turnos independentes e não a herdam.
- Modelos de fallback configurados são desativados para esse turno. Falha ao
  resolver a rota exata resulta em fail closed em vez de enviar dados brutos
  de imagem ao primário.
- O próximo turno independente do usuário limpa o seletor e retorna ao
  primário. Toda requisição de modelo, incluindo consultas laterais, recebe
  apenas as modalidades de mídia suportadas pelo seu alvo exato.

O seletor de turno completo adiciona um marcador NUL final à representação
existente `model\0baseUrl`. A camada de chat remove esse marcador antes da
resolução do modelo. Isso mantém seleções de modelo qualificadas por endpoint
comuns no seu comportamento existente.

## Limites de contexto

A compactação automática de chat baseada em LLM permanece no caminho do
modelo primário. Uma rota de turno completo pula essa compactação porque
executar a compactação do modelo primário enquanto um turno de imagem pertence
a outro provider violaria a garantia de rota exata. A microcompactação local
de histórico existente e o afinamento de payload de imagem ainda se aplicam,
e as cópias de requisição/cache retêm apenas as modalidades de mídia
suportadas pelo seu modelo alvo. Uma requisição de turno completo excessiva,
portanto, falha no modelo selecionado.

## Pontos de entrada

A Fase 1 cobre a TUI interativa, ACP e a CLI não interativa.

Caminhos `@` textuais são resolvidos para seu alvo canônico antes da detecção
de MIME, verificações de workspace, filtragem de ignore e leituras de arquivo.
Tanto o alias fornecido pelo usuário quanto o alvo canônico devem passar na
filtragem de ignore, então um symlink não pode disfarçar um arquivo ignorado
ou um alvo que não é imagem. Hardlinks não são resolvidos por `realpath` e
não são cobertos por esta verificação.

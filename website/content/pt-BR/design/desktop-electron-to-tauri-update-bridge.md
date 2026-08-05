# Ponte de Atualização Desktop de Electron para Tauri

## Contexto

O último release desktop publicado, `desktop-v0.0.5`, é um app Electron chamado
`Qwen Code Desktop` com identificador de bundle `com.alibaba.qwen-code`. Seu
atualizador macOS lê `latest-mac.yml` do release fixo `desktop-latest` e instala
um arquivo ZIP.

O novo shell desktop é um app Tauri. Ele atualmente usa um nome de produto e
identificador de bundle diferentes e publica `desktop-latest.json`, então o app
Electron existente não pode descobri-lo nem substituí-lo.

## Objetivos

- Permitir que instalações macOS assinadas do Electron `0.0.5` atualizem
  diretamente para o primeiro release estável do Tauri.
- Preservar a identidade existente do aplicativo macOS para que o atualizador
  substitua o bundle do app instalado.
- Manter o feed de atualizador assinado do Tauri para todos os releases após a
  migração.
- Tornar a ponte opt-in e de uso único; releases posteriores não devem precisar do
  ferramental de build do Electron.

## Não objetivos

- Migrar configurações, sessões ou estado de workspace do Electron. O app Tauri
  pode solicitar um workspace no primeiro lançamento.
- Fazer a ponte de instalações Windows ou Linux do Electron.
- Gerar blockmaps diferenciais do Electron. O atualizador do Electron faz fallback
  para o ZIP completo verificado por checksum.

## Contrato de compatibilidade

O bundle do Tauri usa a identidade legada do macOS:

- nome do produto: `Qwen Code Desktop`
- identificador de bundle: `com.alibaba.qwen-code`
- prefixo de artefato: `Qwen-Code-Desktop`
- identidade de assinatura: o certificado Developer ID Application existente

O release da ponte deve ser mais novo que `0.0.5`. Ele publica duas visões de
atualizador sobre os mesmos bundles de app assinados:

1. `latest-mac.yml` aponta clientes Electron legados para
   `Qwen-Code-Desktop-arm64.zip` ou `Qwen-Code-Desktop-x64.zip`.
2. `desktop-latest.json` aponta clientes Tauri para os arquivos de atualizador
   assinados do Tauri.

O ZIP é criado a partir do `.app` já assinado e notarizado; ele não é reconstruído
pelo ferramental do Electron.

## Fluxo de release

`Desktop Release` ganha uma entrada `electron_bridge`, desabilitada por padrão.

- Todos os builds macOS continuam a produzir o app Tauri, DMG, arquivo de
  atualizador e assinatura de atualizador.
- Quando `electron_bridge` está habilitado, cada build macOS também cria um ZIP
  compatível com legado.
- O job de publicação gera `latest-mac.yml` a partir dos dois ZIPs e dois DMGs.
- Um release estável da ponte envia os metadados e payloads legados para
  `desktop-latest` junto com `desktop-latest.json`.
- Releases estáveis posteriores deixam `electron_bridge` desabilitado. Atualizar
  `desktop-latest.json` não remove os arquivos da ponte, então instalações Electron
  que retornarem posteriormente ainda podem migrar para o Tauri.

Execuções de rascunho e pré-release podem construir e publicar artefatos da ponte
para inspeção, mas nunca atualizam o feed estável.

## Credenciais de assinatura

O repositório já armazena o certificado Apple da era Electron e a chave de API do
App Store Connect sob os nomes de secret `MAC_CSC_*` e `APPLE_NOTARY_*`. O
workflow aceita esses nomes como fallbacks para os nomes mais novos do Tauri, de
modo que a identidade Developer ID permanece inalterada.

Artefatos de atualizador do Tauri adicionalmente exigem
`TAURI_SIGNING_PRIVATE_KEY`; `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` é necessária
apenas para uma chave privada criptografada. A chave privada deve corresponder à
chave pública na configuração do Tauri antes do primeiro release Tauri publicado.

## Validação

Testes automatizados do release-helper verificam:

- a identidade legada do aplicativo,
- seleção exata de artefatos da ponte,
- valores de SHA-512 e tamanho em `latest-mac.yml`,
- falha quando um artefato da ponte obrigatório está ausente,
- comportamento existente de manifesto do atualizador Tauri e sincronização de
  versão.

Antes do release estável, instale os builds arm64 e x64 assinados do
`desktop-v0.0.5`, aponte-os para um feed de ponte isolado e verifique ambas as
atualizações `0.0.5 -> ponte Tauri` e `ponte Tauri -> Tauri mais novo`.

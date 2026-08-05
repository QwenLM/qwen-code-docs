# Addon nativo de clipboard standalone

## Problema

O bundle do CLI mantém `@teddyzhu/clipboard` como externo para que
instalações npm possam carregar o pacote nativo específico da plataforma em
runtime. Arquivos standalone também mantêm a importação externa, mas
atualmente copiam apenas o addon nativo de captura de áudio para
`lib/node_modules`. A colagem de imagem do clipboard portanto falha
silenciosamente em todo arquivo standalone.

## Restrições

- Cada arquivo deve conter o pacote JavaScript `@teddyzhu/clipboard` e
  exatamente um pacote nativo correspondente ao alvo do arquivo.
- O job de release cria todos os alvos suportados em um único runner Ubuntu.
  Um `npm ci` normal instala apenas o pacote nativo opcional do runner, então
  o empacotamento não pode depender do `node_modules` do repositório para
  artefatos entre alvos.
- As versões dos pacotes de clipboard devem vir do lockfile e permanecer
  alinhadas com as dependências opcionais do CLI.
- O empacotamento local deve continuar funcionando quando um artefato de
  clipboard que não seja do host está indisponível, enquanto o empacotamento
  de release deve falhar em vez de publicar um arquivo parcialmente funcional.

## Design

Antes de construir os arquivos de release, instalar o meta pacote de
clipboard travado no lockfile e todos os pacotes de alvo suportados em um
diretório de staging temporário. Passar esse diretório explicitamente ao
comando de empacotamento por alvo.

O empacotador standalone mapeia cada alvo para seu pacote nativo de clipboard
e copia apenas o meta pacote mais esse pacote de alvo para
`lib/node_modules/@teddyzhu`. Quando nenhum diretório de staging explícito é
fornecido, o empacotador usa o `node_modules` do repositório; um artefato do
host ausente emite um aviso para builds locais. Artefatos ausentes em um
diretório de staging explícito são fatais.

Se o módulo de runtime ainda não puder ser carregado, o prompt de entrada
reporta um único erro visível ao usuário na primeira tentativa de colagem de
imagem do clipboard. Os caminhos existentes de `wl-paste` e `xclip` no Linux
permanecem inalterados.

## Verificação

- Testes de empacotamento cobrem seleção de alvo, exclusão de outros alvos
  nativos e falha para staging explícito incompleto.
- Testes de clipboard e do prompt de entrada cobrem o callback de módulo
  indisponível e o erro único de UI.
- Um arquivo macOS arm64 real é descompactado fora do repositório, carregado
  com seu runtime Node.js embutido e exercitado contra um PNG real no
  clipboard do sistema.

![Colagem de clipboard standalone antes e depois](./standalone-clipboard-native-addon/assets/before-after.png)

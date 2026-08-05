# Proteção de Memória Gerenciada Fixada

## Problema

A memória automática gerenciada descobre recursivamente tópicos markdown
válidos abaixo das raízes de memória do projeto e do usuário, sujeita aos
limites existentes de índice. Agentes de extração automática e de
consolidação Dream podem escrever ou editar caminhos dentro de suas raízes de
memória permitidas, então um arquivo curado manualmente pode ser sobrescrito
ou consolidado como uma memória gerada automaticamente.

O scanner recursivo já descobre arquivos válidos abaixo de `pinned/`; o
comportamento faltante é proteção determinística contra mutação durante a
manutenção automatizada de memória.

## Design escolhido

Tratar um diretório `pinned/` de nível superior dentro de uma raiz de memória
gerenciada como protegido contra mutação por extração automática e excluído da
consolidação Dream:

- Manter documentos fixados válidos legíveis para o recall de memória normal e
  descobríveis pelo indexador existente sob seus limites normais.
- Negar operações `write_file` e `edit` da extração automática e do Dream
  bifurcado quando o caminho requisitado estiver lexicalmente abaixo de
  `pinned/`.
- Comparar o nome do diretório reservado de nível superior sem diferenciar
  maiúsculas/minúsculas para que a deny-list não possa falhar de forma aberta
  em sistemas de arquivos case-insensitive.
- Negar também aliases que resolvam através de symlink para dentro de
  `pinned/`.
- Manter o gate de shell somente leitura existente, que já rejeita `rm` e todo
  outro comando de shell que muta.
- Ensinar os prompts de extração automática e do Dream a deixar documentos
  fixados inalterados e evitar remover intencionalmente suas entradas de
  índice existentes, sujeitos aos limites normais de índice.

A verificação de caminho compara tanto caminhos literais quanto resolvidos sem
diferenciar maiúsculas/minúsculas. Contenção literal protege `pinned/` mesmo
quando esse diretório é ele próprio um symlink. Contenção resolvida impede que
um caminho aparentemente gravável em outra parte da memória aponte via symlink
de volta para dentro de `pinned/`.

A proteção é uma opção explícita na configuração existente do agente com
escopo de memória e é habilitada pelos planejadores de extração automática e
do Dream bifurcado. Isso cobre extração pós-sessão, Dream agendado e
chamadores do endpoint de Dream da memória do workspace. Operações explícitas
de lembrar retêm seu comportamento atual.

## Limites de escopo

- Nenhuma mudança de produção no scanner ou indexador: a descoberta recursiva
  já trata documentos `pinned/` de projeto e de usuário com o schema de
  frontmatter existente.
- Nenhum novo campo de frontmatter e nenhuma criação automática do diretório.
- Nenhum indicador na UI de `/memory`.
- Requisições explícitas de `/forget` mantêm seu comportamento atual.
- Este limite baseado em caminho não detecta aliases de hard-link
  pré-existentes para arquivos fixados. Trabalhadores de memória automáticos
  não podem criá-los com `write_file` ou `edit`, e sua política de shell
  somente leitura bloqueia `ln`; um modelo de ameaça mais forte exigiria uma
  política separada baseada em inode.
- O turno visível do comando slash `/dream` recebe a regra compartilhada de
  prompt de pular, mas não ganha um gate determinístico de ferramenta nesta
  mudança. O comando slash executa no Agente principal, que não tem override
  de permissão por turno existente; adicionar um seria um design de permissão
  separado entre superfícies.
- O Dream bifurcado permanece apenas com memória de projeto porque sua
  configuração com escopo existente exclui a raiz global de memória do
  usuário.
- A extração automática continua cobrindo ambas as raízes de memória de
  projeto e global do usuário, então ambos os diretórios `pinned/` de nível
  superior recebem a mesma proteção.

## Arquivos afetados

- `packages/core/src/memory/paths.ts`
- `packages/core/src/memory/memory-scoped-agent-config.ts`
- `packages/core/src/memory/dreamAgentPlanner.ts`
- `packages/core/src/memory/extractionAgentPlanner.ts`
- Testes colocalizados de permissão, prompt e índice de memória
- `docs/users/features/memory.md`

## Questão em aberto

Se o comando slash `/dream` visível deve receber o mesmo gate determinístico
permanece uma decisão de escopo dos mantenedores. Se necessário, deve ser
implementado como um override geral de permissão por turno em vez de mutar o
gerenciador de permissões no escopo da sessão em torno de um loop de
ferramenta assíncrono.

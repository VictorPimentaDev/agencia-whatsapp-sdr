# Integração Supabase local

**English:** `npm run test:supabase` exercises real local Auth/PostgREST, migrations,
RLS and the application's CRM/webhook handlers with synthetic tenants. It creates
and removes its own disposable project. No hosted project or WhatsApp delivery is
used. The first local run is **BLOCKED**, not passed: Docker is not running.

## Execução repetível

Pré-requisitos: Node 22+, `npm ci`, Docker local em execução e Supabase CLI no PATH.
A implementação foi preparada com CLI **2.111.0**; a stack ainda não foi iniciada
neste ambiente. O primeiro start precisa baixar imagens e ter recursos suficientes
para PostgreSQL, Auth, PostgREST e Kong. Não é necessário login no Supabase nem
arquivo `.env.local`.

```sh
npm ci
npm run test:supabase
```

O comando faz o seguinte:

1. Confirma que o Docker selecionado usa um socket Unix local e está disponível.
   Contextos SSH/TCP são recusados. Não troca o contexto global nem inicia o Docker.
2. Cria uma pasta temporária e um `project_id` exclusivo `agency-integration-<uuid>`.
   Copia as migrations e o seed existentes, sem copiar arquivos ocultos de vínculo
   com projetos. Escolhe três portas livres para API, banco e shadow database.
3. Executa `supabase start --workdir <temporário>` apenas com os serviços necessários.
   As migrations e o seed rodam no banco novo. Nenhum `link`, `db push`, `db reset`
   ou comando remoto é usado.
4. Obtém as chaves locais com `supabase status -o json` em memória, sem imprimi-las.
   Verifica que a URL retornada coincide com a porta local recém-escolhida.
5. Executa as assertions com credenciais exclusivamente desse projeto. Cada sessão
   usa um JWT emitido pelo Auth real; as consultas/RPCs passam pelo PostgREST real.
6. Apaga os usuários sintéticos e executa `supabase stop --project-id <id próprio>
   --no-backup --workdir <temporário>`. Remove apenas a pasta/volumes desta execução.

O ambiente do subprocesso não herda credenciais Supabase/WhatsApp, configurações de
modelo nem `NODE_OPTIONS`. O transporte permite apenas a origem local criada pelo
harness, recusa redirects e usa timeout. Os telefones têm prefixo fictício `550000`,
bloqueado pelo adaptador. Não há tentativa de entrega: ações `send` são usadas apenas
para provar rejeição de opt-out e de envio pendente. O registro de envio incerto é
uma fixture inserida no banco; não representa uma mensagem entregue.

## Assertions da stack real

A suíte possui oito grupos sequenciais com falha imediata:

- Login por senha da conta do seed e de dois usuários `@example.test` criados via
  Auth Admin local, sem envio de email; rejeição de acesso sem token/token inválido.
- Webhook Cloud assinado, rejeição de assinatura inválida, cinco entregas concorrentes
  do mesmo evento e isolamento de dedupe entre tenants com mesmo telefone/event ID.
- RLS em consultas PostgREST **sem filtro de owner**, bloqueio de alteração de outro
  tenant, transferência de owner, inserts/deletes diretos e acesso ao ledger;
  autorização dos RPCs de ingestão, conclusão de envio e apagamento.
- Consentimento, rascunho offline persistido, handoff humano bloqueando rascunhos e
  revisão antiga impedindo reativação da IA.
- Webhook Evolution autenticado e solicitação recebida de atendimento humano.
- Envio incerto persistido por RPC, bloqueio de retry e reconciliação pelo operador
  preservando handoff, sem chamada a provedor.
- Duas ações concorrentes sobre a mesma revisão: exatamente uma vence; STOP atrasado
  preserva a janela temporal, bloqueia send/draft/resume e permanece após novo inbound.
- Apagamento com revisão válida, desvinculação de eventos, replay sem ressurreição e
  preservação do segundo tenant.

Os handlers Next são invocados em processo com `Request`/`Response`; Auth, PostgREST
e PostgreSQL usam serviços reais via HTTP. Não há mocks de Auth ou banco nesta suíte.
Ela não é um teste de navegador conectado ao Supabase nem verifica o roteamento HTTP
completo do servidor Next. Os testes Playwright existentes continuam separados e
mantêm seus contratos controlados de sessão/HTTP.

## Resultado registrado em 2026-11-06

**BLOCKED — zero grupos live executados.** Node 24.14.1, CLI 2.111.0, contexto Docker
`default`. `docker info` retornou:

```text
failed to connect to the docker API at unix:///var/run/docker.sock; check if the path is correct and if the daemon is running: dial unix /var/run/docker.sock: connect: no such file or directory
```

`npm run test:supabase` saiu com código **1**:

```text
BLOCKED: Docker daemon unavailable at unix:///var/run/docker.sock. Start the local engine and rerun; no live assertions ran.
```

Isso acontece antes de criar projeto, containers ou usuários. Os testes de proteção
do harness passam no `npm test`, mas não substituem a execução live. Não foi
reproduzido defeito da aplicação que justificasse alterar código de produção ou SQL.
A lacuna de verificação live do READY permanece aberta até esta suíte passar.

## Diagnóstico e limpeza

Se faltar CLI, Docker, recurso, imagem ou porta, o comando retorna erro; não marca
skip como sucesso. Há um intervalo curto entre escolher portas livres e iniciar os
containers: outro processo pode ocupá-las. Nesse caso, execute novamente para obter
outras portas. Falhas de start também podem indicar migration/seed inválidos e precisam
ser investigadas; não significam automaticamente falta de Docker.

A saída do CLI no start fica suprimida porque pode conter chaves. Para diagnosticar
uma falha posterior ao preflight, execute a stack descartável em um ambiente local
com logs privados e revise-os antes de compartilhar. Não use credenciais hospedadas
nem reset de um projeto existente para contornar uma falha.

SIGINT/SIGTERM acionam a limpeza; SIGKILL, queda de energia ou daemon que para durante
a execução podem deixar recursos. O harness imprime seu project ID antes do start.
Se a limpeza falhar, imprime o comando exato e preserva a configuração temporária.
Use **somente esse ID** em `supabase stop --project-id <id próprio> --no-backup`.
Nunca use `--all` ou `docker system prune` como limpeza desta suíte.

A CI existente executa as proteções unitárias do harness e os gates anteriores.
A execução live é explícita; não foi adicionada uma instalação de stack a todos os
pushes. Documentação oficial: [CLI local](https://supabase.com/docs/guides/local-development/cli/getting-started)
e [projetos locais em paralelo](https://supabase.com/docs/guides/local-development/running-multiple-local-projects).

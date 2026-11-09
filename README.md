# LEDGER

Sistema web de controle financeiro pessoal, familiar e empresarial — local-first (funciona
inteiramente offline em IndexedDB), com sincronização opcional via Firebase/Firestore, pensado
para publicação estática (GitHub Pages).

## Status atual

**Etapas 2 a 5 concluídas.** Etapa 2: estrutura do projeto, layout/navegação responsiva (menu
lateral fixo à esquerda em qualquer largura de tela), roteamento por hash, IndexedDB com o schema
inicial de todas as coleções, internacionalização (pt-BR/en-US) e criação automática do primeiro
espaço financeiro local com as categorias padrão. Etapa 3: cadastro completo de **contas** (com
saldo sempre recalculado a partir dos lançamentos, nunca editado manualmente), **categorias**
(hierarquia pai/filho, arquivar, exclusão com reclassificação quando há lançamentos vinculados),
**cartões de crédito** e **transferências entre contas** (gera os dois lançamentos ligados, nunca
contabilizados como receita/despesa). Etapa 4: **lançamentos** de receita/despesa avulsos,
**parcelados** (com ajuste de centavos na última parcela) e **recorrentes** (semanal/mensal/anual,
geração automática para os próximos 12 meses, pausar/retomar/encerrar série), edição e exclusão
com as três granularidades (somente este / este e os próximos / todos), preservando por padrão
lançamentos já pagos/recebidos (com confirmação explícita para sobrepor), e filtros combináveis
(período, tipo, conta, categoria, status, texto, valor, ordenação). Etapa 5: **compras no cartão**
(avulsas, parceladas ou recorrentes, cada ocorrência vinculada à fatura correta pela regra de
fechamento do cartão), tela de **Faturas** por cartão (aberta/fechada/paga, total recalculado a
partir das compras, drill-down das compras de cada fatura) e **pagamento de fatura** (gera uma
única liquidação — nunca uma despesa duplicada — e marca as compras da fatura como pagas, o que as
protege automaticamente de edição/exclusão sem confirmação explícita). **Cartões** agora mostram
limite utilizado/disponível, recalculados a partir das faturas em aberto. A aplicação roda em modo
`local`, sem exigir Firebase ou login.

Etapa 6: **Dashboard** completo — indicadores reais (saldo total, receitas/despesas/resultado do
período, limite utilizado/disponível somado de todos os cartões, faturas pendentes, próximos
vencimentos) e os 6 gráficos pedidos (receitas vs despesas, despesas por categoria, evolução
mensal, comparação com o mês anterior, distribuição dos saldos por conta, distribuição dos gastos
por cartão), com um seletor de mês. **Relatórios**: filtros combináveis (mês, tipo, conta, cartão,
categoria) e as tabelas pedidas (receitas/despesas por categoria, despesas por subcategoria,
comparativo mensal de 12 meses, comparativo anual, maiores despesas, gastos por conta, gastos por
cartão, histórico de movimentações), com exportação em **CSV** e um botão **Imprimir / PDF** (usa
a função de impressão do navegador, que permite salvar como PDF — não gera um `.xlsx`/`.pdf` de
verdade, o que exigiria uma biblioteca adicional).

Compartilhamento (múltiplos espaços/participantes) ainda não está implementado — a tela de
Configurações indica em qual etapa chega.

### Melhorias de usabilidade

Melhorias de usabilidade aplicadas ao LEDGER:

- **Saldo confirmado vs. previsto**: o saldo das contas (e do Dashboard) agora distingue o que já
  foi pago/recebido do que ainda está pendente, em vez de misturar os dois em um único número.
- **Limite de gastos**: orçamento mensal por categoria, com barra de progresso e aviso ao
  aproximar-se do limite (tela nova, acessível pelo menu).
- **Painel**: saudação e botões rápidos de Nova despesa/receita/transferência logo no topo.
- **Menu lateral agrupado**: telas de uso frequente (Painel, Lançamentos, Transferências,
  Faturas, Limite de gastos, Relatórios) separadas das telas de cadastro/configuração (Contas,
  Cartões, Categorias, Configurações) — continua fixo à esquerda em qualquer largura de tela.
- **Lançamentos em lista agrupada por data** (com rótulo "Hoje"), no lugar da tabela crua —
  cada lançamento mostra um ícone colorido, categoria/conta/status como subtítulo, e um botão de
  marcar como pago/recebido direto na linha, sem precisar abrir o formulário.
- **Criar/editar lançamento em modal** (sobreposto, fecha com Esc ou clicando fora) em vez de
  empurrar a lista para baixo.
- **Atalhos de teclado** `D`/`R`/`T` para nova despesa/receita/transferência, quando o foco não
  está em um campo de formulário.

Os ícones de bancos/cartões ficam em `assets/icons/institutions/` e servem só para a
lista de instituições, não para a identidade visual do app; os badges de categoria usam, por
enquanto, a inicial da categoria sobre uma cor gerada a partir do nome.

### Gráficos exigem internet

Os gráficos do Dashboard usam **Chart.js via CDN** (`cdnjs.cloudflare.com`) — isso é a única
dependência externa do projeto e só é baixada quando a página carrega com acesso à internet. Sem
conexão, os indicadores e tabelas continuam funcionando normalmente; apenas os gráficos ficam em
branco (nenhum erro é lançado). Isso foi verificado neste ambiente de desenvolvimento, cujo
navegador de teste bloqueia domínios externos — por isso os gráficos em si não puderam ser
verificados visualmente aqui, só a dependência de rede e o fallback. Teste em um navegador comum
para confirmar a renderização visual dos 6 gráficos.

### Simplificações deliberadas da Etapa 5

- Mudar o dia de fechamento/vencimento de um cartão não reprocessa faturas já existentes — só
  afeta compras novas a partir da mudança.
- A forma de pagamento (conta ou cartão) de um lançamento é definida na criação e não pode ser
  trocada depois, para não ter que reprocessar faturas/saldo de uma transação já existente.
- A "proteção especial" de faturas pagas (seção 6) é implementada reaproveitando o mesmo mecanismo
  de preservação de lançamentos pagos/recebidos (seção 11): editar/excluir uma compra de fatura
  paga pede confirmação explícita, em vez de ficar bloqueado ou ter um fluxo próprio.

## Como rodar localmente

A aplicação usa ES Modules nativos, que exigem `http(s)://` (não funcionam abrindo o
`index.html` direto via `file://`). Use o servidor estático de desenvolvimento incluído:

```bash
npm start
```

Isso sobe um servidor em `http://localhost:5173` (sem dependências externas, só Node.js).

## Como rodar os testes

```bash
npm test
```

Roda os testes de unidade (Node test runner nativo) para utilitários e regras de negócio puras
(moeda, datas, ids, internacionalização). Testes de regras financeiras mais específicas (saldo,
parcelamento, fatura, recorrência) são adicionados a partir da Etapa 3, conforme cada regra é
implementada.

## Internacionalização

A interface suporta **pt-BR** e **en-US** (`js/core/i18n.js` + `js/locales/`). O idioma é
detectado automaticamente pelo navegador na primeira visita e pode ser trocado a qualquer momento
pelo seletor no cabeçalho; a preferência fica salva no `localStorage` do dispositivo. Categorias
padrão são semeadas traduzidas no idioma vigente no momento da criação do espaço e, depois disso,
são texto comum editável pelo usuário (não são retraduzidas ao trocar o idioma da interface).

## Configuração do Firebase (opcional)

Ainda não implementado — chega na Etapa 8. Até lá, o sistema funciona inteiramente local, o que é
uma condição normal de funcionamento, não um estado incompleto. Quando implementado, a configuração
ficará disponível na tela de Configurações, com migração dos dados locais sob confirmação explícita
(nunca sobrescrevendo dados remotos automaticamente).

## Roteiro de implementação

1. ✅ Etapa 1 — Diagnóstico e arquitetura
2. ✅ Etapa 2 — Estrutura inicial, layout, router, IndexedDB, modo local, i18n
3. ✅ Etapa 3 — Cadastros: contas, categorias, cartões, transferências
4. ✅ Etapa 4 — Lançamentos: receitas, despesas, parcelamento, recorrência, filtros
5. ✅ Etapa 5 — Cartões e faturas: fechamento, pagamento, limite utilizado/disponível
6. ✅ Etapa 6 — Dashboard e relatórios (gráficos, exportação CSV/impressão)
7. ⬜ Etapa 7 — Compartilhamento e permissões (papéis)
8. ⬜ Etapa 8 — Integração Firebase opcional (sincronização, migração)
9. ⬜ Etapa 9 — PWA e publicação no GitHub Pages

## Estrutura do projeto

```
index.html
assets/icons/   ícones de instituições financeiras (ver nota acima)
css/            estilos (main, layout, components, responsive)
js/
  app.js        ponto de entrada
  core/         database (IndexedDB), router, i18n, app-state, auth, permissions, sync, bootstrap
  locales/      dicionários pt-BR e en-US
  modules/      uma pasta por tela (dashboard, accounts, transactions, budgets, ...)
  services/     repositórios (accounts, categories, creditCards, transfers, transactions, invoices, analytics, budgets) — regras de negócio
  utils/        ids, currency, dates, validation, html, observable, recurrence, csv
tools/          servidor estático de desenvolvimento
tests/          testes de unidade (node --test)
```

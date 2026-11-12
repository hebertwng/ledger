# LEDGER

Sistema web de controle financeiro pessoal, familiar e empresarial — local-first (funciona
inteiramente offline em IndexedDB), com sincronização opcional via Firebase/Firestore, pensado
para publicação estática (GitHub Pages).

## Status atual

**Etapas 1 a 6 concluídas.** Etapa 2: estrutura do projeto, layout/navegação responsiva (menu
lateral fixo à esquerda em qualquer largura de tela), roteamento por hash, IndexedDB com o schema
inicial de todas as coleções, internacionalização (pt-BR/en-US) e criação automática do primeiro
espaço financeiro local com as categorias padrão. Etapa 3: cadastro completo de **contas** (com
saldo sempre recalculado a partir dos lançamentos, nunca editado manualmente), **categorias**
(hierarquia pai/filho, arquivar, exclusão com reclassificação quando há lançamentos vinculados),
**cartões de crédito** e **transferências entre contas** (gera os dois lançamentos ligados, nunca
contabilizados como receita/despesa). Etapa 4: **lançamentos** de receita/despesa avulsos,
**parcelados** (com ajuste de centavos na última parcela) e **recorrentes** (semanal/mensal/anual,
geradas sob demanda conforme os meses são visualizados, pausar/retomar/encerrar série), edição e exclusão
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
vencimentos), com um seletor de mês. **Relatórios** em abas (ver "Relatórios" abaixo), com
exportação em **CSV** e um botão **Imprimir / PDF** (usa a função de impressão do navegador, que
permite salvar como PDF — não gera um `.xlsx`/`.pdf` de verdade, o que exigiria uma biblioteca
adicional).

Compartilhamento (múltiplos espaços/participantes) ainda não está implementado — a tela de
Configurações indica em qual etapa chega.

### Leiaute

- **Identidade visual própria** (`css/brand.css`): azul do logotipo com degradê azul→violeta nos
  destaques, fonte Manrope, receitas em verde e despesas em vermelho, cartões brancos com sombra
  suave sobre fundo frio.
- **Menu lateral escuro** à esquerda, de altura total, sempre lateral em qualquer largura:
  uso frequente (Visão geral, Lançamentos, Relatórios, Limite de gastos, Transferências, Faturas)
  separado dos cadastros (Contas, Cartões, Categorias, Configurações). Mostra quantas contas e
  cartões ativos existem, pode ser recolhido para só ícones (a escolha fica salva) e, no rodapé,
  traz o espaço ativo, o modo (local/online) e o seletor de idioma. Em telas estreitas vira uma
  faixa de ícones.
- **Cada tela é um cartão**; a Visão geral é uma grade de painéis recolhíveis, com o resumo do mês
  num cartão em degradê.
- **Animações** (`css/motion.css`): entrada suave ao trocar de tela com itens em cascata, barras
  que crescem, valores da Visão geral que contam até o total, botões que reagem ao toque, joinha
  que "pula" ao marcar pago, janelas que abrem e fecham com efeito de mola (no celular sobem da
  base) e troca gradual de tema. Tudo é desligado quando o sistema pede movimento reduzido.
- **Modo escuro**: em Configurações → Aparência (Claro, Escuro ou Automático, que segue o sistema operacional). Todas as
  cores são variáveis CSS em `css/main.css` (`--color-primary` define a cor de destaque).
- **Responsivo**: no celular, os formulários abrem como painel de tela cheia e as listas ficam
  enxutas (ícone, descrição, valor e situação).
- **Ações de linha** (editar, excluir, arquivar, pausar/retomar série…) são botões com ícone.
- **Seletores**: todo `<select>` (idioma, filtros, formulários) ganha automaticamente o mesmo
  visual do seletor de categorias, sem busca (`js/utils/selectEnhancer.js`; o select original fica
  escondido e continua sendo a fonte do valor). No seletor de categoria, a busca é digitada no
  próprio campo ao abrir — ou já digitando com ele focado.
- **Campos de valor** com máscara monetária: os dígitos entram pela direita (`1` → `0,01`,
  `150000` → `1.500,00`). **Campos de data** (dia e mês) continuam digitáveis e, ao clicar, abrem um calendário próprio no estilo dos seletores (`js/utils/datePicker.js`; Alt+↓ abre pelo teclado).

### Ledi, o personagem

**Ledi** (nome neutro, com visual masculino ou feminino) acompanha o uso do sistema. O desenho e as
16 animações vêm do projeto Personagens (`js/vendor/personagem.js`, cópia de
`Projetos/Personagens/personagem.js`); a integração fica em `js/core/mascot.js` e `css/mascot.css`.

- **Primeiro acesso**: Ledi se apresenta e a pessoa escolhe o visual (pode trocar depois em
  Configurações ou no painel do próprio Ledi).
- **Nível = saúde financeira do mês corrente** (`js/services/financialHealth.js`, com testes):
  pontuação de 0 a 100 somando quatro fatores proporcionais —
  **sobra do mês** até 40 (de −20% a 30% do que entrou, contando pendentes),
  **reserva** até 30 (quantos meses de despesa média dos últimos 3 meses o *saldo previsto* cobre;
  3 meses = máximo), **contas em dia** até 15 (−5 por conta/fatura atrasada) e **limites de gastos**
  até 15 (dentro = 1, perto = 0,5, estourado = 0; sem limites = 10). Níveis: 0–19 Crítico · 20–39
  Baixo · 40–59 Equilibrado · 60–79 Confortável · 80+ Excelente (a interface mostra só o nome do estado, sem número). Saldo previsto negativo:
  Baixo se a dívida for de até 50% das despesas de um mês; acima disso, Crítico.
  **Tudo pelo previsto**: o nível usa sempre os valores previstos (com lançamentos pendentes) — o
  saldo confirmado não entra no cálculo. O painel de Ledi mostra a pontuação de cada fator e
  uma dica sobre o mais fraco. Ao subir, Ledi "sobe de nível" com troca de roupa e confete; ao
  cair, avisa.
- **Todas as mensagens são falas de Ledi**: erros de formulário, avisos das telas e `alert()` viram
  balões de Ledi (capturados automaticamente em `js/core/mascot.js`, sem mexer em cada tela); o
  texto em linha some enquanto Ledi está ligada. O balão nasce colado à direita da imagem dela, na
  altura do rosto (nunca a cobre) e aparece por cima até de janelas abertas; clicar dispensa.
  Confirmações que exigem resposta (excluir, encerrar série) abrem uma **janela de confirmação do
  próprio app** (`confirmDialog` em `js/utils/ui.js`), no lugar do `confirm()` do navegador — que
  alguns navegadores, como o embutido do app, bloqueiam. Esc cancela, Enter confirma.
  **Com Ledi desligada**, as mesmas mensagens viram avisos no padrão do app (`js/utils/notify.js`):
  sempre no topo da janela do navegador, no mesmo lugar (inclusive erros de formulário, por cima da janela aberta) — verde
  para confirmação (ex.: "Despesa salva."), amarelo/laranja para alerta e vermelho para erro. Avisos
  fixos das telas (ex.: "cadastre uma conta antes") ficam no lugar, no estilo de alerta.
- **Seu nome**: em Configurações → Seu perfil. Sem nome, a interface não mostra nome nenhum (o
  "Pessoal" padrão fica oculto); com nome, aparece na saudação, no menu e na saudação de Ledi.
  Quando houver login com Google, o campo `ownerName` do espaço poderá vir de lá.
- **Sempre atualizado**: toda gravação passa por `js/core/database.js`, que avisa quando os dados
  mudam (`onDataChange`); Ledi recalcula a cada mudança de saldo, previsto, lançamento, limite ou
  fatura — inclusive edições, exclusões e alterações de conta.
- **Reações aos eventos**: despesa → aprovando; despesa a partir do *valor alto* (padrão R$ 1.000,
  ajustável) → mãos na cabeça; despesa que estoura um limite de gastos → bolsos vazios; receita →
  dinheiro entrando; transferência para poupança/investimento → cofrinho; marcar pago / pagar fatura
  → comemora (todas as contas do mês pagas → festa maior); erro → coça a cabeça; lista vazia → dá de
  ombros; cópia de segurança → cofrinho.
- **Ao abrir**: acena com a saudação; se há conta vencendo hoje ou atrasada, olha o relógio.
- **Onde aparece**: só no menu lateral, ocupando o espaço livre abaixo dos itens, com o balão de
  fala no alto do quadro. Com o menu recolhido (ou em telas estreitas) mostra só o rosto, ainda
  animado, e o balão sai para a direita do menu. Um clique em Ledi abre, ao lado do menu, o painel
  de saúde financeira (nível, motivos, dica e troca de visual). Parado, os olhos seguem o cursor;
  sem interação, fica no celular.
- Tudo respeita *movimento reduzido* e pode ser desligado em **Configurações → Ledi**.

### Visão geral

Saudação com o período e navegação por mês; resumo de receitas/despesas do mês (com botão para
ocultar valores) e atalhos de Despesa, Receita, Transferência e "+"; painéis recolhíveis de
**Maiores gastos** (rosca + top 5 categorias com %), **Despesas a pagar** e **Receitas a
receber**, **Minhas contas** (saldo confirmado e previsto), **Meus cartões** (fatura do mês e limite
disponível) e **Limite de gastos**.

### Lançamentos

- Lançamentos podem ter **valor zerado** (só valores negativos são recusados).
- Barra com o botão **+ Lançamento** (Nova despesa / receita / transferência, também pelos atalhos
  `D`/`R`/`T`), navegação por mês (‹ › ou setas do teclado) e filtros em linha: **Origem** (contas
  e cartões), **Tipo**, **Categorias** (uma categoria principal inclui as subcategorias),
  **Situação** e busca; valor mínimo/máximo e ordenação ficam em "mais filtros".
- Lista agrupada por dia ("Hoje"), com ícone da categoria, descrição, indicação de fixo/parcelado,
  conta ou cartão (com o logo da instituição), valor e o **joinha** de pago/pendente (verde = pago,
  cinza = pendente; o clique alterna). Rodapé com receitas, despesas, saldo e previsto do mês.
- **Formulário em janela**, compacto: abas Despesa/Receita/Transferência, descrição, valor e data,
  chave **Lançamento pago/recebido** (sugere "não pago" para datas futuras), campo único
  **Conta/Cartão** e **categoria com busca, filtrada pelo tipo** (despesa ou receita), com as
  subcategorias abaixo da principal. A **repetição** fica recolhida no fim: **Lançamento fixo**
  (semanal/mensal/anual, com data final opcional) ou **Lançamento parcelado** (com a prévia
  "Serão lançadas N parcelas de R$ X"). Botões Limpar, Salvar e **Salvar e criar outro**.
  O rascunho é preservado ao trocar tipo, repetição ou conta.

### Categorias, contas e cartões

- **Categorias** em abas Despesas/Receitas; o cadastro escolhe **ícone e cor** (subcategorias
  herdam os da principal) e cria subcategoria direto na linha. As categorias padrão já vêm com
  ícone e cor; espaços criados antes disso recebem os ícones uma única vez, sem mexer em
  categorias personalizadas. Arquivadas ficam numa seção à parte.
- **Contas** e **cartões** em lista com o **logo da instituição** (escolhido no cadastro, entre os
  24 de `assets/icons/institutions/`), saldo confirmado/previsto ou limite disponível, e seção de
  arquivados. Cadastros abrem em janela.

### Investimentos

Menu próprio para o dinheiro aplicado em instituições, **à parte dos lançamentos**: investimentos
ficam em coleções separadas (`investments` e `investmentEntries`, banco versão 3) e **não entram**
nas receitas/despesas do mês, nos saldos das contas, nos relatórios de lançamentos nem na saúde
financeira de Ledi. Entram na cópia de segurança e em "Apagar todos os dados"; "Apagar
movimentações" não os apaga.

- **Carteira**: valor atual, total aplicado, rendimento total (R$ e %) e rendimento do mês; cada
  investimento com instituição (logo), tipo e ações de **aporte**, **resgate** e **atualizar valor**
  (o saldo informado pela instituição — a diferença vira rendimento). Gráfico de distribuição.
  Clicar num investimento abre o histórico de movimentações (com exclusão), editar, arquivar e
  excluir. Resgate maior que o valor disponível na data é recusado.
- **Evolução** (também como aba **Investimentos** em Relatórios): período de 6, 12 ou 24 meses,
  tudo, ou personalizado (de/até); filtro por investimento; indicadores do período (valor no início
  e no fim, aportes − resgates, rendimento R$ e %); gráfico **valor × total aplicado** e gráfico de
  **rendimento por mês**; tabela mês a mês exportável em CSV.
- Rendimento do mês = valor no fim − valor no início − aportes + resgates; o percentual é sobre o
  que estava aplicado no mês (valor inicial + aportes). Cálculos em
  `js/services/investmentAnalytics.js` (com testes).
- Ledi reage: aporte → cofrinho; atualização com ganho → "Rendeu R$ X!"; com perda → pensativa.

### Relatórios

Navegação por mês, filtro de origem (conta ou cartão) e opção **Considerar não pagas**, em abas:

- **Categorias**: despesas ou receitas em **rosca ou barras**, ranking com valor, % e barra de
  proporção; cada categoria abre as subcategorias — também clicando na fatia/barra do gráfico (a
  fatia aberta fica destacada; sem subcategorias, Ledi avisa). Exporta CSV.
- **Entradas × Saídas**: indicadores do mês e de 12 meses, gráfico de barras (receitas e despesas)
  com a linha do **saldo acumulado**, e tabela mês a mês.
- **Contas e cartões**: gastos do mês por conta e por cartão.
- **Movimentações**: maiores despesas e histórico do mês, com exportação CSV.

### Parcelas e recorrências geradas sob demanda

Ao criar um lançamento parcelado ou recorrente (semanal, mensal ou anual), só as ocorrências até o
fim do mês atual (ou do mês da primeira ocorrência, se ela for futura) são gravadas. As demais
passam a existir quando o mês delas é visualizado — na navegação ‹ mês › da tela de Lançamentos,
da Visão geral ou dos Relatórios — e o mês corrente é sempre completado ao abrir o app. A série
guarda um molde (`template`) com tipo, descrição, valor, categoria e conta/cartão; editar "este e
os próximos"/"todos" atualiza também o molde, e excluir "este e os próximos"/"todos" encerra a
série, para que nada volte a ser gerado. Uma parcela excluída individualmente nunca é recriada.
Parcelas de cartão ainda não geradas continuam contando no **limite utilizado** do cartão desde a
compra.

### Cópia de segurança e zerar dados

Em **Configurações → Seus dados**, já que tudo fica salvo só no navegador:

- **Baixar cópia de segurança**: arquivo `ledger-copia-AAAA-MM-DD.json` com todas as coleções.
- **Restaurar cópia**: valida o arquivo, mostra a data e o que ele contém (contas, cartões,
  categorias, lançamentos) e só substitui os dados atuais depois da confirmação.
- **Apagar movimentações**: apaga lançamentos, parcelas, recorrências, transferências e faturas;
  mantém contas, cartões, categorias e limites (os saldos voltam ao saldo inicial).
- **Apagar todos os dados**: volta ao estado de instalação; ao recarregar, o app recria o espaço
  com as categorias padrão.

As exclusões oferecem baixar a cópia antes e só são liberadas digitando **APAGAR**. Cada operação
roda numa única transação do IndexedDB: ou é aplicada inteira, ou nada muda. Tema e idioma são
preferências e não são apagados.

### Gráficos exigem internet

Os gráficos usam **Chart.js 4.4.1 via CDN** (`cdnjs.cloudflare.com`) — a única dependência
externa do projeto, baixada quando a página carrega com acesso à internet. Sem conexão, os
indicadores, listas e tabelas continuam funcionando; só os gráficos ficam em branco (sem erro). A
fonte Manrope também vem do Google Fonts e, offline, cai para a fonte do sistema.


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
pelo seletor no rodapé do menu lateral; a preferência fica salva no `localStorage` do dispositivo. Categorias
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
assets/icons/   ícone do LEDGER e logos de instituições financeiras (contas e cartões)
css/            estilos (main: cores/tema, layout: casca e menu, components, reports, brand: identidade,
                responsive, motion: animações)
js/
  app.js        ponto de entrada
  core/         database (IndexedDB), router, i18n, theme, app-state, auth, permissions, sync, bootstrap
  locales/      dicionários pt-BR e en-US
  modules/      uma pasta por tela (dashboard, accounts, transactions, budgets, ...)
  services/     repositórios (accounts, categories, creditCards, transfers, transactions, invoices, analytics, budgets, dataManagement) — regras de negócio
  utils/        ids, currency, moneyInput, motion, dates, validation, html, observable, recurrence, csv, icons,
                ui (ícones de categoria/instituição, seletores, modal), categoryCombo (seletor de categoria)
tools/          servidor estático de desenvolvimento
tests/          testes de unidade (node --test)
```

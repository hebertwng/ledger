/* =====================================================================
   Personagem financeiro animado — gerador compartilhado
   Usado pelo navegador (personagens-animacoes.html) e pelo Node
   (gerar-svgs.js).   Gênero: 'm' | 'f'   Nível: 1..5
   Estados: veja STATES abaixo (a classe "st-<estado>" no <svg> controla tudo)
   ===================================================================== */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.Personagem = factory();
})(typeof self !== 'undefined' ? self : this, function () {

const STATES = ['idle', 'look', 'wave', 'ok', 'think', 'income', 'save', 'celebrate',
                'levelup', 'panic', 'late', 'overbudget', 'empty', 'error', 'bored', 'bye'];
const STATE_NAMES = {
    idle: 'Parado', look: 'Olhando', wave: 'Acenando', ok: 'Aprovando', think: 'Pensando',
    income: 'Dinheiro entrando', save: 'Guardando', celebrate: 'Comemorando', levelup: 'Subiu de nível',
    panic: 'Valor alto', late: 'Conta vencendo', overbudget: 'Orçamento estourado',
    empty: 'Lista vazia', error: 'Erro', bored: 'Ocioso', bye: 'Despedida'
};
const LEVEL_NAMES = { 1: 'Crítico', 2: 'Baixo', 3: 'Equilibrado', 4: 'Confortável', 5: 'Excelente' };

/* ------------------------------------------------------------------ */
/* CSS das animações                                                   */
/* ------------------------------------------------------------------ */
const CSS = `
@keyframes p-breathe { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
@keyframes p-blink   { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
@keyframes p-wave    { from { transform: rotate(-35deg); } to { transform: rotate(-75deg); } }
@keyframes p-shake   { 0%,100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(-1.6px) rotate(-1.2deg); } 75% { transform: translateX(1.6px) rotate(1.2deg); } }
@keyframes p-jump    { 0%,100% { transform: translateY(0) scaleY(1); } 15% { transform: translateY(0) scaleY(.96); } 45% { transform: translateY(-14px) scaleY(1.02); } 75% { transform: translateY(0) scaleY(.98); } }
@keyframes p-hop     { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes p-pumpR   { from { transform: rotate(-162deg); } to { transform: rotate(-145deg); } }
@keyframes p-pumpL   { from { transform: rotate(162deg); }  to { transform: rotate(145deg); } }
@keyframes p-drip    { 0% { transform: translateY(0); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(12px); opacity: 0; } }
@keyframes p-pop     { 0% { transform: scale(0); opacity: 0; } 50% { opacity: 1; } 100% { transform: scale(1.4); opacity: 0; } }
@keyframes p-twinkle { 0%,100% { opacity: .25; transform: scale(.6); } 50% { opacity: 1; transform: scale(1); } }
@keyframes p-nod     { 0%,100% { transform: rotate(0); } 30% { transform: rotate(3deg); } 60% { transform: rotate(-1deg); } }
@keyframes p-chatter { from { transform: translateY(0); } to { transform: translateY(3px); } }
@keyframes p-glow    { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
@keyframes p-look    { 0%,15%,100% { transform: translate(0,0); } 25%,40% { transform: translate(-1.8px,0); } 50%,65% { transform: translate(1.8px,0); } 75%,88% { transform: translate(.6px,-1.6px); } }
@keyframes p-dot     { 0%,100% { opacity: .15; } 40%,60% { opacity: 1; } }
@keyframes p-tap     { 0%,100% { transform: translateY(0); } 50% { transform: translateY(1.6px); } }
@keyframes p-pulse   { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
@keyframes p-coin    { 0% { transform: translateY(20px); opacity: 0; } 10% { opacity: 1; } 80% { transform: translateY(198px); opacity: 1; } 100% { transform: translateY(202px); opacity: 0; } }
@keyframes p-drop    { 0% { transform: translateY(110px); opacity: 0; } 15% { opacity: 1; } 70% { transform: translateY(184px); opacity: 1; } 76%,100% { transform: translateY(190px); opacity: 0; } }
@keyframes p-pig     { 0%,70%,100% { transform: scale(1); } 80% { transform: scale(1.09); } }
@keyframes p-moth    { 0% { transform: translate(0,0); opacity: 0; } 10% { opacity: 1; } 50% { transform: translate(-10px,-60px); } 100% { transform: translate(14px,-125px); opacity: 0; } }
@keyframes p-flap    { to { transform: scaleX(.35); } }
@keyframes p-shrug   { 0%,40%,100% { transform: translateY(0); } 15%,28% { transform: translateY(-3.5px); } }
@keyframes p-scratch { from { transform: rotate(-60deg); } to { transform: rotate(-80deg); } }
@keyframes p-float   { 0%,100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-4px) rotate(6deg); } }
@keyframes p-feed    { from { transform: translateY(0); } to { transform: translateY(-8px); } }
@keyframes p-yawn    { 0%,62%,96%,100% { transform: scale(1.3,1); } 72%,88% { transform: scale(1.5,5.5); } }
@keyframes p-leave   { 0%,50% { transform: translateY(0) scale(1); opacity: 1; } 88% { transform: translateY(-8px) scale(.55); opacity: 0; } 100% { transform: translateY(-8px) scale(.55); opacity: 0; } }
@keyframes p-lvfrom  { 0%,38% { opacity: 1; } 48%,100% { opacity: 0; } }
@keyframes p-lvto    { 0%,42% { opacity: 0; } 52%,100% { opacity: 1; } }
@keyframes p-flash   { 0%,34% { opacity: 0; transform: scale(.2); } 45% { opacity: .95; transform: scale(1); } 62%,100% { opacity: 0; transform: scale(1.4); } }

.char  { animation: p-breathe 3.5s infinite ease-in-out; }
.mover { transform-origin: 100px 230px; }
.eyes  { transform-box: fill-box; transform-origin: center; animation: p-blink 4.5s infinite; }
.head  { transform-origin: 100px 140px; transition: transform .4s; }
.pupils { transition: transform .2s; }

.arm, .fore { transition: transform .5s cubic-bezier(.3,1.35,.5,1); }
.armR  { transform: rotate(-8deg); }
.armL  { transform: rotate(8deg); }
.foreR { transform: rotate(-4deg); }
.foreL { transform: rotate(4deg); }

/* ---- expressões ---- */
.ex, .fx { display: none; }
.st-idle .ex-idle, .st-look .ex-idle,
.st-wave .ex-smile, .st-ok .ex-smile, .st-income .ex-smile, .st-save .ex-smile, .st-bye .ex-smile,
.st-panic .ex-worried, .st-late .ex-worried,
.st-celebrate .ex-happy, .st-levelup .ex-happy,
.st-think .ex-think, .st-overbudget .ex-sad, .st-empty .ex-shrug,
.st-error .ex-confused, .st-bored .ex-bored { display: inline; }

/* ---- acessórios por estado ---- */
.st-panic .fx-panic, .st-late .fx-panic,
.st-celebrate .fx-party, .st-levelup .fx-party,
.st-think .fx-think, .st-late .fx-late, .st-late .fx-watch,
.st-income .fx-income, .st-save .fx-save, .st-overbudget .fx-over,
.st-error .fx-error, .st-bored .fx-bored { display: inline; }

/* ---- olhar ---- */
.st-idle .pupils  { transform: translate(var(--px, 0px), var(--py, 0px)); }
.st-look .pupils  { animation: p-look 4s infinite ease-in-out; }
.st-think .pupils { transform: translate(1.3px, -1.7px); }
.st-late .pupils  { transform: translate(-1.7px, 1.4px); }
.st-bored .pupils { transform: translate(0, 1.8px); }

/* ---- poses ---- */
/* Acenar / Despedida */
.st-wave .armR, .st-bye .armR   { transform: rotate(-112deg); }
.st-wave .foreR, .st-bye .foreR { transform: rotate(-50deg); animation: p-wave .42s .35s infinite alternate ease-in-out; }
.st-bye .mover { animation: p-leave 3.6s infinite ease-in; }
/* Aprovar */
.st-ok .armR  { transform: rotate(-35deg); }
.st-ok .foreR { transform: rotate(-115deg); }
.st-ok .head  { animation: p-nod .8s ease-in-out infinite; }
/* Pensando: mão no queixo, outro braço apoiando o cotovelo */
.st-think .armR  { transform: rotate(65deg); }
.st-think .foreR { transform: rotate(123deg); }
.st-think .armL  { transform: rotate(-30deg); }
.st-think .foreL { transform: rotate(-60deg); }
.st-think .head  { transform: rotate(-4deg); }
.dot { animation: p-dot 1.5s infinite; } .dot.d1 { animation-delay: .25s; } .dot.d2 { animation-delay: .5s; }
/* Conta vencendo: olha o relógio, impaciente */
.st-late .armL  { transform: rotate(60deg); }
.st-late .foreL { transform: rotate(-150deg); }
.st-late .head  { transform: rotate(-5deg); }
.st-late .mover { animation: p-tap .45s infinite; }
.cal { transform-box: fill-box; transform-origin: center; animation: p-pulse .9s infinite ease-in-out; }
/* Mãos juntas na frente (receita, guardar, celular) */
.st-income .armR, .st-save .armR, .st-bored .armR   { transform: rotate(10deg); }
.st-income .foreR, .st-save .foreR, .st-bored .foreR { transform: rotate(50deg); }
.st-income .armL, .st-save .armL, .st-bored .armL   { transform: rotate(-10deg); }
.st-income .foreL, .st-save .foreL, .st-bored .foreL { transform: rotate(-50deg); }
.st-income .mover { animation: p-hop 1.5s infinite ease-in-out; }
.coin { animation: p-coin 1.5s infinite ease-in; } .coin.d1 { animation-delay: .5s; } .coin.d2 { animation-delay: 1s; }
.coin-drop { animation: p-drop 1.6s infinite ease-in; }
.pig { transform-box: fill-box; transform-origin: center; animation: p-pig 1.6s infinite; }
.st-bored .head { transform: rotate(3deg); }
.feed { animation: p-feed 1.2s infinite steps(4); }
.yawn { transform-box: fill-box; transform-origin: center; animation: p-yawn 6s infinite; }
/* Comemorar */
.st-celebrate .armR  { animation: p-pumpR .35s infinite alternate ease-in-out; transform: rotate(-155deg); }
.st-celebrate .armL  { animation: p-pumpL .35s infinite alternate ease-in-out; transform: rotate(155deg); }
.st-celebrate .foreR, .st-levelup .foreR { transform: rotate(-12deg); }
.st-celebrate .foreL, .st-levelup .foreL { transform: rotate(12deg); }
.st-celebrate .mover { animation: p-jump .7s infinite ease-out; }
/* Subiu de nível: troca de roupa com clarão */
.st-levelup .armR { transform: rotate(-155deg); }
.st-levelup .armL { transform: rotate(155deg); }
.lv-from { animation: p-lvfrom 3s infinite; }
.lv-to   { animation: p-lvto 3s infinite; }
.lv-flash { transform-box: fill-box; transform-origin: center; animation: p-flash 3s infinite; }
/* Mãos na cabeça */
.st-panic .armR  { transform: rotate(-150deg); }
.st-panic .foreR { transform: rotate(-70deg); }
.st-panic .armL  { transform: rotate(150deg); }
.st-panic .foreL { transform: rotate(70deg); }
.st-panic .mover { animation: p-shake .3s .4s infinite; }
.sweat { animation: p-drip 1.6s infinite ease-in; } .sweat.d2 { animation-delay: .8s; }
/* Orçamento estourado: bolsos vazios e mariposa */
.st-overbudget .armR  { transform: rotate(-14deg); }
.st-overbudget .foreR { transform: rotate(8deg); }
.st-overbudget .armL  { transform: rotate(14deg); }
.st-overbudget .foreL { transform: rotate(-8deg); }
.moth { animation: p-moth 2.6s infinite ease-out; }
.wing { transform-box: fill-box; transform-origin: center; animation: p-flap .12s infinite alternate; }
/* Lista vazia: dá de ombros */
.st-empty .armR  { transform: rotate(-40deg); }
.st-empty .foreR { transform: rotate(-70deg); }
.st-empty .armL  { transform: rotate(40deg); }
.st-empty .foreL { transform: rotate(70deg); }
.st-empty .mover { animation: p-shrug 2.2s infinite ease-in-out; }
/* Erro: coça a cabeça */
.st-error .armR  { transform: rotate(-150deg); }
.st-error .foreR { animation: p-scratch .22s infinite alternate ease-in-out; transform: rotate(-70deg); }
.st-error .head  { transform: rotate(5deg); }
.qmark { transform-box: fill-box; transform-origin: center; animation: p-float 1.6s infinite ease-in-out; }

/* ---- caveira (nível 1) ---- */
.glow { fill: #FF6B6B; animation: p-glow 2s infinite ease-in-out; }
.st-wave .glow, .st-ok .glow, .st-celebrate .glow, .st-income .glow,
.st-save .glow, .st-levelup .glow, .st-bye .glow { fill: #FFD54A; }
.jaw { transition: transform .3s; }
.st-panic .jaw { transform: translateY(5px); }
.st-late .jaw, .st-error .jaw, .st-overbudget .jaw, .st-empty .jaw { transform: translateY(2.5px); }
.st-celebrate .jaw, .st-levelup .jaw { animation: p-chatter .18s infinite alternate; }

@media (prefers-reduced-motion: reduce) {
    .char, .eyes, .mover, .head, .sweat, .spark, .twinkle, .glow, .jaw, .pupils, .dot, .cal,
    .coin, .coin-drop, .pig, .moth, .wing, .qmark, .feed, .yawn, .lv-flash,
    .st-wave .foreR, .st-bye .foreR, .st-error .foreR,
    .st-celebrate .armR, .st-celebrate .armL { animation: none !important; }
    .lv-from { animation: none !important; opacity: 0; }
    .lv-to { animation: none !important; opacity: 1; }
    .arm, .fore { transition: none; }
}
.spark { transform-box: fill-box; transform-origin: center; animation: p-pop 1s infinite ease-out; }
.spark.d1 { animation-delay: .33s; } .spark.d2 { animation-delay: .66s; }
.twinkle { transform-box: fill-box; transform-origin: center; animation: p-twinkle 2.4s infinite ease-in-out; }
.twinkle.d1 { animation-delay: .8s; } .twinkle.d2 { animation-delay: 1.6s; }`;

/* ------------------------------------------------------------------ */
/* Definições (gradientes e partes reutilizáveis)                      */
/* ------------------------------------------------------------------ */
const DEFS = `
<radialGradient id="bg1" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#4a2232"/><stop offset="1" stop-color="#1e1222"/></radialGradient>
<radialGradient id="bg2" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#4a3a2c"/><stop offset="1" stop-color="#211a1e"/></radialGradient>
<radialGradient id="bg3" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2c4a72"/><stop offset="1" stop-color="#141e36"/></radialGradient>
<radialGradient id="bg4" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#1f5a5a"/><stop offset="1" stop-color="#0f2428"/></radialGradient>
<radialGradient id="bg5" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#7a5e14"/><stop offset=".55" stop-color="#3a2c0c"/><stop offset="1" stop-color="#1c160a"/></radialGradient>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFE27A" stop-opacity=".55"/><stop offset="1" stop-color="#FFE27A" stop-opacity="0"/></radialGradient>
<radialGradient id="flash" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset=".5" stop-color="#FFF3B0" stop-opacity=".7"/><stop offset="1" stop-color="#FFE27A" stop-opacity="0"/></radialGradient>
<radialGradient id="skinM" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#FFE0C2"/><stop offset="1" stop-color="#EDBB92"/></radialGradient>
<radialGradient id="skinF" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#FFE8D4"/><stop offset="1" stop-color="#F2C7A5"/></radialGradient>
<linearGradient id="hairM" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7E4E26"/><stop offset="1" stop-color="#4A2A12"/></linearGradient>
<linearGradient id="hairF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9A5E30"/><stop offset="1" stop-color="#5C3418"/></linearGradient>
<linearGradient id="hairFBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A3C1C"/><stop offset="1" stop-color="#3E2210"/></linearGradient>
<linearGradient id="bone" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FAF7F0"/><stop offset="1" stop-color="#CFC6B4"/></linearGradient>
<radialGradient id="irisBrown" cx="40%" cy="40%" r="60%"><stop offset="0" stop-color="#9A6A40"/><stop offset="1" stop-color="#4A2E18"/></radialGradient>
<radialGradient id="irisGreen" cx="40%" cy="40%" r="60%"><stop offset="0" stop-color="#5FC08A"/><stop offset="1" stop-color="#1F6B45"/></radialGradient>
<linearGradient id="rag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E6256"/><stop offset="1" stop-color="#433A32"/></linearGradient>
<linearGradient id="ragF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E4E5C"/><stop offset="1" stop-color="#3E2A34"/></linearGradient>
<linearGradient id="greyTee" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#97A2AD"/><stop offset="1" stop-color="#66717C"/></linearGradient>
<linearGradient id="cardigan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A7A39C"/><stop offset="1" stop-color="#77736C"/></linearGradient>
<linearGradient id="white" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DDE3EA"/></linearGradient>
<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3D9BE0"/><stop offset="1" stop-color="#1F5F96"/></linearGradient>
<linearGradient id="shirtBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D8ECFA"/><stop offset="1" stop-color="#A9CCE8"/></linearGradient>
<linearGradient id="navy" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34475E"/><stop offset="1" stop-color="#1A2636"/></linearGradient>
<linearGradient id="teal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5AD8BE"/><stop offset="1" stop-color="#22927C"/></linearGradient>
<linearGradient id="charcoal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3A4049"/><stop offset="1" stop-color="#1C2026"/></linearGradient>
<linearGradient id="black" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2E36"/><stop offset="1" stop-color="#0C0E12"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE680"/><stop offset=".5" stop-color="#F1C40F"/><stop offset="1" stop-color="#B8860B"/></linearGradient>
<filter id="desat"><feColorMatrix type="saturate" values="0.15"/></filter>
<path id="star" d="M 0 -6 L 1.4 -1.4 L 6 0 L 1.4 1.4 L 0 6 L -1.4 1.4 L -6 0 L -1.4 -1.4 Z" fill="#FFE27A"/>
<g id="coin">
    <circle cx="0" cy="0" r="5.5" fill="url(#gold)" stroke="#B8860B" stroke-width="1"/>
    <text x="0" y="2.6" font-size="7.5" font-weight="700" text-anchor="middle" fill="#8A6508" font-family="Arial, sans-serif">$</text>
</g>

<g id="male-head">
    <rect x="88" y="118" width="24" height="34" rx="5" fill="#E2AC84"/>
    <ellipse cx="100" cy="134" rx="13" ry="6" fill="#C98E66" opacity=".7"/>
    <ellipse cx="70" cy="102" rx="6.5" ry="9.5" fill="#F2C29A"/>
    <ellipse cx="130" cy="102" rx="6.5" ry="9.5" fill="#F2C29A"/>
    <path d="M 72 97 Q 67 102 72 108" stroke="#D49B72" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M 128 97 Q 133 102 128 108" stroke="#D49B72" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="M 70 94 C 70 66, 84 56, 100 56 C 116 56, 130 66, 130 94 L 130 104 C 130 124, 116 137, 100 137 C 84 137, 70 124, 70 104 Z" fill="url(#skinM)"/>
    <path d="M 129 106 C 127 125, 114 136, 100 137 C 113 132, 123 122, 129 106 Z" fill="#D49B72" opacity=".45"/>
    <path d="M 100 102 Q 96 111 98 114 Q 101 116 104 113" stroke="#C98E66" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="82" cy="113" rx="5" ry="3" fill="#F08B78" opacity=".22"/>
    <ellipse cx="118" cy="113" rx="5" ry="3" fill="#F08B78" opacity=".22"/>
</g>
<g id="male-hair">
    <path d="M 67 98 C 62 66, 78 46, 100 46 C 124 46, 139 64, 133 98 L 129 98 C 129 86, 127 79, 122 73 C 110 70, 96 73, 84 68 C 79 75, 74 84, 71 98 Z" fill="url(#hairM)"/>
    <path d="M 84 68 C 86 52, 104 42, 122 48 C 132 52, 134 62, 128 70 C 120 60, 104 58, 84 68 Z" fill="#8A5A2E"/>
    <path d="M 84 68 L 86 56" stroke="#3E220E" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M 94 56 C 104 49, 116 49, 126 56" stroke="#B88048" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".85"/>
    <path d="M 74 70 C 76 60, 80 54, 86 50" stroke="#A8703C" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".6"/>
</g>
<!-- olhos em 3 partes: branco, íris (móvel) e linha da pálpebra -->
<g id="male-eye-white"><ellipse cx="88" cy="99" rx="5.5" ry="4.2" fill="#FFF"/><ellipse cx="112" cy="99" rx="5.5" ry="4.2" fill="#FFF"/></g>
<g id="male-iris">
    <circle cx="88" cy="99.3" r="3" fill="url(#irisBrown)"/><circle cx="88" cy="99.3" r="1.4" fill="#1a0f08"/><circle cx="86.9" cy="98" r="1.1" fill="#FFF"/>
    <circle cx="112" cy="99.3" r="3" fill="url(#irisBrown)"/><circle cx="112" cy="99.3" r="1.4" fill="#1a0f08"/><circle cx="110.9" cy="98" r="1.1" fill="#FFF"/>
</g>
<g id="male-eye-line"><path d="M 82.5 97.5 Q 88 93.5 93.5 97.5 M 106.5 97.5 Q 112 93.5 117.5 97.5" stroke="#3A2414" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>

<g id="female-hair-back">
    <path d="M 68 86 C 56 120, 56 158, 64 182 C 82 190, 118 190, 136 182 C 144 158, 144 120, 132 86 Z" fill="url(#hairFBack)"/>
</g>
<g id="female-head">
    <rect x="90" y="116" width="20" height="34" rx="5" fill="#E8B993"/>
    <ellipse cx="100" cy="132" rx="11" ry="5" fill="#D29D78" opacity=".7"/>
    <ellipse cx="72" cy="102" rx="5" ry="8" fill="#F5CBA7"/>
    <ellipse cx="128" cy="102" rx="5" ry="8" fill="#F5CBA7"/>
    <path d="M 72 92 C 72 66, 85 56, 100 56 C 115 56, 128 66, 128 92 L 128 104 C 128 122, 115 134, 100 134 C 85 134, 72 122, 72 104 Z" fill="url(#skinF)"/>
    <path d="M 127 106 C 125 123, 113 133, 100 134 C 112 129, 121 120, 127 106 Z" fill="#DDA582" opacity=".4"/>
    <path d="M 100 103 Q 97 110 99 112.5 Q 101 113.5 103 112" stroke="#D29D78" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="83" cy="112" rx="5.5" ry="3.2" fill="#F48C8C" opacity=".32"/>
    <ellipse cx="117" cy="112" rx="5.5" ry="3.2" fill="#F48C8C" opacity=".32"/>
</g>
<g id="female-hair-top">
    <path d="M 66 106 C 59 66, 76 43, 100 43 C 124 43, 141 66, 134 106 L 129 114 C 129 94, 125 81, 117 71 C 108 83, 90 87, 76 84 C 73 92, 71 102, 71 114 Z" fill="url(#hairF)"/>
    <path d="M 66 104 C 62 128, 64 150, 74 166 C 77 150, 74 128, 72 110 Z" fill="url(#hairF)"/>
    <path d="M 134 104 C 138 128, 136 150, 126 166 C 123 150, 126 128, 128 110 Z" fill="url(#hairF)"/>
    <path d="M 80 55 C 92 46, 110 46, 122 56" stroke="#C48A52" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".75"/>
    <path d="M 112 72 C 104 80, 92 83, 82 82" stroke="#C48A52" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".55"/>
</g>
<g id="female-eye-white"><ellipse cx="88" cy="99" rx="5.5" ry="4.2" fill="#FFF"/><ellipse cx="112" cy="99" rx="5.5" ry="4.2" fill="#FFF"/></g>
<g id="female-iris">
    <circle cx="88" cy="99.3" r="3" fill="url(#irisGreen)"/><circle cx="88" cy="99.3" r="1.4" fill="#0b1f14"/><circle cx="86.9" cy="98" r="1.1" fill="#FFF"/>
    <circle cx="112" cy="99.3" r="3" fill="url(#irisGreen)"/><circle cx="112" cy="99.3" r="1.4" fill="#0b1f14"/><circle cx="110.9" cy="98" r="1.1" fill="#FFF"/>
</g>
<g id="female-eye-line">
    <path d="M 82 97.5 Q 88 93 94 97.5 M 106 97.5 Q 112 93 118 97.5" stroke="#1E120A" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M 82.3 97.4 L 79.5 95.5 M 83.5 96 L 81.5 93.8 M 117.7 97.4 L 120.5 95.5 M 116.5 96 L 118.5 93.8" stroke="#1E120A" stroke-width="1.2" stroke-linecap="round"/>
</g>

<g id="grin">
    <path d="M 87 118 Q 100 136 113 118 Z" fill="#7A2E24"/>
    <path d="M 88.5 118.8 Q 100 121.5 111.5 118.8 L 110 122 Q 100 124 90 122 Z" fill="#FFF"/>
    <path d="M 93 128 Q 100 131 107 128 Q 100 125.5 93 128 Z" fill="#E36A5E"/>
    <path d="M 87 118 Q 100 136 113 118" stroke="#8A4F3C" stroke-width="1.2" fill="none" stroke-linejoin="round"/>
</g>`;

/* ------------------------------------------------------------------ */
/* Braços                                                              */
/* ------------------------------------------------------------------ */
const SHOULDER_Y = 158, ELBOW_Y = 193, WRIST_Y = 218, HAND_Y = 225;

const SLEEVES = {
    2: { m: { fill: '#8E99A4', line: '#56606A', cuff: '#6C7884' }, f: { fill: '#9C988F', line: '#5E5A54', cuff: '#77736C' } },
    3: { m: { fill: '#2F80C4', line: '#174A75', cuff: '#1E5F94' }, f: { fill: '#2F80C4', line: '#174A75', cuff: '#1E5F94' } },
    4: { m: { fill: '#2C3D52', line: '#121A24', cuff: '#D8ECFA' }, f: { fill: '#343A43', line: '#14171B', cuff: '#FFFFFF' } },
    5: { m: { fill: '#1F232A', line: '#060709', cuff: '#FFFFFF', link: true }, f: { fill: '#1F232A', line: '#060709', cuff: '#FFFFFF', link: true } }
};

/*
 * Cada braço é desenhado em 2 camadas com as MESMAS classes:
 * contorno (atrás) e preenchimento (na frente) — assim não aparece
 * emenda no cotovelo e as duas camadas animam juntas.
 */
function arm(side, sx, g, level) {
    const R = side === 'R';
    const t = R ? -4 : 4;
    const o = y => `style="transform-origin:${sx}px ${y}px"`;
    const bone = level === 1;
    const skin = g === 'f' ? '#F5CBA7' : '#F2C29A';
    const shade = g === 'f' ? '#D29D78' : '#C98E66';
    const s = bone ? { fill: '#E6DFCF', line: '#8C8475' } : SLEEVES[level][g];
    const wU = bone ? [7.5, 5] : [13.5, 11];
    const wF = bone ? [7, 4.6] : [12.5, 10];

    // relógio de pulso (só no braço esquerdo, aparece em "conta vencendo")
    const watch = R ? '' : `
            <g class="fx fx-watch">
                <rect x="${sx - 6.5}" y="${WRIST_Y - 9}" width="13" height="5.5" rx="1.5" fill="#2B2B2B"/>
                <circle cx="${sx}" cy="${WRIST_Y - 6.2}" r="4.3" fill="#FFF" stroke="url(#gold)" stroke-width="1.5"/>
                <path d="M ${sx} ${WRIST_Y - 6.2} L ${sx} ${WRIST_Y - 9} M ${sx} ${WRIST_Y - 6.2} L ${sx + 2} ${WRIST_Y - 6.2}" stroke="#333" stroke-width=".9" stroke-linecap="round"/>
            </g>`;

    const hand = () => bone ? `
            <circle cx="${sx}" cy="${HAND_Y - 2}" r="4.6" fill="url(#bone)" stroke="#8C8475" stroke-width=".8"/>
            <path d="M ${sx - 3} ${HAND_Y + 1} L ${sx - 4} ${HAND_Y + 6} M ${sx} ${HAND_Y + 2} L ${sx} ${HAND_Y + 7.5} M ${sx + 3} ${HAND_Y + 1} L ${sx + 4} ${HAND_Y + 6}" stroke="#E6DFCF" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M ${sx + t * .8} ${HAND_Y - 3} L ${sx + t * 1.6} ${HAND_Y + 1}" stroke="#E6DFCF" stroke-width="1.8" stroke-linecap="round"/>${watch}` : `
            <rect x="${sx - 6}" y="${WRIST_Y - 3}" width="12" height="5" rx="2.5" fill="${s.cuff}"/>
            ${s.link ? `<circle cx="${sx}" cy="${WRIST_Y - .5}" r="1.4" fill="url(#gold)"/>` : ''}
            <ellipse cx="${sx + t}" cy="${HAND_Y - 3}" rx="2.4" ry="4" fill="${skin}" stroke="${shade}" stroke-width=".8" transform="rotate(${R ? 25 : -25} ${sx + t} ${HAND_Y - 3})"/>
            <circle cx="${sx}" cy="${HAND_Y}" r="6.3" fill="${skin}" stroke="${shade}" stroke-width=".9"/>
            <path d="M ${sx - 3} ${HAND_Y + 4} L ${sx - 3} ${HAND_Y + 5.8} M ${sx} ${HAND_Y + 4.8} L ${sx} ${HAND_Y + 6.5} M ${sx + 3} ${HAND_Y + 4} L ${sx + 3} ${HAND_Y + 5.8}" stroke="${shade}" stroke-width=".8" stroke-linecap="round"/>${watch}`;

    const layer = fill => `
    <g class="arm arm${side}" ${o(SHOULDER_Y)}>
        <line x1="${sx}" y1="${SHOULDER_Y}" x2="${sx}" y2="${ELBOW_Y}" stroke="${fill ? s.fill : s.line}" stroke-width="${wU[fill ? 1 : 0]}" stroke-linecap="round"/>
        <g class="fore fore${side}" ${o(ELBOW_Y)}>
            <line x1="${sx}" y1="${ELBOW_Y}" x2="${sx}" y2="${WRIST_Y}" stroke="${fill ? s.fill : s.line}" stroke-width="${wF[fill ? 1 : 0]}" stroke-linecap="round"/>
            ${fill ? hand() : ''}
        </g>
    </g>`;
    return layer(false) + layer(true);
}

/* ------------------------------------------------------------------ */
/* Troncos (esbeltos) por nível                                        */
/* ------------------------------------------------------------------ */
const SHAPE = {
    m: {
        body:  'M 68 240 C 67 214, 65 196, 65 178 C 65 160, 72 150, 86 146 C 92 153, 108 153, 114 146 C 128 150, 135 160, 135 178 C 135 196, 133 214, 132 240 Z',
        openL: 'M 68 240 C 67 214, 65 196, 65 178 C 65 160, 72 150, 86 146 L 92 172 L 91 240 Z',
        openR: 'M 132 240 C 133 214, 135 196, 135 178 C 135 160, 128 150, 114 146 L 108 172 L 109 240 Z',
        blzL:  'M 68 240 C 67 214, 65 196, 65 178 C 65 160, 72 150, 84 145 L 95 184 L 92 240 Z',
        blzR:  'M 132 240 C 133 214, 135 196, 135 178 C 135 160, 128 150, 116 145 L 105 184 L 108 240 Z',
        lapL:  'M 84 145 L 95 184 L 86 168 L 79 166 L 81 155 Z',
        lapR:  'M 116 145 L 105 184 L 114 168 L 121 166 L 119 155 Z',
        ragL:  'M 68 240 C 67 214, 65 196, 65 178 C 65 160, 71 151, 81 147 L 85 160 L 80 170 L 86 182 L 79 194 L 85 206 L 79 220 L 84 240 Z',
        ragR:  'M 132 240 C 133 214, 135 196, 135 178 C 135 160, 129 151, 119 147 L 115 160 L 120 170 L 114 182 L 121 194 L 115 206 L 121 220 L 116 240 Z'
    },
    f: {
        body:  'M 70 240 C 69 214, 67 196, 67 180 C 67 162, 74 151, 88 147 C 92 156, 108 156, 112 147 C 126 151, 133 162, 133 180 C 133 196, 131 214, 130 240 Z',
        openL: 'M 70 240 C 69 214, 67 196, 67 180 C 67 162, 74 151, 88 147 L 93 174 L 92 240 Z',
        openR: 'M 130 240 C 131 214, 133 196, 133 180 C 133 162, 126 151, 112 147 L 107 174 L 108 240 Z',
        blzL:  'M 70 240 C 69 214, 67 196, 67 180 C 67 162, 74 151, 86 146 L 96 186 L 93 240 Z',
        blzR:  'M 130 240 C 131 214, 133 196, 133 180 C 133 162, 126 151, 114 146 L 104 186 L 107 240 Z',
        lapL:  'M 86 146 L 96 186 L 87 169 L 80 167 L 83 156 Z',
        lapR:  'M 114 146 L 104 186 L 113 169 L 120 167 L 117 156 Z',
        ragL:  'M 70 240 C 69 214, 67 196, 67 180 C 67 162, 73 152, 82 148 L 86 160 L 80 170 L 86 182 L 79 194 L 85 206 L 79 220 L 84 240 Z',
        ragR:  'M 130 240 C 131 214, 133 196, 133 180 C 133 162, 127 152, 118 148 L 114 160 L 120 170 L 114 182 L 121 194 L 115 206 L 121 220 L 116 240 Z'
    }
};

const RIBS = `
    <rect x="97" y="146" width="6" height="96" rx="3" fill="url(#bone)"/>
    <path d="M 100 150 Q 88 146 74 152 M 100 150 Q 112 146 126 152" stroke="#E6E0D2" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M 100 160 C 91 156, 84 160, 82 168 M 100 160 C 109 156, 116 160, 118 168
             M 100 171 C 92 167, 85 171, 84 179 M 100 171 C 108 167, 115 171, 116 179
             M 100 182 C 93 178, 87 182, 86 189 M 100 182 C 107 178, 113 182, 114 189" stroke="#E6E0D2" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;

function torso(g, level) {
    const F = g === 'f', S = SHAPE[g];
    const chest = F ? `<path d="M 87 140 L 113 140 L 113 174 L 87 174 Z" fill="#EDC09C"/>` : '';
    switch (level) {
    case 1: return `${RIBS}
        <path d="${S.ragL}" fill="url(#${F ? 'ragF' : 'rag'})"/>
        <path d="${S.ragR}" fill="url(#${F ? 'ragF' : 'rag'})"/>
        <ellipse cx="73" cy="206" rx="3" ry="4" fill="#21161b"/>
        <path d="M 124 172 L 130 176 M 125 180 L 129 178" stroke="#21161b" stroke-width="1.2" stroke-linecap="round"/>`;
    case 2: return F ? `${chest}
        <path d="M 85 147 C 92 162, 108 162, 115 147 L 112 240 L 88 240 Z" fill="#C9B9A6"/>
        <path d="${S.openL.replace('L 93 174', 'L 96 178')}" fill="url(#cardigan)"/>
        <path d="${S.openR.replace('L 107 174', 'L 104 178')}" fill="url(#cardigan)"/>
        <circle cx="94" cy="190" r="1.7" fill="#5E5A54"/><circle cx="93.5" cy="202" r="1.7" fill="#5E5A54"/><circle cx="93" cy="214" r="1.7" fill="#5E5A54"/>
        <path d="M 76 226 Q 74 232 77 236" stroke="#615D57" stroke-width="1" fill="none"/>` : `
        <path d="${S.body}" fill="url(#greyTee)"/>
        <path d="M 86 146 C 92 154, 108 154, 114 146" stroke="#59636D" stroke-width="3" fill="none" stroke-linecap="round"/>
        <rect x="110" y="172" width="13" height="11" rx="2" fill="#8C7A66" transform="rotate(-8 116 177)"/>
        <rect x="110" y="172" width="13" height="11" rx="2" fill="none" stroke="#E0D4C2" stroke-width=".9" stroke-dasharray="2 1.6" transform="rotate(-8 116 177)"/>
        <ellipse cx="84" cy="204" rx="2.5" ry="1.8" fill="#3E464E"/>`;
    case 3: return F ? `${chest}
        <path d="M 85 147 C 92 158, 108 158, 115 147 L 112 240 L 88 240 Z" fill="url(#white)"/>
        <path d="${S.openL}" fill="url(#blue)"/>
        <path d="${S.openR}" fill="url(#blue)"/>
        <path d="M 88 147 L 93 174 L 85 163 L 81 152 Z M 112 147 L 107 174 L 115 163 L 119 152 Z" fill="#1E5F94"/>
        <path d="M 91 150 Q 100 160 109 150" stroke="#D0D8E0" stroke-width="1" fill="none"/>
        <circle cx="100" cy="156" r="1.8" fill="#9ED0FF"/>` : `
        <path d="M 84 146 C 92 154, 108 154, 116 146 L 112 240 L 88 240 Z" fill="url(#white)"/>
        <path d="M 86 146 C 92 153, 108 153, 114 146" stroke="#C5CED8" stroke-width="2" fill="none"/>
        <path d="${S.openL}" fill="url(#blue)"/>
        <path d="${S.openR}" fill="url(#blue)"/>
        <path d="M 80 148 C 83 143, 86 143, 88 146 L 92 160 Z M 120 148 C 117 143, 114 143, 112 146 L 108 160 Z" fill="#185080"/>
        <path d="M 91 160 L 90 178 M 109 160 L 110 178" stroke="#E8EEF5" stroke-width="1.6" stroke-linecap="round"/>
        <circle cx="90" cy="179" r="1.6" fill="#E8EEF5"/><circle cx="110" cy="179" r="1.6" fill="#E8EEF5"/>
        <path d="M 92 172 L 91 240 M 108 172 L 109 240" stroke="#C0C8D0" stroke-width="1.2" stroke-dasharray="1.5 1.5"/>`;
    case 4: return F ? `${chest}
        <path d="M 84 147 C 90 166, 110 166, 116 147 L 112 240 L 88 240 Z" fill="url(#teal)"/>
        <path d="M 86 147 C 91 163, 109 163, 114 147" stroke="#1C7A67" stroke-width="1.5" fill="none"/>
        <path d="${S.blzL}" fill="url(#charcoal)"/>
        <path d="${S.blzR}" fill="url(#charcoal)"/>
        <path d="${S.lapL}" fill="#2A2F37"/><path d="${S.lapR}" fill="#2A2F37"/>
        <circle cx="95" cy="196" r="1.8" fill="#0F1216"/>` : `
        <path d="M 84 146 L 116 146 L 112 240 L 88 240 Z" fill="url(#shirtBlue)"/>
        <path d="M 87 144 L 100 157 L 92 164 L 84 150 Z" fill="#EAF4FC" stroke="#9CC0DE" stroke-width=".8"/>
        <path d="M 113 144 L 100 157 L 108 164 L 116 150 Z" fill="#EAF4FC" stroke="#9CC0DE" stroke-width=".8"/>
        <circle cx="100" cy="170" r="1.3" fill="#7FA8C9"/><circle cx="100" cy="182" r="1.3" fill="#7FA8C9"/>
        <path d="${S.blzL}" fill="url(#navy)"/>
        <path d="${S.blzR}" fill="url(#navy)"/>
        <path d="${S.lapL}" fill="#22303F"/><path d="${S.lapR}" fill="#22303F"/>
        <circle cx="94" cy="196" r="1.8" fill="#0F1620"/>
        <path d="M 116 176 L 128 176" stroke="#5B7290" stroke-width="1.5" stroke-linecap="round"/>`;
    case 5: return F ? `${chest}
        <path d="M 84 146 C 90 170, 110 170, 116 146 L 112 240 L 88 240 Z" fill="url(#white)"/>
        <path d="M 89 150 Q 100 166 111 150" stroke="url(#gold)" stroke-width="1.6" fill="none"/>
        <path d="M 100 159 L 104 163 L 100 168 L 96 163 Z" fill="url(#gold)" stroke="#B8860B" stroke-width=".6"/>
        <path d="${S.blzL}" fill="url(#black)"/>
        <path d="${S.blzR}" fill="url(#black)"/>
        <path d="${S.lapL}" fill="#1A1D24"/><path d="${S.lapR}" fill="#1A1D24"/>
        <circle cx="95" cy="196" r="2" fill="url(#gold)"/>
        <circle cx="122" cy="174" r="2.4" fill="url(#gold)"/>` : `
        <path d="M 84 146 L 116 146 L 112 240 L 88 240 Z" fill="url(#white)"/>
        <path d="M 87 144 L 100 156 L 92 163 L 84 150 Z" fill="#FFF" stroke="#CDD5DE" stroke-width=".8"/>
        <path d="M 113 144 L 100 156 L 108 163 L 116 150 Z" fill="#FFF" stroke="#CDD5DE" stroke-width=".8"/>
        <path d="M 96 155 L 104 155 L 102.5 162 L 97.5 162 Z" fill="#D4A017"/>
        <path d="M 97.5 162 L 102.5 162 L 106 194 L 100 202 L 94 194 Z" fill="url(#gold)"/>
        <path d="M 98 170 L 104 176 M 97 182 L 105 190" stroke="#B8860B" stroke-width="1" opacity=".6"/>
        <path d="${S.blzL}" fill="url(#black)"/>
        <path d="${S.blzR}" fill="url(#black)"/>
        <path d="${S.lapL}" fill="#1A1D24"/><path d="${S.lapR}" fill="#1A1D24"/>
        <path d="M 84 145 L 95 184 M 116 145 L 105 184" stroke="#3A3F4A" stroke-width=".8" fill="none"/>
        <path d="M 114 178 L 128 178 L 126.5 181 L 115.5 181 Z" fill="#0E1015"/>
        <path d="M 116 178 L 119 172 L 121.5 177 L 124 172 L 127 178 Z" fill="url(#gold)"/>
        <circle cx="78" cy="170" r="2.2" fill="url(#gold)"/>`;
    }
}

/* ------------------------------------------------------------------ */
/* Rostos                                                              */
/* ------------------------------------------------------------------ */
function eyesMarkup(F, extra = '') {
    const p = F ? 'female' : 'male';
    return `<g class="eyes"><use href="#${p}-eye-white"/><g class="pupils"><use href="#${p}-iris"/></g><use href="#${p}-eye-line"/>${extra}</g>`;
}

function face(g, level) {
    const F = g === 'f';
    const brow = F ? '#6A3C1C' : '#4A2A12';
    const bw = F ? 1.8 : 2.4;
    const lip = F ? '#C26A62' : '#8A4F3C';
    const lid = F ? '#F5CBA7' : '#F2C29A';
    const lash = F ? `<path d="M 82.5 100 L 80 98.5 M 117.5 100 L 120 98.5" stroke="#1E120A" stroke-width="1.2" stroke-linecap="round"/>` : '';
    const tiredLids = `<path d="M 82 98.5 Q 88 93 94 98.5 Q 88 96.5 82 98.5 Z M 106 98.5 Q 112 93 118 98.5 Q 112 96.5 106 98.5 Z" fill="${lid}"/>`;
    const halfLids = `<path d="M 82 99 Q 88 93 94 99 Q 88 97.6 82 99 Z M 106 99 Q 112 93 118 99 Q 112 97.6 106 99 Z" fill="${lid}"/>`;
    const sparkle = `<circle cx="89.5" cy="100.6" r=".6" fill="#FFF"/><circle cx="113.5" cy="100.6" r=".6" fill="#FFF"/>`;
    const browPath = (d, w = bw) => `<path d="${d}" stroke="${brow}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
    const mouth = (d, w = 2) => `<path d="${d}" stroke="${lip}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;

    const idle = {
        2: `${eyesMarkup(F, tiredLids)}
            <path d="M 84 105 Q 88 106.5 92 105 M 108 105 Q 112 106.5 116 105" stroke="#B98A6E" stroke-width="1" fill="none" opacity=".7" stroke-linecap="round"/>
            ${browPath('M 81 91 Q 88 90 94 86.5 M 119 91 Q 112 90 106 86.5')}
            ${mouth('M 93 125 Q 100 120.5 107 125', 1.8)}`,
        3: `${eyesMarkup(F)}
            ${browPath('M 81 90 Q 88 87 94 89 M 119 90 Q 112 87 106 89')}
            ${mouth('M 91 121 Q 100 128 109 121')}`,
        4: `${eyesMarkup(F)}
            ${browPath('M 81 89 Q 88 85.5 94 88 M 119 90 Q 112 86 106 88')}
            ${mouth('M 90 121 Q 100 128 110 119', 2.2)}`,
        5: `${eyesMarkup(F, sparkle)}
            ${browPath('M 80 88 Q 88 83.5 94 86.5 M 120 88 Q 112 83.5 106 86.5')}
            <use href="#grin"/>`
    }[level];

    return `
    <g class="ex ex-idle">${idle}</g>
    <g class="ex ex-smile">
        ${eyesMarkup(F, level === 5 ? sparkle : '')}
        ${browPath('M 80 88 Q 88 83.5 94 86.5 M 120 88 Q 112 83.5 106 86.5')}
        <use href="#grin"/>
    </g>
    <g class="ex ex-worried">
        ${eyesMarkup(F, `<path d="M 82 98.5 Q 88 95 94 98.5 Q 88 97.3 82 98.5 Z M 106 98.5 Q 112 95 118 98.5 Q 112 97.3 106 98.5 Z" fill="${lid}"/>`)}
        ${browPath('M 81 90 Q 88 89.5 94 85 M 119 90 Q 112 89.5 106 85', bw + .4)}
        <ellipse cx="100" cy="124" rx="4.5" ry="5.5" fill="#5E1F2A"/>
        <ellipse cx="100" cy="126.5" rx="2.8" ry="2" fill="#E07A7A"/>
        <ellipse cx="100" cy="124" rx="4.5" ry="5.5" fill="none" stroke="${lip}" stroke-width="1.2"/>
    </g>
    <g class="ex ex-happy">
        <path d="M 82.5 100.5 Q 88 93.5 93.5 100.5 M 106.5 100.5 Q 112 93.5 117.5 100.5" stroke="#3A2414" stroke-width="2.3" fill="none" stroke-linecap="round"/>
        ${lash}
        ${browPath('M 80 87 Q 88 82 94 85.5 M 120 87 Q 112 82 106 85.5')}
        <ellipse cx="82" cy="111" rx="6" ry="3.4" fill="#F27B6A" opacity=".45"/>
        <ellipse cx="118" cy="111" rx="6" ry="3.4" fill="#F27B6A" opacity=".45"/>
        <use href="#grin"/>
    </g>
    <g class="ex ex-think">
        ${eyesMarkup(F)}
        ${browPath('M 81 87.5 Q 88 83 94 86 M 119 90.5 Q 112 89 106 90')}
        ${mouth('M 95 123.5 Q 101 121.5 106 122.5', 1.9)}
    </g>
    <g class="ex ex-sad">
        ${eyesMarkup(F, halfLids)}
        ${browPath('M 81 91 Q 88 90 94 86 M 119 91 Q 112 90 106 86')}
        <ellipse cx="82" cy="112" rx="6" ry="3.2" fill="#F27B6A" opacity=".4"/>
        <ellipse cx="118" cy="112" rx="6" ry="3.2" fill="#F27B6A" opacity=".4"/>
        ${mouth('M 92 124 Q 96 121 100 124 Q 104 127 108 124', 1.8)}
    </g>
    <g class="ex ex-shrug">
        ${eyesMarkup(F)}
        ${browPath('M 80 86.5 Q 88 81.5 94 84.5 M 120 86.5 Q 112 81.5 106 84.5')}
        ${mouth('M 94 123 L 106 123', 1.9)}
        ${mouth('M 92.5 124.5 L 94 123 M 107.5 124.5 L 106 123', 1.5)}
    </g>
    <g class="ex ex-confused">
        ${eyesMarkup(F)}
        ${browPath('M 81 86 Q 88 82 94 86 M 119 90 Q 112 91 106 88')}
        ${mouth('M 93 124 Q 97 121 100 124 Q 103 127 107 123', 1.9)}
    </g>
    <g class="ex ex-bored">
        ${eyesMarkup(F, halfLids)}
        ${browPath('M 81 90 Q 88 88.5 94 89.5 M 119 90 Q 112 88.5 106 89.5')}
        <ellipse class="yawn" cx="100" cy="123.5" rx="3" ry="1" fill="#5E1F2A"/>
    </g>`;
}

const SKULL = `
    <rect x="94" y="128" width="12" height="6" rx="2" fill="url(#bone)"/>
    <rect x="95" y="136" width="10" height="6" rx="2" fill="url(#bone)"/>
    <rect x="95" y="144" width="10" height="6" rx="2" fill="url(#bone)"/>
    <g class="jaw">
        <path d="M 83 122 L 84 131 C 90 136, 110 136, 116 131 L 117 122 Z" fill="#E6E0D2"/>
        <rect x="86" y="124" width="28" height="6" rx="1.5" fill="#FBF8F0" stroke="#8C8475" stroke-width="1"/>
        <path d="M 91.5 124 L 91.5 130 M 97 124 L 97 130 M 103 124 L 103 130 M 108.5 124 L 108.5 130" stroke="#8C8475" stroke-width="1"/>
    </g>
    <path d="M 72 96 C 68 64, 86 54, 100 54 C 114 54, 132 64, 128 96 C 128 108, 124 114, 118 116 L 118 124 L 82 124 L 82 116 C 76 114, 72 108, 72 96 Z" fill="url(#bone)"/>
    <rect x="86" y="119" width="28" height="5.5" rx="1.5" fill="#FBF8F0" stroke="#8C8475" stroke-width="1"/>
    <path d="M 91.5 119 L 91.5 124.5 M 97 119 L 97 124.5 M 103 119 L 103 124.5 M 108.5 119 L 108.5 124.5" stroke="#8C8475" stroke-width="1"/>
    <path d="M 110 57 L 106 66 L 112 72 L 107 80" stroke="#8C8475" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <ellipse cx="88" cy="98" rx="8" ry="9" fill="#2A2238"/>
    <ellipse cx="112" cy="98" rx="8" ry="9" fill="#2A2238"/>
    <g class="pupils"><circle class="glow" cx="89" cy="99" r="2"/><circle class="glow" cx="113" cy="99" r="2"/></g>
    <path d="M 100 107 L 96 115 Q 100 117 104 115 Z" fill="#2A2238"/>
    <path d="M 126 92 C 126 106, 122 112, 118 115 L 118 106 C 121 102, 123 98, 126 92 Z" fill="#A9A08E" opacity=".5"/>`;

/* ------------------------------------------------------------------ */
/* Acessórios                                                          */
/* ------------------------------------------------------------------ */
/* forros dos bolsos puxados para fora (desenhados por cima das mãos, que seguram a borda) */
const POCKETS = `
    <path d="M 133 227 L 153 225 L 151 238 Q 143 242 136 238 Z" fill="#F4F0E8" stroke="#A9A293" stroke-width="1"/>
    <path d="M 136 231 Q 144 233 151 230" stroke="#CFC8BA" stroke-width="1" fill="none" stroke-dasharray="1.5 1.5"/>
    <path d="M 67 227 L 47 225 L 49 238 Q 57 242 64 238 Z" fill="#F4F0E8" stroke="#A9A293" stroke-width="1"/>
    <path d="M 64 231 Q 56 233 49 230" stroke="#CFC8BA" stroke-width="1" fill="none" stroke-dasharray="1.5 1.5"/>`;

const MOTH = `
    <g class="moth">
        <g class="wing"><path d="M 144 228 Q 136 219 135 228 Q 139 232 144 229 Z M 144 228 Q 152 219 153 228 Q 149 232 144 229 Z" fill="#A99F90" stroke="#7A7062" stroke-width=".6"/></g>
        <ellipse cx="144" cy="228.5" rx="1.5" ry="3.2" fill="#5F574C"/>
    </g>`;

const COINS = `
    <g transform="translate(94 0)"><use href="#coin" class="coin"/></g>
    <g transform="translate(101 0)"><use href="#coin" class="coin d1"/></g>
    <g transform="translate(107 0)"><use href="#coin" class="coin d2"/></g>`;

const PIG = `
    <g transform="translate(100 0)"><use href="#coin" class="coin-drop"/></g>
    <g class="pig">
        <path d="M 87 184 L 85 175 L 93 181 Z" fill="#EE93A9" stroke="#D97890" stroke-width=".8"/>
        <path d="M 82 194 q -6 -1 -4 -6 q 2 -3 4 0" stroke="#D97890" stroke-width="1.4" fill="none" stroke-linecap="round"/>
        <rect x="88" y="205" width="6" height="6" rx="1.8" fill="#EE93A9" stroke="#D97890" stroke-width=".8"/>
        <rect x="106" y="205" width="6" height="6" rx="1.8" fill="#EE93A9" stroke="#D97890" stroke-width=".8"/>
        <ellipse cx="100" cy="196" rx="18" ry="13" fill="#F6AFC0" stroke="#D97890" stroke-width="1"/>
        <ellipse cx="94" cy="191" rx="6" ry="3" fill="#FFFFFF" opacity=".35"/>
        <ellipse cx="116.5" cy="196" rx="5" ry="4.6" fill="#EE93A9" stroke="#D97890" stroke-width="1"/>
        <circle cx="115" cy="196" r=".9" fill="#B5576F"/><circle cx="118" cy="196" r=".9" fill="#B5576F"/>
        <circle cx="109" cy="190.5" r="1.4" fill="#3A2030"/>
        <rect x="95" y="182.5" width="10" height="2.6" rx="1.3" fill="#8E3F55"/>
    </g>`;

const PHONE = `
    <rect x="91.5" y="184" width="17" height="27" rx="3" fill="#1C1F26" stroke="#0A0B0E" stroke-width="1"/>
    <svg x="93.5" y="187.5" width="13" height="19" viewBox="0 0 13 19">
        <rect width="13" height="19" fill="#5DADE2"/>
        <g class="feed" fill="#FFFFFF" opacity=".85">
            <rect x="1.5" y="2" width="10" height="2" rx="1"/><rect x="1.5" y="6" width="7" height="2" rx="1"/>
            <rect x="1.5" y="10" width="10" height="2" rx="1"/><rect x="1.5" y="14" width="6" height="2" rx="1"/>
            <rect x="1.5" y="18" width="10" height="2" rx="1"/><rect x="1.5" y="22" width="7" height="2" rx="1"/>
        </g>
    </svg>`;

const THINK = `
    <circle class="dot" cx="140" cy="68" r="2.4" fill="#FFFFFF"/>
    <circle class="dot d1" cx="149" cy="56" r="3.4" fill="#FFFFFF"/>
    <circle class="dot d2" cx="160" cy="42" r="4.8" fill="#FFFFFF"/>`;

const QMARK = `<text class="qmark" x="142" y="62" font-size="26" font-weight="800" fill="#FFD54A" stroke="#7A5A00" stroke-width=".8" font-family="Arial, sans-serif">?</text>`;

const CALENDAR = `
    <g class="cal">
        <rect x="12" y="14" width="36" height="34" rx="4" fill="#FFFFFF"/>
        <path d="M 12 24 L 12 18 Q 12 14 16 14 L 44 14 Q 48 14 48 18 L 48 24 Z" fill="#E74C3C"/>
        <rect x="18" y="10" width="3" height="7" rx="1.5" fill="#555"/><rect x="39" y="10" width="3" height="7" rx="1.5" fill="#555"/>
        <text x="30" y="44" font-size="17" font-weight="800" text-anchor="middle" fill="#C0392B" font-family="Arial, sans-serif">!</text>
    </g>`;

/* ------------------------------------------------------------------ */
/* Montagem                                                            */
/* ------------------------------------------------------------------ */
function backdrop(level) {
    const halo = level === 5 ? `
        <circle cx="100" cy="100" r="86" fill="url(#halo)"/>
        <g transform="translate(30 40)"><use href="#star" class="twinkle"/></g>
        <g transform="translate(172 52)"><use href="#star" class="twinkle d1"/></g>
        <g transform="translate(168 200)"><use href="#star" class="twinkle d2"/></g>
        <g transform="translate(28 196)"><use href="#star" class="twinkle d1"/></g>` : '';
    const dust = level === 1 ? `<g fill="#fff" opacity=".08"><circle cx="30" cy="40" r="2"/><circle cx="170" cy="60" r="1.5"/><circle cx="160" cy="30" r="1"/><circle cx="34" cy="170" r="1.5"/></g>` : '';
    return `<rect width="200" height="240" fill="url(#bg${level})"/>${halo}${dust}`;
}

function charGroup(g, level) {
    const F = g === 'f';
    const skull = level === 1;
    const desat = skull ? ' filter="url(#desat)" opacity=".85"' : '';
    const earrings = F && level === 4 ? `<circle cx="71" cy="113" r="1.8" fill="#BFE9DF"/><circle cx="129" cy="113" r="1.8" fill="#BFE9DF"/>`
        : F && level === 5 ? `<circle cx="71" cy="113" r="2.4" fill="url(#gold)"/><circle cx="129" cy="113" r="2.4" fill="url(#gold)"/>
            <path d="M 71 115.5 L 71 120 M 129 115.5 L 129 120" stroke="#F1C40F" stroke-width="1"/>
            <circle cx="71" cy="121" r="1.4" fill="url(#gold)"/><circle cx="129" cy="121" r="1.4" fill="url(#gold)"/>` : '';
    return `
        <g class="char">
            ${F ? `<use href="#female-hair-back"${desat}/>` : ''}
            <g class="torso">${torso(g, level)}</g>
            <g class="fx fx-income">${COINS}</g>
            <g class="head">
                ${skull ? SKULL : `<use href="${F ? '#female-head' : '#male-head'}"/>${face(g, level)}`}
                <use href="${F ? '#female-hair-top' : '#male-hair'}"${desat}/>
                ${earrings}
                <g class="fx fx-panic">
                    <path class="sweat" d="M 134 76 Q 129 85 134 88 Q 139 85 134 76 Z" fill="#8FD3FF"/>
                    <path class="sweat d2" d="M 64 82 Q 60 89 64 91 Q 68 89 64 82 Z" fill="#8FD3FF"/>
                </g>
                <g class="fx fx-think">${THINK}</g>
                <g class="fx fx-error">${QMARK}</g>
            </g>
            ${arm('L', F ? 70 : 69, g, level)}
            ${arm('R', F ? 130 : 131, g, level)}
            <g class="fx fx-over">${POCKETS}${MOTH}</g>
            <g class="fx fx-save">${PIG}</g>
            <g class="fx fx-bored">${PHONE}</g>
        </g>`;
}

const PARTY = `
        <g class="fx fx-party">
            <g transform="translate(30 60)"><use href="#star" class="spark"/></g>
            <g transform="translate(172 44)"><use href="#star" class="spark d1"/></g>
            <g transform="translate(24 150)"><use href="#star" class="spark d2"/></g>
            <g transform="translate(176 160)"><use href="#star" class="spark d1"/></g>
        </g>`;

function body(g, level, state) {
    if (state === 'levelup') {
        const next = Math.min(level + 1, 5);
        const badge = level === 5 ? 'NÍVEL MÁX' : `NÍVEL ${next}`;
        return `
        ${backdrop(level)}
        <g class="lv-to">${backdrop(next)}</g>
        <circle class="lv-flash" cx="100" cy="120" r="95" fill="url(#flash)"/>
        ${PARTY}
        <g class="mover">
            <g class="lv-from">${charGroup(g, level)}</g>
            <g class="lv-to">${charGroup(g, next)}</g>
        </g>
        <g class="lv-to">
            <rect x="60" y="8" width="80" height="20" rx="10" fill="url(#gold)" stroke="#B8860B" stroke-width="1"/>
            <text x="100" y="22.5" font-size="11" font-weight="800" text-anchor="middle" fill="#3A2C0C" font-family="Arial, sans-serif">${badge}</text>
        </g>`;
    }
    return `
        ${backdrop(level)}
        <g class="fx fx-late">${CALENDAR}</g>
        ${PARTY}
        <g class="mover">${charGroup(g, level)}</g>`;
}

function label(g, level, state) {
    return `Personagem ${g === 'f' ? 'feminina' : 'masculino'}, nível ${level} (${LEVEL_NAMES[level]}), ${STATE_NAMES[state].toLowerCase()}`;
}

/* SVG para usar dentro de uma página que já tem DEFS e CSS */
function svg(g, level, state = 'idle') {
    return `<svg viewBox="0 0 200 240" class="st-${state}" role="img" aria-label="${label(g, level, state)}" xmlns="http://www.w3.org/2000/svg">${body(g, level, state)}</svg>`;
}

/* SVG autônomo (arquivo .svg): leva o próprio CSS e definições */
function standalone(g, level, state) {
    return `<svg viewBox="0 0 200 240" width="400" height="480" class="st-${state}" role="img" aria-label="${label(g, level, state)}" xmlns="http://www.w3.org/2000/svg">
<title>${label(g, level, state)}</title>
<style>${CSS}</style>
<defs>${DEFS}</defs>
${body(g, level, state)}
</svg>
`;
}

return { STATES, STATE_NAMES, LEVEL_NAMES, CSS, DEFS, svg, standalone };
});

// ======================================
// Miolo do app: decide o que mostrar (entrar, carregar, migrar, usar),
// monta a estrutura (barra de cima e abas) e atualiza só o que mudou.
// ======================================

import { html } from "./util.js";
import { estado, inscrever, notificar, tudoCarregado, haPendencia, limparEstado } from "./estado.js";
import {
    iniciarFirebase, aoMudarUsuario, iniciarEscutaMeta, iniciarEscutasDados, pararEscutas, definirTratadorFalha,
    lerDocumentoAntigo, marcarMigrado, migrarDados, limparLixeiraVencida, reiniciarLimpezaDaLixeira, sair
} from "./db.js";
import { decidirMigracao, analisarDocumentoAntigo } from "./migracao.js";
import { resumoBackup, textoDescartados } from "./backup.js";
import { registrar, ligarEventos, avisar, icone, fecharTodasAsFolhas, atualizarFolhasAbertas } from "./ui.js";
import { NOME_APP } from "./config.js";
import { salvarBackup } from "./acoes-backup.js";
import * as auth from "./auth.js";
import * as painel from "./telas/painel.js";
import * as estoque from "./telas/estoque.js";
import * as vendas from "./telas/vendas.js";
import * as clientes from "./telas/clientes.js";
import * as mais from "./telas/mais.js";
import * as formCliente from "./telas/form-cliente.js";
import * as formVenda from "./telas/form-venda.js";

const ABAS = [painel.tela, estoque.tela, vendas.tela, clientes.tela, mais.tela];
const POR_ID = Object.fromEntries(ABAS.map(t => [t.id, t]));

const $app = () => document.getElementById("app");

// ---------- estado do miolo ----------

let autenticacaoResolvida = false;
let faseAtual = "";
let abaAtual = "painel";

let escutasDadosIniciadas = false;
let esperaMetaEsgotada = false;
let temporizadorMeta = null;
let temporizadorDica = null;

let verificandoLegado = false;
let analiseLegado = null;      // resultado de analisarDocumentoAntigo (oferecer ou erro)
let falhaVerificacao = null;   // erro ao olhar o documento antigo
let migrandoAgora = false;
let migracaoConcluida = false; // já migrou nesta sessão (o "meta" pode demorar um instante para confirmar)
let falhaMigracao = "";

// ---------- decidir a fase ----------

function calcularFase() {
    if (!autenticacaoResolvida) return "iniciando";
    if (!estado.uid) return "login";
    if (estado.erroAcesso) return "acesso-negado";
    if (migrandoAgora) return "migrando";

    const decisao = decidirMigracao({ meta: estado.meta, metaDoServidor: estado.metaDoServidor });
    if (decisao === "pronto") return tudoCarregado() ? "app" : "carregando";
    if (decisao === "verificar") {
        if (migracaoConcluida) return "carregando";
        if (falhaVerificacao) return "migracao-erro";
        if (analiseLegado) return analiseLegado.acao === "erro" ? "migracao-erro" : "migracao";
        return "verificando";
    }
    return esperaMetaEsgotada ? "sem-conexao" : "carregando";
}

function avaliar() {
    const decisao = estado.uid ? decidirMigracao({ meta: estado.meta, metaDoServidor: estado.metaDoServidor }) : "";

    if (decisao === "pronto" && !escutasDadosIniciadas) {
        escutasDadosIniciadas = true;
        iniciarEscutasDados();
    }
    if (decisao === "verificar" && !verificandoLegado && !analiseLegado && !falhaVerificacao && !migrandoAgora && !migracaoConcluida) {
        verificarLegado();
    }

    const nova = calcularFase();
    if (nova !== faseAtual) {
        faseAtual = nova;
        renderizarFase();
    }
}

// ---------- sessão ----------

function iniciarSessao(usuario) {
    encerrarSessao({ silencioso: true });
    estado.uid = usuario.uid;
    estado.email = usuario.email || "";
    reiniciarLimpezaDaLixeira();
    iniciarEscutaMeta();
    // se o servidor não responder sobre o "meta" a tempo, mostramos a tela de falta de conexão
    clearTimeout(temporizadorMeta);
    temporizadorMeta = setTimeout(() => { esperaMetaEsgotada = true; avaliar(); }, estado.offline ? 2500 : 12000);
}

function encerrarSessao({ silencioso = false } = {}) {
    pararEscutas();
    clearTimeout(temporizadorMeta);
    escutasDadosIniciadas = false;
    esperaMetaEsgotada = false;
    verificandoLegado = false;
    analiseLegado = null;
    falhaVerificacao = null;
    migrandoAgora = false;
    migracaoConcluida = false;
    falhaMigracao = "";
    const offline = estado.offline;
    fecharTodasAsFolhas();
    limparEstado();
    estado.offline = offline;
    abaAtual = "painel";
    if (!silencioso) auth.reiniciarLogin();
}

// ---------- migração do formato antigo ----------

async function verificarLegado() {
    verificandoLegado = true;
    falhaVerificacao = null;
    try {
        const dados = await lerDocumentoAntigo();
        const analise = analisarDocumentoAntigo(dados);
        if (analise.acao === "marcar") {
            await marcarMigrado();
            migracaoConcluida = true;
        } else analiseLegado = analise;
    } catch (erro) {
        console.log("Erro ao verificar os dados antigos:", erro && erro.code, erro && erro.message);
        falhaVerificacao = erro || new Error("erro");
    } finally {
        verificandoLegado = false;
        avaliar();
    }
}

async function executarMigracao() {
    if (!analiseLegado || analiseLegado.acao !== "oferecer" || migrandoAgora) return;
    const norm = analiseLegado.norm;
    migrandoAgora = true;
    falhaMigracao = "";
    avaliar();
    try {
        await migrarDados(norm, (feitas, total) => {
            const barra = document.getElementById("migracao-barra");
            if (barra) barra.style.width = `${Math.max(4, Math.round((feitas / total) * 100))}%`;
        });
        analiseLegado = null;
        migracaoConcluida = true;
    } catch (erro) {
        console.log("Erro ao migrar:", erro && erro.code, erro && erro.message);
        falhaMigracao = erro && erro.code === "sem-internet"
            ? "Sem internet. Conecte-se e tente de novo."
            : "A atualização não terminou. Seus dados antigos continuam intactos. Confira a internet e tente de novo.";
    } finally {
        migrandoAgora = false;
        avaliar();
    }
}

// ---------- telas de espera e de erro ----------

function logoETexto(corpo) {
    return html`
        <main class="tela-central">
            <img class="login-logo" src="icons/icon-192.png" width="72" height="72" alt="">
            ${corpo}
        </main>`;
}

function telaCarregando(texto) {
    $app().innerHTML = String(logoETexto(html`
        <p class="carregando-texto" role="status">${texto}</p>
        <div class="pontos" aria-hidden="true"><span></span><span></span><span></span></div>
        <p class="dica dica-demora" id="dica-demora" hidden>Está demorando mais que o normal. Confira a internet.</p>`));
    clearTimeout(temporizadorDica);
    temporizadorDica = setTimeout(() => {
        const dica = document.getElementById("dica-demora");
        if (dica) dica.hidden = false;
    }, 6000);
}

function telaMensagem({ titulo, texto, botoes = "" }) {
    $app().innerHTML = String(logoETexto(html`
        <h1 class="mensagem-titulo">${titulo}</h1>
        <p class="mensagem-texto">${texto}</p>
        <div class="mensagem-botoes">${botoes}</div>`));
}

const botaoRecarregar = rotulo => html`<button type="button" class="botao principal" data-acao="tela:recarregar">${rotulo}</button>`;
const botaoSair = html`<button type="button" class="botao texto" data-acao="auth:sair">Sair da conta</button>`;

function telaMigracao() {
    const norm = analiseLegado.norm;
    $app().innerHTML = String(logoETexto(html`
        <h1 class="mensagem-titulo">Atualização dos seus dados</h1>
        <p class="mensagem-texto">O app agora guarda as informações de um jeito mais rápido e seguro para usar em vários aparelhos. Encontramos <strong>${resumoBackup(norm.contagem)}</strong>.</p>
        <p class="mensagem-texto">Nada é apagado: o app copia tudo para o formato novo e mantém o original intacto.</p>
        ${norm.descartados.length ? html`<p class="dica">${textoDescartados(norm.descartados)}</p>` : ""}
        ${falhaMigracao ? html`<p class="erro-form" role="alert">${falhaMigracao}</p>` : ""}
        <div class="mensagem-botoes">
            <button type="button" class="botao principal" data-acao="migracao:iniciar">Atualizar agora</button>
            ${botaoSair}
        </div>`));
}

function telaMigrando() {
    $app().innerHTML = String(logoETexto(html`
        <h1 class="mensagem-titulo">Atualizando seus dados</h1>
        <p class="mensagem-texto">Não feche o app até terminar.</p>
        <div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span id="migracao-barra" style="width:4%"></span></div>`));
}

function renderizarFase() {
    clearTimeout(temporizadorDica);
    switch (faseAtual) {
        case "iniciando":
            telaCarregando("Abrindo o app…");
            break;
        case "login":
            fecharTodasAsFolhas();
            auth.mostrarLogin($app());
            break;
        case "carregando":
            telaCarregando("Carregando seus dados…");
            break;
        case "verificando":
            telaCarregando("Verificando seus dados…");
            break;
        case "migracao":
            telaMigracao();
            break;
        case "migrando":
            telaMigrando();
            break;
        case "migracao-erro": {
            const semInternet = falhaVerificacao && falhaVerificacao.code === "sem-internet";
            telaMensagem({
                titulo: semInternet ? "Sem internet" : "Não foi possível abrir seus dados",
                texto: semInternet
                    ? "Para atualizar seus dados pela primeira vez, o app precisa de internet. Conecte-se e tente de novo."
                    : (analiseLegado && analiseLegado.erro) || "Não conseguimos ler seus dados antigos. Eles continuam guardados e nada foi apagado. Tente de novo; se continuar, avise quem cuida do app.",
                botoes: html`<button type="button" class="botao principal" data-acao="migracao:tentar-de-novo">Tentar de novo</button>${botaoSair}`
            });
            break;
        }
        case "sem-conexao":
            telaMensagem({
                titulo: estado.offline ? "Sem internet" : "O servidor não respondeu",
                texto: estado.offline
                    ? "Na primeira vez que abre neste aparelho, o app precisa de internet para buscar seus dados. Depois disso ele funciona mesmo sem conexão."
                    : "O servidor está demorando para responder. Confira a internet e tente de novo.",
                botoes: html`${botaoRecarregar("Tentar de novo")}${botaoSair}`
            });
            break;
        case "acesso-negado":
            telaMensagem({
                titulo: "Acesso negado",
                texto: "O Firebase não deixou esta conta ler os dados. Entre com a conta certa ou confira as regras do Firestore (arquivo firestore.rules).",
                botoes: html`${botaoRecarregar("Tentar de novo")}${botaoSair}`
            });
            break;
        case "app":
            montarCasca();
            break;
        default:
            break;
    }
}

// ---------- estrutura do app ----------

function montarCasca() {
    $app().innerHTML = String(html`
        <div class="casca">
            <header class="topo">
                <div class="topo-linha">
                    <img class="topo-logo" src="icons/icon-64.png" width="32" height="32" alt="">
                    <h1 id="topo-titulo" class="topo-titulo"></h1>
                    <span id="topo-sync" class="sync-chip" role="status" hidden></span>
                </div>
                <div id="faixa-estado" class="faixa-estado" role="status" hidden></div>
            </header>
            <main id="conteudo" tabindex="-1"></main>
            <nav class="abas" aria-label="Seções do app">
                ${ABAS.map(t => html`
                    <button type="button" class="aba" data-acao="nav:aba" data-tela="${t.id}">
                        ${icone(t.icone, 24)}<span>${t.titulo}</span>
                    </button>`)}
            </nav>
        </div>`);
    irParaAba(abaAtual, { rolar: false });
    atualizarStatus();
    mostrarFaixaDeVersao();
}

function irParaAba(id, { filtro, rolar = true } = {}) {
    const tela = POR_ID[id];
    if (!tela) return;
    if (id === "vendas" && filtro !== undefined) vendas.tela.filtrarPor(filtro || "todas");
    abaAtual = id;
    document.querySelectorAll(".aba").forEach(b => {
        if (b.dataset.tela === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    const titulo = document.getElementById("topo-titulo");
    if (titulo) titulo.textContent = tela.titulo;
    const conteudo = document.getElementById("conteudo");
    if (conteudo) tela.entrar(conteudo);
    if (rolar) window.scrollTo(0, 0);
}

// ---------- status de conexão ----------

let pendenteDesde = 0;

function atualizarStatus() {
    const chip = document.getElementById("topo-sync");
    const faixa = document.getElementById("faixa-estado");
    if (!chip || !faixa) return;

    // "Enviando…" só aparece se a gravação demorar (senão pisca a cada toque)
    let mostrarEnviando = false;
    if (haPendencia() && !estado.offline) {
        if (!pendenteDesde) { pendenteDesde = Date.now(); setTimeout(atualizarStatus, 1600); }
        mostrarEnviando = Date.now() - pendenteDesde >= 1500;
    } else {
        pendenteDesde = 0;
    }
    chip.hidden = !mostrarEnviando;
    chip.textContent = mostrarEnviando ? "Enviando…" : "";

    let textoFaixa = "";
    if (estado.offline) {
        textoFaixa = haPendencia()
            ? "Sem internet. As alterações ficam guardadas neste aparelho e são enviadas quando a conexão voltar."
            : "Sem internet. Você pode continuar usando: o que lançar é enviado quando a conexão voltar.";
    } else if (estado.semConfirmacao) {
        textoFaixa = "O servidor ainda não respondeu. Você está vendo a cópia guardada neste aparelho.";
    }
    faixa.hidden = !textoFaixa;
    faixa.textContent = textoFaixa;
    faixa.classList.toggle("aviso", !!textoFaixa);
}

// ---------- reação às mudanças de dados ----------

let agendado = false;
let chavesPendentes = new Set();

function aoMudar(chaves) {
    (chaves || []).forEach(c => chavesPendentes.add(c));
    if (agendado) return;
    agendado = true;
    const rodar = () => {
        if (!agendado) return;
        agendado = false;
        const ch = chavesPendentes;
        chavesPendentes = new Set();
        processar(ch);
    };
    // com a aba em segundo plano o navegador pausa o requestAnimationFrame
    if (document.hidden) setTimeout(rodar, 0); else requestAnimationFrame(rodar);
}

function processar(chaves) {
    avaliar();
    if (faseAtual !== "app") return;
    atualizarStatus();
    // a confirmação do servidor chega como "sync" (os dados não mudaram): é a hora de limpar a lixeira vencida
    limparLixeiraVencida();
    if (chaves.size === 1 && chaves.has("sync")) return;

    const tela = POR_ID[abaAtual];
    if (tela && tela.atualizar && document.getElementById("conteudo")) tela.atualizar();
    atualizarFolhasAbertas();
}

// ---------- nova versão do app ----------

let novaVersao = false;

function mostrarFaixaDeVersao() {
    if (!novaVersao) return;
    let faixa = document.getElementById("faixa-versao");
    if (!faixa) {
        faixa = document.createElement("div");
        faixa.id = "faixa-versao";
        faixa.className = "faixa-versao";
        faixa.setAttribute("role", "status");
        faixa.innerHTML = String(html`<span>Nova versão disponível.</span><button type="button" class="botao secundario" data-acao="app:atualizar">Atualizar</button>`);
        document.body.appendChild(faixa);
    }
}

function registrarServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const minhaVersao = `${globalThis.VERSAO_APP}-${globalThis.VERSAO_ARQUIVOS}`;

    // o worker avisa qual versão assumiu; se for diferente da que esta página carregou, há novidade
    navigator.serviceWorker.addEventListener("message", ev => {
        const dados = ev.data;
        if (dados && dados.tipo === "versao-ativa" && dados.versao && dados.versao !== minhaVersao) {
            novaVersao = true;
            mostrarFaixaDeVersao();
        }
    });

    navigator.serviceWorker.register("service-worker.js", { updateViaCache: "none" }).then(registro => {
        const procurar = () => registro.update().catch(() => { /* sem internet agora */ });
        document.addEventListener("visibilitychange", () => { if (!document.hidden) procurar(); });
        setInterval(procurar, 60 * 60 * 1000);
    }).catch(erro => console.log("Service worker não registrado:", erro));
}

// ---------- falhas de gravação ----------

definirTratadorFalha(erro => {
    const codigo = erro && erro.code;
    if (codigo === "permission-denied") avisar("Acesso negado pelo Firebase. Confira as regras do Firestore.", { tipo: "erro", duracao: 9000 });
    else if (codigo === "not-found") avisar("Esse item foi apagado em outro aparelho, então a alteração não foi salva.", { tipo: "erro", duracao: 8000 });
    else if (codigo === "unauthenticated") avisar("Sua sessão terminou. Entre de novo.", { tipo: "erro", duracao: 8000 });
    else avisar("Não foi possível salvar a alteração. Confira a internet e tente de novo.", { tipo: "erro", duracao: 8000 });
});

// ---------- ligações ----------

function juntar(chave) {
    const fontes = [painel, estoque, vendas, clientes, mais, formCliente, formVenda, auth];
    return Object.assign({}, ...fontes.map(m => (m.eventos && m.eventos[chave]) || {}));
}

registrar({
    cliques: {
        ...juntar("cliques"),
        "nav:aba": el => irParaAba(el.dataset.tela),
        "nav:ir": el => irParaAba(el.dataset.tela, { filtro: el.dataset.filtro === undefined ? undefined : el.dataset.filtro }),
        "backup:salvar": () => { salvarBackup(); },
        "tela:recarregar": () => location.reload(),
        "app:atualizar": () => location.reload(),
        "auth:sair": () => { sair().catch(() => {}); },
        "migracao:iniciar": () => { executarMigracao(); },
        "migracao:tentar-de-novo": () => {
            analiseLegado = null;
            falhaVerificacao = null;
            falhaMigracao = "";
            faseAtual = "";
            avaliar();
        }
    },
    entradas: juntar("entradas"),
    mudancas: juntar("mudancas"),
    envios: juntar("envios")
});

function iniciar() {
    ligarEventos();
    inscrever(aoMudar);

    window.addEventListener("online", () => { estado.offline = false; notificar(["sync"]); });
    window.addEventListener("offline", () => { estado.offline = true; notificar(["sync"]); });

    registrarServiceWorker();

    if (!globalThis.firebase) {
        faseAtual = "erro-fatal";
        telaMensagem({
            titulo: "Não foi possível abrir o app",
            texto: "Os arquivos do app não carregaram. Confira a internet e tente de novo.",
            botoes: botaoRecarregar("Recarregar")
        });
        return;
    }

    faseAtual = "iniciando";
    telaCarregando("Abrindo o app…");

    iniciarFirebase();
    aoMudarUsuario(usuario => {
        autenticacaoResolvida = true;
        if (usuario) {
            if (estado.uid !== usuario.uid) iniciarSessao(usuario);
        } else if (estado.uid) {
            encerrarSessao();
        }
        avaliar();
    });
}

iniciar();

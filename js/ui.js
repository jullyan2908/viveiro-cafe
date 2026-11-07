// ======================================
// Peças de interface: ícones, janelas (folhas), confirmações, avisos, campos
// ======================================

import { html, raw, esc, Raw } from "./util.js";

// ---------- ícones (traço 1,75, 24×24, herdam a cor do texto) ----------

const ICONES = {
    painel: '<rect x="3" y="3" width="8" height="10" rx="1.8"/><rect x="13" y="3" width="8" height="6" rx="1.8"/><rect x="13" y="11" width="8" height="10" rx="1.8"/><rect x="3" y="15" width="8" height="6" rx="1.8"/>',
    muda: '<path d="M12 21v-10"/><path d="M12 11C12 7 9.5 4.5 5 4.5 5 8.5 7.5 11 12 11Z"/><path d="M12 14.5c0-3.2 2.4-5.5 7-5.5 0 3.7-2.6 5.5-7 5.5Z"/>',
    venda: '<path d="M5.5 8h13l-1 12.5h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.8-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M18 14.2c2.5.4 4 2.3 4 5.3"/>',
    mais: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
    fechar: '<path d="M6 6l12 12M18 6 6 18"/>',
    adicionar: '<path d="M12 5v14M5 12h14"/>',
    buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    editar: '<path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z"/><path d="m13.5 8.5 3 3"/>',
    lixeira: '<path d="M4 7h16M10 7V4.5h4V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5"/>',
    desfazer: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    baixar: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14"/>',
    aviso: '<path d="M12 4 2.8 19.5h18.4L12 4Z"/><path d="M12 10v4.5M12 17.3v.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.8v.2"/>',
    conversa: '<path d="M4 5.5h16v11H11l-4.5 3.5v-3.5H4z"/>',
    telefone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>',
    olho: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    "olho-cortado": '<path d="M3.5 3.5 20.5 20.5"/><path d="M10 5.8a8.8 8.8 0 0 1 2-.3C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3.2 4M6.2 7.7A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.3 0 2.5-.3 3.6-.8"/><path d="M9.8 9.8a2.8 2.8 0 0 0 4 4"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    direita: '<path d="m9 5 7 7-7 7"/>',
    caixa: '<path d="M3.5 8 12 4l8.5 4v8.5L12 20.5l-8.5-4V8Z"/><path d="m3.5 8 8.5 4 8.5-4M12 12v8.5"/>',
    moeda: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.7.8-2.7 2 0 3 5.8 1.4 5.8 4.2 0 1.2-1.2 2.2-3 2.2-1.4 0-2.5-.6-3-1.6M12 6.5v1.3M12 16.2v1.3"/>',
    etiqueta: '<path d="M3.5 12.5V4.5h8l9 9-8 8-9-9Z"/><circle cx="8" cy="9" r="1.3" fill="currentColor" stroke="none"/>',
    sair: '<path d="M10 4.5H5.5v15H10M14 8l4 4-4 4M18 12H9"/>',
    ajustar: '<path d="M4 8h4.5M13.5 8H20M4 16h8.5M17.5 16H20"/><circle cx="11" cy="8" r="2.5"/><circle cx="15" cy="16" r="2.5"/>',
    arquivo: '<path d="M6 3.5h8l4 4v13H6z"/><path d="M14 3.5v4h4"/>',
    restaurar: '<path d="M4.5 12a7.5 7.5 0 1 0 2.3-5.4L4.5 9"/><path d="M4.5 4.5V9H9"/>',
    nuvem: '<path d="M7 18.5a4.5 4.5 0 0 1-.4-9A6 6 0 0 1 18 9.8a4.4 4.4 0 0 1-.5 8.7H7Z"/>',
    calendario: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3.5V7M16 3.5V7"/>'
};

export function icone(nome, tamanho = 24) {
    const caminho = ICONES[nome] || "";
    return raw(`<svg class="icone" width="${tamanho}" height="${tamanho}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${caminho}</svg>`);
}

// ---------- ligação de eventos (um ouvinte só para o app inteiro) ----------
// No HTML: data-acao="nome" (clique) | data-entrada="nome" (digitando) |
//          data-mudanca="nome" (select/checkbox) | data-envio="nome" (formulário)

const registro = { cliques: new Map(), entradas: new Map(), mudancas: new Map(), envios: new Map() };

export function registrar({ cliques = {}, entradas = {}, mudancas = {}, envios = {} } = {}) {
    Object.entries(cliques).forEach(([n, f]) => registro.cliques.set(n, f));
    Object.entries(entradas).forEach(([n, f]) => registro.entradas.set(n, f));
    Object.entries(mudancas).forEach(([n, f]) => registro.mudancas.set(n, f));
    Object.entries(envios).forEach(([n, f]) => registro.envios.set(n, f));
}

// o erro de um campo some assim que a pessoa volta a mexer nele (se ainda estiver errado, aparece de novo ao enviar)
function limparErroAoEditar(el) {
    if (!el || !el.matches || !el.id || !el.matches('[aria-invalid="true"]')) return;
    el.removeAttribute("aria-invalid");
    el.closest(".campo")?.classList.remove("com-erro");
    const area = document.getElementById(`${el.id}-erro`);
    if (area) area.textContent = "";
}

export function ligarEventos() {
    document.addEventListener("click", ev => {
        const el = ev.target.closest("[data-acao]");
        if (!el || el.disabled || el.getAttribute("aria-disabled") === "true") return;
        const fn = registro.cliques.get(el.dataset.acao);
        if (fn) { ev.preventDefault(); fn(el, ev); }
    });
    document.addEventListener("input", ev => {
        limparErroAoEditar(ev.target);
        const el = ev.target.closest("[data-entrada]");
        const fn = el && registro.entradas.get(el.dataset.entrada);
        if (fn) fn(el, ev);
    });
    document.addEventListener("change", ev => {
        limparErroAoEditar(ev.target);
        const el = ev.target.closest("[data-mudanca]");
        const fn = el && registro.mudancas.get(el.dataset.mudanca);
        if (fn) fn(el, ev);
    });
    document.addEventListener("submit", ev => {
        const el = ev.target.closest("[data-envio]");
        const fn = el && registro.envios.get(el.dataset.envio);
        if (fn) { ev.preventDefault(); fn(el, ev); }
    });
}

// ---------- janelas (folhas) ----------
// No celular sobem de baixo; no computador ficam no centro.
// ESC, toque no fundo e o botão "voltar" do aparelho fecham a de cima.

const pilha = [];
let proximoId = 0;

// Histórico: enquanto há alguma janela aberta existe UMA entrada nossa no histórico, não importa
// quantas janelas estejam empilhadas. O "voltar" do aparelho consome essa entrada e fecha a de cima.
// Duas regras evitam que o "voltar" jogue a pessoa para fora do app:
//  - tirar a entrada é adiado um instante, para uma janela aberta logo em seguida reaproveitá-la;
//  - nunca se põe uma entrada nova enquanto uma volta pedida por nós ainda não chegou.
let entrada = false;          // nossa entrada de histórico está colocada
let voltasPendentes = 0;      // voltas que pedimos e ainda não chegaram
let precisaEntrada = false;   // abriu uma janela enquanto havia volta pendente
let adiarRetirada = null;

function colocarEntrada() {
    if (entrada) return;
    if (voltasPendentes > 0) { precisaEntrada = true; return; }
    try { history.pushState({ viveiroJanela: true }, ""); entrada = true; } catch (e) { /* sem histórico */ }
}

function retirarEntradaDepois() {
    clearTimeout(adiarRetirada);
    adiarRetirada = setTimeout(() => {
        if (pilha.length || !entrada) return;
        entrada = false;
        voltasPendentes++;
        try { history.back(); } catch (e) { voltasPendentes--; }
    }, 0);
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function atualizarInercia() {
    const app = document.getElementById("app");
    if (app) app.inert = pilha.length > 0;
    pilha.forEach((f, i) => { f.fundo.inert = i !== pilha.length - 1; });
    document.body.classList.toggle("com-folha", pilha.length > 0);
}

export function abrirFolha({ titulo = "", corpo = "", rodape = "", variante = "folha", fixa = false, classe = "", aoFechar = null, aoAtualizar = null } = {}) {
    const id = ++proximoId;
    const fundo = document.createElement("div");
    fundo.className = variante === "dialogo" ? "folha-fundo dialogo" : "folha-fundo";
    const tituloId = `folha-titulo-${id}`;
    fundo.innerHTML = String(html`
        <div class="folha ${classe}" role="${variante === "dialogo" ? "alertdialog" : "dialog"}" aria-modal="true" aria-labelledby="${tituloId}" tabindex="-1">
            <header class="folha-topo">
                <h2 id="${tituloId}">${titulo}</h2>
                ${fixa ? "" : html`<button type="button" class="botao-icone" data-fechar-folha aria-label="Fechar">${icone("fechar")}</button>`}
            </header>
            <div class="folha-corpo">${corpo}</div>
            ${String(rodape ?? "") ? html`<footer class="folha-rodape">${rodape}</footer>` : ""}
        </div>`);

    const folha = {
        id, fundo, fixa, aoFechar, aoAtualizar,
        el: fundo.querySelector(".folha"),
        corpoEl: fundo.querySelector(".folha-corpo"),
        rodapeEl: fundo.querySelector(".folha-rodape"),
        focoAnterior: document.activeElement,
        fechada: false,
        fechar: () => fecharFolha(folha),
        definirCorpo(conteudo) { folha.corpoEl.innerHTML = String(conteudo); },
        definirTitulo(texto) { fundo.querySelector(".folha-topo h2").textContent = texto; },
        definirRodape(conteudo) {
            if (!String(conteudo ?? "")) {
                if (folha.rodapeEl) { folha.rodapeEl.remove(); folha.rodapeEl = null; }
                return;
            }
            if (!folha.rodapeEl) {
                folha.rodapeEl = document.createElement("footer");
                folha.rodapeEl.className = "folha-rodape";
                folha.el.appendChild(folha.rodapeEl);
            }
            folha.rodapeEl.innerHTML = String(conteudo);
        }
    };

    let comecouNoFundo = false;
    fundo.addEventListener("pointerdown", ev => { comecouNoFundo = ev.target === fundo; });
    fundo.addEventListener("click", ev => {
        if (ev.target === fundo && comecouNoFundo && !fixa) fecharFolha(folha);
        else if (ev.target.closest("[data-fechar-folha]")) fecharFolha(folha);
    });

    pilha.push(folha);
    document.getElementById("camada").appendChild(fundo);
    atualizarInercia();

    // o botão "voltar" do celular fecha a janela em vez de sair do app
    colocarEntrada();

    const alvo = folha.el.querySelector("[data-foco]") || folha.el.querySelector('input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), select, textarea') || folha.el;
    requestAnimationFrame(() => { if (!folha.fechada) alvo.focus({ preventScroll: true }); });
    return folha;
}

function fecharFolha(folha) {
    const i = pilha.indexOf(folha);
    if (i < 0 || folha.fechada) return;
    folha.fechada = true;
    pilha.splice(i, 1);
    folha.fundo.remove();
    atualizarInercia();
    if (folha.focoAnterior && document.contains(folha.focoAnterior) && !pilha.length) {
        try { folha.focoAnterior.focus({ preventScroll: true }); } catch (e) { /* elemento sumiu */ }
    } else if (pilha.length) {
        const topo = pilha[pilha.length - 1];
        const alvo = topo.el.querySelector("[data-foco]") || topo.el;
        alvo.focus({ preventScroll: true });
    }
    if (folha.aoFechar) folha.aoFechar();
    if (!pilha.length) retirarEntradaDepois();
}

export function fecharTodasAsFolhas() {
    [...pilha].reverse().forEach(f => fecharFolha(f));
}

export const haFolhaAberta = () => pilha.length > 0;

// a tela mudou (dados novos): janelas de consulta se redesenham
export function atualizarFolhasAbertas() {
    [...pilha].forEach(f => { if (f.aoAtualizar && !f.fechada) f.aoAtualizar(f); });
}

window.addEventListener("popstate", () => {
    if (voltasPendentes > 0) {
        // a volta que pedimos chegou
        voltasPendentes--;
        if (voltasPendentes === 0 && precisaEntrada) {
            precisaEntrada = false;
            if (pilha.length) colocarEntrada();
        }
        return;
    }
    // a pessoa apertou "voltar": a nossa entrada foi consumida
    entrada = false;
    const topo = pilha[pilha.length - 1];
    if (!topo) return;
    if (!topo.fixa) fecharFolha(topo);   // janela de andamento: o "voltar" não fecha
    if (pilha.length) colocarEntrada();   // ainda há janela aberta: repõe a entrada para o próximo "voltar"
});

document.addEventListener("keydown", ev => {
    const topo = pilha[pilha.length - 1];
    if (!topo) return;
    if (ev.key === "Escape" && !topo.fixa) {
        ev.preventDefault();
        fecharFolha(topo);
    } else if (ev.key === "Tab") {
        const itens = [...topo.el.querySelectorAll(FOCAVEIS)].filter(e => e.offsetParent !== null);
        if (!itens.length) { ev.preventDefault(); topo.el.focus(); return; }
        const primeiro = itens[0], ultimo = itens[itens.length - 1];
        if (ev.shiftKey && (document.activeElement === primeiro || document.activeElement === topo.el)) { ev.preventDefault(); ultimo.focus(); }
        else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
    }
});

// ---------- confirmações (no lugar de confirm() e prompt()) ----------

// devolve Promise<boolean>
export function confirmar({ titulo, texto = "", rotuloOk = "Confirmar", rotuloCancelar = "Cancelar", perigo = false }) {
    return new Promise(resolve => {
        let respondido = false;
        const responder = valor => { if (!respondido) { respondido = true; resolve(valor); } };
        const folha = abrirFolha({
            titulo, variante: "dialogo", fixa: false,
            corpo: html`<p class="texto-dialogo">${texto}</p>`,
            rodape: html`
                <button type="button" class="botao secundario" data-resposta="nao">${rotuloCancelar}</button>
                <button type="button" class="botao ${perigo ? "perigo-cheio" : "principal"}" data-resposta="sim" data-foco>${rotuloOk}</button>`,
            aoFechar: () => responder(false)
        });
        folha.rodapeEl.addEventListener("click", ev => {
            const b = ev.target.closest("[data-resposta]");
            if (!b) return;
            responder(b.dataset.resposta === "sim");
            folha.fechar();
        });
    });
}

// pede para digitar uma palavra (ex.: APAGAR) antes de liberar o botão
export function confirmarDigitando({ titulo, texto, palavra, rotuloOk = "Confirmar", rotuloCampo = "Digite para confirmar" }) {
    return new Promise(resolve => {
        let respondido = false;
        const responder = valor => { if (!respondido) { respondido = true; resolve(valor); } };
        const folha = abrirFolha({
            titulo, variante: "dialogo",
            corpo: html`
                <p class="texto-dialogo">${texto}</p>
                <div class="campo">
                    <label for="digitar-palavra">${rotuloCampo}: <strong>${palavra}</strong></label>
                    <input id="digitar-palavra" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">
                </div>`,
            rodape: html`
                <button type="button" class="botao secundario" data-resposta="nao">Cancelar</button>
                <button type="button" class="botao perigo-cheio" data-resposta="sim" disabled>${rotuloOk}</button>`,
            aoFechar: () => responder(false)
        });
        const campo = folha.el.querySelector("#digitar-palavra");
        const ok = folha.rodapeEl.querySelector('[data-resposta="sim"]');
        campo.addEventListener("input", () => { ok.disabled = campo.value.trim().toUpperCase() !== palavra.toUpperCase(); });
        campo.addEventListener("keydown", ev => { if (ev.key === "Enter" && !ok.disabled) ok.click(); });
        folha.rodapeEl.addEventListener("click", ev => {
            const b = ev.target.closest("[data-resposta]");
            if (!b || b.disabled) return;
            responder(b.dataset.resposta === "sim");
            folha.fechar();
        });
    });
}

// ---------- avisos rápidos ----------

let temporizadorAviso = null;

// avisar("Cliente salvo", { acao: { rotulo: "Desfazer", aoClicar: () => … }, tipo: "erro" })
export function avisar(texto, { acao = null, tipo = "", duracao } = {}) {
    const area = document.getElementById("avisos");
    if (!area) return;
    clearTimeout(temporizadorAviso);
    area.innerHTML = String(html`
        <div class="aviso-rapido ${tipo}">
            <span>${texto}</span>
            ${acao ? html`<button type="button" class="aviso-acao">${acao.rotulo}</button>` : ""}
        </div>`);
    const caixa = area.firstElementChild;
    requestAnimationFrame(() => caixa.classList.add("visivel"));
    if (acao) {
        caixa.querySelector(".aviso-acao").addEventListener("click", () => {
            clearTimeout(temporizadorAviso);
            caixa.remove();
            acao.aoClicar();
        });
    }
    temporizadorAviso = setTimeout(() => caixa.remove(), duracao ?? (acao ? 7000 : tipo === "erro" ? 6000 : 3200));
}

// ---------- blocos reutilizáveis ----------

export function chip(texto, tom = "neutro") {
    return html`<span class="chip ${tom}">${texto}</span>`;
}

// tela vazia que convida a agir
export function estadoVazio({ titulo, texto = "", rotulo = "", acao = "", dados = "" }) {
    return html`
        <div class="vazio">
            <p class="vazio-titulo">${titulo}</p>
            ${texto ? html`<p class="vazio-texto">${texto}</p>` : ""}
            ${rotulo ? html`<button type="button" class="botao principal" data-acao="${acao}" ${raw(dados)}>${rotulo}</button>` : ""}
        </div>`;
}

export function esqueleto(linhas = 4) {
    return html`<div class="esqueleto" aria-hidden="true">${Array.from({ length: linhas }, () => html`<div class="esqueleto-linha"></div>`)}</div>`;
}

// campo de formulário com rótulo ligado (for/id), dica e área de erro
export function campo({ id, rotulo, tipo = "text", valor = "", dica = "", erro = "", placeholder = "", modo = "", extra = "" }) {
    const descritores = [dica ? `${id}-dica` : "", `${id}-erro`].filter(Boolean).join(" ");
    return html`
        <div class="campo${erro ? " com-erro" : ""}">
            <label for="${id}">${rotulo}</label>
            <input id="${id}" name="${id}" type="${tipo}" value="${valor}" placeholder="${placeholder}"
                ${raw(modo ? `inputmode="${esc(modo)}"` : "")} ${raw(extra)}
                aria-describedby="${descritores}" ${raw(erro ? 'aria-invalid="true"' : "")}>
            ${dica ? html`<p class="dica" id="${id}-dica">${dica}</p>` : ""}
            <p class="erro-campo" id="${id}-erro" role="alert">${erro}</p>
        </div>`;
}

// escreve/limpa a mensagem de erro de um campo já na tela
export function mostrarErro(raiz, id, mensagem) {
    const input = raiz.querySelector(`#${id}`);
    const area = raiz.querySelector(`#${id}-erro`);
    if (area) area.textContent = mensagem || "";
    if (input) {
        if (mensagem) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid");
        input.closest(".campo")?.classList.toggle("com-erro", !!mensagem);
    }
}

export function opcoes(lista, selecionado, { vazio = "", rotulo = x => x.nome, valor = x => x.id } = {}) {
    return html`
        ${vazio ? html`<option value="">${vazio}</option>` : ""}
        ${lista.map(x => html`<option value="${valor(x)}" ${raw(valor(x) === selecionado ? "selected" : "")}>${rotulo(x)}</option>`)}`;
}

export { Raw };

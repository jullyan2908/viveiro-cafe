// Tela de vendas: lista com filtros, detalhes da venda, receber, definir preço, entrega, cancelar, excluir.

import { html, raw, dinheiro, numero, plural, dataBR, dataCurta, dataLocal, nomeDoMes, numeroParaCampo, linkWhatsApp } from "../util.js";
import { abrirFolha, campo, mostrarErro, avisar, confirmar, estadoVazio, chip, icone } from "../ui.js";
import { estado, clientesPorId, vendasPorId, vendasVisiveis, estoquePorId } from "../estado.js";
import {
    itensDaVenda, totalVenda, pagoVenda, saldoVenda, statusVenda, entregaVenda, quantidadeVenda,
    resumoItens, nomeDoCliente, filtrarVendas, contarPorFiltro, mesesDasVendas, validarRecebimento, validarPrecos,
    mensagemMudasProntas, FILTROS_VENDA
} from "../regras.js";
import {
    receberPagamento, definirPrecos, marcarEntrega, cancelarVenda, reativarVenda,
    enviarParaLixeira, restaurarDaLixeira
} from "../db.js";
import { abrirFormVenda } from "./form-venda.js";

const POR_PAGINA = 80;
let busca = "";
let situacao = "todas";
let mes = "";
let limite = POR_PAGINA;
let assinaturaMeses = "";

const ROTULO_FILTRO = { todas: "Todas", a_receber: "A receber", sem_preco: "Sem preço", a_entregar: "A entregar", pagas: "Pagas" };

// ---------- peças compartilhadas (a tela de clientes também usa) ----------

export function chipSituacao(v) {
    switch (statusVenda(v)) {
        case "pago": return chip("Pago", "verde");
        case "parcial": return chip("Parcial", "laranja");
        case "reservado": return chip("A receber", "laranja");
        case "sem_preco": return chip("Sem preço", "azul");
        default: return chip("Cancelada", "neutro");
    }
}

export function linhaVenda(v, { mostrarCliente = true } = {}) {
    const st = statusVenda(v);
    const total = totalVenda(v);
    const saldo = saldoVenda(v);
    const entrega = entregaVenda(v);
    const resumo = resumoItens(itensDaVenda(v));
    const nome = nomeDoCliente(v, clientesPorId());
    return html`
        <li class="linha venda${st === "cancelada" ? " cancelada" : ""}">
            <button type="button" class="linha-corpo" data-acao="venda:abrir" data-id="${v.id}">
                <span class="linha-titulo">${mostrarCliente ? nome : resumo}</span>
                ${mostrarCliente ? html`<span class="linha-sub">${resumo}</span>` : ""}
                <span class="linha-meta">
                    ${v.data ? html`<span>${dataCurta(v.data)}</span>` : ""}
                    ${st === "parcial" || st === "reservado" ? html`<span class="falta">falta ${dinheiro(saldo)}</span>` : ""}
                    ${entrega === "pendente" && st !== "cancelada" ? html`<span class="entrega">${icone("caixa", 14)} a entregar${v.retirada ? " em " + dataCurta(v.retirada) : ""}</span>` : ""}
                </span>
            </button>
            <span class="linha-lado">
                ${chipSituacao(v)}
                <span class="linha-valor num">${total === null ? "a definir" : dinheiro(total)}</span>
            </span>
        </li>`;
}

// ---------- a tela ----------

function cabecalhoDaTela() {
    return html`
        <div class="barra-acoes">
            <div class="busca">
                ${icone("buscar", 20)}
                <input type="search" id="vendas-busca" placeholder="Buscar" aria-label="Buscar venda por cliente ou variedade" autocomplete="off" value="${busca}" data-entrada="vendas:buscar">
            </div>
            <button type="button" class="botao principal" data-acao="vendas:nova">${icone("adicionar", 20)} Nova venda</button>
        </div>
        <div class="filtros" role="group" aria-label="Filtrar vendas">
            <span class="contem" id="vendas-filtros"></span>
            <span class="contem" id="vendas-mes-area"></span>
        </div>
        <div id="vendas-lista"></div>`;
}

function desenharFiltros() {
    const contagem = contarPorFiltro(vendasVisiveis());
    document.getElementById("vendas-filtros").innerHTML = String(html`
        ${FILTROS_VENDA.map(f => html`
            <button type="button" class="filtro" data-acao="vendas:filtro" data-filtro="${f}" aria-pressed="${f === situacao ? "true" : "false"}">
                ${ROTULO_FILTRO[f]}${f === "todas" ? "" : html` <span class="contagem">${contagem[f]}</span>`}
            </button>`)}`);

    const meses = mesesDasVendas(estado.vendas);
    const assinatura = meses.join(",") + "|" + mes;
    if (assinatura !== assinaturaMeses) {
        assinaturaMeses = assinatura;
        const area = document.getElementById("vendas-mes-area");
        area.innerHTML = meses.length < 2 ? "" : String(html`
            <select id="vendas-mes" class="filtro-mes${mes ? " ativo" : ""}" aria-label="Filtrar por mês" data-mudanca="vendas:mes">
                <option value="">Todos os meses</option>
                ${meses.map(m => html`<option value="${m}" ${raw(m === mes ? "selected" : "")}>${nomeDoMes(m)}</option>`)}
            </select>`);
    }
}

function desenharLista() {
    const area = document.getElementById("vendas-lista");
    const todas = vendasVisiveis();
    if (!todas.length) {
        area.innerHTML = String(estadoVazio({
            titulo: "Nenhuma venda registrada",
            texto: "Registre a primeira venda para acompanhar o que cada cliente já pagou.",
            rotulo: "Registrar a primeira venda", acao: "vendas:nova"
        }));
        return;
    }
    const lista = filtrarVendas(todas, { situacao, mes, busca, clientesPorId: clientesPorId() });
    if (!lista.length) {
        area.innerHTML = String(estadoVazio({
            titulo: "Nenhuma venda encontrada",
            texto: "Mude a busca ou o filtro para ver outras vendas.",
            rotulo: "Limpar busca e filtros", acao: "vendas:limpar"
        }));
        return;
    }
    const visiveis = lista.slice(0, limite);
    area.innerHTML = String(html`
        <ul class="lista">${visiveis.map(v => linhaVenda(v))}</ul>
        ${lista.length > limite ? html`<button type="button" class="botao secundario largo" data-acao="vendas:mais">Mostrar mais (${numero(lista.length - limite)} restantes)</button>` : ""}`);
}

export const tela = {
    id: "vendas",
    titulo: "Vendas",
    icone: "venda",
    entrar(raizEl) {
        limite = POR_PAGINA;
        assinaturaMeses = "";
        raizEl.innerHTML = String(cabecalhoDaTela());
        desenharFiltros();
        desenharLista();
    },
    atualizar() {
        desenharFiltros();
        desenharLista();
    },
    // outras telas podem abrir a lista já filtrada (ex.: "A entregar" no painel)
    filtrarPor(f) { situacao = f; busca = ""; mes = ""; limite = POR_PAGINA; assinaturaMeses = ""; }
};

// ---------- detalhes da venda ----------

function corpoDaVenda(v) {
    const st = statusVenda(v);
    const total = totalVenda(v);
    const pago = pagoVenda(v);
    const saldo = saldoVenda(v);
    const entrega = entregaVenda(v);
    const cliente = clientesPorId().get(v.clienteId);
    const zap = cliente ? linkWhatsApp(cliente.telefone, mensagemMudasProntas(cliente, itensDaVenda(v))) : "";

    return html`
        <div class="topo-venda">
            ${chipSituacao(v)}
            ${v.data ? html`<span class="muted">${dataBR(v.data)}</span>` : ""}
        </div>

        <table class="itens">
            <caption class="sr-only">Mudas desta venda</caption>
            <thead><tr><th scope="col">Muda</th><th scope="col" class="direita">Valor</th></tr></thead>
            <tbody>
                ${itensDaVenda(v).map(i => html`
                    <tr>
                        <td><span class="item-nome">${numero(i.quantidade)} ${i.produto}</span>
                            ${i.valor !== null && i.valor !== undefined && i.quantidade ? html`<span class="item-sub">${dinheiro(i.valor / i.quantidade)} por muda</span>` : ""}</td>
                        <td class="direita num">${i.valor === null || i.valor === undefined ? "a definir" : dinheiro(i.valor)}</td>
                    </tr>`)}
            </tbody>
        </table>

        <dl class="resumo-venda">
            <div class="resumo-linha"><dt>Total</dt><dd class="num">${total === null ? "a definir" : dinheiro(total)}</dd></div>
            <div class="resumo-linha"><dt>${total === null ? "Sinal recebido" : "Já recebido"}</dt><dd class="num">${dinheiro(pago)}</dd></div>
            ${total === null || st === "cancelada" ? "" : html`<div class="resumo-linha destaque"><dt>Falta receber</dt><dd class="num">${dinheiro(saldo)}</dd></div>`}
        </dl>

        ${entrega === "pendente" && st !== "cancelada" ? html`
            <div class="bloco-entrega pendente">
                <p><strong>A entregar.</strong>${v.retirada ? ` Retirada ou entrega prevista para ${dataBR(v.retirada)}.` : ""}</p>
                ${acaoDoRodape(v) === "entregar" ? "" : html`<button type="button" class="botao secundario largo" data-acao="venda:entregar" data-id="${v.id}">${icone("caixa", 20)} Marcar como entregue</button>`}
                ${zap ? html`<a class="botao secundario largo" href="${zap}" target="_blank" rel="noopener">${icone("conversa", 20)} Avisar pelo WhatsApp</a>` : ""}
            </div>` : ""}
        ${entrega === "entregue" ? html`
            <div class="bloco-entrega feita">
                <p><strong>Entregue</strong>${v.entregueEm ? ` em ${dataBR(dataLocal(new Date(v.entregueEm)))}` : ""}.</p>
                <button type="button" class="botao texto" data-acao="venda:desfazer-entrega" data-id="${v.id}">Desfazer entrega</button>
            </div>` : ""}

        <div class="acoes-lista">
            ${st === "cancelada" ? "" : html`<button type="button" class="botao secundario largo" data-acao="venda:editar" data-id="${v.id}">${icone("editar", 20)} Editar venda</button>`}
        </div>

        <div class="zona-cuidado">
            ${st === "cancelada" ? "" : html`<button type="button" class="botao perigo largo" data-acao="venda:cancelar" data-id="${v.id}">Cancelar venda e devolver as mudas ao estoque</button>`}
            <button type="button" class="botao perigo largo" data-acao="venda:excluir" data-id="${v.id}">${icone("lixeira", 20)} Excluir do histórico</button>
        </div>`;
}

// o botão grande de baixo: a próxima coisa que mais provavelmente falta fazer nesta venda
function acaoDoRodape(v) {
    const st = statusVenda(v);
    if (st === "cancelada") return "reativar";
    if (st === "sem_preco") return "definir-preco";
    if (st === "reservado" || st === "parcial") return "receber";
    if (entregaVenda(v) === "pendente") return "entregar";
    return "";
}

function rodapeDaVenda(v) {
    switch (acaoDoRodape(v)) {
        case "reativar": return html`<button type="button" class="botao principal largo" data-acao="venda:reativar" data-id="${v.id}">Reativar venda</button>`;
        case "definir-preco": return html`<button type="button" class="botao principal largo" data-acao="venda:definir-preco" data-id="${v.id}">${icone("etiqueta", 20)} Definir preço</button>`;
        case "receber": return html`<button type="button" class="botao principal largo" data-acao="venda:receber" data-id="${v.id}">${icone("moeda", 20)} Receber pagamento</button>`;
        case "entregar": return html`<button type="button" class="botao principal largo" data-acao="venda:entregar" data-id="${v.id}">${icone("caixa", 20)} Marcar como entregue</button>`;
        default: return "";
    }
}

let detalhe = null; // { id, folha }

export function abrirVenda(id) {
    const v = vendasPorId().get(id);
    if (!v || v.removido) return null;
    const folha = abrirFolha({
        titulo: nomeDoCliente(v, clientesPorId()),
        classe: "folha-detalhe",
        corpo: corpoDaVenda(v),
        rodape: rodapeDaVenda(v),
        aoFechar: () => { if (detalhe && detalhe.folha === folha) detalhe = null; },
        aoAtualizar: f => {
            const atual = vendasPorId().get(id);
            if (!atual || atual.removido) { f.fechar(); return; }
            f.definirTitulo(nomeDoCliente(atual, clientesPorId()));
            f.definirCorpo(corpoDaVenda(atual));
            f.definirRodape(rodapeDaVenda(atual));
        }
    });
    detalhe = { id, folha };
    return folha;
}

const vendaDe = el => vendasPorId().get(el.dataset.id);

// ---------- receber pagamento ----------

let receber = null;

function abrirReceber(v) {
    const saldo = saldoVenda(v);
    const folha = abrirFolha({
        titulo: "Receber pagamento",
        corpo: html`
            <p class="texto-dialogo"><strong>${nomeDoCliente(v, clientesPorId())}</strong> deve ${dinheiro(saldo)} de ${dinheiro(totalVenda(v))}.</p>
            <form id="form-receber" data-envio="venda:receber-salvar" novalidate>
                ${campo({ id: "receber-valor", rotulo: "Valor recebido agora", valor: numeroParaCampo(saldo, 2), modo: "decimal", extra: 'autocomplete="off" data-foco', dica: "Já veio com o que falta. Mude se o pagamento for parcial." })}
            </form>`,
        rodape: html`<button type="submit" form="form-receber" class="botao principal largo">Registrar pagamento</button>`,
        aoFechar: () => { receber = null; }
    });
    receber = { id: v.id, folha };
    const campoValor = folha.el.querySelector("#receber-valor");
    requestAnimationFrame(() => campoValor.select());
}

function salvarRecebimento() {
    if (!receber) return;
    const v = vendasPorId().get(receber.id);
    if (!v) return;
    const r = validarRecebimento(receber.folha.el.querySelector("#receber-valor").value, v);
    if (r.erro) {
        mostrarErro(receber.folha.el, "receber-valor", r.erro);
        receber.folha.el.querySelector("#receber-valor").focus();
        return;
    }
    receberPagamento(v, r.valor);
    receber.folha.fechar();
    avisar(r.quitou ? "Pagamento quitado" : "Pagamento registrado");
}

// ---------- definir preço ----------

let precos = null;

function abrirDefinirPrecos(v) {
    const itens = itensDaVenda(v);
    const folha = abrirFolha({
        titulo: "Definir preço",
        corpo: html`
            <p class="texto-dialogo">Quanto você vai cobrar por muda em <strong>${nomeDoCliente(v, clientesPorId())}</strong>?</p>
            <form id="form-precos" data-envio="venda:precos-salvar" novalidate>
                ${itens.map((i, idx) => i.valor !== null && i.valor !== undefined ? "" : campo({
                    id: `preco-${idx}`,
                    rotulo: `${numero(i.quantidade)} ${i.produto}: preço por muda`,
                    modo: "decimal", placeholder: "Ex.: 1,50",
                    extra: `autocomplete="off" data-entrada="venda:precos-ao-vivo"${idx === itens.findIndex(x => x.valor === null || x.valor === undefined) ? " data-foco" : ""}`
                }))}
                <p class="erro-campo" id="precos-geral" role="alert"></p>
                <dl class="resumo-venda" id="precos-resumo" aria-live="polite"></dl>
            </form>`,
        rodape: html`<button type="submit" form="form-precos" class="botao principal largo">Salvar preço</button>`,
        aoFechar: () => { precos = null; }
    });
    precos = { id: v.id, folha };
    atualizarPrecosAoVivo();
}

function lerPrecos() {
    const v = vendasPorId().get(precos.id);
    const digitados = {};
    itensDaVenda(v).forEach((_, idx) => {
        const campoEl = precos.folha.el.querySelector(`#preco-${idx}`);
        if (campoEl) digitados[idx] = campoEl.value;
    });
    return { v, digitados };
}

function atualizarPrecosAoVivo() {
    if (!precos) return;
    const { v, digitados } = lerPrecos();
    const r = validarPrecos(digitados, v);
    const total = r.ok ? r.total : null;
    precos.folha.el.querySelector("#precos-resumo").innerHTML = String(html`
        <div class="resumo-linha"><dt>Total</dt><dd class="num">${total === null ? "a definir" : dinheiro(total)}</dd></div>
        <div class="resumo-linha"><dt>Já recebido</dt><dd class="num">${dinheiro(pagoVenda(v))}</dd></div>`);
}

function salvarPrecos() {
    if (!precos) return;
    const { v, digitados } = lerPrecos();
    const r = validarPrecos(digitados, v);
    const el = precos.folha.el;
    Object.keys(digitados).forEach(idx => mostrarErro(el, `preco-${idx}`, r.erros[idx] || ""));
    el.querySelector("#precos-geral").textContent = r.erroGeral || "";
    if (!r.ok) { el.querySelector('[aria-invalid="true"]')?.focus(); return; }
    definirPrecos(v, r.itens);
    precos.folha.fechar();
    avisar(`Preço definido: ${dinheiro(r.total)}`);
}

// ---------- cancelar, reativar, excluir ----------

async function pedirCancelamento(v) {
    const nome = nomeDoCliente(v, clientesPorId());
    const ok = await confirmar({
        titulo: "Cancelar esta venda?",
        texto: `As ${plural(quantidadeVenda(v), "muda", "mudas")} de ${nome} voltam para o estoque e a venda sai dos totais. Ela continua no histórico, e dá para reativar depois.`,
        rotuloOk: "Cancelar venda", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return;
    cancelarVenda(v);
    avisar("Venda cancelada", { acao: { rotulo: "Desfazer", aoClicar: () => reativar(v, "Cancelamento desfeito") } });
}

function reativar(v, mensagem = "Venda reativada") {
    // as mudas saem do estoque de novo: confere se ainda há o suficiente
    const faltas = [];
    itensDaVenda(v).forEach(i => {
        const p = estoquePorId().get(i.produtoId);
        const disponivel = p && !p.removido ? Number(p.quantidade) || 0 : 0;
        if (disponivel < i.quantidade) faltas.push(`${i.produto} (faltam ${numero(i.quantidade - disponivel)})`);
    });
    if (faltas.length) {
        avisar(`Não há estoque para reativar: ${faltas.join(", ")}`, { tipo: "erro" });
        return false;
    }
    reativarVenda(v);
    avisar(mensagem);
    return true;
}

async function pedirExclusao(v) {
    const nome = nomeDoCliente(v, clientesPorId());
    const pendente = !v.cancelada && entregaVenda(v) === "pendente";
    const ativa = !v.cancelada;
    const ok = await confirmar({
        titulo: "Excluir esta venda do histórico?",
        texto: html`A venda de <strong>${nome}</strong> sai da lista e dos totais. ${ativa ? "O estoque não volta: para devolver as mudas, cancele a venda em vez de excluir. " : ""}${pendente ? "Atenção: as mudas ainda não foram entregues. " : ""}Fica 30 dias na lixeira, em Mais.`,
        rotuloOk: "Excluir do histórico", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return false;
    enviarParaLixeira("vendas", v.id);
    avisar("Venda excluída do histórico", { acao: { rotulo: "Desfazer", aoClicar: () => restaurarDaLixeira("vendas", v.id) } });
    return true;
}

export const eventos = {
    cliques: {
        "vendas:nova": () => abrirFormVenda(),
        "vendas:filtro": el => { situacao = el.dataset.filtro; limite = POR_PAGINA; desenharFiltros(); desenharLista(); },
        "vendas:limpar": () => {
            busca = ""; situacao = "todas"; mes = ""; limite = POR_PAGINA; assinaturaMeses = "";
            const campoBusca = document.getElementById("vendas-busca");
            if (campoBusca) campoBusca.value = "";
            desenharFiltros(); desenharLista();
        },
        "vendas:mais": () => { limite += POR_PAGINA; desenharLista(); },
        "venda:abrir": el => abrirVenda(el.dataset.id),
        "venda:receber": el => { const v = vendaDe(el); if (v) abrirReceber(v); },
        "venda:definir-preco": el => { const v = vendaDe(el); if (v) abrirDefinirPrecos(v); },
        "venda:editar": el => { const v = vendaDe(el); if (v) abrirFormVenda({ venda: v }); },
        "venda:entregar": el => {
            const v = vendaDe(el);
            if (!v) return;
            marcarEntrega(v, true);
            avisar("Venda marcada como entregue", { acao: { rotulo: "Desfazer", aoClicar: () => marcarEntrega(v, false) } });
        },
        "venda:desfazer-entrega": el => { const v = vendaDe(el); if (v) { marcarEntrega(v, false); avisar("Entrega desfeita"); } },
        "venda:cancelar": async el => { const v = vendaDe(el); if (v) { await pedirCancelamento(v); } },
        "venda:reativar": el => { const v = vendaDe(el); if (v) reativar(v); },
        "venda:excluir": async el => {
            const v = vendaDe(el);
            if (!v) return;
            const excluiu = await pedirExclusao(v);
            if (excluiu && detalhe && detalhe.id === v.id) detalhe.folha.fechar();
        }
    },
    entradas: {
        "vendas:buscar": el => { busca = el.value; limite = POR_PAGINA; desenharLista(); },
        "venda:precos-ao-vivo": () => atualizarPrecosAoVivo()
    },
    mudancas: {
        "vendas:mes": el => { mes = el.value; assinaturaMeses = ""; limite = POR_PAGINA; desenharFiltros(); desenharLista(); }
    },
    envios: {
        "venda:receber-salvar": salvarRecebimento,
        "venda:precos-salvar": salvarPrecos
    }
};

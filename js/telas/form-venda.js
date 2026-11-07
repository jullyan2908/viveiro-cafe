// Formulário de venda: novo e editar. Uma venda pode ter várias variedades.

import { html, raw, dinheiro, numero, plural, dataLocal, numeroParaCampo, precoParaCampo, contem } from "../util.js";
import { abrirFolha, campo, mostrarErro, avisar, estadoVazio, icone } from "../ui.js";
import { estado, clientesAtivos, clientesPorId, estoqueAtivo, estoquePorId } from "../estado.js";
import { validarVenda, itensDaVenda, pagoVenda } from "../regras.js";
import { registrarVenda, editarVenda } from "../db.js";
import { abrirFormCliente } from "./form-cliente.js";

const CHAVE_JA_ENTREGUE = "viveiro_ja_entregue";

let form = null;       // o formulário aberto
let seletor = null;    // a janela de escolher cliente

const idItem = (chave, parte) => `item-${chave}-${parte}`;

function lembrarEntrega() {
    try { return localStorage.getItem(CHAVE_JA_ENTREGUE) === "1"; } catch (e) { return false; }
}

// ---------- abrir ----------

export function abrirFormVenda({ venda = null, clienteId = "", clienteNome = "" } = {}) {
    if (!venda && !estoqueAtivo().length) {
        avisar("Cadastre uma variedade no Estoque antes de registrar uma venda", { tipo: "erro" });
        return;
    }
    if (!venda && !clientesAtivos().length && !clienteId) {
        // sem clientes ainda: já abre o cadastro de cliente e depois volta para a venda
        abrirFormCliente({ aoSalvar: (id, dados) => abrirFormVenda({ clienteId: id, clienteNome: dados.nome }) });
        return;
    }

    const editando = !!venda;
    form = {
        venda,
        editando,
        clienteId: venda?.clienteId ?? clienteId,
        clienteNomeNovo: clienteNome,
        itens: [],
        proximaChave: 1,
        entrada: editando ? numeroParaCampo(pagoVenda(venda), 2) : "",
        data: venda?.data || dataLocal(),
        retirada: venda?.retirada || "",
        jaEntregue: editando ? venda.entregue === true : lembrarEntrega(),
        tentou: false,
        folha: null
    };

    if (editando) {
        itensDaVenda(venda).forEach(i => form.itens.push({
            chave: form.proximaChave++,
            produtoId: i.produtoId || "",
            produtoNome: i.produto,
            quantidade: String(i.quantidade),
            preco: i.valor === null || i.valor === undefined || !i.quantidade ? "" : precoParaCampo(i.valor / i.quantidade)
        }));
    } else {
        form.itens.push({ chave: form.proximaChave++, produtoId: "", quantidade: "", preco: "" });
    }

    form.folha = abrirFolha({
        titulo: editando ? "Editar venda" : "Nova venda",
        classe: "folha-venda",
        corpo: corpoDoFormulario(),
        rodape: html`<button type="submit" form="form-venda" class="botao principal largo">${editando ? "Salvar alterações" : "Registrar venda"}</button>`,
        aoFechar: () => { form = null; if (seletor) seletor.fechar(); }
    });
    atualizarResumo();
}

// ---------- HTML ----------

function nomeDoClienteEscolhido() {
    return clientesPorId().get(form.clienteId)?.nome || form.clienteNomeNovo || "";
}

function opcoesProduto(selecionadoId, itemAtual) {
    const naVenda = new Map((form.venda ? itensDaVenda(form.venda) : []).map(i => [i.produtoId, Number(i.quantidade) || 0]));
    const lista = estoqueAtivo();
    const existe = lista.some(p => p.id === selecionadoId);
    return html`
        <option value="">Escolher variedade</option>
        ${lista.map(p => {
            const disponivel = (Number(p.quantidade) || 0) + (naVenda.get(p.id) || 0);
            const rotulo = disponivel > 0 ? `${p.nome} — ${numero(disponivel)} em estoque` : `${p.nome} — sem estoque`;
            const desabilitar = disponivel <= 0 && p.id !== selecionadoId;
            return html`<option value="${p.id}" ${raw(p.id === selecionadoId ? "selected" : "")} ${raw(desabilitar ? "disabled" : "")}>${rotulo}</option>`;
        })}
        ${selecionadoId && !existe ? html`<option value="${selecionadoId}" selected>${itemAtual.produtoNome || "Variedade removida"} (removida)</option>` : ""}`;
}

function htmlItem(item, indice) {
    const podeRemover = form.itens.length > 1;
    return html`
        <fieldset class="item-venda" data-chave="${item.chave}">
            <legend>${form.itens.length > 1 ? `Variedade ${indice + 1}` : "Mudas"}</legend>
            <div class="campo">
                <label for="${idItem(item.chave, "produto")}">Variedade</label>
                <select id="${idItem(item.chave, "produto")}" data-mudanca="venda:campo" data-parte="produtoId" aria-describedby="${idItem(item.chave, "produto")}-erro">
                    ${opcoesProduto(item.produtoId, item)}
                </select>
                <p class="erro-campo" id="${idItem(item.chave, "produto")}-erro" role="alert"></p>
            </div>
            <div class="par">
                ${campo({ id: idItem(item.chave, "quantidade"), rotulo: "Quantidade", valor: item.quantidade, modo: "numeric", placeholder: "Ex.: 500", extra: 'data-entrada="venda:campo" data-parte="quantidade" autocomplete="off"' })}
                ${campo({ id: idItem(item.chave, "preco"), rotulo: "Preço por muda", valor: item.preco, modo: "decimal", placeholder: "Ex.: 1,50", extra: 'data-entrada="venda:campo" data-parte="preco" autocomplete="off"' })}
            </div>
            <p class="dica" id="${idItem(item.chave, "info")}"></p>
            ${podeRemover ? html`<button type="button" class="botao texto" data-acao="venda:remover-item" data-chave="${item.chave}">${icone("lixeira", 18)} Tirar esta variedade</button>` : ""}
        </fieldset>`;
}

function corpoDoFormulario() {
    const nome = nomeDoClienteEscolhido();
    return html`
        <form id="form-venda" data-envio="venda:salvar" novalidate>
            <div class="campo">
                <label id="venda-cliente-rotulo">Cliente</label>
                <button type="button" class="seletor${nome ? "" : " sem-valor"}" id="venda-cliente" data-acao="venda:escolher-cliente" aria-labelledby="venda-cliente-rotulo venda-cliente" aria-describedby="venda-cliente-erro">
                    <span>${nome || "Escolher cliente"}</span>${icone("direita", 20)}
                </button>
                <p class="erro-campo" id="venda-cliente-erro" role="alert"></p>
            </div>

            <div id="venda-itens">${form.itens.map(htmlItem)}</div>
            <p class="erro-campo" id="venda-geral-erro" role="alert"></p>
            <button type="button" class="botao secundario largo" data-acao="venda:mais-item">${icone("adicionar", 18)} Outra variedade</button>
            <p class="dica">Deixe o preço em branco se ainda não combinou: dá para definir depois.</p>

            <div class="grupo-form">
                <div class="campo-com-botao">
                    ${campo({ id: "venda-entrada", rotulo: form.editando ? "Já recebido" : "Entrada (já pagou)", valor: form.entrada, modo: "decimal", placeholder: "R$ 0,00", dica: "Deixe em branco se ainda não pagou nada.", extra: 'data-entrada="venda:campo" data-parte="entrada" autocomplete="off"' })}
                    <button type="button" class="botao secundario" data-acao="venda:pagou-tudo">Pagou tudo</button>
                </div>
            </div>

            <div class="grupo-form">
                ${campo({ id: "venda-data", rotulo: "Data da venda", tipo: "date", valor: form.data, extra: 'data-mudanca="venda:campo" data-parte="data"' })}
                ${form.editando && form.venda.entregue === true ? "" : html`
                    ${form.editando ? "" : html`
                        <label class="marcar">
                            <input type="checkbox" id="venda-ja-entregue" data-mudanca="venda:entrega" ${raw(form.jaEntregue ? "checked" : "")}>
                            <span>O cliente já levou as mudas</span>
                        </label>`}
                    <div id="venda-retirada-grupo"${raw(form.jaEntregue ? " hidden" : "")}>
                        ${campo({ id: "venda-retirada", rotulo: "Retirada ou entrega prevista", tipo: "date", valor: form.retirada, dica: "Opcional. Ajuda a lembrar quando entregar.", extra: 'data-mudanca="venda:campo" data-parte="retirada"' })}
                    </div>`}
            </div>

            <dl class="resumo-venda" id="venda-resumo" aria-live="polite"></dl>
        </form>`;
}

// ---------- ler e validar ----------

function lerModelo() {
    const el = form.folha.el;
    form.itens.forEach(it => {
        it.produtoId = el.querySelector("#" + idItem(it.chave, "produto"))?.value ?? it.produtoId;
        it.quantidade = el.querySelector("#" + idItem(it.chave, "quantidade"))?.value ?? it.quantidade;
        it.preco = el.querySelector("#" + idItem(it.chave, "preco"))?.value ?? it.preco;
    });
    form.entrada = el.querySelector("#venda-entrada")?.value ?? form.entrada;
    form.data = el.querySelector("#venda-data")?.value ?? form.data;
    form.retirada = el.querySelector("#venda-retirada")?.value ?? form.retirada;
    const caixa = el.querySelector("#venda-ja-entregue");
    if (caixa) form.jaEntregue = caixa.checked;
}

function validar() {
    return validarVenda({
        clienteId: form.clienteId,
        itens: form.itens,
        entrada: form.entrada,
        data: form.data,
        retirada: form.jaEntregue ? "" : form.retirada,
        estoque: estoqueAtivo(),
        clientes: clientesAtivos().concat(form.clienteNomeNovo ? [{ id: form.clienteId, nome: form.clienteNomeNovo }] : []),
        itensAntigos: form.venda ? itensDaVenda(form.venda) : []
    });
}

function atualizarResumo() {
    if (!form) return;
    lerModelo();
    const r = validar();
    const el = form.folha.el;

    const total = r.dados.total;
    const pago = r.dados.valorPago;
    el.querySelector("#venda-resumo").innerHTML = String(html`
        <div class="resumo-linha"><dt>Total</dt><dd class="num">${total === null ? "a definir" : dinheiro(total)}</dd></div>
        <div class="resumo-linha"><dt>${form.editando ? "Já recebido" : "Entrada"}</dt><dd class="num">${dinheiro(pago)}</dd></div>
        ${total === null ? "" : html`<div class="resumo-linha destaque"><dt>Falta receber</dt><dd class="num">${dinheiro(r.saldo)}</dd></div>`}`);

    form.itens.forEach(it => {
        const p = estoquePorId().get(it.produtoId);
        const info = el.querySelector("#" + idItem(it.chave, "info"));
        if (!info) return;
        if (!p) { info.textContent = ""; return; }
        const devolvidas = form.venda ? (itensDaVenda(form.venda).find(i => i.produtoId === p.id)?.quantidade || 0) : 0;
        info.textContent = `Em estoque: ${plural((Number(p.quantidade) || 0) + devolvidas, "muda", "mudas")}`;
    });

    if (form.tentou) mostrarErros(r);
    return r;
}

function mostrarErros(r) {
    const el = form.folha.el;
    mostrarErro(el, "venda-cliente", r.erros.cliente);
    const geral = el.querySelector("#venda-geral-erro");
    if (geral) geral.textContent = r.erros.geral || "";
    form.itens.forEach((it, i) => {
        const e = r.erros.itens[i] || {};
        const pe = el.querySelector("#" + idItem(it.chave, "produto") + "-erro");
        const sel = el.querySelector("#" + idItem(it.chave, "produto"));
        if (pe) pe.textContent = e.produto || "";
        if (sel) { if (e.produto) sel.setAttribute("aria-invalid", "true"); else sel.removeAttribute("aria-invalid"); }
        mostrarErro(el, idItem(it.chave, "quantidade"), e.quantidade);
        mostrarErro(el, idItem(it.chave, "preco"), e.preco);
    });
    mostrarErro(el, "venda-entrada", r.erros.entrada);
    mostrarErro(el, "venda-data", r.erros.data);
    mostrarErro(el, "venda-retirada", r.erros.retirada);
}

function salvar() {
    if (!form) return;
    form.tentou = true;
    const r = atualizarResumo();
    mostrarErros(r);
    if (!r.ok) {
        const alvo = form.folha.el.querySelector('[aria-invalid="true"]') || form.folha.el.querySelector(".campo.com-erro");
        alvo?.scrollIntoView({ block: "center" });
        if (alvo && alvo.focus) alvo.focus({ preventScroll: true });
        return;
    }

    const nomeCliente = nomeDoClienteEscolhido();
    const dados = { ...r.dados, clienteNome: nomeCliente };
    if (form.editando) {
        editarVenda(form.venda, dados);
        avisar("Venda atualizada");
    } else {
        registrarVenda({ ...dados, entregue: form.jaEntregue });
        try { localStorage.setItem(CHAVE_JA_ENTREGUE, form.jaEntregue ? "1" : "0"); } catch (e) { /* sem armazenamento local */ }
        avisar("Venda registrada");
    }
    form.folha.fechar();
}

// ---------- escolher cliente ----------

let buscaCliente = "";

function listaDeClientes() {
    const termo = buscaCliente.trim();
    const lista = clientesAtivos().filter(c => !termo || contem(c.nome, termo) || contem(c.cidade, termo));
    if (!lista.length) {
        return estadoVazio({
            titulo: termo ? "Nenhum cliente com esse nome" : "Nenhum cliente cadastrado",
            texto: termo ? "Confira a escrita ou cadastre um novo cliente." : "",
            rotulo: "Cadastrar novo cliente", acao: "venda:novo-cliente"
        });
    }
    return html`<ul class="lista">${lista.map(c => html`
        <li class="linha">
            <button type="button" class="linha-corpo" data-acao="venda:cliente-escolhido" data-id="${c.id}">
                <span class="linha-titulo">${c.nome}</span>
                ${c.cidade ? html`<span class="linha-sub">${c.cidade}</span>` : ""}
            </button>
            ${c.id === form?.clienteId ? html`<span class="marca-escolhido" aria-label="Escolhido">${icone("check")}</span>` : ""}
        </li>`)}</ul>`;
}

function escolherCliente() {
    buscaCliente = "";
    seletor = abrirFolha({
        titulo: "Escolher cliente",
        classe: "folha-seletor",
        corpo: html`
            <div class="busca">
                ${icone("buscar", 20)}
                <input type="search" id="venda-busca-cliente" placeholder="Buscar cliente" aria-label="Buscar cliente" autocomplete="off" data-entrada="venda:buscar-cliente" data-foco>
            </div>
            <div id="venda-lista-clientes">${listaDeClientes()}</div>`,
        rodape: html`<button type="button" class="botao secundario largo" data-acao="venda:novo-cliente">${icone("adicionar", 18)} Novo cliente</button>`,
        aoFechar: () => { seletor = null; }
    });
}

function definirCliente(id, nomeNovo = "") {
    if (!form) return;
    form.clienteId = id;
    form.clienteNomeNovo = nomeNovo;
    const botao = form.folha.el.querySelector("#venda-cliente");
    botao.classList.remove("sem-valor");
    botao.querySelector("span").textContent = nomeDoClienteEscolhido();
    mostrarErro(form.folha.el, "venda-cliente", "");
    if (seletor) seletor.fechar();
}

// ---------- itens ----------

function redesenharItens() {
    lerModelo();
    form.folha.el.querySelector("#venda-itens").innerHTML = String(html`${form.itens.map(htmlItem)}`);
    atualizarResumo();
}

export const eventos = {
    cliques: {
        "venda:escolher-cliente": () => escolherCliente(),
        "venda:cliente-escolhido": el => definirCliente(el.dataset.id),
        "venda:novo-cliente": () => abrirFormCliente({ aoSalvar: (id, dados) => definirCliente(id, dados.nome) }),
        "venda:mais-item": () => {
            lerModelo();
            const chave = form.proximaChave++;
            form.itens.push({ chave, produtoId: "", quantidade: "", preco: "" });
            redesenharItens();
            form.folha.el.querySelector("#" + idItem(chave, "produto"))?.focus();
        },
        "venda:remover-item": el => {
            lerModelo();
            form.itens = form.itens.filter(i => String(i.chave) !== el.dataset.chave);
            redesenharItens();
        },
        "venda:pagou-tudo": () => {
            const r = atualizarResumo();
            if (r.dados.total === null) {
                avisar("Preencha as variedades e os preços para calcular o total", { tipo: "erro" });
                return;
            }
            form.folha.el.querySelector("#venda-entrada").value = numeroParaCampo(r.dados.total, 2);
            atualizarResumo();
        }
    },
    entradas: {
        "venda:campo": () => atualizarResumo(),
        "venda:buscar-cliente": el => {
            buscaCliente = el.value;
            const area = document.getElementById("venda-lista-clientes");
            if (area) area.innerHTML = String(listaDeClientes());
        }
    },
    mudancas: {
        "venda:campo": () => atualizarResumo(),
        "venda:entrega": el => {
            const grupo = form?.folha.el.querySelector("#venda-retirada-grupo");
            if (grupo) grupo.hidden = el.checked;
            atualizarResumo();
        }
    },
    envios: { "venda:salvar": salvar }
};

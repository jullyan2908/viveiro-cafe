// Tela de estoque: variedades, ajustes (entrada, perda, contagem), histórico, exclusão.

import { html, raw, numero, plural, dataCurta, dataLocal, numeroParaCampo, paraInteiro, contem } from "../util.js";
import { abrirFolha, campo, mostrarErro, avisar, confirmar, estadoVazio, chip, icone } from "../ui.js";
import { estado, estoqueAtivo, estoquePorId, ajustesDe, vendasVisiveis } from "../estado.js";
import { minimoDe, situacaoEstoque, nomeDuplicado, calcularAjuste, itensDaVenda } from "../regras.js";
import { criarVariedade, editarVariedade, ajustarEstoque, enviarParaLixeira, restaurarDaLixeira } from "../db.js";
import { MINIMO_PADRAO } from "../config.js";

let busca = "";

// ---------- peças compartilhadas (o painel também usa) ----------

export function chipEstoque(e) {
    switch (situacaoEstoque(e)) {
        case "negativo": return chip("Negativo", "vermelho");
        case "zerado": return chip("Zerado", "vermelho");
        case "baixo": return chip("Estoque baixo", "laranja");
        default: return "";
    }
}

// todas as barras usam a mesma escala, para dar para comparar uma variedade com a outra
export function escalaDoEstoque(lista) {
    return lista.reduce((maior, e) => Math.max(maior, Number(e.quantidade) || 0, minimoDe(e)), 0);
}

export function barraDeEstoque(e, escala) {
    const q = Math.max(0, Number(e.quantidade) || 0);
    const nivel = escala > 0 ? Math.min(100, (q / escala) * 100) : 0;
    const marca = escala > 0 ? Math.min(100, (minimoDe(e) / escala) * 100) : 0;
    return html`<span class="barra-estoque ${situacaoEstoque(e)}" aria-hidden="true">
        <span class="barra-nivel" style="width:${nivel.toFixed(1)}%"></span>
        <span class="barra-minimo" style="left:${marca.toFixed(1)}%"></span>
    </span>`;
}

const ROTULO_TIPO = { entrada: "Entrada", perda: "Perda", correcao: "Correção de contagem" };

// ---------- a tela ----------

export const tela = {
    id: "estoque",
    titulo: "Estoque",
    icone: "muda",
    entrar(raizEl) {
        raizEl.innerHTML = String(html`
            <div class="barra-acoes">
                <div class="busca">
                    ${icone("buscar", 20)}
                    <input type="search" id="estoque-busca" placeholder="Buscar" aria-label="Buscar variedade" autocomplete="off" value="${busca}" data-entrada="estoque:buscar">
                </div>
                <button type="button" class="botao principal" data-acao="estoque:nova">${icone("adicionar", 20)} Nova variedade</button>
            </div>
            <div id="estoque-lista"></div>`);
        desenharLista();
    },
    atualizar() { desenharLista(); }
};

function linhaDeEstoque(e, escala) {
    const q = Number(e.quantidade) || 0;
    const chipSituacao = chipEstoque(e);
    return html`
        <li class="linha estoque">
            <button type="button" class="linha-corpo" data-acao="estoque:abrir" data-id="${e.id}">
                <span class="linha-titulo">${e.nome}</span>
                ${barraDeEstoque(e, escala)}
                ${chipSituacao ? html`
                    <span class="linha-meta">
                        ${chipSituacao}
                        <span>mínimo ${numero(minimoDe(e))}</span>
                    </span>` : ""}
            </button>
            <span class="linha-lado">
                <span class="linha-valor num grande">${numero(q)}</span>
                <span class="linha-unidade">${Math.abs(q) === 1 ? "muda" : "mudas"}</span>
            </span>
        </li>`;
}

function desenharLista() {
    const area = document.getElementById("estoque-lista");
    if (!area) return;
    const todas = estoqueAtivo();
    if (!todas.length) {
        area.innerHTML = String(estadoVazio({
            titulo: "Nenhuma variedade cadastrada",
            texto: "Cadastre as variedades de café que você produz para acompanhar quantas mudas restam.",
            rotulo: "Cadastrar a primeira variedade", acao: "estoque:nova"
        }));
        return;
    }
    const lista = busca.trim() ? todas.filter(e => contem(e.nome, busca)) : todas;
    if (!lista.length) {
        area.innerHTML = String(estadoVazio({
            titulo: "Nenhuma variedade encontrada",
            texto: "Confira a escrita ou limpe a busca.",
            rotulo: "Limpar busca", acao: "estoque:limpar"
        }));
        return;
    }
    const escala = escalaDoEstoque(todas);
    area.innerHTML = String(html`<ul class="lista">${lista.map(e => linhaDeEstoque(e, escala))}</ul>`);
}

// ---------- detalhes de uma variedade ----------

let detalhe = null; // { id, folha, verTudo }
const LIMITE_HISTORICO = 10;

function textoDelta(d) {
    return `${d > 0 ? "+" : "−"}${numero(Math.abs(d))}`;
}

function corpoDaVariedade(e) {
    const q = Number(e.quantidade) || 0;
    const sit = situacaoEstoque(e);
    const todos = ajustesDe(e.id);
    const mostrados = detalhe?.verTudo ? todos : todos.slice(0, LIMITE_HISTORICO);

    return html`
        <div class="resumo-estoque">
            <p class="numero-grande num">${numero(q)}</p>
            <p class="muted">${Math.abs(q) === 1 ? "muda" : "mudas"} em estoque</p>
            ${barraDeEstoque(e, Math.max(q, minimoDe(e)) * 1.25)}
            <p class="linha-meta">${chipEstoque(e)}<span>Aviso no Painel abaixo de ${numero(minimoDe(e))}</span></p>
            ${sit === "negativo" ? html`<p class="aviso-bloco">O estoque ficou negativo, provavelmente porque duas vendas usaram as mesmas mudas. Conte as mudas e corrija em Ajustar estoque.</p>` : ""}
        </div>

        <div class="acoes-lista">
            <button type="button" class="botao secundario largo" data-acao="estoque:editar" data-id="${e.id}">${icone("editar", 20)} Editar variedade</button>
        </div>

        <h3 class="subtitulo">Histórico de ajustes</h3>
        ${!todos.length ? html`<p class="muted">Nenhum ajuste registrado ainda.</p>` : html`
            <ul class="historico">
                ${mostrados.map(a => html`
                    <li>
                        <span class="hist-data">${a.data ? dataCurta(a.data) : ""}</span>
                        <span class="hist-desc">${ROTULO_TIPO[a.tipo] || "Ajuste"}${a.motivo ? html`<small>${a.motivo}</small>` : ""}</span>
                        <span class="hist-valor num">${textoDelta(Number(a.quantidade) || 0)}</span>
                    </li>`)}
            </ul>
            ${todos.length > mostrados.length ? html`<button type="button" class="botao texto" data-acao="estoque:historico-tudo">Mostrar todos (${numero(todos.length)})</button>` : ""}`}

        <div class="zona-cuidado">
            <button type="button" class="botao perigo largo" data-acao="estoque:excluir" data-id="${e.id}">${icone("lixeira", 20)} Excluir variedade</button>
        </div>`;
}

const rodapeDaVariedade = e => html`<button type="button" class="botao principal largo" data-acao="estoque:ajustar" data-id="${e.id}">${icone("ajustar", 20)} Ajustar estoque</button>`;

export function abrirVariedade(id) {
    const e = estoquePorId().get(id);
    if (!e || e.removido) return null;
    const folha = abrirFolha({
        titulo: e.nome,
        classe: "folha-detalhe",
        corpo: "",
        rodape: rodapeDaVariedade(e),
        aoFechar: () => { if (detalhe && detalhe.folha === folha) detalhe = null; },
        aoAtualizar: f => {
            const atual = estoquePorId().get(id);
            if (!atual || atual.removido) { f.fechar(); return; }
            f.definirTitulo(atual.nome);
            f.definirCorpo(corpoDaVariedade(atual));
        }
    });
    detalhe = { id, folha, verTudo: false };
    folha.definirCorpo(corpoDaVariedade(e));
    return folha;
}

// ---------- cadastrar e editar ----------

let formVariedade = null; // { folha, variedade }

function abrirFormVariedade({ variedade = null } = {}) {
    const editando = !!variedade;
    const folha = abrirFolha({
        titulo: editando ? "Editar variedade" : "Nova variedade",
        corpo: html`
            <form id="form-variedade" data-envio="estoque:salvar" novalidate>
                ${campo({ id: "var-nome", rotulo: "Nome da variedade", valor: variedade?.nome ?? "", placeholder: "Ex.: Catuaí Vermelho 144", extra: 'autocomplete="off" autocapitalize="words" maxlength="120"', dica: editando ? "Vendas já registradas continuam com o nome antigo." : "" })}
                ${editando ? "" : campo({ id: "var-quantidade", rotulo: "Mudas em estoque agora", valor: "", modo: "numeric", placeholder: "Ex.: 1000", dica: "Depois, para mudar essa quantidade, use Ajustar estoque.", extra: 'autocomplete="off"' })}
                ${campo({
                    id: "var-minimo", rotulo: "Estoque mínimo (opcional)", valor: typeof variedade?.minimo === "number" ? String(variedade.minimo) : "",
                    modo: "numeric", placeholder: String(MINIMO_PADRAO),
                    dica: `O Painel avisa quando as mudas ficarem abaixo disso. Em branco vale ${MINIMO_PADRAO}.`, extra: 'autocomplete="off"'
                })}
            </form>`,
        rodape: html`<button type="submit" form="form-variedade" class="botao principal largo">${editando ? "Salvar alterações" : "Cadastrar variedade"}</button>`,
        aoFechar: () => { formVariedade = null; }
    });
    formVariedade = { folha, variedade };
}

function salvarVariedade() {
    if (!formVariedade) return;
    const { folha, variedade } = formVariedade;
    const el = folha.el;
    const nome = el.querySelector("#var-nome").value.trim();
    let invalido = false;

    if (!nome) { mostrarErro(el, "var-nome", "Digite o nome da variedade"); invalido = true; }
    else if (nomeDuplicado(nome, estado.estoque, variedade?.id)) { mostrarErro(el, "var-nome", "Já existe uma variedade com esse nome"); invalido = true; }
    else mostrarErro(el, "var-nome", "");

    let quantidade = 0;
    if (!variedade) {
        const texto = el.querySelector("#var-quantidade").value.trim();
        quantidade = texto === "" ? 0 : paraInteiro(texto);
        if (!Number.isFinite(quantidade) || quantidade < 0) { mostrarErro(el, "var-quantidade", "Informe um número inteiro, 0 ou mais"); invalido = true; }
        else mostrarErro(el, "var-quantidade", "");
    }

    const textoMinimo = el.querySelector("#var-minimo").value.trim();
    let minimo = null;
    if (textoMinimo !== "") {
        minimo = paraInteiro(textoMinimo);
        if (!Number.isFinite(minimo) || minimo < 0) { mostrarErro(el, "var-minimo", "Informe um número inteiro, 0 ou mais"); invalido = true; minimo = null; }
        else mostrarErro(el, "var-minimo", "");
    } else mostrarErro(el, "var-minimo", "");

    if (invalido) { el.querySelector('[aria-invalid="true"]')?.focus(); return; }

    if (variedade) {
        editarVariedade(variedade.id, { nome, minimo });
        avisar("Variedade atualizada");
    } else {
        criarVariedade({ nome, quantidade, minimo });
        avisar("Variedade cadastrada");
    }
    folha.fechar();
}

// ---------- ajustar estoque ----------

let formAjuste = null; // { folha, id }

const EXPLICACAO_TIPO = {
    entrada: "Mudas novas que chegaram ao estoque.",
    perda: "Mudas que morreram, estragaram ou foram descartadas.",
    correcao: "Você contou as mudas e o número do app está diferente."
};
const MOTIVO_EXEMPLO = {
    entrada: "Ex.: nova germinação",
    perda: "Ex.: geada, doença",
    correcao: "Ex.: contagem de novembro"
};

function abrirAjuste(id) {
    const e = estoquePorId().get(id);
    if (!e || e.removido) return;
    const folha = abrirFolha({
        titulo: "Ajustar estoque",
        corpo: html`
            <p class="texto-dialogo"><strong>${e.nome}</strong>: ${plural(Number(e.quantidade) || 0, "muda", "mudas")} em estoque.</p>
            <form id="form-ajuste" data-envio="estoque:ajuste-salvar" novalidate>
                <fieldset class="segmentos">
                    <legend class="sr-only">Tipo de ajuste</legend>
                    ${["entrada", "perda", "correcao"].map(t => html`
                        <label class="segmento">
                            <input type="radio" name="ajuste-tipo" value="${t}" ${raw(t === "entrada" ? "checked" : "")} data-mudanca="estoque:ajuste-tipo">
                            <span>${t === "correcao" ? "Contagem" : ROTULO_TIPO[t]}</span>
                        </label>`)}
                </fieldset>
                <p class="dica" id="ajuste-explicacao">${EXPLICACAO_TIPO.entrada}</p>

                <div id="ajuste-grupo-quantidade">
                    ${campo({ id: "ajuste-quantidade", rotulo: "Quantidade", modo: "numeric", placeholder: "Ex.: 250", extra: 'autocomplete="off" data-entrada="estoque:ajuste-ao-vivo" data-foco' })}
                </div>
                <div id="ajuste-grupo-contagem" hidden>
                    ${campo({ id: "ajuste-contagem", rotulo: "Contagem atual", valor: numeroParaCampo(Number(e.quantidade) || 0), modo: "numeric", placeholder: "Quantas mudas há agora?", extra: 'autocomplete="off" data-entrada="estoque:ajuste-ao-vivo"' })}
                </div>
                ${campo({ id: "ajuste-motivo", rotulo: "Motivo (opcional)", placeholder: MOTIVO_EXEMPLO.entrada, extra: 'autocomplete="off" maxlength="160"' })}
                ${campo({ id: "ajuste-data", rotulo: "Data", tipo: "date", valor: dataLocal() })}
                <p class="resultado-ajuste" id="ajuste-resultado" aria-live="polite"></p>
            </form>`,
        rodape: html`<button type="submit" form="form-ajuste" class="botao principal largo">Registrar ajuste</button>`,
        aoFechar: () => { formAjuste = null; }
    });
    formAjuste = { folha, id };
    atualizarAjuste();
}

function tipoDoAjuste() {
    return formAjuste.folha.el.querySelector('input[name="ajuste-tipo"]:checked')?.value || "entrada";
}

function calcularAjusteDoFormulario() {
    const e = estoquePorId().get(formAjuste.id);
    const el = formAjuste.folha.el;
    const tipo = tipoDoAjuste();
    return {
        e, tipo,
        r: calcularAjuste({
            tipo,
            quantidade: el.querySelector("#ajuste-quantidade").value,
            contagem: el.querySelector("#ajuste-contagem").value,
            atual: Number(e?.quantidade) || 0
        })
    };
}

function atualizarAjuste() {
    if (!formAjuste) return;
    const el = formAjuste.folha.el;
    const tipo = tipoDoAjuste();
    el.querySelector("#ajuste-grupo-quantidade").hidden = tipo === "correcao";
    el.querySelector("#ajuste-grupo-contagem").hidden = tipo !== "correcao";
    el.querySelector("#ajuste-explicacao").textContent = EXPLICACAO_TIPO[tipo];
    el.querySelector("#ajuste-motivo").placeholder = MOTIVO_EXEMPLO[tipo];

    const { e, r } = calcularAjusteDoFormulario();
    const atual = Number(e?.quantidade) || 0;
    el.querySelector("#ajuste-resultado").textContent = r.erro ? "" : `Estoque vai de ${numero(atual)} para ${numero(r.novoTotal)}`;
}

function salvarAjuste() {
    if (!formAjuste) return;
    const el = formAjuste.folha.el;
    const { e, tipo, r } = calcularAjusteDoFormulario();
    if (!e || e.removido) { avisar("Essa variedade não existe mais", { tipo: "erro" }); formAjuste.folha.fechar(); return; }

    const idCampo = tipo === "correcao" ? "ajuste-contagem" : "ajuste-quantidade";
    mostrarErro(el, "ajuste-quantidade", "");
    mostrarErro(el, "ajuste-contagem", "");

    let erro = r.erro || "";
    if (!erro && r.delta === 0) erro = `A contagem é igual ao estoque atual (${numero(Number(e.quantidade) || 0)})`;
    const data = el.querySelector("#ajuste-data").value;
    if (!erro && !data) { mostrarErro(el, "ajuste-data", "Informe a data do ajuste"); el.querySelector("#ajuste-data").focus(); return; }
    mostrarErro(el, "ajuste-data", "");

    if (erro) {
        mostrarErro(el, idCampo, erro);
        el.querySelector("#" + idCampo).focus();
        return;
    }

    ajustarEstoque({
        produtoId: e.id, produto: e.nome, tipo, delta: r.delta,
        motivo: el.querySelector("#ajuste-motivo").value.trim(), data
    });
    formAjuste.folha.fechar();
    avisar("Ajuste registrado");
}

// ---------- excluir ----------

async function pedirExclusao(e) {
    const q = Number(e.quantidade) || 0;
    const nVendas = vendasVisiveis().filter(v => itensDaVenda(v).some(i => i.produtoId === e.id)).length;
    const partes = ["Ela sai da lista de estoque e das opções de venda."];
    if (q > 0) partes.push(`As ${plural(q, "muda", "mudas")} em estoque deixam de contar nos totais.`);
    if (nVendas) partes.push(nVendas === 1 ? "Uma venda usa essa variedade e continua no histórico." : `${numero(nVendas)} vendas usam essa variedade e continuam no histórico.`);
    partes.push("Fica 30 dias na lixeira, em Mais.");
    const ok = await confirmar({
        titulo: `Excluir ${e.nome}?`,
        texto: partes.join(" "),
        rotuloOk: "Excluir variedade", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return false;
    enviarParaLixeira("estoque", e.id);
    avisar("Variedade excluída", { acao: { rotulo: "Desfazer", aoClicar: () => restaurarDaLixeira("estoque", e.id) } });
    return true;
}

export const eventos = {
    cliques: {
        "estoque:nova": () => abrirFormVariedade(),
        "estoque:abrir": el => abrirVariedade(el.dataset.id),
        "estoque:editar": el => { const e = estoquePorId().get(el.dataset.id); if (e) abrirFormVariedade({ variedade: e }); },
        "estoque:ajustar": el => abrirAjuste(el.dataset.id),
        "estoque:historico-tudo": () => {
            if (!detalhe) return;
            detalhe.verTudo = true;
            const e = estoquePorId().get(detalhe.id);
            if (e) detalhe.folha.definirCorpo(corpoDaVariedade(e));
        },
        "estoque:excluir": async el => {
            const e = estoquePorId().get(el.dataset.id);
            if (!e) return;
            const excluiu = await pedirExclusao(e);
            if (excluiu && detalhe && detalhe.id === e.id) detalhe.folha.fechar();
        },
        "estoque:limpar": () => {
            busca = "";
            const campoBusca = document.getElementById("estoque-busca");
            if (campoBusca) campoBusca.value = "";
            desenharLista();
        }
    },
    entradas: {
        "estoque:buscar": el => { busca = el.value; desenharLista(); },
        "estoque:ajuste-ao-vivo": () => atualizarAjuste()
    },
    mudancas: {
        "estoque:ajuste-tipo": () => {
            atualizarAjuste();
            if (!formAjuste) return;
            const campoAlvo = tipoDoAjuste() === "correcao" ? "#ajuste-contagem" : "#ajuste-quantidade";
            formAjuste.folha.el.querySelector(campoAlvo)?.focus();
        }
    },
    envios: {
        "estoque:salvar": salvarVariedade,
        "estoque:ajuste-salvar": salvarAjuste
    }
};

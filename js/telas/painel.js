// Painel: o que o viveirista precisa ver ao abrir o app.
// Quanto ainda tem a receber, quem deve, o que entregar e o que está acabando.

import { html, numero, plural, dinheiro, dataCurta, linkWhatsApp } from "../util.js";
import { icone, estadoVazio } from "../ui.js";
import { estado, clientesPorId, estoqueAtivo } from "../estado.js";
import { resumoDoPainel, devedores, estoqueBaixo, situacaoBackup, mensagemCobranca } from "../regras.js";
import { ultimoBackupMs } from "../db.js";
import { barraDeEstoque, escalaDoEstoque, chipEstoque, abrirVariedade } from "./estoque.js";

const LIMITE_DEVEDORES = 5;
let verTodosDevedores = false;

export const tela = {
    id: "painel",
    titulo: "Painel",
    icone: "painel",
    entrar(raizEl) { raizEl.innerHTML = String(conteudo()); },
    atualizar() {
        const raizEl = document.getElementById("conteudo");
        if (raizEl) raizEl.innerHTML = String(conteudo());
    }
};

// ---------- blocos ----------

function avisoDeBackup(temDados) {
    if (!temDados) return "";
    const { precisa, dias } = situacaoBackup(ultimoBackupMs());
    if (!precisa) return "";
    const quando = dias === Infinity ? "Você ainda não salvou nenhum backup." : `Seu último backup foi há ${plural(dias, "dia", "dias")}.`;
    return html`
        <div class="aviso-bloco com-acao" role="region" aria-label="Lembrete de backup">
            <div>
                <p><strong>${quando}</strong></p>
                <p class="muted">Guarde uma cópia dos seus dados no celular para não perder nada.</p>
            </div>
            <button type="button" class="botao secundario" data-acao="backup:salvar">${icone("baixar", 20)} Salvar backup</button>
        </div>`;
}

function primeirosPassos(r) {
    const passos = [
        { feito: estoqueAtivo().length > 0, titulo: "Cadastre uma variedade", texto: "Informe quantas mudas você tem de cada café.", rotulo: "Cadastrar variedade", acao: "estoque:nova" },
        { feito: r.clientes > 0, titulo: "Cadastre um cliente", texto: "Nome e telefone, para ligar e chamar no WhatsApp.", rotulo: "Cadastrar cliente", acao: "clientes:novo" },
        { feito: false, titulo: "Registre a primeira venda", texto: "O estoque baixa sozinho e você acompanha o que falta receber.", rotulo: "Registrar venda", acao: "vendas:nova" }
    ];
    const atual = passos.findIndex(p => !p.feito);
    return html`
        <section class="primeiros-passos" aria-labelledby="passos-titulo">
            <h2 id="passos-titulo">Vamos começar</h2>
            <ol>
                ${passos.map((p, i) => html`
                    <li class="${p.feito ? "feito" : i === atual ? "atual" : ""}">
                        <p class="passo-titulo">${p.titulo}</p>
                        ${i === atual ? html`<p class="muted">${p.texto}</p><button type="button" class="botao principal" data-acao="${p.acao}">${p.rotulo}</button>` : ""}
                    </li>`)}
            </ol>
        </section>`;
}

function destaque(r) {
    const pagoComPreco = Math.max(0, r.faturamento - r.aReceber);
    const pct = r.faturamento > 0 ? Math.round((pagoComPreco / r.faturamento) * 100) : 0;
    let situacao;
    if (r.faturamento <= 0) situacao = "Nenhuma venda com preço definido ainda.";
    else if (r.aReceber <= 0) situacao = "Tudo o que foi vendido já foi pago.";
    else situacao = `${pct}% do valor vendido já foi pago.`;

    return html`
        <section class="destaque-bloco" aria-labelledby="destaque-rotulo">
            <h2 id="destaque-rotulo" class="destaque-rotulo">A receber</h2>
            <p class="destaque-valor num">${dinheiro(r.aReceber)}</p>
            <div class="progresso" role="img" aria-label="${situacao}"><span style="width:${r.faturamento > 0 ? pct : 0}%"></span></div>
            <p class="destaque-sub">${situacao}</p>
            <button type="button" class="botao principal largo acao-principal" data-acao="vendas:nova">${icone("adicionar", 20)} Nova venda</button>
        </section>
        <div class="numeros">
            <div class="numero-bloco">
                <p class="numero-rotulo">Em estoque</p>
                <p class="numero-valor num">${numero(r.estoqueTotal)}</p>
                <p class="numero-unidade">${Math.abs(r.estoqueTotal) === 1 ? "muda" : "mudas"}</p>
            </div>
            <div class="numero-bloco">
                <p class="numero-rotulo">Já recebido</p>
                <p class="numero-valor num">${dinheiro(r.recebido)}</p>
                <p class="numero-unidade">de ${dinheiro(r.faturamento)} vendidos</p>
            </div>
        </div>`;
}

function atencao(r, baixos) {
    const itens = [];
    if (r.aEntregar > 0) {
        itens.push({ tom: "laranja", texto: `${r.aEntregar === 1 ? "1 venda" : `${numero(r.aEntregar)} vendas`} para entregar (${plural(r.mudasAEntregar, "muda", "mudas")})`, tela: "vendas", filtro: "a_entregar" });
    }
    if (r.semPreco > 0) {
        itens.push({ tom: "azul", texto: `${r.semPreco === 1 ? "1 venda sem preço definido" : `${numero(r.semPreco)} vendas sem preço definido`}`, tela: "vendas", filtro: "sem_preco" });
    }
    if (baixos.length > 0) {
        itens.push({ tom: "laranja", texto: baixos.length === 1 ? `Estoque baixo: ${baixos[0].nome}` : `${numero(baixos.length)} variedades com estoque baixo`, tela: "estoque", filtro: "" });
    }
    if (!itens.length) return "";
    return html`
        <ul class="atencao" aria-label="Precisa de atenção">
            ${itens.map(i => html`
                <li>
                    <button type="button" class="linha-atencao ${i.tom}" data-acao="nav:ir" data-tela="${i.tela}" data-filtro="${i.filtro}">
                        <span class="ponto" aria-hidden="true"></span>
                        <span class="linha-atencao-texto">${i.texto}</span>
                        ${icone("direita", 20)}
                    </button>
                </li>`)}
        </ul>`;
}

function quemMeDeve(vendasExistem) {
    if (!vendasExistem) return "";
    const lista = devedores(estado.vendas, clientesPorId());
    if (!lista.length) {
        return html`
            <section class="secao" aria-labelledby="devedores-titulo">
                <h2 id="devedores-titulo">Quem me deve</h2>
                <p class="tudo-certo">${icone("check", 20)} Ninguém deve nada agora.</p>
            </section>`;
    }
    const mostrados = verTodosDevedores ? lista : lista.slice(0, LIMITE_DEVEDORES);
    return html`
        <section class="secao" aria-labelledby="devedores-titulo">
            <h2 id="devedores-titulo">Quem me deve</h2>
            <ul class="lista">
                ${mostrados.map(d => {
                    const cliente = clientesPorId().get(d.clienteId);
                    const zap = cliente ? linkWhatsApp(cliente.telefone, mensagemCobranca(cliente, d.saldo)) : "";
                    const n = d.vendas.length;
                    const detalhe = `${n === 1 ? "" : `${numero(n)} vendas`}${n > 1 && d.maisAntiga ? ", " : ""}${d.maisAntiga ? `desde ${dataCurta(d.maisAntiga)}` : (n === 1 ? "1 venda em aberto" : "")}`;
                    return html`
                        <li class="linha devedor">
                            <button type="button" class="linha-corpo" data-acao="cliente:abrir" data-id="${d.clienteId}">
                                <span class="linha-titulo">${d.nome}</span>
                                <span class="linha-sub">${detalhe}</span>
                            </button>
                            <span class="linha-lado"><span class="linha-valor num falta">${dinheiro(d.saldo)}</span></span>
                            ${zap ? html`<a class="botao-icone cobrar" href="${zap}" target="_blank" rel="noopener" aria-label="Cobrar ${d.nome} no WhatsApp" title="Cobrar no WhatsApp">${icone("conversa", 22)}</a>` : ""}
                        </li>`;
                })}
            </ul>
            ${lista.length > mostrados.length ? html`<button type="button" class="botao texto" data-acao="painel:todos-devedores">Mostrar todos (${numero(lista.length)})</button>` : ""}
        </section>`;
}

function estoquePorVariedade() {
    const lista = estoqueAtivo();
    if (!lista.length) {
        return html`
            <section class="secao" aria-labelledby="estoque-titulo">
                <h2 id="estoque-titulo">Estoque por variedade</h2>
                ${estadoVazio({ titulo: "Nenhuma variedade cadastrada", texto: "Cadastre as variedades para acompanhar as mudas.", rotulo: "Cadastrar variedade", acao: "estoque:nova" })}
            </section>`;
    }
    const escala = escalaDoEstoque(lista);
    return html`
        <section class="secao" aria-labelledby="estoque-titulo">
            <h2 id="estoque-titulo">Estoque por variedade</h2>
            <ul class="lista">
                ${lista.map(e => html`
                    <li class="linha estoque">
                        <button type="button" class="linha-corpo" data-acao="painel:variedade" data-id="${e.id}">
                            <span class="linha-titulo">${e.nome}</span>
                            ${barraDeEstoque(e, escala)}
                            ${chipEstoque(e) ? html`<span class="linha-meta">${chipEstoque(e)}</span>` : ""}
                        </button>
                        <span class="linha-lado"><span class="linha-valor num grande">${numero(Number(e.quantidade) || 0)}</span><span class="linha-unidade">${Math.abs(Number(e.quantidade) || 0) === 1 ? "muda" : "mudas"}</span></span>
                    </li>`)}
            </ul>
        </section>`;
}

function resumoSecundario(r) {
    return html`
        <section class="secao" aria-labelledby="resumo-titulo">
            <h2 id="resumo-titulo">Resumo</h2>
            <dl class="resumo-simples">
                <div><dt>Vendido com preço</dt><dd class="num">${dinheiro(r.faturamento)}</dd></div>
                <div><dt>Mudas vendidas</dt><dd class="num">${numero(r.mudasVendidas)}</dd></div>
                <div><dt>Clientes</dt><dd class="num">${numero(r.clientes)}</dd></div>
            </dl>
        </section>`;
}

function conteudo() {
    const r = resumoDoPainel({ vendas: estado.vendas, estoque: estado.estoque, clientes: estado.clientes });
    const vendasExistem = estado.vendas.some(v => !v.removido);
    const temDados = vendasExistem || r.clientes > 0 || estoqueAtivo().length > 0;
    const baixos = estoqueBaixo(estado.estoque);

    if (!vendasExistem) {
        // conta nova ou sem vendas: guia os primeiros passos em vez de mostrar zeros
        return html`
            ${avisoDeBackup(temDados)}
            ${primeirosPassos(r)}
            ${temDados ? html`${atencao(r, baixos)}${estoquePorVariedade()}` : ""}`;
    }

    return html`
        ${avisoDeBackup(temDados)}
        ${destaque(r)}
        ${atencao(r, baixos)}
        ${quemMeDeve(vendasExistem)}
        ${estoquePorVariedade()}
        ${resumoSecundario(r)}`;
}

export const eventos = {
    cliques: {
        "painel:todos-devedores": () => { verTodosDevedores = true; tela.atualizar(); },
        "painel:variedade": el => abrirVariedade(el.dataset.id)
    }
};

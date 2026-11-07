// Tela de clientes: lista, extrato do cliente, contato (ligar, WhatsApp, cobrar), contrato em PDF.

import { html, numero, plural, dinheiro, urlSegura, contem, soDigitos, linkWhatsApp, linkTel, telefoneParaExibir } from "../util.js";
import { abrirFolha, avisar, confirmar, estadoVazio, icone } from "../ui.js";
import { estado, clientesAtivos, clientesPorId, vendasVisiveis } from "../estado.js";
import { devedores, extratoCliente, vendaAtiva, mensagemCobranca, mensagemOla } from "../regras.js";
import { enviarParaLixeira, restaurarDaLixeira, anexarContrato, removerLinkDoContrato } from "../db.js";
import { ehPdf } from "../arquivos.js";
import { CLOUDINARY } from "../config.js";
import { abrirFormCliente } from "./form-cliente.js";
import { abrirFormVenda } from "./form-venda.js";
import { linhaVenda } from "./vendas.js";

let busca = "";

// ---------- a tela ----------

export const tela = {
    id: "clientes",
    titulo: "Clientes",
    icone: "pessoas",
    entrar(raizEl) {
        raizEl.innerHTML = String(html`
            <div class="barra-acoes">
                <div class="busca">
                    ${icone("buscar", 20)}
                    <input type="search" id="clientes-busca" placeholder="Buscar" aria-label="Buscar cliente por nome, cidade ou telefone" autocomplete="off" value="${busca}" data-entrada="clientes:buscar">
                </div>
                <button type="button" class="botao principal" data-acao="clientes:novo">${icone("adicionar", 20)} Novo cliente</button>
            </div>
            <div id="clientes-lista"></div>`);
        desenharLista();
    },
    atualizar() { desenharLista(); }
};

function combinaComBusca(c, termo) {
    if (contem(c.nome, termo) || contem(c.cidade, termo)) return true;
    const digitos = soDigitos(termo);
    return digitos.length >= 3 && soDigitos(c.telefone).includes(digitos);
}

function desenharLista() {
    const area = document.getElementById("clientes-lista");
    if (!area) return;
    const todos = clientesAtivos();
    if (!todos.length) {
        area.innerHTML = String(estadoVazio({
            titulo: "Nenhum cliente cadastrado",
            texto: "Cadastre quem compra suas mudas para registrar vendas e saber quem ainda deve.",
            rotulo: "Cadastrar o primeiro cliente", acao: "clientes:novo"
        }));
        return;
    }
    const termo = busca.trim();
    const lista = termo ? todos.filter(c => combinaComBusca(c, termo)) : todos;
    if (!lista.length) {
        area.innerHTML = String(estadoVazio({
            titulo: "Nenhum cliente encontrado",
            texto: "Confira a escrita ou limpe a busca.",
            rotulo: "Limpar busca", acao: "clientes:limpar"
        }));
        return;
    }

    const deve = new Map(devedores(estado.vendas, clientesPorId()).map(d => [d.clienteId, d.saldo]));
    area.innerHTML = String(html`<ul class="lista">${lista.map(c => {
        const saldo = deve.get(c.id) || 0;
        return html`
            <li class="linha cliente">
                <button type="button" class="linha-corpo" data-acao="cliente:abrir" data-id="${c.id}">
                    <span class="linha-titulo">${c.nome}</span>
                    <span class="linha-sub">${c.cidade || "Sem cidade"}</span>
                </button>
                ${saldo > 0 ? html`<span class="linha-lado"><span class="linha-valor num falta">${dinheiro(saldo)}</span><span class="linha-unidade">a receber</span></span>` : ""}
            </li>`;
    })}</ul>`);
}

// ---------- detalhes e extrato do cliente ----------

let detalhe = null;  // { id, folha, verTodas }
const LIMITE_VENDAS = 30;
const enviando = new Set(); // clientes com contrato sendo enviado

function blocoContrato(c) {
    const url = urlSegura(c.contratoUrl);
    if (enviando.has(c.id)) {
        return html`<p class="muted" role="status">Enviando o contrato…</p>`;
    }
    if (url) {
        return html`
            <p class="contrato-nome">${icone("arquivo", 20)} <span>${c.contratoNome || "Contrato"}</span></p>
            <div class="botoes-linha">
                <a class="botao secundario" href="${url}" target="_blank" rel="noopener">Abrir PDF</a>
                <button type="button" class="botao texto" data-acao="cliente:anexar" data-id="${c.id}">Trocar</button>
                <button type="button" class="botao texto" data-acao="cliente:remover-contrato" data-id="${c.id}">Remover</button>
            </div>`;
    }
    return html`
        <p class="muted">Guarde o PDF do contrato aqui para abrir quando precisar (até ${Math.round(CLOUDINARY.limiteBytes / 1024 / 1024)} MB).</p>
        <button type="button" class="botao secundario" data-acao="cliente:anexar" data-id="${c.id}">${icone("arquivo", 20)} Anexar contrato (PDF)</button>`;
}

function corpoDoCliente(c) {
    const ext = extratoCliente(c.id, estado.vendas);
    const telefone = telefoneParaExibir(c.telefone);
    const zap = linkWhatsApp(c.telefone, mensagemOla(c));
    const ligar = linkTel(c.telefone);
    const cobrar = ext.deve > 0 ? linkWhatsApp(c.telefone, mensagemCobranca(c, ext.deve)) : "";
    const mostradas = detalhe?.verTodas ? ext.vendas : ext.vendas.slice(0, LIMITE_VENDAS);

    return html`
        <div class="contato">
            ${c.cidade ? html`<p class="muted">${c.cidade}</p>` : ""}
            ${telefone ? html`<p class="telefone num">${telefone}</p>` : html`<p class="muted">Sem telefone cadastrado</p>`}
            ${ligar || zap ? html`
                <div class="botoes-linha">
                    ${ligar ? html`<a class="botao secundario" href="${ligar}">${icone("telefone", 20)} Ligar</a>` : ""}
                    ${zap ? html`<a class="botao secundario" href="${zap}" target="_blank" rel="noopener">${icone("conversa", 20)} WhatsApp</a>` : ""}
                </div>` : ""}
        </div>

        <h3 class="subtitulo">Compras</h3>
        <dl class="extrato">
            <div><dt>Comprado</dt><dd class="num">${dinheiro(ext.comprado)}</dd></div>
            <div><dt>Pago</dt><dd class="num">${dinheiro(ext.pago)}</dd></div>
            <div class="${ext.deve > 0 ? "atencao" : ""}"><dt>Deve</dt><dd class="num">${dinheiro(ext.deve)}</dd></div>
        </dl>
        ${ext.semPreco ? html`<p class="dica">${plural(ext.semPreco, "venda sem preço definido não entra", "vendas sem preço definido não entram")} nesses valores.</p>` : ""}
        ${cobrar ? html`<a class="botao secundario largo" href="${cobrar}" target="_blank" rel="noopener">${icone("conversa", 20)} Cobrar ${dinheiro(ext.deve)} no WhatsApp</a>` : ""}
        ${ext.deve > 0 && !cobrar ? html`<p class="dica">Cadastre o telefone com DDD para cobrar pelo WhatsApp.</p>` : ""}

        <h3 class="subtitulo">Contrato</h3>
        <div id="cliente-contrato">${blocoContrato(c)}</div>

        <h3 class="subtitulo">Vendas</h3>
        ${!ext.vendas.length ? html`<p class="muted">Nenhuma venda para este cliente ainda.</p>` : html`
            <ul class="lista compacta">${mostradas.map(v => linhaVenda(v, { mostrarCliente: false }))}</ul>
            ${ext.vendas.length > mostradas.length ? html`<button type="button" class="botao texto" data-acao="cliente:todas-vendas">Mostrar todas (${numero(ext.vendas.length)})</button>` : ""}`}

        <div class="acoes-lista">
            <button type="button" class="botao secundario largo" data-acao="cliente:editar" data-id="${c.id}">${icone("editar", 20)} Editar cliente</button>
        </div>
        <div class="zona-cuidado">
            <button type="button" class="botao perigo largo" data-acao="cliente:excluir" data-id="${c.id}">${icone("lixeira", 20)} Excluir cliente</button>
        </div>`;
}

const rodapeDoCliente = c => html`<button type="button" class="botao principal largo" data-acao="cliente:nova-venda" data-id="${c.id}">${icone("venda", 20)} Nova venda</button>`;

export function abrirCliente(id) {
    const c = clientesPorId().get(id);
    if (!c || c.removido) return null;
    const folha = abrirFolha({
        titulo: c.nome,
        classe: "folha-detalhe",
        corpo: "",
        rodape: rodapeDoCliente(c),
        aoFechar: () => { if (detalhe && detalhe.folha === folha) detalhe = null; },
        aoAtualizar: f => {
            const atual = clientesPorId().get(id);
            if (!atual || atual.removido) { f.fechar(); return; }
            f.definirTitulo(atual.nome);
            f.definirCorpo(corpoDoCliente(atual));
        }
    });
    detalhe = { id, folha, verTodas: false };
    folha.definirCorpo(corpoDoCliente(c));
    return folha;
}

function redesenharDetalhe() {
    if (!detalhe) return;
    const c = clientesPorId().get(detalhe.id);
    if (c) detalhe.folha.definirCorpo(corpoDoCliente(c));
}

// ---------- contrato em PDF ----------

let campoArquivo = null;
let clienteDoArquivo = null;

function garantirCampoArquivo() {
    if (campoArquivo) return campoArquivo;
    campoArquivo = document.createElement("input");
    campoArquivo.type = "file";
    campoArquivo.accept = "application/pdf,.pdf";
    campoArquivo.hidden = true;
    campoArquivo.tabIndex = -1;
    campoArquivo.setAttribute("aria-hidden", "true");
    document.body.appendChild(campoArquivo);
    campoArquivo.addEventListener("change", () => {
        const arquivo = campoArquivo.files && campoArquivo.files[0];
        const id = clienteDoArquivo;
        campoArquivo.value = "";
        if (arquivo && id) enviarContrato(id, arquivo);
    });
    return campoArquivo;
}

async function enviarParaCloudinary(arquivo) {
    const dados = new FormData();
    dados.append("file", arquivo);
    dados.append("upload_preset", CLOUDINARY.preset);
    const controle = new AbortController();
    const limite = setTimeout(() => controle.abort(), 90000);
    try {
        const resposta = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY.nuvem}/auto/upload`, { method: "POST", body: dados, signal: controle.signal });
        if (!resposta.ok) throw new Error("Falha no envio: " + resposta.status);
        const json = await resposta.json();
        const url = urlSegura(json.secure_url);
        if (!url) throw new Error("Resposta sem link seguro");
        return url;
    } finally {
        clearTimeout(limite);
    }
}

async function enviarContrato(id, arquivo) {
    const c = clientesPorId().get(id);
    if (!c) return;
    const limiteMB = Math.round(CLOUDINARY.limiteBytes / 1024 / 1024);
    if (arquivo.size > CLOUDINARY.limiteBytes) { avisar(`PDF grande demais. O máximo é ${limiteMB} MB.`, { tipo: "erro" }); return; }
    if (!(await ehPdf(arquivo))) { avisar("Só é possível anexar arquivos PDF", { tipo: "erro" }); return; }
    if (estado.offline || navigator.onLine === false) {
        avisar("Sem internet. Anexe o contrato quando a conexão voltar.", { tipo: "erro" });
        return;
    }

    enviando.add(id);
    redesenharDetalhe();
    try {
        const url = await enviarParaCloudinary(arquivo);
        anexarContrato(id, url, arquivo.name);
        avisar("Contrato anexado");
    } catch (erro) {
        console.log("Erro ao enviar contrato:", erro);
        avisar("Não foi possível enviar o PDF. Confira a internet e tente de novo.", { tipo: "erro" });
    } finally {
        enviando.delete(id);
        redesenharDetalhe();
    }
}

async function pedirRemocaoDoContrato(c) {
    const ok = await confirmar({
        titulo: "Remover o contrato?",
        texto: "O link sai do cadastro deste cliente. O arquivo continua guardado no Cloudinary; para apagá-lo de lá, use o painel do Cloudinary.",
        rotuloOk: "Remover contrato", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return;
    const { contratoUrl, contratoNome } = c;
    removerLinkDoContrato(c.id);
    avisar("Contrato removido", { acao: { rotulo: "Desfazer", aoClicar: () => anexarContrato(c.id, contratoUrl, contratoNome || "Contrato") } });
}

// ---------- excluir ----------

async function pedirExclusao(c) {
    const vendas = vendasVisiveis().filter(v => v.clienteId === c.id);
    const ativas = vendas.filter(vendaAtiva);
    const ext = extratoCliente(c.id, estado.vendas);
    const partes = [];
    if (vendas.length) {
        partes.push(`${vendas.length === 1 ? "Uma venda deste cliente continua" : `${numero(vendas.length)} vendas deste cliente continuam`} no histórico.`);
    }
    if (ext.deve > 0) partes.push(`Atenção: ele ainda deve ${dinheiro(ext.deve)} e a dívida continua em Quem me deve.`);
    if (ativas.some(v => v.entregue === false)) partes.push("Há mudas dele ainda a entregar.");
    partes.push("Fica 30 dias na lixeira, em Mais.");
    const ok = await confirmar({
        titulo: `Excluir ${c.nome}?`,
        texto: partes.join(" "),
        rotuloOk: "Excluir cliente", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return false;
    enviarParaLixeira("clientes", c.id);
    avisar("Cliente excluído", { acao: { rotulo: "Desfazer", aoClicar: () => restaurarDaLixeira("clientes", c.id) } });
    return true;
}

export const eventos = {
    cliques: {
        "clientes:novo": () => abrirFormCliente(),
        "clientes:limpar": () => {
            busca = "";
            const campoBusca = document.getElementById("clientes-busca");
            if (campoBusca) campoBusca.value = "";
            desenharLista();
        },
        "cliente:abrir": el => abrirCliente(el.dataset.id),
        "cliente:editar": el => { const c = clientesPorId().get(el.dataset.id); if (c) abrirFormCliente({ cliente: c }); },
        "cliente:nova-venda": el => {
            const c = clientesPorId().get(el.dataset.id);
            if (c) abrirFormVenda({ clienteId: c.id, clienteNome: c.nome });
        },
        "cliente:todas-vendas": () => { if (detalhe) { detalhe.verTodas = true; redesenharDetalhe(); } },
        "cliente:anexar": el => {
            clienteDoArquivo = el.dataset.id;
            garantirCampoArquivo().click();
        },
        "cliente:remover-contrato": el => { const c = clientesPorId().get(el.dataset.id); if (c) pedirRemocaoDoContrato(c); },
        "cliente:excluir": async el => {
            const c = clientesPorId().get(el.dataset.id);
            if (!c) return;
            const excluiu = await pedirExclusao(c);
            if (excluiu && detalhe && detalhe.id === c.id) detalhe.folha.fechar();
        }
    },
    entradas: {
        "clientes:buscar": el => { busca = el.value; desenharLista(); }
    }
};

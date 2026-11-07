// ======================================
// Banco de dados (Firestore) — um documento por cliente, variedade e venda
//
//   usuarios/{uid}/clientes/{id}   usuarios/{uid}/estoque/{id}
//   usuarios/{uid}/vendas/{id}     usuarios/{uid}/ajustes/{id}
//   usuarios/{uid}/meta/app        (migrado, ultimoBackup)
//   usuarios/{uid}/viveiro/dados   (formato ANTIGO — só lido na migração, nunca alterado)
//
// Regras desta camada:
//  • Cada gravação mexe só nos documentos que ela precisa (sem "último que salvou ganha").
//  • Estoque muda por increment(): dois aparelhos vendendo ao mesmo tempo não se atropelam.
//  • "Registrar venda e baixar estoque" é UM lote: ou grava tudo ou nada (funciona offline).
//  • As gravações do dia a dia NÃO esperam o servidor (offline a espera nunca acabaria):
//    a tela já enxerga a mudança e erros chegam pelo tratador de falhas.
//  • Operações grandes (migrar, restaurar, apagar tudo) esperam o servidor e exigem internet.
// ======================================

import { FIREBASE_CONFIG } from "./config.js";
import { estado, COLECOES, notificar, estoquePorId } from "./estado.js";
import { deltaEstoque, expirouNaLixeira } from "./regras.js";
import { dataLocal } from "./util.js";

const fb = globalThis.firebase;
let firestore = null;
let autenticador = null;

const FV = () => fb.firestore.FieldValue;
const TAMANHO_LOTE = 400;          // o Firestore aceita 500 por lote; fica folga
const TEMPO_OPERACAO_LONGA = 30000;

// ---------- início ----------

export function iniciarFirebase() {
    fb.initializeApp(FIREBASE_CONFIG);
    firestore = fb.firestore();
    autenticador = fb.auth();

    // Guarda uma cópia dos dados no aparelho: o app abre e funciona sem internet,
    // e o que for lançado sobe sozinho quando a conexão voltar.
    try {
        firestore.enablePersistence({ synchronizeTabs: true }).catch(erro => {
            estado.persistenciaOk = false;
            console.log("Persistência offline indisponível:", erro && erro.code);
            notificar(["sync"]);
        });
    } catch (erro) {
        estado.persistenciaOk = false;
        console.log("Erro ao ativar persistência offline:", erro);
    }
    return autenticador;
}

// ---------- caminhos ----------

const raiz = () => firestore.collection("usuarios").doc(estado.uid);
const colecao = nome => raiz().collection(nome);
const documento = (nome, id) => colecao(nome).doc(id);
const docMeta = () => colecao("meta").doc("app");
const docLegado = () => colecao("viveiro").doc("dados");

// ---------- login ----------

export const aoMudarUsuario = fn => autenticador.onAuthStateChanged(fn);
export const entrar = (email, senha) => autenticador.signInWithEmailAndPassword(email, senha);
export const criarConta = (email, senha) => autenticador.createUserWithEmailAndPassword(email, senha);
export const recuperarSenha = email => autenticador.sendPasswordResetEmail(email);

export function sair() {
    pararEscutas();
    return autenticador.signOut();
}

// ---------- escutas em tempo real ----------

let paradores = [];
let pararMeta = null;
let temporizadorCarga = null;

export function pararEscutas() {
    paradores.forEach(p => { try { p(); } catch (e) { /* já parado */ } });
    paradores = [];
    if (pararMeta) { try { pararMeta(); } catch (e) { /* já parado */ } pararMeta = null; }
    clearTimeout(temporizadorCarga);
}

// O documento meta/app diz se esta conta já foi migrada para o formato novo.
export function iniciarEscutaMeta() {
    if (pararMeta) pararMeta();
    pararMeta = docMeta().onSnapshot({ includeMetadataChanges: true }, snap => {
        estado.meta = snap.exists ? snap.data() : null;
        estado.metaDoServidor = !snap.metadata.fromCache;
        notificar(["meta"]);
    }, erro => aoErroEscuta("meta", erro));
}

export function iniciarEscutasDados() {
    paradores.forEach(p => { try { p(); } catch (e) { /* já parado */ } });
    paradores = COLECOES.map(nome =>
        colecao(nome).onSnapshot({ includeMetadataChanges: true },
            snap => aoReceberColecao(nome, snap),
            erro => aoErroEscuta(nome, erro)));

    // Sem internet e sem nada guardado no aparelho, o Firestore pode demorar para dizer
    // "não tenho nada". Passado um tempo, mostramos a tela (vazia) com um aviso claro.
    clearTimeout(temporizadorCarga);
    temporizadorCarga = setTimeout(() => {
        let mudou = false;
        COLECOES.forEach(nome => {
            if (!estado.carregado[nome]) { estado.carregado[nome] = true; mudou = true; }
        });
        if (mudou) {
            estado.semConfirmacao = true;
            notificar(["carga"]);
        }
    }, estado.offline ? 2500 : 8000);
}

function aoReceberColecao(nome, snap) {
    const eraCarregado = estado.carregado[nome];
    const confirmouServidor = !snap.metadata.fromCache;

    estado.pendentes[nome] = snap.metadata.hasPendingWrites;
    if (confirmouServidor) estado.servidor[nome] = true;

    // eventos que só trazem informação de sincronização (nada mudou nos dados) não refazem a lista
    let listaMudou = true;
    if (eraCarregado) {
        try { listaMudou = snap.docChanges().length > 0; } catch (e) { listaMudou = true; }
    }
    if (listaMudou || !eraCarregado) {
        estado[nome] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    if (confirmouServidor || snap.size > 0) estado.carregado[nome] = true;
    if (COLECOES.every(c => estado.servidor[c])) estado.semConfirmacao = false;

    notificar([listaMudou || !eraCarregado ? nome : "sync"]);
}

function aoErroEscuta(nome, erro) {
    console.log("Erro ao sincronizar:", nome, erro && erro.code, erro && erro.message);
    if (erro && erro.code === "permission-denied") estado.erroAcesso = true;
    notificar(["erro"]);
}

// ---------- gravação do dia a dia (não espera o servidor) ----------

let tratadorFalha = () => {};
export const definirTratadorFalha = fn => { tratadorFalha = fn; };

function enviar(lote) {
    const promessa = lote.commit();
    promessa.catch(erro => {
        console.log("Erro ao gravar:", erro && erro.code, erro && erro.message);
        tratadorFalha(erro);
    });
    return promessa;
}

const agoraMs = () => Date.now();

// ----- clientes -----

export function salvarCliente({ id, nome, telefone, cidade }) {
    const lote = firestore.batch();
    const r = id ? documento("clientes", id) : colecao("clientes").doc();
    if (id) lote.update(r, { nome, telefone, cidade });
    else lote.set(r, { nome, telefone, cidade, criadoEm: agoraMs() });
    enviar(lote);
    return r.id;
}

// o contrato fica guardado no Cloudinary; aqui só guardamos o link
export function anexarContrato(id, url, nome) {
    const lote = firestore.batch();
    lote.update(documento("clientes", id), { contratoUrl: url, contratoNome: nome });
    enviar(lote);
}

export function removerLinkDoContrato(id) {
    const lote = firestore.batch();
    lote.update(documento("clientes", id), { contratoUrl: FV().delete(), contratoNome: FV().delete() });
    enviar(lote);
}

// ----- estoque -----

export function criarVariedade({ nome, quantidade, minimo }) {
    const lote = firestore.batch();
    const r = colecao("estoque").doc();
    const dados = { nome, quantidade, criadoEm: agoraMs() };
    if (minimo !== null && minimo !== undefined) dados.minimo = minimo;
    lote.set(r, dados);
    if (quantidade > 0) {
        lote.set(colecao("ajustes").doc(), {
            produtoId: r.id, produto: nome, tipo: "entrada", quantidade,
            motivo: "Estoque inicial", data: dataLocal(), criadoEm: agoraMs()
        });
    }
    enviar(lote);
    return r.id;
}

export function editarVariedade(id, { nome, minimo }) {
    const lote = firestore.batch();
    lote.update(documento("estoque", id), {
        nome,
        minimo: minimo === null || minimo === undefined ? FV().delete() : minimo
    });
    enviar(lote);
}

// delta > 0 entra, delta < 0 sai. Registra no histórico de ajustes.
export function ajustarEstoque({ produtoId, produto, tipo, delta, motivo, data }) {
    const lote = firestore.batch();
    lote.update(documento("estoque", produtoId), { quantidade: FV().increment(delta) });
    lote.set(colecao("ajustes").doc(), { produtoId, produto, tipo, quantidade: delta, motivo: motivo || "", data, criadoEm: agoraMs() });
    enviar(lote);
}

// ----- vendas -----

// muda o estoque só das variedades que ainda existem (uma apagada de vez faria o lote inteiro falhar)
function aplicarDeltasDeEstoque(lote, deltas) {
    const existentes = estoquePorId();
    deltas.forEach(({ produtoId, delta }) => {
        if (existentes.has(produtoId)) lote.update(documento("estoque", produtoId), { quantidade: FV().increment(delta) });
    });
}

// dados já validados por validarVenda()
export function registrarVenda({ clienteId, clienteNome, itens, valorPago, data, retirada, entregue }) {
    const lote = firestore.batch();
    const r = colecao("vendas").doc();
    const agora = agoraMs();
    const venda = { clienteId, clienteNome: clienteNome || "", itens, valorPago, data, entregue: !!entregue, criadoEm: agora };
    if (retirada) venda.retirada = retirada;
    if (entregue) venda.entregueEm = agora;
    lote.set(r, venda);
    aplicarDeltasDeEstoque(lote, deltaEstoque([], itens));
    enviar(lote);
    return r.id;
}

export function editarVenda(antiga, { clienteId, clienteNome, itens, valorPago, data, retirada }) {
    const lote = firestore.batch();
    lote.update(documento("vendas", antiga.id), {
        clienteId, clienteNome: clienteNome || "", itens, valorPago, data,
        retirada: retirada ? retirada : FV().delete()
    });
    aplicarDeltasDeEstoque(lote, deltaEstoque(antiga.itens, itens));
    enviar(lote);
}

export function receberPagamento(venda, valor) {
    const lote = firestore.batch();
    lote.update(documento("vendas", venda.id), { valorPago: FV().increment(valor) });
    enviar(lote);
}

export function definirPrecos(venda, itens) {
    const lote = firestore.batch();
    lote.update(documento("vendas", venda.id), { itens });
    enviar(lote);
}

export function marcarEntrega(venda, entregue) {
    const lote = firestore.batch();
    lote.update(documento("vendas", venda.id), {
        entregue: !!entregue,
        entregueEm: entregue ? agoraMs() : FV().delete()
    });
    enviar(lote);
}

// cancelar devolve as mudas ao estoque e mantém a venda no histórico (fora dos totais)
export function cancelarVenda(venda) {
    const lote = firestore.batch();
    lote.update(documento("vendas", venda.id), { cancelada: true, canceladaEm: agoraMs() });
    aplicarDeltasDeEstoque(lote, deltaEstoque(venda.itens, []));
    enviar(lote);
}

// desfaz o cancelamento: as mudas saem do estoque de novo
export function reativarVenda(venda) {
    const lote = firestore.batch();
    lote.update(documento("vendas", venda.id), { cancelada: FV().delete(), canceladaEm: FV().delete() });
    aplicarDeltasDeEstoque(lote, deltaEstoque([], venda.itens));
    enviar(lote);
}

// ----- lixeira (vale para clientes, variedades e vendas) -----
// "Excluir" não apaga: o item sai das telas e fica 30 dias na lixeira. Não mexe no estoque.

export function enviarParaLixeira(nomeColecao, id) {
    const lote = firestore.batch();
    lote.update(documento(nomeColecao, id), { removido: true, removidoEm: agoraMs() });
    enviar(lote);
}

export function restaurarDaLixeira(nomeColecao, id) {
    const lote = firestore.batch();
    lote.update(documento(nomeColecao, id), { removido: FV().delete(), removidoEm: FV().delete() });
    enviar(lote);
}

export function apagarDeVez(nomeColecao, id) {
    const lote = firestore.batch();
    lote.delete(documento(nomeColecao, id));
    if (nomeColecao === "estoque") {
        estado.ajustes.filter(a => a.produtoId === id).forEach(a => lote.delete(documento("ajustes", a.id)));
    }
    enviar(lote);
}

// Apaga de vez o que passou do prazo. Só roda com dados confirmados pelo servidor
// (uma cópia velha do aparelho poderia apagar algo que foi restaurado em outro lugar).
let lixeiraLimpa = false;
export function limparLixeiraVencida(agora = agoraMs()) {
    if (lixeiraLimpa || estado.offline) return 0;
    if (!["clientes", "estoque", "vendas"].every(n => estado.servidor[n])) return 0;
    lixeiraLimpa = true;

    const refs = [];
    [["clientes", estado.clientes], ["estoque", estado.estoque], ["vendas", estado.vendas]].forEach(([nome, lista]) => {
        lista.filter(i => expirouNaLixeira(i, agora)).forEach(i => {
            refs.push(documento(nome, i.id));
            if (nome === "estoque") estado.ajustes.filter(a => a.produtoId === i.id).forEach(a => refs.push(documento("ajustes", a.id)));
        });
    });
    for (let i = 0; i < refs.length; i += TAMANHO_LOTE) {
        const lote = firestore.batch();
        refs.slice(i, i + TAMANHO_LOTE).forEach(r => lote.delete(r));
        enviar(lote);
    }
    return refs.length;
}
export const reiniciarLimpezaDaLixeira = () => { lixeiraLimpa = false; };

// ----- backup feito -----

export function registrarBackupFeito() {
    const agora = agoraMs();
    try { localStorage.setItem("viveiro_ultimo_backup", String(agora)); } catch (e) { /* sem armazenamento local */ }
    const lote = firestore.batch();
    lote.set(docMeta(), { ultimoBackup: agora }, { merge: true });
    enviar(lote);
}

export function ultimoBackupMs() {
    const doServidor = Number(estado.meta?.ultimoBackup) || 0;
    let local = 0;
    try { local = Number(localStorage.getItem("viveiro_ultimo_backup")) || 0; } catch (e) { /* sem armazenamento local */ }
    return Math.max(doServidor, local);
}

// ---------- operações grandes (esperam o servidor) ----------

function erroComCodigo(mensagem, codigo) {
    return Object.assign(new Error(mensagem), { code: codigo });
}

function exigirOnline() {
    if (estado.offline || (typeof navigator !== "undefined" && navigator.onLine === false)) {
        throw erroComCodigo("Sem internet", "sem-internet");
    }
}

function comTempo(promessa, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(erroComCodigo("O servidor não respondeu a tempo", "tempo-esgotado")), ms);
        promessa.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });
}

const confirmarNoServidor = lote => comTempo(lote.commit(), TEMPO_OPERACAO_LONGA);

async function executarOperacoes(operacoes, aoProgresso) {
    let feitas = 0;
    for (let i = 0; i < operacoes.length; i += TAMANHO_LOTE) {
        const parte = operacoes.slice(i, i + TAMANHO_LOTE);
        const lote = firestore.batch();
        parte.forEach(op => {
            if (op.tipo === "apagar") lote.delete(op.ref);
            else if (op.opcoes) lote.set(op.ref, op.dados, op.opcoes);
            else lote.set(op.ref, op.dados);
        });
        await confirmarNoServidor(lote);
        feitas += parte.length;
        if (aoProgresso) aoProgresso(feitas, operacoes.length);
    }
}

async function idsNoServidor(nome) {
    const snap = await colecao(nome).get({ source: "server" });
    return snap.docs.map(d => d.id);
}

// o documento do formato antigo (null se não existe)
export async function lerDocumentoAntigo() {
    exigirOnline();
    const snap = await docLegado().get({ source: "server" });
    return snap.exists ? snap.data() : null;
}

export async function marcarMigrado() {
    const lote = firestore.batch();
    lote.set(docMeta(), { migrado: true, migradoEm: agoraMs() }, { merge: true });
    await confirmarNoServidor(lote);
}

// norm: resultado de normalizarBackup(). Copia cada item para o seu documento (mesmos ids).
// O documento antigo NÃO é alterado: ele continua lá como cópia de segurança.
export async function migrarDados(norm, aoProgresso) {
    exigirOnline();
    const operacoes = [];
    COLECOES.forEach(nome => norm[nome].forEach(({ id, ...dados }) => operacoes.push({ tipo: "gravar", ref: documento(nome, id), dados })));
    await executarOperacoes(operacoes, aoProgresso);
    await marcarMigrado();
}

// Troca tudo pelo conteúdo do backup: grava o que está no arquivo e, só depois, remove o resto.
export async function restaurarBackup(norm, aoProgresso) {
    exigirOnline();
    const operacoes = [];
    const novos = {};
    COLECOES.forEach(nome => {
        novos[nome] = new Set();
        norm[nome].forEach(({ id, ...dados }) => {
            novos[nome].add(id);
            operacoes.push({ tipo: "gravar", ref: documento(nome, id), dados });
        });
    });
    for (const nome of COLECOES) {
        const existentes = await idsNoServidor(nome);
        existentes.filter(id => !novos[nome].has(id)).forEach(id => operacoes.push({ tipo: "apagar", ref: documento(nome, id) }));
    }
    await executarOperacoes(operacoes, aoProgresso);
}

// Apaga clientes, variedades, vendas e histórico (e o documento antigo).
// O meta/app continua com migrado=true para a migração nunca rodar de novo.
export async function apagarTudo(aoProgresso) {
    exigirOnline();
    const operacoes = [];
    for (const nome of COLECOES) {
        (await idsNoServidor(nome)).forEach(id => operacoes.push({ tipo: "apagar", ref: documento(nome, id) }));
    }
    operacoes.push({ tipo: "apagar", ref: docLegado() });
    await executarOperacoes(operacoes, aoProgresso);
    await marcarMigrado();
}

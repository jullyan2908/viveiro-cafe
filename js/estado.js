// ======================================
// Estado em memória: um espelho do que o Firestore mandou,
// mais um aviso para a tela redesenhar quando algo muda.
// ======================================

import { ordenarPorNome, comparar } from "./util.js";

export const COLECOES = ["clientes", "estoque", "vendas", "ajustes"];

function estadoInicial() {
    return {
        uid: null,
        email: "",

        clientes: [],
        estoque: [],
        vendas: [],
        ajustes: [],

        meta: null,            // documento meta/app (null = ainda não existe)
        metaDoServidor: false, // o servidor já confirmou o que sabemos do meta?

        // cada coleção está "carregada" quando já temos o que mostrar
        carregado: { clientes: false, estoque: false, vendas: false, ajustes: false },
        // o servidor já respondeu (dados confirmados, não só cópia do aparelho)
        servidor: { clientes: false, estoque: false, vendas: false, ajustes: false },
        pendentes: { clientes: false, estoque: false, vendas: false, ajustes: false },

        semConfirmacao: false,  // passou o tempo e o servidor ainda não respondeu: mostramos só o que há no aparelho
        erroAcesso: false,      // regras do Firestore negaram a leitura
        persistenciaOk: true,   // false se o navegador não deixa guardar dados offline
        offline: typeof navigator !== "undefined" ? navigator.onLine === false : false
    };
}

export const estado = estadoInicial();

// ---------- avisos de mudança ----------

const ouvintes = new Set();
let versao = 0;
const memoria = new Map();

export function inscrever(fn) {
    ouvintes.add(fn);
    return () => ouvintes.delete(fn);
}

export function notificar(chaves = []) {
    versao++;
    ouvintes.forEach(fn => {
        try { fn(chaves); } catch (e) { console.error("Erro ao atualizar a tela:", e); }
    });
}

export function definirLista(nome, lista) {
    estado[nome] = lista;
    notificar([nome]);
}

export function limparEstado() {
    Object.assign(estado, estadoInicial());
    notificar(["tudo"]);
}

export const tudoCarregado = () => COLECOES.every(c => estado.carregado[c]);
export const haPendencia = () => COLECOES.some(c => estado.pendentes[c]);

// ---------- consultas prontas (guardadas até o próximo aviso de mudança) ----------

function memo(chave, calcular) {
    const guardado = memoria.get(chave);
    if (guardado && guardado.versao === versao) return guardado.valor;
    const valor = calcular();
    memoria.set(chave, { versao, valor });
    return valor;
}

export const clientesPorId = () => memo("clientesPorId", () => new Map(estado.clientes.map(c => [c.id, c])));
export const estoquePorId = () => memo("estoquePorId", () => new Map(estado.estoque.map(e => [e.id, e])));
export const vendasPorId = () => memo("vendasPorId", () => new Map(estado.vendas.map(v => [v.id, v])));

export const clientesAtivos = () => memo("clientesAtivos", () => ordenarPorNome(estado.clientes.filter(c => !c.removido)));
export const estoqueAtivo = () => memo("estoqueAtivo", () => ordenarPorNome(estado.estoque.filter(e => !e.removido)));
export const vendasVisiveis = () => memo("vendasVisiveis", () => estado.vendas.filter(v => !v.removido));

// histórico de ajustes de uma variedade, do mais novo para o mais antigo
export function ajustesDe(produtoId) {
    return memo("ajustes:" + produtoId, () =>
        estado.ajustes.filter(a => a.produtoId === produtoId)
            .sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0)));
}

// tudo o que está na lixeira, do que saiu há menos tempo para o mais antigo
export const itensNaLixeira = () => memo("lixeira", () => {
    const lista = [];
    estado.clientes.filter(c => c.removido).forEach(item => lista.push({ tipo: "cliente", colecao: "clientes", item }));
    estado.estoque.filter(e => e.removido).forEach(item => lista.push({ tipo: "variedade", colecao: "estoque", item }));
    estado.vendas.filter(v => v.removido).forEach(item => lista.push({ tipo: "venda", colecao: "vendas", item }));
    return lista.sort((a, b) => (Number(b.item.removidoEm) || 0) - (Number(a.item.removidoEm) || 0) || comparar(a.item.id, b.item.id));
});

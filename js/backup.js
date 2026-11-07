// ======================================
// Backup: montar o arquivo e conferir, item por item, o que vem de um arquivo
// (puro: testado em testes/backup.test.js). A mesma conferência serve para
// restaurar backup e para migrar os dados do formato antigo.
// ======================================

import { novoId, idValido, urlSegura, ehDataISO, arred, dataLocal, plural } from "./util.js";

export const VERSAO_BACKUP = 2;

const TIPOS_AJUSTE = ["entrada", "perda", "correcao"];

const corta = (valor, max) => String(valor ?? "").trim().slice(0, max);
const ehObjeto = v => v !== null && typeof v === "object" && !Array.isArray(v);

// ---------- montar ----------

function limpar(item) {
    const out = {};
    Object.keys(item).forEach(k => { if (item[k] !== undefined) out[k] = item[k]; });
    return out;
}

export function montarBackup({ clientes = [], estoque = [], vendas = [], ajustes = [] }, agora = new Date()) {
    return {
        app: "viveiro-cafe",
        versao: VERSAO_BACKUP,
        geradoEm: agora.toISOString(),
        clientes: clientes.map(limpar),
        estoque: estoque.map(limpar),
        vendas: vendas.map(limpar),
        ajustes: ajustes.map(limpar)
    };
}

export const nomeArquivoBackup = (agora = new Date()) => `backup-viveiro-cafe-${dataLocal(agora)}.json`;

// ---------- conferir ----------

// criadoEm: usado só para ordenar. Ids do formato antigo começam com Date.now() em base 36.
function criadoEmDe(item, id, indice, legado) {
    if (Number.isFinite(item?.criadoEm) && item.criadoEm > 0) return item.criadoEm;
    if (legado) {
        const t = parseInt(String(id).slice(0, 8), 36);
        if (Number.isFinite(t) && t > 1.4e12 && t < 4.1e12) return t;
    }
    return indice + 1;
}

// campos de lixeira comuns a todos os tipos
function camposLixeira(item, destino, { agora, renovarLixeira }) {
    if (item?.removido === true) {
        destino.removido = true;
        const quando = Number(item.removidoEm);
        destino.removidoEm = renovarLixeira || !(quando > 0) ? agora : quando;
    }
}

// entrada: objeto lido do arquivo (qualquer coisa, inclusive lixo)
// devolve { ok, erro?, versao, clientes, estoque, vendas, ajustes, descartados, avisos, contagem }
export function normalizarBackup(entrada, { agora = Date.now(), renovarLixeira = false } = {}) {
    const falha = erro => ({
        ok: false, erro, versao: 0, clientes: [], estoque: [], vendas: [], ajustes: [],
        descartados: [], avisos: [], contagem: { clientes: 0, estoque: 0, vendas: 0, ajustes: 0 }
    });

    if (!ehObjeto(entrada)) return falha("Esse arquivo não é um backup do Viveiro Café.");
    if (!Array.isArray(entrada.clientes) || !Array.isArray(entrada.estoque) || !Array.isArray(entrada.vendas)) {
        return falha("Esse arquivo não tem clientes, estoque e vendas — não parece um backup do Viveiro Café.");
    }
    const versao = entrada.versao === undefined ? 1 : Number(entrada.versao);
    if (!Number.isFinite(versao) || versao < 1) return falha("Não foi possível identificar a versão desse backup.");
    if (versao > VERSAO_BACKUP) return falha("Esse backup é de uma versão mais nova do app. Atualize o app e tente de novo.");

    const legado = versao === 1;
    const opc = { agora, renovarLixeira };
    const descartados = [];
    const avisos = [];
    const descartar = (tipo, indice, motivo) => descartados.push({ tipo, indice, motivo });

    // ids de cada coleção: antigo → definitivo (ids estranhos ganham um id novo; as vendas acompanham)
    function gerenciarIds(lista, tipo) {
        const mapa = new Map();
        const usados = new Set();
        lista.forEach((item, i) => {
            if (!ehObjeto(item)) return;
            let id = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : "";
            let novo = id;
            if (!idValido(novo)) novo = novoId();
            if (usados.has(novo)) { mapa.set(`dup:${i}`, null); return; }
            usados.add(novo);
            mapa.set(`i:${i}`, novo);
            if (id) mapa.set(id, novo);
        });
        return mapa;
    }

    const mapaClientes = gerenciarIds(entrada.clientes, "cliente");
    const mapaEstoque = gerenciarIds(entrada.estoque, "variedade");

    // ----- clientes -----
    const clientes = [];
    entrada.clientes.forEach((c, i) => {
        if (!ehObjeto(c)) return descartar("cliente", i, "item inválido");
        const id = mapaClientes.get(`i:${i}`);
        if (!id) return descartar("cliente", i, "id repetido");
        const nome = corta(c.nome, 200);
        if (!nome) return descartar("cliente", i, "sem nome");
        const out = {
            id, nome,
            telefone: corta(c.telefone, 40),
            cidade: corta(c.cidade, 120),
            criadoEm: criadoEmDe(c, id, i, legado)
        };
        const url = urlSegura(c.contratoUrl);
        if (url) {
            out.contratoUrl = url;
            out.contratoNome = corta(c.contratoNome, 200) || "contrato.pdf";
        } else if (c.contratoUrl) avisos.push(`O contrato de "${nome}" foi ignorado (link não seguro).`);
        camposLixeira(c, out, opc);
        clientes.push(out);
    });

    // ----- estoque -----
    const estoque = [];
    entrada.estoque.forEach((e, i) => {
        if (!ehObjeto(e)) return descartar("variedade", i, "item inválido");
        const id = mapaEstoque.get(`i:${i}`);
        if (!id) return descartar("variedade", i, "id repetido");
        const nome = corta(e.nome, 200);
        if (!nome) return descartar("variedade", i, "sem nome");
        const q = Number(e.quantidade);
        if (!Number.isFinite(q)) return descartar("variedade", i, "quantidade inválida");
        const out = { id, nome, quantidade: Math.round(q), criadoEm: criadoEmDe(e, id, i, legado) };
        if (!Number.isInteger(q)) avisos.push(`A quantidade de "${nome}" foi arredondada para ${out.quantidade}.`);
        if (typeof e.minimo === "number" && Number.isFinite(e.minimo) && e.minimo >= 0) out.minimo = Math.round(e.minimo);
        camposLixeira(e, out, opc);
        estoque.push(out);
    });

    // ----- vendas -----
    const refCliente = id => (id !== undefined && mapaClientes.has(String(id)) ? mapaClientes.get(String(id)) : (idValido(String(id ?? "")) ? String(id) : ""));
    const refProduto = id => (id !== undefined && id !== null && mapaEstoque.has(String(id)) ? mapaEstoque.get(String(id)) : (idValido(String(id ?? "")) ? String(id) : null));

    const idsVendas = new Set();
    const vendas = [];
    entrada.vendas.forEach((v, i) => {
        if (!ehObjeto(v)) return descartar("venda", i, "item inválido");

        let itensBrutos;
        if (Array.isArray(v.itens)) itensBrutos = v.itens;
        else itensBrutos = [{ produtoId: v.produtoId, produto: v.produto, quantidade: v.quantidade, valor: v.valor }];

        const itens = [];
        itensBrutos.forEach(it => {
            if (!ehObjeto(it)) return;
            const produto = corta(it.produto, 200);
            const qtd = Number(it.quantidade);
            if (!produto || !Number.isFinite(qtd) || qtd < 1) return;
            let valor = null;
            if (it.valor !== null && it.valor !== undefined) {
                const n = Number(it.valor);
                if (!Number.isFinite(n) || n < 0) return;
                valor = arred(n);
            }
            itens.push({ produtoId: refProduto(it.produtoId), produto, quantidade: Math.round(qtd), valor });
        });
        if (!itens.length) return descartar("venda", i, "sem variedades válidas");

        let id = typeof v.id === "string" || typeof v.id === "number" ? String(v.id) : "";
        if (!idValido(id)) id = novoId();
        if (idsVendas.has(id)) return descartar("venda", i, "id repetido");
        idsVendas.add(id);

        // vendas muito antigas não tinham "status" nem "valorPago": eram sempre pagas por inteiro
        let pago = Number(v.valorPago);
        if (!Number.isFinite(pago) || pago < 0) {
            const totalAntigo = itens.every(it => it.valor !== null) ? itens.reduce((s, it) => s + it.valor, 0) : 0;
            pago = v.status === undefined && v.valorPago === undefined && legado ? totalAntigo : 0;
        }

        const out = {
            id,
            clienteId: refCliente(v.clienteId),
            itens,
            valorPago: arred(pago),
            data: ehDataISO(v.data) ? v.data : "",
            criadoEm: criadoEmDe(v, id, i, legado)
        };
        const nomeCliente = corta(v.clienteNome, 200);
        if (nomeCliente) out.clienteNome = nomeCliente;
        if (typeof v.entregue === "boolean") out.entregue = v.entregue;
        if (ehDataISO(v.retirada)) out.retirada = v.retirada;
        if (Number(v.entregueEm) > 0) out.entregueEm = Number(v.entregueEm);
        if (v.cancelada === true) {
            out.cancelada = true;
            out.canceladaEm = Number(v.canceladaEm) > 0 ? Number(v.canceladaEm) : agora;
        }
        camposLixeira(v, out, opc);
        vendas.push(out);
    });

    // ----- ajustes de estoque (só no formato novo) -----
    const ajustes = [];
    const idsAjustes = new Set();
    (Array.isArray(entrada.ajustes) ? entrada.ajustes : []).forEach((a, i) => {
        if (!ehObjeto(a)) return descartar("ajuste", i, "item inválido");
        const quantidade = Number(a.quantidade);
        if (!TIPOS_AJUSTE.includes(a.tipo) || !Number.isFinite(quantidade) || quantidade === 0) {
            return descartar("ajuste", i, "dados inválidos");
        }
        let id = typeof a.id === "string" ? a.id : "";
        if (!idValido(id)) id = novoId();
        if (idsAjustes.has(id)) return descartar("ajuste", i, "id repetido");
        idsAjustes.add(id);
        ajustes.push({
            id,
            produtoId: refProduto(a.produtoId),
            produto: corta(a.produto, 200),
            tipo: a.tipo,
            quantidade: Math.round(quantidade),
            motivo: corta(a.motivo, 300),
            data: ehDataISO(a.data) ? a.data : "",
            criadoEm: criadoEmDe(a, id, i, false)
        });
    });

    return {
        ok: true,
        versao,
        clientes, estoque, vendas, ajustes,
        descartados,
        avisos,
        contagem: { clientes: clientes.length, estoque: estoque.length, vendas: vendas.length, ajustes: ajustes.length }
    };
}

// "12 clientes, 5 variedades e 87 vendas"
export function resumoBackup(c) {
    return `${plural(c.clientes, "cliente", "clientes")}, ${plural(c.estoque, "variedade", "variedades")} e ${plural(c.vendas, "venda", "vendas")}`;
}

export function textoDescartados(descartados) {
    if (!descartados.length) return "";
    const n = descartados.length;
    return `${plural(n, "item foi ignorado", "itens foram ignorados")} por estar${n === 1 ? "" : "em"} incompleto${n === 1 ? "" : "s"} ou repetido${n === 1 ? "" : "s"}.`;
}

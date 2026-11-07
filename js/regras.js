// ======================================
// Regras do negócio (puras: sem tela e sem Firebase)
// Tudo aqui é testado em testes/regras.test.js
// ======================================

import { MINIMO_PADRAO, DIAS_LIXEIRA, DIAS_ALERTA_BACKUP } from "./config.js";
import {
    arred, dinheiro, numero, plural, paraNumero, paraInteiro, comparar, contem,
    ehDataISO, mesDe, primeiroNome, diasDesdeMs
} from "./util.js";

// ---------- vendas ----------
// Uma venda pode ter várias variedades:
//   itens: [{ produtoId, produto, quantidade, valor }]   (valor = total da linha; null = preço a definir)
// A situação (pago, parcial…) nunca é guardada: é sempre calculada a partir dos valores.

export function itensDaVenda(v) {
    if (Array.isArray(v?.itens)) return v.itens;
    // formato antigo (uma variedade por venda) — só por garantia
    if (v && v.produto != null) {
        return [{
            produtoId: v.produtoId ?? null,
            produto: v.produto,
            quantidade: Number(v.quantidade) || 0,
            valor: v.valor == null ? null : Number(v.valor)
        }];
    }
    return [];
}

export function quantidadeVenda(v) {
    return itensDaVenda(v).reduce((soma, i) => soma + (Number(i.quantidade) || 0), 0);
}

// total da venda, ou null se alguma variedade ainda está sem preço
export function totalVenda(v) {
    const itens = itensDaVenda(v);
    if (!itens.length) return null;
    let soma = 0;
    for (const i of itens) {
        if (i.valor === null || i.valor === undefined || !Number.isFinite(Number(i.valor))) return null;
        soma += Number(i.valor);
    }
    return arred(soma);
}

export const pagoVenda = v => arred(Math.max(0, Number(v?.valorPago) || 0));

// quanto falta receber (null se o preço ainda não foi definido)
export function saldoVenda(v) {
    const total = totalVenda(v);
    return total === null ? null : Math.max(0, arred(total - pagoVenda(v)));
}

// 'cancelada' | 'sem_preco' | 'pago' | 'parcial' | 'reservado'
export function statusVenda(v) {
    if (v?.cancelada) return "cancelada";
    const total = totalVenda(v);
    if (total === null) return "sem_preco";
    const pago = pagoVenda(v);
    if (pago >= total) return "pago";
    if (pago > 0) return "parcial";
    return "reservado";
}

// 'pendente' | 'entregue' | 'nao_controlada' (vendas antigas, de antes do controle de entrega)
export function entregaVenda(v) {
    if (typeof v?.entregue !== "boolean") return "nao_controlada";
    return v.entregue ? "entregue" : "pendente";
}

// conta nos totais? (não está na lixeira e não foi cancelada)
export const vendaAtiva = v => !v?.removido && !v?.cancelada;
export const vendaVisivel = v => !v?.removido;

export function resumoItens(itens) {
    return (itens || []).map(i => `${numero(i.quantidade)} ${i.produto}`).join(", ");
}

export function nomeDoCliente(venda, clientesPorId) {
    const c = clientesPorId?.get?.(venda.clienteId);
    return c?.nome || venda.clienteNome || "Cliente removido";
}

// mais recentes primeiro
export function ordenarVendas(vendas) {
    return vendas.slice().sort((a, b) =>
        comparar(b.data || "", a.data || "") ||
        (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0) ||
        comparar(b.id, a.id)
    );
}

// ---------- painel ----------

export function resumoDoPainel({ vendas = [], estoque = [], clientes = [] }) {
    let faturamento = 0, recebido = 0, aReceber = 0, mudasVendidas = 0;
    let semPreco = 0, semPrecoSinal = 0, aEntregar = 0, mudasAEntregar = 0;

    for (const v of vendas.filter(vendaAtiva)) {
        const total = totalVenda(v);
        const pago = pagoVenda(v);
        const qtd = quantidadeVenda(v);
        mudasVendidas += qtd;
        recebido += pago;
        if (total === null) {
            semPreco++;
            semPrecoSinal += pago;
        } else {
            faturamento += total;
            aReceber += Math.max(0, total - pago);
        }
        if (entregaVenda(v) === "pendente") {
            aEntregar++;
            mudasAEntregar += qtd;
        }
    }

    const estoqueAtivo = estoque.filter(e => !e.removido);
    return {
        estoqueTotal: estoqueAtivo.reduce((s, e) => s + (Number(e.quantidade) || 0), 0),
        mudasVendidas,
        faturamento: arred(faturamento),
        recebido: arred(recebido),
        aReceber: arred(aReceber),
        semPreco,
        semPrecoSinal: arred(semPrecoSinal),
        aEntregar,
        mudasAEntregar,
        clientes: clientes.filter(c => !c.removido).length
    };
}

// clientes com saldo a pagar, do maior para o menor
export function devedores(vendas, clientesPorId = new Map()) {
    const grupos = new Map();
    for (const v of vendas.filter(vendaAtiva)) {
        const saldo = saldoVenda(v);
        if (saldo === null || saldo <= 0) continue;
        let g = grupos.get(v.clienteId);
        if (!g) {
            g = { clienteId: v.clienteId, nome: nomeDoCliente(v, clientesPorId), saldo: 0, vendas: [], maisAntiga: "" };
            grupos.set(v.clienteId, g);
        }
        g.saldo = arred(g.saldo + saldo);
        g.vendas.push(v);
        if (ehDataISO(v.data) && (!g.maisAntiga || v.data < g.maisAntiga)) g.maisAntiga = v.data;
    }
    return [...grupos.values()].sort((a, b) => b.saldo - a.saldo || comparar(a.nome, b.nome));
}

export function extratoCliente(clienteId, vendas) {
    const todas = vendas.filter(v => v.clienteId === clienteId && vendaVisivel(v));
    const ativas = todas.filter(vendaAtiva);
    let comprado = 0, pago = 0, deve = 0, mudas = 0, semPreco = 0;
    for (const v of ativas) {
        const total = totalVenda(v);
        mudas += quantidadeVenda(v);
        pago += pagoVenda(v);
        if (total === null) semPreco++;
        else {
            comprado += total;
            deve += Math.max(0, total - pagoVenda(v));
        }
    }
    return {
        vendas: ordenarVendas(todas),
        comprado: arred(comprado), pago: arred(pago), deve: arred(deve), mudas, semPreco
    };
}

// ---------- filtros da lista de vendas ----------

export const FILTROS_VENDA = ["todas", "a_receber", "sem_preco", "a_entregar", "pagas"];

export function passaFiltroVenda(v, situacao) {
    if (situacao === "todas" || !situacao) return true;
    if (!vendaAtiva(v)) return false;
    const st = statusVenda(v);
    if (situacao === "a_receber") return st === "reservado" || st === "parcial";
    if (situacao === "sem_preco") return st === "sem_preco";
    if (situacao === "pagas") return st === "pago";
    if (situacao === "a_entregar") return entregaVenda(v) === "pendente";
    return true;
}

export function filtrarVendas(vendas, { situacao = "todas", mes = "", busca = "", clientesPorId = new Map() } = {}) {
    return ordenarVendas(vendas.filter(vendaVisivel).filter(v => {
        if (!passaFiltroVenda(v, situacao)) return false;
        if (mes && mesDe(v.data) !== mes) return false;
        if (busca && busca.trim()) {
            const nome = nomeDoCliente(v, clientesPorId);
            const produtos = itensDaVenda(v).map(i => i.produto).join(" ");
            if (!contem(nome, busca) && !contem(produtos, busca)) return false;
        }
        return true;
    }));
}

export function contarPorFiltro(vendas) {
    const visiveis = vendas.filter(vendaVisivel);
    const out = {};
    for (const f of FILTROS_VENDA) out[f] = visiveis.filter(v => passaFiltroVenda(v, f)).length;
    return out;
}

// meses (AAAA-MM) que têm venda, do mais recente para o mais antigo
export function mesesDasVendas(vendas) {
    const meses = new Set();
    for (const v of vendas.filter(vendaVisivel)) {
        const m = mesDe(v.data);
        if (m) meses.add(m);
    }
    return [...meses].sort().reverse();
}

// ---------- estoque ----------

export function minimoDe(e) {
    return typeof e?.minimo === "number" && Number.isFinite(e.minimo) && e.minimo >= 0 ? e.minimo : MINIMO_PADRAO;
}

// 'negativo' | 'zerado' | 'baixo' | 'ok'
export function situacaoEstoque(e) {
    const q = Number(e?.quantidade) || 0;
    if (q < 0) return "negativo";
    if (q === 0) return "zerado";
    if (q < minimoDe(e)) return "baixo";
    return "ok";
}

export const estoqueBaixo = estoque =>
    estoque.filter(e => !e.removido && situacaoEstoque(e) !== "ok");

// nome já usado por outra variedade? (ignora acento, maiúsculas e a própria variedade ao editar)
export function nomeDuplicado(nome, lista, ignorarId = null) {
    const n = String(nome ?? "").trim();
    if (!n) return false;
    return lista.some(x => !x.removido && x.id !== ignorarId && comparar(String(x.nome).trim(), n) === 0);
}

// Ajuste manual de estoque. tipo: 'entrada' | 'perda' | 'correcao'
// Para 'correcao' a pessoa informa a contagem real e o app calcula a diferença.
export function calcularAjuste({ tipo, quantidade, contagem, atual }) {
    const estoqueAtual = Number(atual) || 0;
    if (tipo === "correcao") {
        const nova = paraInteiro(contagem);
        if (!Number.isFinite(nova) || nova < 0) return { erro: "Informe a contagem atual (número inteiro, 0 ou mais)" };
        return { delta: nova - estoqueAtual, novoTotal: nova };
    }
    const q = paraInteiro(quantidade);
    if (!Number.isFinite(q) || q < 1) return { erro: "Informe a quantidade (número inteiro, 1 ou mais)" };
    if (tipo === "perda") {
        if (q > estoqueAtual) return { erro: `Só há ${plural(estoqueAtual, "muda", "mudas")} em estoque` };
        return { delta: -q, novoTotal: estoqueAtual - q };
    }
    return { delta: q, novoTotal: estoqueAtual + q };
}

// O que muda no estoque quando uma venda passa de itensAntigos para itensNovos.
// delta > 0 devolve mudas ao estoque; delta < 0 tira.
export function deltaEstoque(itensAntigos = [], itensNovos = []) {
    const delta = new Map();
    for (const i of itensAntigos) {
        if (!i.produtoId) continue;
        delta.set(i.produtoId, (delta.get(i.produtoId) || 0) + (Number(i.quantidade) || 0));
    }
    for (const i of itensNovos) {
        if (!i.produtoId) continue;
        delta.set(i.produtoId, (delta.get(i.produtoId) || 0) - (Number(i.quantidade) || 0));
    }
    return [...delta].filter(([, d]) => d !== 0).map(([produtoId, d]) => ({ produtoId, delta: d }));
}

// ---------- validação do formulário de venda ----------

// Recebe o que foi digitado (texto) e devolve erros por campo + os dados já convertidos.
// `dados` é preenchido mesmo com erros, para o resumo ao vivo.
export function validarVenda({
    clienteId, itens = [], entrada = "", data = "", retirada = "",
    estoque = [], clientes = [], itensAntigos = []
}) {
    const erros = { cliente: "", itens: [], entrada: "", data: "", retirada: "", geral: "" };

    if (!clienteId || !clientes.some(c => c.id === clienteId && !c.removido)) {
        erros.cliente = "Escolha o cliente";
    }

    const devolvidas = new Map();
    for (const i of itensAntigos) {
        devolvidas.set(i.produtoId, (devolvidas.get(i.produtoId) || 0) + (Number(i.quantidade) || 0));
    }

    const limpos = [];
    const vistos = new Set();
    let algumSemPreco = false;

    itens.forEach((it, idx) => {
        const e = { produto: "", quantidade: "", preco: "" };
        erros.itens[idx] = e;

        const produto = estoque.find(p => p.id === it.produtoId && !p.removido);
        if (!it.produtoId) e.produto = "Escolha a variedade";
        else if (!produto) e.produto = "Essa variedade não está mais no estoque";
        else if (vistos.has(it.produtoId)) e.produto = "Essa variedade já está em outra linha";
        if (it.produtoId) vistos.add(it.produtoId);

        const qtd = paraInteiro(it.quantidade);
        if (!Number.isFinite(qtd) || qtd < 1) e.quantidade = "Informe a quantidade (número inteiro)";
        else if (produto) {
            const disponivel = (Number(produto.quantidade) || 0) + (devolvidas.get(produto.id) || 0);
            if (qtd > disponivel) {
                e.quantidade = disponivel > 0
                    ? `Só há ${plural(disponivel, "muda", "mudas")} de ${produto.nome} em estoque`
                    : `${produto.nome} está sem estoque`;
            }
        }

        let preco = null;
        const precoTxt = String(it.preco ?? "").trim();
        if (precoTxt !== "") {
            preco = paraNumero(precoTxt);
            if (!Number.isFinite(preco) || preco <= 0) {
                e.preco = "Preço inválido (use um valor maior que zero)";
                preco = null;
            }
        }

        if (!e.produto && !e.quantidade && !e.preco) {
            limpos.push({
                produtoId: produto.id,
                produto: produto.nome,
                quantidade: qtd,
                valor: preco === null ? null : arred(preco * qtd)
            });
            if (preco === null) algumSemPreco = true;
        }
    });

    if (!itens.length) erros.geral = "Adicione pelo menos uma variedade";

    // total só existe quando todas as linhas estão válidas e com preço
    const total = itens.length > 0 && limpos.length === itens.length && !algumSemPreco
        ? arred(limpos.reduce((s, i) => s + i.valor, 0))
        : null;

    let pago = 0;
    const entradaTxt = String(entrada ?? "").trim();
    if (entradaTxt !== "") {
        pago = paraNumero(entradaTxt);
        if (!Number.isFinite(pago) || pago < 0) {
            erros.entrada = "Valor inválido";
            pago = 0;
        } else if (total !== null && arred(pago) > total) {
            erros.entrada = `Maior que o total (${dinheiro(total)})`;
        }
    }
    pago = arred(pago);

    const dataFinal = data || "";
    if (!ehDataISO(dataFinal)) erros.data = "Informe a data da venda";
    if (retirada) {
        if (!ehDataISO(retirada)) erros.retirada = "Data inválida";
        else if (ehDataISO(dataFinal) && retirada < dataFinal) erros.retirada = "A retirada não pode ser antes da venda";
    }

    const ok = !erros.cliente && !erros.geral && !erros.entrada && !erros.data && !erros.retirada &&
        erros.itens.every(e => !e.produto && !e.quantidade && !e.preco);

    return {
        ok,
        erros,
        dados: { clienteId, itens: limpos, total, valorPago: pago, data: dataFinal, retirada: retirada || "" },
        saldo: total === null ? null : Math.max(0, arred(total - pago))
    };
}

// valor recebido agora (texto) para uma venda que já tem preço
export function validarRecebimento(texto, venda) {
    const saldo = saldoVenda(venda);
    if (saldo === null) return { erro: "Defina o preço antes de receber" };
    const valor = paraNumero(texto);
    if (!Number.isFinite(valor) || valor <= 0) return { erro: "Informe um valor maior que zero" };
    if (arred(valor) > saldo) return { erro: `Maior que o que falta (${dinheiro(saldo)})` };
    return { valor: arred(valor), quitou: arred(valor) >= saldo };
}

// preços por muda digitados para as variedades sem preço de uma venda
// precos: { [índice do item]: "1,50" }
// devolve { ok, erros: {índice: msg}, erroGeral, itens, total }
export function validarPrecos(precos, venda) {
    const itens = itensDaVenda(venda).map(i => ({ ...i }));
    const erros = {};
    itens.forEach((it, idx) => {
        if (it.valor !== null && it.valor !== undefined) return; // já tem preço
        const p = paraNumero(precos[idx]);
        if (!Number.isFinite(p) || p <= 0) {
            erros[idx] = "Informe o preço por muda";
            return;
        }
        it.valor = arred(p * (Number(it.quantidade) || 0));
    });
    if (Object.keys(erros).length) return { ok: false, erros, erroGeral: "" };

    const total = arred(itens.reduce((s, i) => s + Number(i.valor), 0));
    const pago = pagoVenda(venda);
    if (pago > total) {
        return {
            ok: false, erros: {},
            erroGeral: `O que já foi recebido (${dinheiro(pago)}) é maior que o total (${dinheiro(total)}). Confira os preços.`
        };
    }
    return { ok: true, erros: {}, erroGeral: "", itens, total };
}

// ---------- lixeira e backup ----------

export function expirouNaLixeira(item, agora = Date.now(), dias = DIAS_LIXEIRA) {
    return !!item?.removido && Number(item.removidoEm) > 0 && agora - Number(item.removidoEm) > dias * 86400000;
}

export function diasRestantesLixeira(item, agora = Date.now(), dias = DIAS_LIXEIRA) {
    const restante = (Number(item?.removidoEm) || 0) + dias * 86400000 - agora;
    return Math.max(0, Math.ceil(restante / 86400000));
}

// { precisa, dias }  — dias é Infinity se nunca fez backup
export function situacaoBackup(ultimoBackupMs, agora = Date.now(), limite = DIAS_ALERTA_BACKUP) {
    const dias = diasDesdeMs(ultimoBackupMs, agora);
    return { precisa: dias >= limite, dias };
}

// ---------- mensagens prontas (WhatsApp) ----------

export function mensagemCobranca(cliente, saldo) {
    const nome = primeiroNome(cliente?.nome);
    return `Olá${nome ? ", " + nome : ""}! Tudo bem? Passando para lembrar do saldo de ${dinheiro(saldo)} das mudas de café. Quando puder acertar, me avise. Obrigado!`;
}

export function mensagemMudasProntas(cliente, itens) {
    const nome = primeiroNome(cliente?.nome);
    return `Olá${nome ? ", " + nome : ""}! Suas mudas já estão prontas (${resumoItens(itens)}). Vamos combinar o melhor dia para a retirada?`;
}

export function mensagemOla(cliente) {
    const nome = primeiroNome(cliente?.nome);
    return `Olá${nome ? ", " + nome : ""}! Tudo bem?`;
}

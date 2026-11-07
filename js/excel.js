// ======================================
// Planilha Excel (.xlsx)
// Recebe a biblioteca (XLSX) de fora, assim dá para testar em Node.
// Abas: Clientes, Estoque, Vendas (um pedido por linha) e Itens vendidos.
// Vendas canceladas e itens da lixeira não entram.
// ======================================

import { arred, ehDataISO } from "./util.js";
import {
    itensDaVenda, quantidadeVenda, totalVenda, pagoVenda, saldoVenda, statusVenda, entregaVenda,
    vendaAtiva, ordenarVendas, resumoItens, nomeDoCliente, situacaoEstoque, minimoDe, devedores
} from "./regras.js";

const MOEDA = '"R$" #,##0.00';
const DATA = "dd/mm/yyyy";

const ROTULO_SITUACAO = {
    sem_preco: "Preço a definir",
    reservado: "Reservado",
    parcial: "Parcial (sinal)",
    pago: "Pago"
};
const ROTULO_ESTOQUE = { ok: "Ok", baixo: "Baixo", zerado: "Zerado", negativo: "Negativo" };
const ROTULO_ENTREGA = { pendente: "A entregar", entregue: "Entregue", nao_controlada: "" };

// só a primeira linha leva o estilo de cabeçalho
const estiloCabecalho = {
    font: { bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "7C9A54" } },
    alignment: { horizontal: "center", vertical: "center" }
};

const cab = texto => ({ v: texto, t: "s", s: estiloCabecalho });
const texto = valor => ({ v: String(valor ?? ""), t: "s" });
const num = valor => ({ v: Number(valor) || 0, t: "n" });
const moeda = valor => ({ v: arred(valor), t: "n", z: MOEDA });

// Data de verdade (número de série do Excel com formato de data): ordena e filtra certo.
// Calculado em UTC para não depender do fuso de quem gera o arquivo.
function data(iso) {
    if (!ehDataISO(iso)) return texto("");
    const serie = Math.round((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 86400000);
    return { v: serie, t: "n", z: DATA };
}

function aba(XLSX, cabecalhos, linhas, larguras) {
    const ws = XLSX.utils.aoa_to_sheet([cabecalhos.map(cab), ...linhas]);
    ws["!cols"] = larguras.map(wch => ({ wch }));
    const ultimaColuna = XLSX.utils.encode_col(cabecalhos.length - 1);
    ws["!autofilter"] = { ref: `A1:${ultimaColuna}${Math.max(1, linhas.length + 1)}` };
    return ws;
}

export function montarPlanilha(XLSX, { clientes = [], estoque = [], vendas = [] }) {
    const wb = XLSX.utils.book_new();

    const clientesAtivos = clientes.filter(c => !c.removido);
    const clientesPorId = new Map(clientes.map(c => [c.id, c]));
    const deveDe = new Map(devedores(vendas, clientesPorId).map(d => [d.clienteId, d.saldo]));
    const ativas = ordenarVendas(vendas.filter(vendaAtiva)).reverse(); // da mais antiga para a mais nova

    XLSX.utils.book_append_sheet(wb, aba(XLSX,
        ["Nome", "Telefone", "Cidade", "Deve", "Contrato"],
        clientesAtivos.map(c => [texto(c.nome), texto(c.telefone), texto(c.cidade), moeda(deveDe.get(c.id) || 0), texto(c.contratoUrl || "")]),
        [30, 18, 22, 14, 40]), "Clientes");

    XLSX.utils.book_append_sheet(wb, aba(XLSX,
        ["Variedade", "Quantidade", "Mínimo", "Situação"],
        estoque.filter(e => !e.removido).map(e => [texto(e.nome), num(e.quantidade), num(minimoDe(e)), texto(ROTULO_ESTOQUE[situacaoEstoque(e)])]),
        [30, 14, 12, 12]), "Estoque");

    XLSX.utils.book_append_sheet(wb, aba(XLSX,
        ["Data", "Cliente", "Mudas", "Quantidade", "Valor", "Situação", "Valor pago", "Falta receber", "Entrega", "Retirada prevista"],
        ativas.map(v => {
            const total = totalVenda(v);
            return [
                data(v.data),
                texto(nomeDoCliente(v, clientesPorId)),
                texto(resumoItens(itensDaVenda(v))),
                num(quantidadeVenda(v)),
                total === null ? texto("A definir") : moeda(total),
                texto(ROTULO_SITUACAO[statusVenda(v)]),
                moeda(pagoVenda(v)),
                total === null ? texto("") : moeda(saldoVenda(v)),
                texto(ROTULO_ENTREGA[entregaVenda(v)]),
                data(v.retirada)
            ];
        }),
        [12, 28, 40, 12, 14, 18, 14, 14, 12, 16]), "Vendas");

    const linhasItens = [];
    ativas.forEach(v => {
        itensDaVenda(v).forEach(i => {
            const tem = i.valor !== null && i.valor !== undefined;
            linhasItens.push([
                data(v.data),
                texto(nomeDoCliente(v, clientesPorId)),
                texto(i.produto),
                num(i.quantidade),
                tem && i.quantidade > 0 ? moeda(i.valor / i.quantidade) : texto("A definir"),
                tem ? moeda(i.valor) : texto("A definir")
            ]);
        });
    });
    XLSX.utils.book_append_sheet(wb, aba(XLSX,
        ["Data", "Cliente", "Variedade", "Quantidade", "Preço por muda", "Valor do item"],
        linhasItens, [12, 28, 30, 12, 16, 16]), "Itens vendidos");

    return wb;
}

// bytes do arquivo .xlsx
export function gerarXlsx(XLSX, dados) {
    return XLSX.write(montarPlanilha(XLSX, dados), { type: "array", bookType: "xlsx" });
}

export const nomeArquivoExcel = (hoje = new Date()) => {
    const p = n => String(n).padStart(2, "0");
    return `viveiro-cafe-${hoje.getFullYear()}-${p(hoje.getMonth() + 1)}-${p(hoje.getDate())}.xlsx`;
};


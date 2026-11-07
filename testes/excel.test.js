process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { montarPlanilha, gerarXlsx, nomeArquivoExcel } from "../js/excel.js";
import { normalizarBackup } from "../js/backup.js";

// a biblioteca é um script de navegador: carregamos num contexto isolado
const ctx = { console, TextDecoder, TextEncoder, Uint8Array, ArrayBuffer, Date, Math, JSON, Object, Array, String, Number, Error, Map, Set, Symbol, parseInt, parseFloat, isNaN, RegExp };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("../vendor/xlsx.bundle.js", import.meta.url), "utf8"), ctx);
const XLSX = ctx.XLSX;

const dados = () => {
    const n = normalizarBackup(JSON.parse(readFileSync(new URL("./dados-legado.json", import.meta.url), "utf8")));
    // uma venda nova, com 2 variedades, cancelada, e um cliente na lixeira — nenhuma deve aparecer
    n.vendas.push({ id: "x1", clienteId: "c1", itens: [{ produtoId: "e1", produto: "Catuaí Vermelho IAC 144", quantidade: 10, valor: 20 }], valorPago: 20, data: "2026-11-06", criadoEm: 99, cancelada: true });
    n.vendas.push({ id: "x2", clienteId: "c2", itens: [{ produtoId: "e1", produto: "Catuaí", quantidade: 10, valor: 20 }, { produtoId: "e3", produto: "Arara", quantidade: 5, valor: null }], valorPago: 0, data: "2026-11-07", criadoEm: 100, entregue: false, retirada: "2026-11-20" });
    n.clientes.push({ id: "c9", nome: "Apagado", telefone: "", cidade: "", removido: true, removidoEm: 1 });
    return n;
};

const lerDeVolta = d => XLSX.read(gerarXlsx(XLSX, d), { type: "array" });
// (a biblioteca roda em outro contexto do Node: copiamos para arrays "normais" antes de comparar)
const linhas = (wb, nome) => JSON.parse(JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true })));

test("quatro abas, na ordem certa", () => {
    const wb = lerDeVolta(dados());
    assert.deepEqual([...wb.SheetNames], ["Clientes", "Estoque", "Vendas", "Itens vendidos"]);
});

test("estilo de cabeçalho só na linha 1", () => {
    const wb = montarPlanilha(XLSX, dados());
    for (const nome of wb.SheetNames) {
        const ws = wb.Sheets[nome];
        assert.ok(ws.A1.s && ws.A1.s.fill, `${nome}: cabeçalho com estilo`);
        const ultima = XLSX.utils.decode_range(ws["!ref"]).e.r;
        for (let r = 1; r <= ultima; r++) {
            for (const col of ["A", "B", "C"]) {
                const cel = ws[col + (r + 1)];
                if (cel) assert.equal(cel.s, undefined, `${nome}!${col}${r + 1} não deveria ter estilo de cabeçalho`);
            }
        }
        assert.ok(ws["!autofilter"], `${nome}: filtro`);
    }
});

test("vendas: um pedido por linha, datas de verdade, cancelada e lixeira de fora", () => {
    const wb = lerDeVolta(dados());
    const v = linhas(wb, "Vendas");
    assert.deepEqual(v[0], ["Data", "Cliente", "Mudas", "Quantidade", "Valor", "Situação", "Valor pago", "Falta receber", "Entrega", "Retirada prevista"]);
    assert.equal(v.length, 1 + 6);                       // 5 antigas + x2; a cancelada (x1) não entra
    const doPedidoNovo = v[v.length - 1];
    assert.equal(doPedidoNovo[1], "Maria Aparecida Souza");
    assert.equal(doPedidoNovo[2], "10 Catuaí, 5 Arara");
    assert.equal(doPedidoNovo[3], 15);
    assert.equal(doPedidoNovo[4], "A definir");          // uma das variedades sem preço
    assert.equal(doPedidoNovo[5], "Preço a definir");
    assert.equal(doPedidoNovo[8], "A entregar");

    // as datas são números de série com formato de data (Excel ordena e filtra)
    const ws = wb.Sheets["Vendas"];
    assert.equal(ws.A2.t, "n");
    assert.equal(ws.A2.w, "02/10/2026");
    assert.equal(ws["J7"].w, "20/11/2026");
    // 2026-10-02 em número de série do Excel
    assert.equal(ws.A2.v, 46297);
});

test("valores em reais são números (dá para somar no Excel)", () => {
    const wb = lerDeVolta(dados());
    const v = linhas(wb, "Vendas");
    const pagos = v.slice(1).map(l => l[6]);
    assert.ok(pagos.every(x => typeof x === "number"));
    assert.equal(pagos.reduce((a, b) => a + b, 0), 3000 + 800 + 0 + 500 + 240 + 0);
    assert.equal(v[2][4], 2250);       // total da venda parcial
    assert.equal(v[2][7], 1450);       // falta receber
});

test("itens vendidos: uma linha por variedade, com preço por muda", () => {
    const wb = lerDeVolta(dados());
    const i = linhas(wb, "Itens vendidos");
    assert.equal(i.length, 1 + 5 + 2);
    assert.deepEqual(i[1].slice(1), ["Sebastião Almeida", "Catuaí Vermelho IAC 144", 2000, 1.5, 3000]);
    assert.deepEqual(i[i.length - 1].slice(2), ["Arara", 5, "A definir", "A definir"]);
});

test("clientes (sem a lixeira) com quanto devem; estoque com situação", () => {
    const wb = lerDeVolta(dados());
    const c = linhas(wb, "Clientes");
    assert.equal(c.length, 1 + 5);
    const maria = c.find(l => l[0] === "Maria Aparecida Souza");
    assert.equal(maria[3], 900);            // a venda reservada v3 (a nova x2 ainda não tem preço fechado)
    assert.equal(maria[4], "https://res.cloudinary.com/demo/contrato.pdf");
    const e = linhas(wb, "Estoque");
    assert.deepEqual(e.find(l => l[0] === "Arara"), ["Arara", 80, 100, "Baixo"]);
    assert.deepEqual(e.find(l => l[0] === "Topázio"), ["Topázio", 0, 100, "Zerado"]);
    assert.deepEqual(e.find(l => l[0] === "Mundo Novo"), ["Mundo Novo", 3400, 100, "Ok"]);
});

test("nome do arquivo", () => {
    assert.equal(nomeArquivoExcel(new Date(2026, 10, 7)), "viveiro-cafe-2026-11-07.xlsx");
});

process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizarBackup, montarBackup, nomeArquivoBackup, resumoBackup, textoDescartados, VERSAO_BACKUP } from "../js/backup.js";
import { totalVenda, statusVenda, saldoVenda } from "../js/regras.js";
import { idValido } from "../js/util.js";

const legado = () => JSON.parse(readFileSync(new URL("./dados-legado.json", import.meta.url), "utf8"));

test("formato antigo: cada venda vira um pedido com uma variedade, e a situação bate com a de antes", () => {
    const n = normalizarBackup(legado());
    assert.ok(n.ok);
    assert.equal(n.versao, 1);
    assert.deepEqual(n.contagem, { clientes: 5, estoque: 5, vendas: 5, ajustes: 0 });
    assert.equal(n.descartados.length, 0);

    const porId = Object.fromEntries(n.vendas.map(v => [v.id, v]));
    assert.deepEqual(porId.v1.itens, [{ produtoId: "e1", produto: "Catuaí Vermelho IAC 144", quantidade: 2000, valor: 3000 }]);
    assert.equal(statusVenda(porId.v1), "pago");
    assert.equal(statusVenda(porId.v2), "parcial");
    assert.equal(saldoVenda(porId.v2), 1450);
    assert.equal(statusVenda(porId.v3), "reservado");
    assert.equal(statusVenda(porId.v4), "sem_preco");
    assert.equal(porId.v4.valorPago, 500);
    assert.equal(totalVenda(porId.v4), null);
    assert.equal(porId.v1.data, "2026-10-02");
    assert.equal(porId.v1.entregue, undefined);   // vendas antigas: entrega "não controlada"
    assert.ok(!("status" in porId.v1));            // situação não é mais guardada
    assert.equal(porId.v1.clienteId, "c1");
});

test("clientes e estoque do formato antigo mantêm id e dados", () => {
    const n = normalizarBackup(legado());
    const c2 = n.clientes.find(c => c.id === "c2");
    assert.equal(c2.contratoUrl, "https://res.cloudinary.com/demo/contrato.pdf");
    assert.equal(c2.nome, "Maria Aparecida Souza");
    assert.equal(n.estoque.find(e => e.id === "e3").quantidade, 80);
    assert.equal(n.estoque.find(e => e.id === "e5").quantidade, 0);
    assert.ok(n.clientes.every(c => c.criadoEm > 0));
});

test("venda muito antiga (sem status e sem valorPago) era paga por inteiro", () => {
    const d = legado();
    d.vendas = [{ id: "v9", clienteId: "c1", produtoId: "e1", produto: "Catuaí", quantidade: 10, valor: 20, data: "2025-01-02" }];
    const n = normalizarBackup(d);
    assert.equal(n.vendas[0].valorPago, 20);
    assert.equal(statusVenda(n.vendas[0]), "pago");
});

test("ids vindos do formato antigo viram datas de criação (ordem preservada)", () => {
    const d = { clientes: [], estoque: [], vendas: [
        { id: Date.now().toString(36) + "abc123def", clienteId: "c1", produto: "A", quantidade: 1, valor: 1, valorPago: 1, data: "2026-01-01" }
    ] };
    const n = normalizarBackup(d);
    assert.ok(Math.abs(n.vendas[0].criadoEm - Date.now()) < 5000);
});

test("estrutura inválida é recusada com mensagem clara", () => {
    for (const ruim of [null, "texto", 5, [], {}, { clientes: [], estoque: [] }, { clientes: {}, estoque: [], vendas: [] }]) {
        const n = normalizarBackup(ruim);
        assert.ok(!n.ok, JSON.stringify(ruim));
        assert.ok(n.erro);
    }
    const novo = normalizarBackup({ versao: 99, clientes: [], estoque: [], vendas: [] });
    assert.ok(!novo.ok);
    assert.match(novo.erro, /versão mais nova/);
});

test("item por item: lixo é descartado, o resto entra", () => {
    const d = {
        clientes: [{ id: "a1", nome: "Ok" }, { id: "a2", nome: "   " }, 5, null, { id: "a1", nome: "Repetido" }],
        estoque: [{ id: "b1", nome: "Arara", quantidade: "80" }, { id: "b2", nome: "Sem qtd" }, { id: "b3", nome: "Decimal", quantidade: 10.4 }],
        vendas: [
            { id: "v1", clienteId: "a1", produto: "Arara", quantidade: 5, valor: 10, valorPago: 10, data: "2026-01-02" },
            { id: "v2", clienteId: "a1", produto: "", quantidade: 5, valor: 10 },       // sem nome de variedade
            { id: "v3", clienteId: "a1", produto: "X", quantidade: 0, valor: 10 },       // quantidade zero
            { id: "v4", clienteId: "a1", produto: "X", quantidade: 1, valor: -3 }         // valor negativo
        ]
    };
    const n = normalizarBackup(d);
    assert.ok(n.ok);
    assert.deepEqual(n.clientes.map(c => c.id), ["a1"]);
    assert.deepEqual(n.estoque.map(e => [e.id, e.quantidade]), [["b1", 80], ["b3", 10]]);
    assert.deepEqual(n.vendas.map(v => v.id), ["v1"]);
    assert.equal(n.descartados.length, 4 + 1 + 3);   // 4 clientes (sem nome, 2 inválidos, id repetido) + 1 variedade + 3 vendas
    assert.ok(n.avisos.some(a => /arredondada/.test(a)));
    assert.match(textoDescartados(n.descartados), /8 itens foram ignorados/);
    assert.match(textoDescartados([{}]), /^1 item foi ignorado por estar incompleto ou repetido\.$/);
});

test("ids estranhos ganham id novo e as vendas acompanham", () => {
    const d = {
        clientes: [{ id: "a/b", nome: "Barra" }],
        estoque: [{ id: "..", nome: "Ponto", quantidade: 5 }],
        vendas: [{ id: "x y", clienteId: "a/b", produtoId: "..", produto: "Ponto", quantidade: 1, valor: 2, valorPago: 0, data: "2026-01-01" }]
    };
    const n = normalizarBackup(d);
    const [c] = n.clientes, [e] = n.estoque, [v] = n.vendas;
    assert.ok(idValido(c.id) && idValido(e.id) && idValido(v.id));
    assert.notEqual(c.id, "a/b");
    assert.equal(v.clienteId, c.id);
    assert.equal(v.itens[0].produtoId, e.id);
});

test("contrato com link inseguro é ignorado, com aviso", () => {
    const n = normalizarBackup({ clientes: [{ id: "a", nome: "X", contratoUrl: "javascript:alert(1)" }, { id: "b", nome: "Y", contratoUrl: "http://x.com/a.pdf" }], estoque: [], vendas: [] });
    assert.ok(n.clientes.every(c => !c.contratoUrl));
    assert.equal(n.avisos.length, 2);
});

test("ida e volta: montar o backup e conferir de novo não perde nada", () => {
    const original = normalizarBackup(legado());
    const arquivo = montarBackup(original, new Date("2026-11-07T22:30:00-03:00"));
    assert.equal(arquivo.app, "viveiro-cafe");
    assert.equal(arquivo.versao, VERSAO_BACKUP);
    const texto = JSON.stringify(arquivo);                    // como vai para o arquivo
    const de_novo = normalizarBackup(JSON.parse(texto));
    assert.ok(de_novo.ok);
    assert.equal(de_novo.versao, 2);
    assert.deepEqual(de_novo.clientes, original.clientes);
    assert.deepEqual(de_novo.estoque, original.estoque);
    assert.deepEqual(de_novo.vendas, original.vendas);
    assert.equal(nomeArquivoBackup(new Date("2026-11-07T22:30:00-03:00")), "backup-viveiro-cafe-2026-11-07.json");
    assert.equal(resumoBackup(de_novo.contagem), "5 clientes, 5 variedades e 5 vendas");
});

test("formato novo preserva entrega, cancelamento, lixeira, vários itens e ajustes", () => {
    const entrada = {
        app: "viveiro-cafe", versao: 2,
        clientes: [{ id: "c1", nome: "A", telefone: "(34) 99999-9999", cidade: "X", criadoEm: 5, removido: true, removidoEm: 1000 }],
        estoque: [{ id: "e1", nome: "Catuaí", quantidade: 10, minimo: 50, criadoEm: 6 }],
        vendas: [{
            id: "v1", clienteId: "c1", clienteNome: "A", valorPago: 10, data: "2026-02-03", criadoEm: 7,
            itens: [{ produtoId: "e1", produto: "Catuaí", quantidade: 3, valor: 9 }, { produtoId: "e1", produto: "Outro", quantidade: 2, valor: null }],
            entregue: false, retirada: "2026-02-10", cancelada: true, canceladaEm: 2000
        }],
        ajustes: [{ id: "a1", produtoId: "e1", produto: "Catuaí", tipo: "perda", quantidade: -4, motivo: "murcharam", data: "2026-02-01", criadoEm: 8 },
                  { id: "a2", tipo: "invalido", quantidade: 1 }]
    };
    const n = normalizarBackup(entrada, { agora: 5000 });
    assert.ok(n.ok);
    assert.equal(n.clientes[0].removido, true);
    assert.equal(n.clientes[0].removidoEm, 1000);
    assert.equal(n.estoque[0].minimo, 50);
    const v = n.vendas[0];
    assert.equal(v.itens.length, 2);
    assert.equal(v.entregue, false);
    assert.equal(v.retirada, "2026-02-10");
    assert.equal(v.cancelada, true);
    assert.equal(v.canceladaEm, 2000);
    assert.equal(n.ajustes.length, 1);
    assert.equal(n.ajustes[0].quantidade, -4);
    assert.equal(n.descartados.filter(x => x.tipo === "ajuste").length, 1);

    // ao restaurar, o que estava na lixeira ganha mais 30 dias
    const renovado = normalizarBackup(entrada, { agora: 5000, renovarLixeira: true });
    assert.equal(renovado.clientes[0].removidoEm, 5000);
});

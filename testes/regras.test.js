process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    itensDaVenda, quantidadeVenda, totalVenda, pagoVenda, saldoVenda, statusVenda, entregaVenda, vendaAtiva,
    resumoItens, nomeDoCliente, ordenarVendas, resumoDoPainel, devedores, extratoCliente,
    passaFiltroVenda, filtrarVendas, contarPorFiltro, mesesDasVendas,
    minimoDe, situacaoEstoque, estoqueBaixo, nomeDuplicado, calcularAjuste, deltaEstoque,
    validarVenda, validarRecebimento, validarPrecos,
    expirouNaLixeira, diasRestantesLixeira, situacaoBackup,
    mensagemCobranca, mensagemMudasProntas
} from "../js/regras.js";

const item = (produtoId, produto, quantidade, valor) => ({ produtoId, produto, quantidade, valor });
const venda = (id, extra) => ({ id, clienteId: "c1", itens: [item("e1", "Catuaí", 100, 150)], valorPago: 0, data: "2026-11-01", criadoEm: 1, ...extra });

const clientes = [
    { id: "c1", nome: "Sebastião Almeida", telefone: "(34) 99876-5432" },
    { id: "c2", nome: "Maria Souza" },
    { id: "c3", nome: "Fazenda Santa Luzia", removido: true, removidoEm: 1 }
];
const clientesPorId = new Map(clientes.map(c => [c.id, c]));
const estoque = [
    { id: "e1", nome: "Catuaí Vermelho", quantidade: 5000 },
    { id: "e2", nome: "Arara", quantidade: 80 },
    { id: "e3", nome: "Topázio", quantidade: 0 },
    { id: "e4", nome: "Mundo Novo", quantidade: 500, minimo: 1000 },
    { id: "e5", nome: "Velho", quantidade: 3, removido: true, removidoEm: 1 }
];

test("situação da venda é sempre calculada dos valores", () => {
    assert.equal(statusVenda(venda("a", { valorPago: 0 })), "reservado");
    assert.equal(statusVenda(venda("a", { valorPago: 50 })), "parcial");
    assert.equal(statusVenda(venda("a", { valorPago: 150 })), "pago");
    assert.equal(statusVenda(venda("a", { valorPago: 200 })), "pago");
    assert.equal(statusVenda(venda("a", { itens: [item("e1", "Catuaí", 100, null)], valorPago: 20 })), "sem_preco");
    assert.equal(statusVenda(venda("a", { cancelada: true })), "cancelada");
    assert.equal(statusVenda({ itens: [] }), "sem_preco");
});

test("total, pago e saldo com várias variedades", () => {
    const v = venda("a", { itens: [item("e1", "Catuaí", 100, 150), item("e2", "Arara", 10, 45.5)], valorPago: 100 });
    assert.equal(totalVenda(v), 195.5);
    assert.equal(quantidadeVenda(v), 110);
    assert.equal(saldoVenda(v), 95.5);
    const semUm = venda("b", { itens: [item("e1", "Catuaí", 100, 150), item("e2", "Arara", 10, null)] });
    assert.equal(totalVenda(semUm), null);   // um item sem preço → total desconhecido
    assert.equal(saldoVenda(semUm), null);
    assert.equal(saldoVenda(venda("c", { valorPago: 999 })), 0); // nunca negativo
    assert.equal(pagoVenda({ valorPago: -5 }), 0);
});

test("formato antigo de uma variedade por venda ainda é entendido", () => {
    const antiga = { id: "x", produto: "Arara", produtoId: "e2", quantidade: 120, valor: 240, valorPago: 240 };
    assert.equal(totalVenda(antiga), 240);
    assert.equal(statusVenda(antiga), "pago");
    assert.equal(resumoItens(itensDaVenda(antiga)), "120 Arara");
});

test("entrega: vendas antigas não têm controle", () => {
    assert.equal(entregaVenda(venda("a")), "nao_controlada");
    assert.equal(entregaVenda(venda("a", { entregue: false })), "pendente");
    assert.equal(entregaVenda(venda("a", { entregue: true })), "entregue");
});

const vendas = [
    venda("v1", { valorPago: 0, entregue: false, data: "2026-11-01" }),                                   // reservado, 150 a receber
    venda("v2", { clienteId: "c2", valorPago: 50, entregue: true, data: "2026-10-20", criadoEm: 2 }),     // parcial, 100
    venda("v3", { clienteId: "c2", valorPago: 150, data: "2026-10-21", criadoEm: 3 }),                    // paga
    venda("v4", { itens: [item("e2", "Arara", 20, null)], valorPago: 20, data: "2026-11-03", criadoEm: 4 }), // sem preço, sinal 20
    venda("v5", { cancelada: true, valorPago: 150, data: "2026-11-04", criadoEm: 5 }),                    // cancelada: fora dos totais
    venda("v6", { removido: true, removidoEm: 10, data: "2026-11-05", criadoEm: 6 })                      // lixeira: some
];

test("resumo do painel ignora canceladas e lixeira", () => {
    const r = resumoDoPainel({ vendas, estoque, clientes });
    assert.equal(r.faturamento, 450);      // v1+v2+v3
    assert.equal(r.recebido, 220);         // 0+50+150+20
    assert.equal(r.aReceber, 250);         // 150+100
    assert.equal(r.semPreco, 1);
    assert.equal(r.semPrecoSinal, 20);
    assert.equal(r.mudasVendidas, 100 + 100 + 100 + 20);
    assert.equal(r.aEntregar, 1);          // só v1 está pendente
    assert.equal(r.estoqueTotal, 5000 + 80 + 0 + 500); // a variedade na lixeira não conta
    assert.equal(r.clientes, 2);
});

test("quem me deve: agrupa por cliente e ordena do maior para o menor", () => {
    const d = devedores(vendas, clientesPorId);
    assert.deepEqual(d.map(x => [x.clienteId, x.saldo]), [["c1", 150], ["c2", 100]]);
    assert.equal(d[1].maisAntiga, "2026-10-20");
    assert.equal(d[0].nome, "Sebastião Almeida");
    // cliente excluído continua aparecendo com o nome guardado na venda
    const orfa = [venda("o", { clienteId: "c9", clienteNome: "Fulano de Tal" })];
    assert.equal(devedores(orfa, clientesPorId)[0].nome, "Fulano de Tal");
    assert.equal(nomeDoCliente({ clienteId: "zz" }, clientesPorId), "Cliente removido");
});

test("extrato do cliente", () => {
    const e = extratoCliente("c2", vendas);
    assert.equal(e.comprado, 300);
    assert.equal(e.pago, 200);
    assert.equal(e.deve, 100);
    assert.equal(e.mudas, 200);
    assert.deepEqual(e.vendas.map(v => v.id), ["v3", "v2"]); // mais recentes primeiro
});

test("filtros e busca da lista de vendas", () => {
    const ids = f => filtrarVendas(vendas, { clientesPorId, ...f }).map(v => v.id);
    assert.deepEqual(ids({}), ["v5", "v4", "v1", "v3", "v2"]);                // todas (inclui cancelada, exclui lixeira)
    assert.deepEqual(ids({ situacao: "a_receber" }), ["v1", "v2"]);
    assert.deepEqual(ids({ situacao: "sem_preco" }), ["v4"]);
    assert.deepEqual(ids({ situacao: "a_entregar" }), ["v1"]);
    assert.deepEqual(ids({ situacao: "pagas" }), ["v3"]);
    assert.deepEqual(ids({ mes: "2026-10" }), ["v3", "v2"]);
    assert.deepEqual(ids({ busca: "MARIA" }), ["v3", "v2"]);
    assert.deepEqual(ids({ busca: "arara" }), ["v4"]);                        // busca também pelo nome da variedade
    assert.deepEqual(contarPorFiltro(vendas), { todas: 5, a_receber: 2, sem_preco: 1, a_entregar: 1, pagas: 1 });
    assert.deepEqual(mesesDasVendas(vendas), ["2026-11", "2026-10"]);
    assert.ok(!passaFiltroVenda(venda("c", { cancelada: true }), "pagas"));
});

test("ordem das vendas: data, depois criação", () => {
    const o = ordenarVendas([venda("a", { data: "2026-10-01", criadoEm: 9 }), venda("b", { data: "2026-11-01", criadoEm: 1 }), venda("c", { data: "2026-11-01", criadoEm: 5 })]);
    assert.deepEqual(o.map(v => v.id), ["c", "b", "a"]);
});

test("estoque: mínimo próprio, padrão 100, situação", () => {
    assert.equal(minimoDe({}), 100);
    assert.equal(minimoDe({ minimo: 1000 }), 1000);
    assert.equal(minimoDe({ minimo: 0 }), 0);
    assert.equal(minimoDe({ minimo: -5 }), 100);
    assert.equal(situacaoEstoque({ quantidade: 5000 }), "ok");
    assert.equal(situacaoEstoque({ quantidade: 99 }), "baixo");
    assert.equal(situacaoEstoque({ quantidade: 100 }), "ok");
    assert.equal(situacaoEstoque({ quantidade: 500, minimo: 1000 }), "baixo");
    assert.equal(situacaoEstoque({ quantidade: 0 }), "zerado");
    assert.equal(situacaoEstoque({ quantidade: -3 }), "negativo");
    assert.deepEqual(estoqueBaixo(estoque).map(e => e.id), ["e2", "e3", "e4"]);
});

test("nome de variedade repetido", () => {
    assert.ok(nomeDuplicado("catuai vermelho", estoque));
    assert.ok(nomeDuplicado("  ARARA ", estoque));
    assert.ok(!nomeDuplicado("Arara", estoque, "e2"));   // editando ela mesma
    assert.ok(!nomeDuplicado("Velho", estoque));          // a que está na lixeira não conta
    assert.ok(!nomeDuplicado("", estoque));
});

test("ajuste de estoque: entrada, perda, correção de contagem", () => {
    assert.deepEqual(calcularAjuste({ tipo: "entrada", quantidade: "500", atual: 80 }), { delta: 500, novoTotal: 580 });
    assert.deepEqual(calcularAjuste({ tipo: "perda", quantidade: "30", atual: 80 }), { delta: -30, novoTotal: 50 });
    assert.match(calcularAjuste({ tipo: "perda", quantidade: "90", atual: 80 }).erro, /Só há 80 mudas/);
    assert.deepEqual(calcularAjuste({ tipo: "correcao", contagem: "75", atual: 80 }), { delta: -5, novoTotal: 75 });
    assert.deepEqual(calcularAjuste({ tipo: "correcao", contagem: "0", atual: 80 }), { delta: -80, novoTotal: 0 });
    assert.ok(calcularAjuste({ tipo: "entrada", quantidade: "0", atual: 80 }).erro);
    assert.ok(calcularAjuste({ tipo: "entrada", quantidade: "1,5", atual: 80 }).erro);
    assert.ok(calcularAjuste({ tipo: "correcao", contagem: "", atual: 80 }).erro);
});

test("quanto o estoque muda ao registrar, editar e cancelar", () => {
    const a = [item("e1", "Catuaí", 100, 1), item("e2", "Arara", 10, 1)];
    assert.deepEqual(deltaEstoque([], a), [{ produtoId: "e1", delta: -100 }, { produtoId: "e2", delta: -10 }]);   // registrar
    assert.deepEqual(deltaEstoque(a, []), [{ produtoId: "e1", delta: 100 }, { produtoId: "e2", delta: 10 }]);     // cancelar
    const b = [item("e1", "Catuaí", 120, 1), item("e3", "Topázio", 5, 1)];
    assert.deepEqual(deltaEstoque(a, b), [{ produtoId: "e1", delta: -20 }, { produtoId: "e2", delta: 10 }, { produtoId: "e3", delta: -5 }]); // editar
    assert.deepEqual(deltaEstoque(a, a), []);                                                                      // nada mudou
});

const base = { clienteId: "c1", data: "2026-11-07", estoque, clientes };

test("validar venda: caminho feliz", () => {
    const r = validarVenda({ ...base, itens: [{ produtoId: "e1", quantidade: "100", preco: "1,50" }], entrada: "50" });
    assert.ok(r.ok);
    assert.equal(r.dados.total, 150);
    assert.equal(r.dados.valorPago, 50);
    assert.equal(r.saldo, 100);
    assert.deepEqual(r.dados.itens, [{ produtoId: "e1", produto: "Catuaí Vermelho", quantidade: 100, valor: 150 }]);
});

test("validar venda: sem preço deixa o total em aberto e aceita sinal", () => {
    const r = validarVenda({ ...base, itens: [{ produtoId: "e1", quantidade: "100", preco: "" }], entrada: "20" });
    assert.ok(r.ok);
    assert.equal(r.dados.total, null);
    assert.equal(r.saldo, null);
    assert.equal(r.dados.itens[0].valor, null);
});

test("validar venda: erros em português e por campo", () => {
    let r = validarVenda({ ...base, clienteId: "", itens: [{ produtoId: "", quantidade: "", preco: "abc" }], entrada: "x", data: "" });
    assert.ok(!r.ok);
    assert.equal(r.erros.cliente, "Escolha o cliente");
    assert.equal(r.erros.itens[0].produto, "Escolha a variedade");
    assert.match(r.erros.itens[0].quantidade, /número inteiro/);
    assert.match(r.erros.itens[0].preco, /Preço inválido/);
    assert.equal(r.erros.entrada, "Valor inválido");
    assert.equal(r.erros.data, "Informe a data da venda");

    r = validarVenda({ ...base, itens: [] });
    assert.equal(r.erros.geral, "Adicione pelo menos uma variedade");

    r = validarVenda({ ...base, clienteId: "c3", itens: [{ produtoId: "e1", quantidade: "1", preco: "" }] }); // cliente na lixeira
    assert.equal(r.erros.cliente, "Escolha o cliente");
});

test("validar venda: estoque insuficiente avisa em vez de cortar sozinho", () => {
    let r = validarVenda({ ...base, itens: [{ produtoId: "e2", quantidade: "100", preco: "" }] });
    assert.ok(!r.ok);
    assert.equal(r.erros.itens[0].quantidade, "Só há 80 mudas de Arara em estoque");
    r = validarVenda({ ...base, itens: [{ produtoId: "e3", quantidade: "1", preco: "" }] });
    assert.equal(r.erros.itens[0].quantidade, "Topázio está sem estoque");
    r = validarVenda({ ...base, itens: [{ produtoId: "e5", quantidade: "1", preco: "" }] });
    assert.match(r.erros.itens[0].produto, /não está mais/);
});

test("validar venda: entrada maior que o total é erro (não é cortada em silêncio)", () => {
    const r = validarVenda({ ...base, itens: [{ produtoId: "e1", quantidade: "100", preco: "1,50" }], entrada: "200" });
    assert.ok(!r.ok);
    assert.match(r.erros.entrada, /^Maior que o total \(R\$.150,00\)$/);
});

test("validar venda: variedade repetida e retirada antes da venda", () => {
    const r = validarVenda({ ...base, retirada: "2026-11-01", itens: [
        { produtoId: "e1", quantidade: "10", preco: "" }, { produtoId: "e1", quantidade: "10", preco: "" }] });
    assert.match(r.erros.itens[1].produto, /já está em outra linha/);
    assert.match(r.erros.retirada, /antes da venda/);
});

test("validar venda ao editar: as mudas da própria venda voltam a contar como disponíveis", () => {
    const antigos = [item("e2", "Arara", 70, 1)];
    // estoque de Arara é 80 (já descontou as 70). Dá para vender até 150 ao editar.
    let r = validarVenda({ ...base, itens: [{ produtoId: "e2", quantidade: "150", preco: "" }], itensAntigos: antigos });
    assert.ok(r.ok);
    r = validarVenda({ ...base, itens: [{ produtoId: "e2", quantidade: "151", preco: "" }], itensAntigos: antigos });
    assert.ok(!r.ok);
});

test("receber pagamento", () => {
    const v = venda("a", { valorPago: 50 });
    assert.deepEqual(validarRecebimento("100", v), { valor: 100, quitou: true });
    assert.deepEqual(validarRecebimento("30,50", v), { valor: 30.5, quitou: false });
    assert.match(validarRecebimento("101", v).erro, /Maior que o que falta \(R\$.100,00\)/);
    assert.ok(validarRecebimento("0", v).erro);
    assert.ok(validarRecebimento("", v).erro);
    assert.match(validarRecebimento("10", venda("b", { itens: [item("e1", "x", 1, null)] })).erro, /Defina o preço/);
});

test("definir preço de variedades sem preço", () => {
    const v = venda("a", { itens: [item("e1", "Catuaí", 100, 150), item("e2", "Arara", 10, null)], valorPago: 20 });
    let r = validarPrecos({ 1: "4,50" }, v);
    assert.ok(r.ok);
    assert.equal(r.total, 195);
    assert.equal(r.itens[1].valor, 45);
    assert.equal(r.itens[0].valor, 150);          // quem já tinha preço continua igual
    r = validarPrecos({ 1: "" }, v);
    assert.ok(!r.ok);
    assert.equal(r.erros[1], "Informe o preço por muda");
    // sinal maior que o novo total: avisa em vez de cortar
    const caro = venda("b", { itens: [item("e2", "Arara", 10, null)], valorPago: 500 });
    r = validarPrecos({ 0: "1" }, caro);
    assert.ok(!r.ok);
    assert.match(r.erroGeral, /já foi recebido/);
});

test("lixeira e backup: prazos", () => {
    const dia = 86400000, agora = 100 * dia;
    assert.ok(expirouNaLixeira({ removido: true, removidoEm: agora - 31 * dia }, agora));
    assert.ok(!expirouNaLixeira({ removido: true, removidoEm: agora - 29 * dia }, agora));
    assert.ok(!expirouNaLixeira({ removido: true }, agora));              // sem data: nunca apaga sozinho
    assert.ok(!expirouNaLixeira({ removidoEm: agora - 99 * dia }, agora)); // não está na lixeira
    assert.equal(diasRestantesLixeira({ removidoEm: agora - 25 * dia }, agora), 5);
    assert.deepEqual(situacaoBackup(agora - 20 * dia, agora), { precisa: true, dias: 20 });
    assert.deepEqual(situacaoBackup(agora - 2 * dia, agora), { precisa: false, dias: 2 });
    assert.deepEqual(situacaoBackup(0, agora), { precisa: true, dias: Infinity });
});

test("mensagens prontas", () => {
    assert.equal(mensagemCobranca(clientes[0], 1234.5).replace(/ /g, " "),
        "Olá, Sebastião! Tudo bem? Passando para lembrar do saldo de R$ 1.234,50 das mudas de café. Quando puder acertar, me avise. Obrigado!");
    assert.match(mensagemMudasProntas(clientes[1], [item("e1", "Catuaí", 200, 1), item("e2", "Arara", 10, 1)]), /200 Catuaí, 10 Arara/);
});

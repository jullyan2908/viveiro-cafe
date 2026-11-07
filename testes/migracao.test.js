import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decidirMigracao, analisarDocumentoAntigo } from "../js/migracao.js";

const legado = () => JSON.parse(readFileSync(new URL("./dados-legado.json", import.meta.url), "utf8"));

test("ao entrar: só abre o app quando meta/app diz que já migrou", () => {
    assert.equal(decidirMigracao({ meta: { migrado: true }, metaDoServidor: false }), "pronto");  // cópia do aparelho basta
    assert.equal(decidirMigracao({ meta: { migrado: true }, metaDoServidor: true }), "pronto");
});

test("ao entrar: sem confirmação do servidor, espera (nunca decide só pela cópia do aparelho)", () => {
    assert.equal(decidirMigracao({ meta: null, metaDoServidor: false }), "aguardar");
    assert.equal(decidirMigracao({ meta: { ultimoBackup: 1 }, metaDoServidor: false }), "aguardar");
});

test("ao entrar: servidor confirmou que não migrou → verificar se existem dados antigos", () => {
    assert.equal(decidirMigracao({ meta: null, metaDoServidor: true }), "verificar");
    assert.equal(decidirMigracao({ meta: { migrado: false }, metaDoServidor: true }), "verificar");
});

test("documento antigo: conta nova ou vazia só é marcada, sem tela", () => {
    assert.deepEqual(analisarDocumentoAntigo(null), { acao: "marcar" });
    assert.deepEqual(analisarDocumentoAntigo(undefined), { acao: "marcar" });
    assert.deepEqual(analisarDocumentoAntigo({ clientes: [], estoque: [], vendas: [] }), { acao: "marcar" });
});

test("documento antigo com dados: oferece a migração com o resumo", () => {
    const r = analisarDocumentoAntigo(legado());
    assert.equal(r.acao, "oferecer");
    assert.deepEqual(r.norm.contagem, { clientes: 5, estoque: 5, vendas: 5, ajustes: 0 });
});

test("documento antigo ilegível: erro, sem apagar nem marcar nada", () => {
    const r = analisarDocumentoAntigo({ qualquer: "coisa" });
    assert.equal(r.acao, "erro");
    assert.ok(r.erro);
});

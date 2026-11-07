// Confere que o app pode funcionar sem internet: js/versao.js está em dia e a lista de
// arquivos guardados no aparelho tem tudo que a página e os módulos precisam.
// Se algum teste daqui falhar depois de você mudar um arquivo, rode:  npm run versao

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, posix } from "node:path";
import { RAIZ, listarArquivos, resumoDosArquivos } from "../tools/nova-versao.mjs";

const ler = caminho => readFileSync(join(RAIZ, caminho), "utf8");

// carrega js/versao.js do mesmo jeito que o navegador (ele só escreve em "self")
function carregarVersao() {
    const alvo = {};
    new Function("self", ler("js/versao.js"))(alvo);
    return alvo;
}

function arquivosJs(pasta, saida = []) {
    for (const nome of readdirSync(join(RAIZ, pasta)).sort()) {
        const caminho = `${pasta}/${nome}`;
        if (statSync(join(RAIZ, caminho)).isDirectory()) arquivosJs(caminho, saida);
        else if (nome.endsWith(".js")) saida.push(caminho);
    }
    return saida;
}

test("js/versao.js está em dia com os arquivos do app (se falhar: npm run versao)", () => {
    const v = carregarVersao();
    assert.deepEqual(v.ARQUIVOS_APP, ["./", ...listarArquivos()], "a lista de arquivos mudou");
    assert.equal(v.VERSAO_ARQUIVOS, resumoDosArquivos(), "algum arquivo mudou desde a última vez que js/versao.js foi gerado");
});

test("o número da versão é o mesmo no package.json e no js/versao.js", () => {
    const pacote = JSON.parse(ler("package.json"));
    assert.equal(carregarVersao().VERSAO_APP, pacote.version);
});

test("todo arquivo da lista existe e o essencial está nela", () => {
    const { ARQUIVOS_APP } = carregarVersao();
    assert.equal(ARQUIVOS_APP[0], "./");
    assert.equal(new Set(ARQUIVOS_APP).size, ARQUIVOS_APP.length, "arquivo repetido na lista");
    for (const arquivo of ARQUIVOS_APP.slice(1)) {
        assert.ok(existsSync(join(RAIZ, arquivo)), `está na lista mas não existe: ${arquivo}`);
    }
    for (const essencial of ["index.html", "manifest.json", "css/estilo.css", "js/principal.js", "js/versao.js"]) {
        assert.ok(ARQUIVOS_APP.includes(essencial), `faltou na lista: ${essencial}`);
    }
    assert.ok(!ARQUIVOS_APP.includes("service-worker.js"), "o service worker não entra na própria lista");
});

test("tudo que o index.html e o manifest usam está na lista de arquivos guardados", () => {
    const { ARQUIVOS_APP } = carregarVersao();
    const usados = new Set();

    for (const [, endereco] of ler("index.html").matchAll(/\b(?:src|href)="([^"]+)"/g)) {
        if (/^(?:[a-z]+:)?\/\//i.test(endereco) || endereco.startsWith("#") || endereco.startsWith("data:")) continue;
        usados.add(posix.normalize(endereco.split(/[?#]/)[0]));
    }
    const manifesto = JSON.parse(ler("manifest.json"));
    for (const icone of manifesto.icons || []) usados.add(posix.normalize(icone.src));

    assert.ok(usados.size > 5, "não encontrei os arquivos usados pelo index.html");
    for (const arquivo of usados) {
        assert.ok(ARQUIVOS_APP.includes(arquivo), `usado pelo index.html/manifest mas fora da lista: ${arquivo}`);
    }
});

test("todo módulo importado existe e está na lista (senão o app quebra sem internet)", () => {
    const { ARQUIVOS_APP } = carregarVersao();
    let conferidos = 0;
    for (const arquivo of arquivosJs("js")) {
        const texto = ler(arquivo);
        const importados = Array.from(texto.matchAll(/\bfrom\s+["'](\.{1,2}\/[^"']+)["']|\bimport\s*\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g), m => m[1] || m[2]);
        for (const origem of importados) {
            const alvo = posix.normalize(posix.join(dirname(arquivo), origem));
            assert.ok(existsSync(join(RAIZ, alvo)), `${arquivo} importa ${origem}, que não existe`);
            assert.ok(ARQUIVOS_APP.includes(alvo), `${arquivo} importa ${alvo}, que não está na lista`);
            conferidos++;
        }
    }
    assert.ok(conferidos > 20, `poucos imports conferidos (${conferidos}): o teste está lendo errado?`);
});

test("o service worker usa a lista gerada e não tem uma lista própria", () => {
    const sw = ler("service-worker.js");
    assert.match(sw, /importScripts\(\s*["']js\/versao\.js["']\s*\)/);
    assert.match(sw, /self\.ARQUIVOS_APP/);
    for (const nome of ["estilo.css", "principal.js", "manifest.json", "icon-192"]) {
        assert.ok(!sw.includes(nome), `o service worker cita ${nome}: a lista deveria vir só de js/versao.js`);
    }
});

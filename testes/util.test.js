process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    esc, html, raw, urlSegura, arred, dinheiro, numero, plural, paraNumero, paraInteiro, numeroParaCampo, precoParaCampo,
    dataLocal, ehDataISO, dataBR, dataCurta, mesDe, nomeDoMes, diasEntre, adicionarDias, diasDesdeMs,
    normalizarFone, mascararTelefone, telefoneParaExibir, linkWhatsApp, linkTel,
    normalizar, contem, ordenarPorNome, primeiroNome, novoId, idValido
} from "../js/util.js";

const nbsp = s => s.replace(/ /g, " ");

test("esc escapa os cinco caracteres perigosos e a crase", () => {
    assert.equal(esc(`<img src=x onerror="alert('x')">&\``), "&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;&#96;");
    assert.equal(esc(null), "");
    assert.equal(esc(undefined), "");
    assert.equal(esc(0), "0");
});

test("html`` escapa valores, mantém html aninhado e junta listas", () => {
    const nome = `"><script>alert(1)</script>`;
    const r = html`<input value="${nome}"><b>${raw("<i>ok</i>")}</b>`.toString();
    assert.equal(r, `<input value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"><b><i>ok</i></b>`);
    const filho = html`<li>${"a<b"}</li>`;
    assert.equal(html`<ul>${[filho, filho]}</ul>`.toString(), "<ul><li>a&lt;b</li><li>a&lt;b</li></ul>");
    assert.equal(html`${false}${null}${undefined}|${0}`.toString(), "|0");
});

test("urlSegura só aceita https", () => {
    assert.equal(urlSegura("https://res.cloudinary.com/x/contrato.pdf"), "https://res.cloudinary.com/x/contrato.pdf");
    for (const ruim of ["javascript:alert(1)", "http://exemplo.com/a.pdf", "data:text/html,<script>", "//exemplo.com", "", null, undefined, "nao e url"]) {
        assert.equal(urlSegura(ruim), "", String(ruim));
    }
});

test("arred / dinheiro / numero / plural", () => {
    assert.equal(arred(3 * 1.15), 3.45);
    assert.equal(arred(0.1 + 0.2), 0.3);
    assert.equal(arred(-0.0001), 0);
    assert.equal(arred("x"), 0);
    assert.equal(nbsp(dinheiro(1234.5)), "R$ 1.234,50");
    assert.equal(nbsp(dinheiro(0)), "R$ 0,00");
    assert.equal(numero(5200), "5.200");
    assert.equal(plural(1, "muda", "mudas"), "1 muda");
    assert.equal(plural(250, "muda", "mudas"), "250 mudas");
    assert.equal(plural(0, "muda", "mudas"), "0 mudas");
});

test("paraNumero entende o jeito brasileiro de digitar", () => {
    const casos = [
        ["1,50", 1.5], ["1.50", 1.5], ["12", 12], ["1.234,56", 1234.56], ["1,234.56", 1234.56],
        ["R$ 12,00", 12], ["R$12", 12], ["1.500", 1500], ["0.500", 0.5], ["0,5", 0.5], ["1.234.567", 1234567],
        [" 7 ", 7], ["-3", -3], [5, 5]
    ];
    for (const [entrada, esperado] of casos) assert.equal(paraNumero(entrada), esperado, String(entrada));
    for (const ruim of ["", "abc", "1,2,x", "--1", null, undefined, NaN, "1e5", "R$"]) {
        assert.ok(Number.isNaN(paraNumero(ruim)), String(ruim));
    }
});

test("paraInteiro rejeita decimais", () => {
    assert.equal(paraInteiro("100"), 100);
    assert.equal(paraInteiro("1.000"), 1000);
    assert.ok(Number.isNaN(paraInteiro("1,5")));
    assert.ok(Number.isNaN(paraInteiro("")));
    assert.equal(numeroParaCampo(1.5), "1,5");
    assert.equal(numeroParaCampo(150, 2), "150,00");
});

test("precoParaCampo mostra 2 casas e só mais quando o preço pede", () => {
    assert.equal(precoParaCampo(2.5), "2,50");
    assert.equal(precoParaCampo(3), "3,00");
    assert.equal(precoParaCampo(0.1 + 0.2), "0,30");
    assert.equal(precoParaCampo(175 / 50), "3,50");
    assert.equal(precoParaCampo(2.125), "2,125");
    assert.equal(precoParaCampo(1000 / 3), "333,3333");
    assert.equal(precoParaCampo("abc"), "");
});

test("dataLocal usa o dia de quem está usando, não o de Greenwich", () => {
    const noite = new Date("2026-11-07T22:30:00-03:00"); // 01:30 do dia 8 em UTC
    assert.equal(noite.toISOString().slice(0, 10), "2026-11-08");   // o erro antigo
    assert.equal(dataLocal(noite), "2026-11-07");                    // o certo
    assert.equal(dataLocal(new Date("2026-01-01T00:05:00-03:00")), "2026-01-01");
});

test("datas: validar, formatar, diferença", () => {
    assert.ok(ehDataISO("2026-11-07"));
    assert.ok(ehDataISO("2024-02-29"));
    for (const ruim of ["2026-02-30", "2026-13-01", "07/11/2026", "2026-1-1", "", null, "2026-11-07T10:00"]) assert.ok(!ehDataISO(ruim), String(ruim));
    assert.equal(dataBR("2026-11-07"), "07/11/2026");
    assert.equal(dataBR("lixo"), "");
    assert.equal(dataCurta("2026-11-07", "2026-12-01"), "07/11");
    assert.equal(dataCurta("2025-11-07", "2026-12-01"), "07/11/25");
    assert.equal(mesDe("2026-11-07"), "2026-11");
    assert.equal(nomeDoMes("2026-11"), "novembro de 2026");
    assert.equal(diasEntre("2026-10-30", "2026-11-02"), 3);
    assert.equal(adicionarDias("2026-02-27", 3), "2026-03-02");
    assert.equal(diasDesdeMs(Date.now() - 3 * 86400000 - 1000), 3);
    assert.equal(diasDesdeMs(0), Infinity);
});

test("telefone: máscara, links", () => {
    const casos = [["3", "(3"], ["31", "(31"], ["319", "(31) 9"], ["31999", "(31) 999"], ["3199999", "(31) 9999-9"],
        ["3133334444", "(31) 3333-4444"], ["31999998888", "(31) 99999-8888"], ["+55 (31) 99999-8888", "(31) 99999-8888"], ["", ""]];
    for (const [entrada, esperado] of casos) assert.equal(mascararTelefone(entrada), esperado, entrada);
    assert.equal(normalizarFone("5531999998888"), "31999998888");
    assert.equal(telefoneParaExibir("34998765432"), "(34) 99876-5432");
    assert.equal(telefoneParaExibir("9999-8888"), "9999-8888"); // sem DDD: mostra como está
    assert.equal(linkWhatsApp("(34) 99876-5432"), "https://wa.me/5534998765432");
    assert.equal(linkWhatsApp("(34) 99876-5432", "Olá, tudo bem? R$ 10 & mais"), "https://wa.me/5534998765432?text=Ol%C3%A1%2C%20tudo%20bem%3F%20R%24%2010%20%26%20mais");
    assert.equal(linkWhatsApp("9999-8888"), "");
    assert.equal(linkTel("(34) 99876-5432"), "tel:+5534998765432");
    assert.equal(linkTel("3883-1100"), "tel:38831100");
    assert.equal(linkTel("12"), "");
});

test("busca ignora acento e maiúsculas; ordem alfabética em português", () => {
    assert.equal(normalizar("  Catuaí Vermelho "), "catuai vermelho");
    assert.ok(contem("Catuaí Vermelho", "CATUAI"));
    assert.ok(!contem("Arara", "catuai"));
    const nomes = ordenarPorNome([{ nome: "Zé" }, { nome: "álvaro" }, { nome: "Beto" }, { nome: "Ana" }]).map(x => x.nome);
    assert.deepEqual(nomes, ["álvaro", "Ana", "Beto", "Zé"]); // "alvaro" vem antes de "ana"
    assert.equal(primeiroNome("  Maria Aparecida Souza"), "Maria");
    assert.equal(primeiroNome(""), "");
});

test("ids", () => {
    const id = novoId();
    assert.equal(id.length, 20);
    assert.ok(idValido(id));
    assert.notEqual(novoId(), novoId());
    for (const ruim of ["", "a/b", "..", "com espaço", "x".repeat(121), 5, null]) assert.ok(!idValido(ruim), String(ruim));
    assert.ok(idValido("c1") && idValido("mjk3v9z4abc123") && idValido("a-b_c"));
});

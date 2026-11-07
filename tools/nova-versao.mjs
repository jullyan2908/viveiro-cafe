// Gera js/versao.js: o número da versão, um "resumo" do conteúdo dos arquivos e a lista
// de arquivos que o app guarda para funcionar sem internet (service-worker.js).
//
//   node tools/nova-versao.mjs            → mantém o número da versão, atualiza o resumo e a lista
//   node tools/nova-versao.mjs 2.1.0      → também troca o número da versão
//
// Rode depois de mudar qualquer arquivo do app e antes de publicar. Se esquecer,
// "npm test" avisa que js/versao.js está desatualizado.

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const PASTAS = ["css", "js", "vendor", "icons"];
const ARQUIVOS_RAIZ = ["index.html", "manifest.json"];
const ARQUIVO_VERSAO = "js/versao.js";

function percorrer(raiz, pasta, saida) {
    for (const nome of readdirSync(join(raiz, pasta)).sort()) {
        const caminho = `${pasta}/${nome}`;
        if (statSync(join(raiz, caminho)).isDirectory()) percorrer(raiz, caminho, saida);
        else saida.push(caminho);
    }
}

// arquivos que fazem parte do app (não inclui o service-worker.js, testes, tools, docs)
export function listarArquivos(raiz = RAIZ) {
    const lista = ARQUIVOS_RAIZ.filter(f => existsSync(join(raiz, f)));
    PASTAS.forEach(p => { if (existsSync(join(raiz, p))) percorrer(raiz, p, lista); });
    return lista.sort();
}

// resumo do conteúdo (o próprio versao.js fica de fora, senão o resumo mudaria a cada geração)
export function resumoDosArquivos(raiz = RAIZ, arquivos = listarArquivos(raiz)) {
    const hash = createHash("sha256");
    for (const arquivo of arquivos) {
        if (arquivo === ARQUIVO_VERSAO) continue;
        hash.update(arquivo + "\n");
        hash.update(readFileSync(join(raiz, arquivo)));
        hash.update("\n");
    }
    return hash.digest("hex").slice(0, 10);
}

export function lerVersaoAtual(raiz = RAIZ) {
    try {
        const texto = readFileSync(join(raiz, ARQUIVO_VERSAO), "utf8");
        return /VERSAO_APP\s*=\s*"([^"]+)"/.exec(texto)?.[1] || "2.0.0";
    } catch {
        return "2.0.0";
    }
}

export function montarVersao({ versao, resumo, arquivos }) {
    const lista = ["./", ...arquivos].map(a => `    ${JSON.stringify(a)}`).join(",\n");
    return `// Gerado por tools/nova-versao.mjs — não edite à mão.
// Rode "npm run versao" depois de mudar qualquer arquivo do app.
self.VERSAO_APP = ${JSON.stringify(versao)};
self.VERSAO_ARQUIVOS = ${JSON.stringify(resumo)};
self.ARQUIVOS_APP = [
${lista}
];
`;
}

export function gerar({ raiz = RAIZ, versao } = {}) {
    const arquivos = listarArquivos(raiz);
    const resumo = resumoDosArquivos(raiz, arquivos);
    const conteudo = montarVersao({ versao: versao || lerVersaoAtual(raiz), resumo, arquivos });
    writeFileSync(join(raiz, ARQUIVO_VERSAO), conteudo);
    return { versao: versao || lerVersaoAtual(raiz), resumo, arquivos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const versaoPedida = process.argv[2];
    if (versaoPedida && !/^\d+\.\d+\.\d+$/.test(versaoPedida)) {
        console.error('Use o formato 1.2.3 para o número da versão. Exemplo: node tools/nova-versao.mjs 2.1.0');
        process.exit(1);
    }
    const r = gerar({ versao: versaoPedida });
    console.log(`js/versao.js atualizado: versão ${r.versao}, resumo ${r.resumo}, ${r.arquivos.length} arquivos.`);
}

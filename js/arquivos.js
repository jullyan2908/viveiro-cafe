// ======================================
// Entregar e ler arquivos (backup, Excel)
// No celular abre a folha de compartilhar (WhatsApp, Drive, Arquivos…);
// no computador baixa o arquivo.
// ======================================

const MIME_JSON = "application/json";
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export { MIME_JSON, MIME_XLSX };

const eToque = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

// Devolve 'compartilhado' | 'baixado' | 'cancelado'.
// IMPORTANTE: chame direto do clique, sem esperar nada antes (iPhone exige o gesto do toque).
export async function entregarArquivo({ nome, tipo, conteudo, titulo }) {
    const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
    const arquivo = typeof File === "function" ? new File([blob], nome, { type: tipo }) : null;

    if (arquivo && eToque() && navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
            await navigator.share({ files: [arquivo], title: titulo || nome });
            return "compartilhado";
        } catch (erro) {
            if (erro && erro.name === "AbortError") return "cancelado";
            // outro erro (por exemplo, o aparelho negou): cai para o download comum
        }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nome;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    // revogar na hora cancelaria o download em alguns navegadores
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return "baixado";
}

export function lerTexto(arquivo) {
    if (arquivo && typeof arquivo.text === "function") return arquivo.text();
    return new Promise((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => reject(leitor.error);
        leitor.readAsText(arquivo);
    });
}

// Confere se o arquivo é mesmo um PDF (o tipo informado pelo aparelho pode mentir)
export async function ehPdf(arquivo) {
    try {
        const inicio = new Uint8Array(await arquivo.slice(0, 5).arrayBuffer());
        return String.fromCharCode(...inicio) === "%PDF-";
    } catch (e) {
        return false;
    }
}

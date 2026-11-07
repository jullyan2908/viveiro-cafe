// ======================================
// Utilidades puras (sem tela, sem Firebase)
// Tudo aqui é testado em testes/util.test.js
// ======================================

// ---------- HTML seguro ----------
// Todo texto que entra numa tela passa por esc() ou pelo html``.
// Nunca monte HTML juntando texto do usuário "na mão".

const MAPA_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };

export function esc(valor) {
    return String(valor ?? "").replace(/[&<>"'`]/g, c => MAPA_ESC[c]);
}

// Marca um trecho que já é HTML confiável (gerado por nós) e não deve ser escapado de novo.
export class Raw {
    constructor(texto) { this.texto = texto; }
    toString() { return this.texto; }
}

export const raw = texto => new Raw(String(texto ?? ""));

function paraHtml(valor) {
    if (valor instanceof Raw) return valor.texto;
    if (Array.isArray(valor)) return valor.map(paraHtml).join("");
    if (valor === null || valor === undefined || valor === false) return "";
    return esc(valor);
}

// html`<b>${nome}</b>` — escapa tudo que vem entre ${}.
// Listas (arrays) e outros html`` aninhados entram como estão.
export function html(partes, ...valores) {
    let saida = partes[0];
    valores.forEach((v, i) => { saida += paraHtml(v) + partes[i + 1]; });
    return new Raw(saida);
}

// Só aceita links https (bloqueia javascript:, data:, http:…)
export function urlSegura(valor) {
    try {
        const u = new URL(String(valor ?? ""));
        return u.protocol === "https:" ? u.href : "";
    } catch {
        return "";
    }
}

// ---------- números e dinheiro ----------

// arredonda para centavos (evita 3 × 1,15 = 3,4499999999999997)
export function arred(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return 0;
    return (Math.round((n + Number.EPSILON) * 100) / 100) || 0;
}

const formatoMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatoNumero = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

export function dinheiro(valor) {
    return formatoMoeda.format(arred(valor));
}

export function numero(valor) {
    const n = Number(valor);
    return formatoNumero.format(Number.isFinite(n) ? n : 0);
}

// "1 muda", "250 mudas"
export function plural(n, singular, pluralTxt) {
    return `${numero(n)} ${Number(n) === 1 ? singular : pluralTxt}`;
}

// Lê o que a pessoa digitou: "1,50", "1.50", "1.234,56", "R$ 12,00", "1.500" → número. Inválido → NaN.
export function paraNumero(texto) {
    if (typeof texto === "number") return Number.isFinite(texto) ? texto : NaN;
    let s = String(texto ?? "").trim().replace(/\s+/g, "").replace(/^R\$/i, "");
    if (s === "" || !/^-?[\d.,]+$/.test(s)) return NaN;

    const temVirgula = s.includes(",");
    const temPonto = s.includes(".");

    if (temVirgula && temPonto) {
        // o último separador é o decimal; o outro é separador de milhar
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
        else s = s.replace(/,/g, "");
    } else if (temVirgula) {
        s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (temPonto) {
        const partes = s.split(".");
        if (partes.length > 2) {
            s = partes.join("");                       // 1.234.567
        } else if (partes[1].length === 3 && !/^-?0?$/.test(partes[0])) {
            s = partes.join("");                       // 1.500 → 1500 (mas 0.500 continua 0,5)
        }
    }

    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
}

// Número inteiro digitado ("1.000" → 1000). Se não for inteiro → NaN.
export function paraInteiro(texto) {
    const n = paraNumero(texto);
    return Number.isInteger(n) ? n : NaN;
}

// Para preencher campos de formulário (vírgula decimal)
export function numeroParaCampo(valor, casas) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return "";
    const texto = casas === undefined ? String(n) : n.toFixed(casas);
    return texto.replace(".", ",");
}

// preço por muda para o campo de edição: 2 casas ("2,50") e só mais se for preciso ("2,125")
export function precoParaCampo(valor) {
    const n = Number(valor);
    if (!Number.isFinite(n)) return "";
    if (Math.abs(n * 100 - Math.round(n * 100)) < 1e-6) return n.toFixed(2).replace(".", ",");
    return String(Number(n.toFixed(4))).replace(".", ",");
}

// ---------- datas (sempre no horário LOCAL de quem usa o app) ----------

const pad2 = n => String(n).padStart(2, "0");

// 'AAAA-MM-DD' do dia local. (toISOString() usaria UTC e viraria o dia às 21h no Brasil)
export function dataLocal(d = new Date()) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function ehDataISO(s) {
    if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [a, m, d] = s.split("-").map(Number);
    const dt = new Date(a, m - 1, d);
    return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// '2026-11-07' → '07/11/2026'
export function dataBR(s) {
    return ehDataISO(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "";
}

// '07/11' (acrescenta o ano se não for o do dia de referência)
export function dataCurta(s, hoje = dataLocal()) {
    if (!ehDataISO(s)) return "";
    const base = `${s.slice(8, 10)}/${s.slice(5, 7)}`;
    return s.slice(0, 4) === hoje.slice(0, 4) ? base : `${base}/${s.slice(2, 4)}`;
}

export const mesDe = s => (ehDataISO(s) ? s.slice(0, 7) : "");

// '2026-11' → 'novembro de 2026'
export function nomeDoMes(mes) {
    if (!/^\d{4}-\d{2}$/.test(mes ?? "")) return "";
    const [a, m] = mes.split("-").map(Number);
    return new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

// quantos dias de a até b (datas 'AAAA-MM-DD'); não sofre com horário de verão
export function diasEntre(a, b) {
    if (!ehDataISO(a) || !ehDataISO(b)) return NaN;
    const ms = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return Math.round((ms(b) - ms(a)) / 86400000);
}

export function adicionarDias(iso, n) {
    const [a, m, d] = iso.split("-").map(Number);
    return dataLocal(new Date(a, m - 1, d + n));
}

// dias inteiros desde um instante (ms) até agora
export function diasDesdeMs(ms, agora = Date.now()) {
    if (!Number.isFinite(ms) || ms <= 0) return Infinity;
    return Math.floor((agora - ms) / 86400000);
}

// ---------- telefone ----------

export const soDigitos = s => String(s ?? "").replace(/\D+/g, "");

// remove o 55 do país e limita a 11 dígitos (DDD + 9 dígitos)
export function normalizarFone(s) {
    let d = soDigitos(s);
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
    return d.slice(0, 11);
}

// máscara enquanto digita: (31) 99999-9999
export function mascararTelefone(s) {
    const d = normalizarFone(s);
    if (d.length === 0) return "";
    if (d.length <= 2) return `(${d}`;
    const ddd = d.slice(0, 2);
    const resto = d.slice(2);
    if (d.length <= 6) return `(${ddd}) ${resto}`;
    if (d.length <= 10) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
    return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}

// Como mostrar um telefone já salvo: com máscara se for um número completo, senão do jeito que está
export function telefoneParaExibir(s) {
    const d = normalizarFone(s);
    return d.length === 10 || d.length === 11 ? mascararTelefone(d) : String(s ?? "").trim();
}

export function telefoneValido(s) {
    const d = normalizarFone(s);
    return d.length === 10 || d.length === 11;
}

// link do WhatsApp (só para número completo com DDD); texto opcional já pronto
export function linkWhatsApp(telefone, texto = "") {
    const d = normalizarFone(telefone);
    if (d.length !== 10 && d.length !== 11) return "";
    const base = `https://wa.me/55${d}`;
    return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}

export function linkTel(telefone) {
    const d = normalizarFone(telefone);
    if (d.length === 10 || d.length === 11) return `tel:+55${d}`;
    return soDigitos(telefone).length >= 8 ? `tel:${soDigitos(telefone)}` : "";
}

// ---------- texto ----------

// minúsculas e sem acento, para busca ("Catuaí" casa com "catuai")
export function normalizar(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export const contem = (texto, busca) => normalizar(texto).includes(normalizar(busca));

export function comparar(a, b) {
    return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { sensitivity: "base", numeric: true });
}

export function ordenarPorNome(lista, campo = "nome") {
    return lista.slice().sort((x, y) => comparar(x[campo], y[campo]));
}

export function primeiroNome(nome) {
    return String(nome ?? "").trim().split(/\s+/)[0] || "";
}

// ---------- ids ----------

const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// id de 20 letras/números, no mesmo estilo dos ids do Firestore
export function novoId() {
    const bytes = new Uint8Array(20);
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    let id = "";
    for (const b of bytes) id += LETRAS[b % LETRAS.length];
    return id;
}

// ids que podemos usar como nome de documento sem surpresas
export const idValido = id => typeof id === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(id);

// ---------- funções de apoio ----------

export function debounce(fn, ms = 200) {
    let t;
    const f = (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
    f.cancelar = () => clearTimeout(t);
    return f;
}

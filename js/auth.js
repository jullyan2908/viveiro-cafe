// Tela de entrada: entrar, criar conta (opcional) e "esqueci minha senha".

import { html } from "./util.js";
import { icone } from "./ui.js";
import { entrar, criarConta, recuperarSenha } from "./db.js";
import { PERMITIR_CRIAR_CONTA, NOME_APP } from "./config.js";

let modo = "entrar";        // 'entrar' | 'criar' | 'esqueci'
let emailDigitado = "";
let ocupado = false;
let raizAtual = null;

export function reiniciarLogin() {
    modo = "entrar";
    emailDigitado = "";
    ocupado = false;
}

const REGISTRO_ENTRAR = {
    "auth/invalid-credential": "E-mail ou senha incorretos. Confira e tente de novo.",
    "auth/wrong-password": "E-mail ou senha incorretos. Confira e tente de novo.",
    "auth/user-not-found": "E-mail ou senha incorretos. Confira e tente de novo.",
    "auth/invalid-email": "E-mail inválido. Confira como foi digitado.",
    "auth/too-many-requests": "Muitas tentativas. Espere um pouco e tente de novo.",
    "auth/network-request-failed": "Sem conexão com a internet. Conecte-se e tente de novo.",
    "auth/user-disabled": "Esta conta foi desativada."
};

const REGISTRO_CRIAR = {
    "auth/email-already-in-use": "Esse e-mail já tem conta. Volte e entre.",
    "auth/invalid-email": "E-mail inválido. Confira como foi digitado.",
    "auth/weak-password": "Senha muito fraca. Use pelo menos 6 caracteres.",
    "auth/operation-not-allowed": "Criar contas está desativado neste projeto do Firebase.",
    "auth/network-request-failed": "Sem conexão com a internet. Conecte-se e tente de novo."
};

const REGISTRO_SENHA = {
    "auth/invalid-email": "E-mail inválido. Confira como foi digitado.",
    "auth/too-many-requests": "Muitas tentativas. Espere um pouco e tente de novo.",
    "auth/network-request-failed": "Sem conexão com a internet. Conecte-se e tente de novo."
};

// ---------- tela ----------

function campoSenha(id, rotulo, autocompletar) {
    return html`
        <div class="campo">
            <label for="${id}">${rotulo}</label>
            <div class="campo-senha">
                <input id="${id}" name="${id}" type="password" autocomplete="${autocompletar}" autocapitalize="none" spellcheck="false" aria-describedby="${id}-erro">
                <button type="button" class="botao-icone" data-acao="auth:ver-senha" data-alvo="${id}" aria-label="Mostrar senha" aria-pressed="false">${icone("olho", 22)}</button>
            </div>
            <p class="erro-campo" id="${id}-erro" role="alert"></p>
        </div>`;
}

function campoEmail() {
    return html`
        <div class="campo">
            <label for="login-email">E-mail</label>
            <input id="login-email" name="login-email" type="email" inputmode="email" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="seu@email.com" value="${emailDigitado}" aria-describedby="login-email-erro">
            <p class="erro-campo" id="login-email-erro" role="alert"></p>
        </div>`;
}

function formulario() {
    if (modo === "criar") {
        return html`
            <h2 class="login-passo">Criar conta</h2>
            <form id="form-login" data-envio="auth:enviar" novalidate>
                ${campoEmail()}
                ${campoSenha("login-senha", "Senha", "new-password")}
                ${campoSenha("login-senha2", "Repita a senha", "new-password")}
                <p class="erro-form" id="login-erro" role="alert"></p>
                <button type="submit" class="botao principal largo" id="login-enviar">Criar conta</button>
            </form>
            <p class="login-troca">Já tem conta? <button type="button" class="botao texto" data-acao="auth:modo" data-modo="entrar">Entrar</button></p>`;
    }
    if (modo === "esqueci") {
        return html`
            <h2 class="login-passo">Redefinir senha</h2>
            <p class="login-texto">Digite o e-mail da sua conta. Enviamos um link para você criar uma nova senha.</p>
            <form id="form-login" data-envio="auth:enviar" novalidate>
                ${campoEmail()}
                <p class="erro-form" id="login-erro" role="alert"></p>
                <p class="ok-form" id="login-ok" role="status"></p>
                <button type="submit" class="botao principal largo" id="login-enviar">Enviar link</button>
            </form>
            <p class="login-troca"><button type="button" class="botao texto" data-acao="auth:modo" data-modo="entrar">Voltar para entrar</button></p>`;
    }
    return html`
        <form id="form-login" data-envio="auth:enviar" novalidate>
            ${campoEmail()}
            ${campoSenha("login-senha", "Senha", "current-password")}
            <p class="erro-form" id="login-erro" role="alert"></p>
            <button type="submit" class="botao principal largo" id="login-enviar">Entrar</button>
        </form>
        <p class="login-troca">
            <button type="button" class="botao texto" data-acao="auth:modo" data-modo="esqueci">Esqueci minha senha</button>
            ${PERMITIR_CRIAR_CONTA ? html`<button type="button" class="botao texto" data-acao="auth:modo" data-modo="criar">Criar conta</button>` : ""}
        </p>`;
}

export function mostrarLogin(raizEl) {
    raizAtual = raizEl;
    ocupado = false;
    raizEl.innerHTML = String(html`
        <main class="tela-central login">
            <img class="login-logo" src="icons/icon-192.png" width="72" height="72" alt="">
            <h1 class="login-titulo">${NOME_APP}</h1>
            <p class="login-sub">Estoque, clientes e vendas das suas mudas de café.</p>
            <div class="login-caixa">${formulario()}</div>
        </main>`);
    if (matchMedia("(pointer: fine)").matches) raizEl.querySelector("input")?.focus();
}

// ---------- ações ----------

const $ = id => raizAtual?.querySelector("#" + id);

function guardarEmail() {
    const campo = $("login-email");
    if (campo) emailDigitado = campo.value.trim();
}

function erroDeCampo(id, mensagem) {
    const area = $(id + "-erro");
    const campo = $(id);
    if (area) area.textContent = mensagem || "";
    if (campo) { if (mensagem) campo.setAttribute("aria-invalid", "true"); else campo.removeAttribute("aria-invalid"); }
}

function limparMensagens() {
    ["login-email", "login-senha", "login-senha2"].forEach(id => erroDeCampo(id, ""));
    const erro = $("login-erro"); if (erro) erro.textContent = "";
    const ok = $("login-ok"); if (ok) ok.textContent = "";
}

function ocuparBotao(textoOcupado) {
    const botao = $("login-enviar");
    ocupado = true;
    if (botao) { botao.disabled = true; botao.dataset.rotulo = botao.textContent; botao.textContent = textoOcupado; }
}

function liberarBotao() {
    const botao = $("login-enviar");
    ocupado = false;
    if (botao) { botao.disabled = false; if (botao.dataset.rotulo) botao.textContent = botao.dataset.rotulo; }
}

async function enviar() {
    if (ocupado || !raizAtual) return;
    guardarEmail();
    limparMensagens();
    const email = emailDigitado;
    const senha = $("login-senha")?.value ?? "";
    const mostrarGeral = texto => { const e = $("login-erro"); if (e) e.textContent = texto; };

    if (!email) { erroDeCampo("login-email", "Digite o e-mail"); $("login-email").focus(); return; }

    if (modo === "esqueci") {
        ocuparBotao("Enviando…");
        try {
            await recuperarSenha(email);
            const ok = $("login-ok");
            if (ok) ok.textContent = "Se esse e-mail tiver conta, você vai receber um link para criar uma nova senha. Olhe também a caixa de spam.";
        } catch (erro) {
            console.log("Erro ao pedir nova senha:", erro && erro.code);
            mostrarGeral(REGISTRO_SENHA[erro && erro.code] || "Não foi possível enviar o e-mail. Tente de novo.");
        }
        liberarBotao();
        return;
    }

    if (!senha) { erroDeCampo("login-senha", "Digite a senha"); $("login-senha").focus(); return; }

    if (modo === "criar") {
        if (senha.length < 6) { erroDeCampo("login-senha", "A senha precisa ter pelo menos 6 caracteres"); $("login-senha").focus(); return; }
        if (senha !== ($("login-senha2")?.value ?? "")) { erroDeCampo("login-senha2", "As senhas digitadas são diferentes"); $("login-senha2").focus(); return; }
        ocuparBotao("Criando conta…");
        try {
            await criarConta(email, senha);
            // o app percebe a conta nova sozinho e abre
        } catch (erro) {
            console.log("Erro ao criar conta:", erro && erro.code);
            mostrarGeral(REGISTRO_CRIAR[erro && erro.code] || "Não foi possível criar a conta. Tente de novo.");
            liberarBotao();
        }
        return;
    }

    ocuparBotao("Entrando…");
    try {
        await entrar(email, senha);
    } catch (erro) {
        console.log("Erro ao entrar:", erro && erro.code);
        mostrarGeral(REGISTRO_ENTRAR[erro && erro.code] || "Não foi possível entrar. Tente de novo.");
        liberarBotao();
        $("login-senha")?.focus();
    }
}

export const eventos = {
    cliques: {
        "auth:modo": el => {
            guardarEmail();
            modo = el.dataset.modo;
            if (raizAtual) mostrarLogin(raizAtual);
        },
        "auth:ver-senha": el => {
            const campo = raizAtual?.querySelector("#" + el.dataset.alvo);
            if (!campo) return;
            const mostrando = campo.type === "password";
            campo.type = mostrando ? "text" : "password";
            el.setAttribute("aria-pressed", String(mostrando));
            el.setAttribute("aria-label", mostrando ? "Ocultar senha" : "Mostrar senha");
            el.innerHTML = String(icone(mostrando ? "olho-cortado" : "olho", 22));
            campo.focus();
        }
    },
    envios: { "auth:enviar": enviar }
};

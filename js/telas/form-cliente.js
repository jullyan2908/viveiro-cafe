// Formulário de cliente (novo e editar). Usado pela tela de clientes e pelo formulário de venda.

import { html, mascararTelefone, telefoneParaExibir, normalizarFone, telefoneValido } from "../util.js";
import { abrirFolha, campo, mostrarErro, avisar } from "../ui.js";
import { salvarCliente } from "../db.js";

let aberto = null; // { folha, cliente, aoSalvar }

export function abrirFormCliente({ cliente = null, aoSalvar = null } = {}) {
    const editando = !!cliente;
    const folha = abrirFolha({
        titulo: editando ? "Editar cliente" : "Novo cliente",
        corpo: html`
            <form id="form-cliente" data-envio="cliente:salvar" novalidate>
                ${campo({ id: "cli-nome", rotulo: "Nome", valor: cliente?.nome ?? "", placeholder: "Nome do cliente", extra: 'autocomplete="off" autocapitalize="words" maxlength="200"' })}
                ${campo({ id: "cli-telefone", rotulo: "Telefone", tipo: "tel", valor: telefoneParaExibir(cliente?.telefone ?? ""), placeholder: "(DD) 9XXXX-XXXX", modo: "tel", dica: "Com o DDD. Serve para ligar e chamar no WhatsApp.", extra: 'autocomplete="off" data-entrada="cliente:mascara"' })}
                ${campo({ id: "cli-cidade", rotulo: "Cidade", valor: cliente?.cidade ?? "", extra: 'autocomplete="off" autocapitalize="words" maxlength="120"' })}
            </form>`,
        rodape: html`<button type="submit" form="form-cliente" class="botao principal largo">${editando ? "Salvar alterações" : "Cadastrar cliente"}</button>`,
        aoFechar: () => { aberto = null; }
    });
    aberto = { folha, cliente, aoSalvar };
}

function salvar() {
    if (!aberto) return;
    const { folha, cliente, aoSalvar } = aberto;
    const nome = folha.el.querySelector("#cli-nome").value.trim();
    const telefoneDigitado = folha.el.querySelector("#cli-telefone").value.trim();
    const cidade = folha.el.querySelector("#cli-cidade").value.trim();

    let erros = 0;
    if (!nome) { mostrarErro(folha.el, "cli-nome", "Digite o nome do cliente"); erros++; }
    else mostrarErro(folha.el, "cli-nome", "");

    // aceita telefone completo, vazio, ou o que já estava salvo antes (cadastros antigos)
    const igualAoSalvo = cliente && normalizarFone(telefoneDigitado) === normalizarFone(cliente.telefone);
    if (telefoneDigitado && !telefoneValido(telefoneDigitado) && !igualAoSalvo) {
        mostrarErro(folha.el, "cli-telefone", "Informe o telefone com DDD (10 ou 11 números)");
        erros++;
    } else mostrarErro(folha.el, "cli-telefone", "");

    if (erros) {
        folha.el.querySelector(".com-erro input")?.focus();
        return;
    }

    const telefone = telefoneValido(telefoneDigitado) ? mascararTelefone(telefoneDigitado) : telefoneDigitado;
    const id = salvarCliente({ id: cliente?.id, nome, telefone, cidade });
    folha.fechar();
    avisar(cliente ? "Cliente atualizado" : "Cliente cadastrado");
    if (aoSalvar) aoSalvar(id, { nome, telefone, cidade });
}

export const eventos = {
    envios: { "cliente:salvar": salvar },
    entradas: { "cliente:mascara": el => { el.value = mascararTelefone(el.value); } }
};

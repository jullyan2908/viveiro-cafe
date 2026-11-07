// ======================================
// Migração dos dados do formato antigo (um documento só) para o novo
// (um documento por cliente, variedade e venda).
//
// Segurança: o documento antigo nunca é alterado nem apagado pela migração.
// Se algo der errado, ele continua lá. Testado em testes/migracao.test.js
// ======================================

import { normalizarBackup } from "./backup.js";

// O que fazer ao entrar, olhando o documento meta/app:
//   'pronto'   — esta conta já foi migrada: abrir o app
//   'verificar'— o servidor confirmou que ainda não migrou: olhar se existem dados antigos
//   'aguardar' — só temos uma cópia do aparelho (ou nada): esperar o servidor responder
export function decidirMigracao({ meta, metaDoServidor }) {
    if (meta && meta.migrado === true) return "pronto";
    if (metaDoServidor) return "verificar";
    return "aguardar";
}

// Olha o documento antigo (o que veio do servidor, ou null se não existe).
//   { acao: 'marcar' }   — conta nova (ou documento vazio): é só marcar como migrada
//   { acao: 'oferecer', norm } — há dados: mostrar o resumo e oferecer "Atualizar agora"
//   { acao: 'erro', erro, detalhe } — documento antigo ilegível (erro: texto para a pessoa; detalhe: motivo técnico)
export function analisarDocumentoAntigo(dados, agora = Date.now()) {
    if (dados === null || dados === undefined) return { acao: "marcar" };
    const norm = normalizarBackup(dados, { agora });
    // a mensagem de normalizarBackup fala em "arquivo"; aqui os dados vêm da conta, então o texto é outro
    if (!norm.ok) {
        return {
            acao: "erro",
            erro: "Os dados guardados na sua conta não estão no formato esperado, então o app não consegue atualizá-los. Eles continuam guardados e nada foi apagado. Tente de novo; se continuar, avise quem cuida do app.",
            detalhe: norm.erro
        };
    }
    const { clientes, estoque, vendas } = norm.contagem;
    if (clientes + estoque + vendas === 0) return { acao: "marcar" };
    return { acao: "oferecer", norm };
}

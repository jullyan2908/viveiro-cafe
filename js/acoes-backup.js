// Salvar o backup: usado pelo aviso do Painel e pela tela Mais.
// Chame direto do clique (o iPhone só abre a folha de compartilhar por um toque).

import { estado, tudoCarregado } from "./estado.js";
import { montarBackup, nomeArquivoBackup } from "./backup.js";
import { entregarArquivo, MIME_JSON } from "./arquivos.js";
import { registrarBackupFeito } from "./db.js";
import { avisar } from "./ui.js";

let salvando = false;

// devolve true se o backup foi salvo (ou baixado)
export async function salvarBackup() {
    if (salvando) return false;
    if (estado.erroAcesso || !tudoCarregado()) {
        avisar("Os dados ainda não carregaram. Tente de novo em instantes.", { tipo: "erro" });
        return false;
    }
    salvando = true;
    try {
        const conteudo = JSON.stringify(montarBackup({
            clientes: estado.clientes, estoque: estado.estoque, vendas: estado.vendas, ajustes: estado.ajustes
        }), null, 2);
        const resultado = await entregarArquivo({
            nome: nomeArquivoBackup(), tipo: MIME_JSON, conteudo, titulo: "Backup do Viveiro Café"
        });
        if (resultado === "cancelado") return false;
        registrarBackupFeito();
        avisar(resultado === "baixado" ? "Backup baixado: procure em Downloads" : "Backup salvo");
        return true;
    } catch (erro) {
        console.log("Erro ao salvar o backup:", erro);
        avisar("Não foi possível salvar o backup. Tente de novo.", { tipo: "erro" });
        return false;
    } finally {
        salvando = false;
    }
}

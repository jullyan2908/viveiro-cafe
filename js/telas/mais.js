// Tela Mais: conta, backup, Excel, lixeira e a zona de perigo.

import { html, plural } from "../util.js";
import { abrirFolha, avisar, confirmar, confirmarDigitando, estadoVazio, icone } from "../ui.js";
import { estado, clientesPorId, itensNaLixeira, haPendencia, tudoCarregado } from "../estado.js";
import { diasRestantesLixeira, itensDaVenda, resumoItens, nomeDoCliente, situacaoBackup } from "../regras.js";
import { normalizarBackup, resumoBackup, textoDescartados } from "../backup.js";
import { gerarXlsx, nomeArquivoExcel } from "../excel.js";
import { entregarArquivo, lerTexto, MIME_XLSX } from "../arquivos.js";
import { sair, ultimoBackupMs, restaurarBackup, apagarTudo, restaurarDaLixeira, apagarDeVez } from "../db.js";
import { salvarBackup } from "../acoes-backup.js";

const TAMANHO_MAXIMO_BACKUP = 25 * 1024 * 1024;

export const tela = {
    id: "mais",
    titulo: "Mais",
    icone: "mais",
    entrar(raizEl) { raizEl.innerHTML = String(conteudo()); },
    atualizar() {
        const raizEl = document.getElementById("conteudo");
        if (raizEl) raizEl.innerHTML = String(conteudo());
    }
};

// ---------- números do que existe agora ----------

function contagemAtual() {
    return {
        clientes: estado.clientes.filter(c => !c.removido).length,
        estoque: estado.estoque.filter(e => !e.removido).length,
        vendas: estado.vendas.filter(v => !v.removido).length
    };
}

const haDados = c => c.clientes + c.estoque + c.vendas > 0;

function textoUltimoBackup() {
    const { dias } = situacaoBackup(ultimoBackupMs());
    if (dias === Infinity) return "Você ainda não salvou nenhum backup.";
    if (dias <= 0) return "Último backup: hoje.";
    return `Último backup: há ${plural(dias, "dia", "dias")}.`;
}

// ---------- a tela ----------

function conteudo() {
    const naLixeira = itensNaLixeira().length;
    return html`
        <div class="tela-mais">
            ${estado.persistenciaOk ? "" : html`
                <div class="aviso-bloco" role="alert">
                    <p><strong>Este navegador não guarda dados no aparelho.</strong></p>
                    <p>O app só funciona com internet, e o que você lançar sem conexão pode se perder.</p>
                </div>`}

            <section class="secao" aria-labelledby="mais-backup">
                <h2 id="mais-backup">Backup</h2>
                <p class="muted">Uma cópia de tudo (clientes, estoque e vendas) num arquivo. Guarde no Drive, no e-mail ou no WhatsApp.</p>
                <p class="estado-backup">${textoUltimoBackup()}</p>
                <div class="botoes-linha">
                    <button type="button" class="botao principal" data-acao="backup:salvar">${icone("baixar", 20)} Salvar backup</button>
                    <button type="button" class="botao secundario" data-acao="mais:restaurar">${icone("restaurar", 20)} Restaurar backup</button>
                </div>
            </section>

            <section class="secao" aria-labelledby="mais-excel">
                <h2 id="mais-excel">Planilha</h2>
                <p class="muted">Clientes, estoque e vendas em uma planilha do Excel, para imprimir ou mandar para o contador.</p>
                <button type="button" class="botao secundario" data-acao="mais:excel">${icone("arquivo", 20)} Exportar para Excel</button>
            </section>

            <section class="secao" aria-labelledby="mais-lixeira">
                <h2 id="mais-lixeira">Lixeira</h2>
                <button type="button" class="linha-botao" data-acao="mais:lixeira">
                    <span>
                        <span class="linha-titulo">Itens excluídos</span>
                        <span class="linha-sub">${naLixeira ? `${plural(naLixeira, "item", "itens")}, guardados por 30 dias` : "Nada por aqui"}</span>
                    </span>
                    ${icone("direita", 20)}
                </button>
            </section>

            <section class="secao" aria-labelledby="mais-conta">
                <h2 id="mais-conta">Conta</h2>
                <p class="muted">Você entrou como <strong class="email">${estado.email}</strong>.</p>
                <button type="button" class="botao secundario" data-acao="mais:sair">${icone("sair", 20)} Sair da conta</button>
            </section>

            <section class="secao zona-perigo" aria-labelledby="mais-perigo">
                <h2 id="mais-perigo">Zona de perigo</h2>
                <p class="muted">Apaga todos os clientes, variedades e vendas de todos os aparelhos. O app salva um backup antes.</p>
                <button type="button" class="botao perigo" data-acao="mais:apagar-tudo">${icone("lixeira", 20)} Apagar todos os dados</button>
            </section>

            <p class="versao">Viveiro Café, versão ${globalThis.VERSAO_APP || "—"}</p>
        </div>`;
}

// ---------- erros de operações grandes ----------

function textoDeErro(erro, acao) {
    switch (erro && erro.code) {
        case "sem-internet": return `Sem internet. Conecte-se para ${acao}.`;
        case "tempo-esgotado": return "O servidor demorou para responder. Confira a internet e tente de novo.";
        case "permission-denied": return "Acesso negado pelo Firebase. Confira as regras do Firestore.";
        default: return `Não foi possível ${acao}. Confira a internet e tente de novo.`;
    }
}

// janela de andamento (sem botão de fechar)
function abrirProgresso(titulo, texto) {
    const folha = abrirFolha({
        titulo, variante: "dialogo", fixa: true,
        corpo: html`
            <p class="texto-dialogo">${texto}</p>
            <div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="progresso-barra" style="width:4%"></span></div>`
    });
    return {
        atualizar(feitas, total) {
            const pct = total > 0 ? Math.max(4, Math.round((feitas / total) * 100)) : 100;
            const barra = folha.el.querySelector("#progresso-barra");
            if (barra) barra.style.width = pct + "%";
            folha.el.querySelector(".progresso")?.setAttribute("aria-valuenow", String(pct));
        },
        fechar: () => folha.fechar()
    };
}

// ---------- restaurar backup ----------

let campoBackup = null;

function garantirCampoBackup() {
    if (campoBackup) return campoBackup;
    campoBackup = document.createElement("input");
    campoBackup.type = "file";
    campoBackup.accept = "application/json,.json";
    campoBackup.hidden = true;
    campoBackup.tabIndex = -1;
    campoBackup.setAttribute("aria-hidden", "true");
    document.body.appendChild(campoBackup);
    campoBackup.addEventListener("change", () => {
        const arquivo = campoBackup.files && campoBackup.files[0];
        campoBackup.value = "";
        if (arquivo) prepararRestauracao(arquivo);
    });
    return campoBackup;
}

async function prepararRestauracao(arquivo) {
    if (arquivo.size > TAMANHO_MAXIMO_BACKUP) {
        avisar("Esse arquivo é grande demais para ser um backup.", { tipo: "erro" });
        return;
    }
    let conteudoArquivo;
    try {
        conteudoArquivo = JSON.parse(await lerTexto(arquivo));
    } catch (erro) {
        avisar("Esse arquivo não é um backup do Viveiro Café.", { tipo: "erro" });
        return;
    }
    const norm = normalizarBackup(conteudoArquivo, { renovarLixeira: true });
    if (!norm.ok) { avisar(norm.erro, { tipo: "erro" }); return; }
    abrirDialogoDeRestauracao(norm);
}

function abrirDialogoDeRestauracao(norm) {
    const atual = contagemAtual();
    const temAtual = haDados(atual);
    const folha = abrirFolha({
        titulo: "Substituir os dados atuais?",
        variante: "dialogo",
        classe: "folha-restaurar",
        corpo: html`
            <p class="texto-dialogo">Este backup tem <strong>${resumoBackup(norm.contagem)}</strong>.</p>
            <p class="texto-dialogo">${temAtual ? html`Os dados que estão no app agora (${resumoBackup(atual)}) serão substituídos pelos do backup.` : "O app está vazio: os dados do backup serão colocados nele."}</p>
            ${norm.descartados.length ? html`<p class="dica">${textoDescartados(norm.descartados)}</p>` : ""}
            ${temAtual ? html`<p class="dica">Recomendado: salve uma cópia dos dados atuais antes de substituir.</p>` : ""}`,
        rodape: html`
            ${temAtual ? html`<button type="button" class="botao secundario" data-resposta="copia">Salvar cópia dos dados atuais</button>` : ""}
            <button type="button" class="botao perigo-cheio" data-resposta="restaurar">Restaurar backup</button>
            <button type="button" class="botao texto" data-resposta="cancelar" data-foco>Cancelar</button>`
    });
    folha.rodapeEl.addEventListener("click", async ev => {
        const botao = ev.target.closest("[data-resposta]");
        if (!botao || botao.disabled) return;
        const resposta = botao.dataset.resposta;
        if (resposta === "cancelar") { folha.fechar(); return; }
        if (resposta === "copia") {
            const salvou = await salvarBackup();
            if (salvou && !folha.fechada) { botao.textContent = "Cópia salva"; botao.disabled = true; }
            return;
        }
        folha.fechar();
        executarRestauracao(norm);
    });
}

async function executarRestauracao(norm) {
    const progresso = abrirProgresso("Restaurando o backup", "Não feche o app até terminar.");
    try {
        await restaurarBackup(norm, (feitas, total) => progresso.atualizar(feitas, total));
        progresso.fechar();
        avisar("Backup restaurado");
    } catch (erro) {
        console.log("Erro ao restaurar:", erro);
        progresso.fechar();
        const semInternet = erro && (erro.code === "sem-internet" || erro.code === "permission-denied");
        avisar(semInternet ? textoDeErro(erro, "restaurar o backup") : "A restauração não terminou. Confira a internet e restaure o mesmo arquivo de novo.", { tipo: "erro", duracao: 9000 });
    }
}

// ---------- Excel ----------

async function exportarExcel() {
    if (estado.erroAcesso || !tudoCarregado()) {
        avisar("Os dados ainda não carregaram. Tente de novo em instantes.", { tipo: "erro" });
        return;
    }
    const XLSX = globalThis.XLSX;
    if (!XLSX) { avisar("A biblioteca de planilhas não carregou. Recarregue o app e tente de novo.", { tipo: "erro" }); return; }
    try {
        const bytes = gerarXlsx(XLSX, { clientes: estado.clientes, estoque: estado.estoque, vendas: estado.vendas });
        const resultado = await entregarArquivo({ nome: nomeArquivoExcel(), tipo: MIME_XLSX, conteudo: bytes, titulo: "Planilha do Viveiro Café" });
        if (resultado === "cancelado") return;
        avisar(resultado === "baixado" ? "Planilha baixada: procure em Downloads" : "Planilha salva");
    } catch (erro) {
        console.log("Erro ao gerar a planilha:", erro);
        avisar("Não foi possível gerar a planilha.", { tipo: "erro" });
    }
}

// ---------- lixeira ----------

const ROTULO_TIPO = { cliente: "Cliente", variedade: "Variedade", venda: "Venda" };

function nomeNaLixeira({ tipo, item }) {
    if (tipo === "venda") {
        const resumo = resumoItens(itensDaVenda(item));
        return `${nomeDoCliente(item, clientesPorId())}${resumo ? `: ${resumo}` : ""}`;
    }
    return item.nome || "Sem nome";
}

function corpoDaLixeira() {
    const lista = itensNaLixeira();
    if (!lista.length) {
        return estadoVazio({ titulo: "A lixeira está vazia", texto: "O que você excluir fica aqui por 30 dias, e dá para restaurar." });
    }
    return html`
        <p class="muted">Os itens somem de vez depois de 30 dias.</p>
        <ul class="lista">
            ${lista.map(x => {
                const dias = diasRestantesLixeira(x.item);
                return html`
                    <li class="linha lixeira">
                        <div class="linha-corpo estatico">
                            <span class="linha-titulo">${nomeNaLixeira(x)}</span>
                            <span class="linha-sub">${ROTULO_TIPO[x.tipo]}, ${dias <= 0 ? "some hoje" : `some em ${plural(dias, "dia", "dias")}`}</span>
                        </div>
                        <button type="button" class="botao secundario" data-acao="lixeira:restaurar" data-colecao="${x.colecao}" data-id="${x.item.id}">Restaurar</button>
                        <button type="button" class="botao-icone perigo" data-acao="lixeira:apagar" data-colecao="${x.colecao}" data-id="${x.item.id}" aria-label="Apagar ${nomeNaLixeira(x)} de vez" title="Apagar de vez">${icone("lixeira", 20)}</button>
                    </li>`;
            })}
        </ul>`;
}

function rodapeDaLixeira() {
    return itensNaLixeira().length
        ? html`<button type="button" class="botao perigo largo" data-acao="lixeira:esvaziar">Esvaziar a lixeira</button>`
        : "";
}

function abrirLixeira() {
    abrirFolha({
        titulo: "Lixeira",
        corpo: corpoDaLixeira(),
        rodape: rodapeDaLixeira(),
        aoAtualizar: f => {
            f.definirCorpo(corpoDaLixeira());
            f.definirRodape(rodapeDaLixeira());
        }
    });
}

async function apagarItemDeVez(colecao, id) {
    const x = itensNaLixeira().find(i => i.colecao === colecao && i.item.id === id);
    if (!x) return;
    const ok = await confirmar({
        titulo: "Apagar de vez?",
        texto: `${nomeNaLixeira(x)} será apagado para sempre. Não dá para desfazer.`,
        rotuloOk: "Apagar de vez", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return;
    apagarDeVez(colecao, id);
    avisar("Apagado de vez");
}

async function esvaziarLixeira() {
    const lista = itensNaLixeira();
    if (!lista.length) return;
    const ok = await confirmar({
        titulo: "Esvaziar a lixeira?",
        texto: `${plural(lista.length, "item será apagado", "itens serão apagados")} para sempre. Não dá para desfazer.`,
        rotuloOk: "Esvaziar lixeira", rotuloCancelar: "Voltar", perigo: true
    });
    if (!ok) return;
    lista.forEach(x => apagarDeVez(x.colecao, x.item.id));
    avisar("Lixeira esvaziada");
}

// ---------- sair e apagar tudo ----------

async function sairDaConta() {
    if (haPendencia()) {
        const ok = await confirmar({
            titulo: "Há alterações sem enviar",
            texto: "Algumas mudanças ainda não chegaram ao servidor, por falta de internet. Se você sair agora, elas podem se perder.",
            rotuloOk: "Sair mesmo assim", rotuloCancelar: "Ficar", perigo: true
        });
        if (!ok) return;
    }
    try {
        await sair();
    } catch (erro) {
        console.log("Erro ao sair:", erro);
        avisar("Não foi possível sair. Tente de novo.", { tipo: "erro" });
    }
}

async function apagarTudoComSeguranca() {
    if (estado.erroAcesso || !tudoCarregado()) {
        avisar("Os dados ainda não carregaram. Tente de novo em instantes.", { tipo: "erro" });
        return;
    }
    if (estado.offline || navigator.onLine === false) {
        avisar("Sem internet. Conecte-se para apagar os dados.", { tipo: "erro" });
        return;
    }
    const atual = contagemAtual();
    if (!haDados(atual) && !itensNaLixeira().length && !estado.ajustes.length) {
        avisar("Não há dados para apagar.");
        return;
    }

    const seguir = await confirmar({
        titulo: "Apagar todos os dados?",
        texto: `Isso apaga ${haDados(atual) ? resumoBackup(atual) : "tudo o que existe"}, em todos os aparelhos. Antes de apagar, o app salva um backup para você guardar.`,
        rotuloOk: "Salvar backup e continuar", rotuloCancelar: "Cancelar", perigo: false
    });
    if (!seguir) return;

    const salvou = await salvarBackup();
    if (!salvou) {
        avisar("Nada foi apagado: o backup precisa ser salvo antes.", { tipo: "erro" });
        return;
    }

    const confirmou = await confirmarDigitando({
        titulo: "Confirmar a exclusão",
        texto: "Backup salvo. Agora confirme: todos os clientes, variedades e vendas serão apagados e não dá para desfazer.",
        palavra: "APAGAR", rotuloOk: "Apagar tudo", rotuloCampo: "Digite"
    });
    if (!confirmou) return;

    const progresso = abrirProgresso("Apagando os dados", "Não feche o app até terminar.");
    try {
        await apagarTudo((feitas, total) => progresso.atualizar(feitas, total));
        progresso.fechar();
        avisar("Todos os dados foram apagados");
    } catch (erro) {
        console.log("Erro ao apagar tudo:", erro);
        progresso.fechar();
        avisar(textoDeErro(erro, "apagar os dados"), { tipo: "erro", duracao: 9000 });
    }
}

export const eventos = {
    cliques: {
        "mais:sair": () => { sairDaConta(); },
        "mais:restaurar": () => { garantirCampoBackup().click(); },
        "mais:excel": () => { exportarExcel(); },
        "mais:lixeira": () => abrirLixeira(),
        "mais:apagar-tudo": () => { apagarTudoComSeguranca(); },
        "lixeira:restaurar": el => {
            restaurarDaLixeira(el.dataset.colecao, el.dataset.id);
            avisar("Item restaurado");
        },
        "lixeira:apagar": el => { apagarItemDeVez(el.dataset.colecao, el.dataset.id); },
        "lixeira:esvaziar": () => { esvaziarLixeira(); }
    }
};

// ======================================
// Viveiro Café - Aplicativo
// app.js - Parte 1
// Base + armazenamento + estrutura
// ======================================

const STORAGE_KEY = "viveiro_cafe_dados";

let dados = {
    clientes: [],
    estoque: [],
    vendas: []
};

let telaAtual = "inicio";
let modoLogin = "entrar"; // "entrar" ou "criar"
let buscaVendaCliente = "";

// Cloudinary — usado só pra guardar o PDF do contrato de cada cliente (opcional)
const CLOUDINARY_CLOUD_NAME = "tbic6pyg";
const CLOUDINARY_UPLOAD_PRESET = "viveiro-cafe";
const LIMITE_CONTRATO_BYTES = 8 * 1024 * 1024; // 8MB


function enviarParaCloudinary(arquivo){

    let formData = new FormData();
    formData.append("file", arquivo);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    return fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, {
        method: "POST",
        body: formData
    })
    .then(resposta=>{
        if(!resposta.ok) throw new Error("Falha no upload");
        return resposta.json();
    })
    .then(json=>json.secure_url);

}


// -------------------------------
// FIREBASE (nuvem) - configuração
// -------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyDxWnb382E4J1EPZ-Es9O4ytwceKgWEGMw",
    authDomain: "viveiro-cafe-pedro.firebaseapp.com",
    projectId: "viveiro-cafe-pedro",
    storageBucket: "viveiro-cafe-pedro.firebasestorage.app",
    messagingSenderId: "1008798649663",
    appId: "1:1008798649663:web:98e9ce0914fd4eb378178a"
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();

// Permite o app continuar funcionando offline,
// usando a última cópia sincronizada, e mandar
// as mudanças pra nuvem assim que a internet voltar.
try{
    db.enablePersistence({synchronizeTabs:true})
    .catch(err=>{
        console.log("Persistência offline indisponível:", err.code);
    });
}catch(e){
    console.log("Erro ao ativar persistência offline:", e);
}

let docRef = null; // definido depois do login, um por usuário (isolado por UID)


// -------------------------------
// LOGIN (Firebase Authentication)
// -------------------------------

let usuarioLogado = null;
let pararEscuta = null; // cancela o listener do usuário anterior, se tiver

firebase.auth().onAuthStateChanged(usuario=>{

    usuarioLogado = usuario;

    // se já tinha um listener rodando (de outro usuário, ou de antes de sair),
    // para ele antes de continuar — senão os dados de contas diferentes se misturam
    if(pararEscuta){
        pararEscuta();
        pararEscuta = null;
    }

    if(usuario){

        // cada usuário tem seu próprio documento, isolado pelo UID dele
        docRef = db
            .collection("usuarios")
            .doc(usuario.uid)
            .collection("viveiro")
            .doc("dados");

        if(telaAtual === "login") telaAtual = "inicio";

        // limpa o que tava na tela antes de carregar os dados desse usuário
        dados = { clientes: [], estoque: [], vendas: [] };

        iniciarEscutaDados();

    }else{

        docRef = null;
        dados = { clientes: [], estoque: [], vendas: [] };

    }

    atualizarTela();

});


function fazerLogin(){

    let email =
    document
    .getElementById("loginEmail")
    .value
    .trim();

    let senha =
    document
    .getElementById("loginSenha")
    .value;

    if(!email || !senha){

        mostrarToast("Preencha e-mail e senha");

        return;

    }

    let botao = document.getElementById("loginBotao");
    if(botao){
        botao.disabled = true;
        botao.innerText = "Entrando...";
    }

    firebase.auth()
    .signInWithEmailAndPassword(email, senha)
    .catch(erro=>{

        console.log("Erro no login:", erro.code);

        if(erro.code === "auth/invalid-credential" || erro.code === "auth/wrong-password" || erro.code === "auth/user-not-found"){
            mostrarToast("E-mail ou senha incorretos");
        }else if(erro.code === "auth/too-many-requests"){
            mostrarToast("Muitas tentativas — espera um pouco e tenta de novo");
        }else{
            mostrarToast("Não foi possível entrar");
        }

        if(botao){
            botao.disabled = false;
            botao.innerText = "Entrar";
        }

    });

}


function alternarSenha(){

    let campo = document.getElementById("loginSenha");
    let botao = document.getElementById("olhoSenha");

    if(campo.type === "password"){
        campo.type = "text";
        botao.innerText = "🙈";
    }else{
        campo.type = "password";
        botao.innerText = "👁️";
    }

}


function alternarSenhaConfirma(){

    let campo = document.getElementById("loginSenhaConfirma");
    let botao = document.getElementById("olhoSenhaConfirma");

    if(campo.type === "password"){
        campo.type = "text";
        botao.innerText = "🙈";
    }else{
        campo.type = "password";
        botao.innerText = "👁️";
    }

}


function criarConta(){

    let email =
    document
    .getElementById("loginEmail")
    .value
    .trim();

    let senha =
    document
    .getElementById("loginSenha")
    .value;

    let senhaConfirma =
    document
    .getElementById("loginSenhaConfirma")
    .value;

    if(!email || !senha){

        mostrarToast("Preencha e-mail e senha");

        return;

    }

    if(senha.length < 6){

        mostrarToast("A senha precisa ter pelo menos 6 caracteres");

        return;

    }

    if(senha !== senhaConfirma){

        mostrarToast("As senhas digitadas são diferentes");

        return;

    }

    let botao = document.getElementById("loginBotao");
    if(botao){
        botao.disabled = true;
        botao.innerText = "Criando...";
    }

    firebase.auth()
    .createUserWithEmailAndPassword(email, senha)
    .catch(erro=>{

        console.log("Erro ao criar conta:", erro.code);

        if(erro.code === "auth/email-already-in-use"){
            mostrarToast("Esse e-mail já tem conta — tenta entrar");
        }else if(erro.code === "auth/invalid-email"){
            mostrarToast("E-mail inválido");
        }else if(erro.code === "auth/weak-password"){
            mostrarToast("Senha muito fraca — use pelo menos 6 caracteres");
        }else{
            mostrarToast("Não foi possível criar a conta");
        }

        if(botao){
            botao.disabled = false;
            botao.innerText = "Criar conta";
        }

    });

    // se der certo, o onAuthStateChanged detecta sozinho e já entra logado

}


function fazerLogout(){

    modoLogin = "entrar";
    firebase.auth().signOut();

}


// -------------------------------
// BANCO NA NUVEM (Firestore)
// -------------------------------

function iniciarEscutaDados(){

    if(!docRef) return;

    // Escuta mudanças em tempo real na nuvem
    // (isso também faz a primeira carga dos dados)
    pararEscuta = docRef.onSnapshot(
    doc=>{

        if(doc.exists){

            const remoto = doc.data();

            if(
                remoto &&
                Array.isArray(remoto.clientes) &&
                Array.isArray(remoto.estoque) &&
                Array.isArray(remoto.vendas)
            ){

                dados = remoto;

            }

        }else{

            // primeira vez desse usuário no app: cria o documento dele na nuvem
            docRef.set(dados);

        }

        atualizarTela();

    },
    erro=>{

        console.log("Erro ao sincronizar com a nuvem:", erro.code, erro.message);

        if(erro.code === "permission-denied"){
            mostrarToast("Acesso negado pelo Firebase — confere a regra do Firestore");
        }

        carregarDadosLocal();

        atualizarTela();

    }
    );

}


// -------------------------------
// BANCO NA NUVEM (Firestore)
// -------------------------------

function salvarDados(){

    if(!docRef || !usuarioLogado) return;

    docRef.set(dados)
    .catch(err=>{

        console.log("Erro ao salvar na nuvem:", err.code, err.message);

        if(err.code === "permission-denied"){
            mostrarToast("Acesso negado pelo Firebase — confere a regra do Firestore");
        }else if(!navigator.onLine){
            mostrarToast("Sem conexão agora — vai sincronizar sozinho depois");
        }else{
            mostrarToast("Erro ao salvar: " + err.code);
        }

    });

    // cópia extra local, só por segurança — separada por usuário
    try{

        localStorage.setItem(
            STORAGE_KEY + "_" + usuarioLogado.uid,
            JSON.stringify(dados)
        );

    }catch(e){

        console.log("Erro ao salvar cópia local:", e);

    }

}


function carregarDadosLocal(){

    if(!usuarioLogado) return;

    const salvo = localStorage.getItem(STORAGE_KEY + "_" + usuarioLogado.uid);

    if(salvo){

        try{

            const carregado = JSON.parse(salvo);

            if(
                carregado &&
                typeof carregado === "object" &&
                Array.isArray(carregado.clientes) &&
                Array.isArray(carregado.estoque) &&
                Array.isArray(carregado.vendas)
            ){

                dados = carregado;

            }

        }catch(e){

            console.log("Erro ao carregar cópia local");

        }

    }

}


function atualizarTela(){

    if(document.getElementById("app-root")){

        renderizar();

    }

}


// Escuta mudanças em tempo real na nuvem
// (isso também faz a primeira carga dos dados)
docRef.onSnapshot(
doc=>{

    if(doc.exists){

        const remoto = doc.data();

        if(
            remoto &&
            Array.isArray(remoto.clientes) &&
            Array.isArray(remoto.estoque) &&
            Array.isArray(remoto.vendas)
        ){

            dados = remoto;

        }

    }else{

        // primeira vez usando o app: cria o documento na nuvem
        docRef.set(dados);

    }

    atualizarTela();

},
erro=>{

    console.log("Erro ao sincronizar com a nuvem:", erro);

    carregarDadosLocal();

    atualizarTela();

}
);



// -------------------------------
// UTILIDADES
// -------------------------------

function gerarId(){

    return Date.now().toString(36)
    +
    Math.random()
    .toString(36)
    .substring(2);

}


function dinheiro(valor){

    return Number(valor || 0)
    .toLocaleString(
        "pt-BR",
        {
            style:"currency",
            currency:"BRL"
        }
    );

}


function numero(valor){

    return Number(valor || 0)
    .toLocaleString("pt-BR");

}


function dataHoje(){

    return new Date()
    .toISOString()
    .substring(0,10);

}



function mostrarToast(texto){

    let antigo=document.querySelector(".toast");

    if(antigo)
        antigo.remove();


    let div=document.createElement("div");

    div.className="toast";
    div.innerText=texto;

    document.body.appendChild(div);


    setTimeout(()=>{

        div.classList.add("show");

    },50);


    setTimeout(()=>{

        div.remove();

    },2500);

}



// -------------------------------
// INICIALIZAÇÃO
// -------------------------------

document.addEventListener(
"DOMContentLoaded",
()=>{

    atualizarTela();
    atualizarFaixaConexao();

});


// -------------------------------
// AVISO DE CONEXÃO (offline/online)
// -------------------------------

function atualizarFaixaConexao(){

    let faixa = document.getElementById("faixaConexao");
    if(!faixa) return;

    if(navigator.onLine){
        faixa.style.display = "none";
    }else{
        faixa.style.display = "block";
    }

}

window.addEventListener("offline", ()=>{

    mostrarToast("Sem internet — continua registrando, sincroniza sozinho depois");
    atualizarFaixaConexao();

});

window.addEventListener("online", ()=>{

    mostrarToast("Conexão de volta — sincronizando com o Firebase...");
    atualizarFaixaConexao();

});



// -------------------------------
// CONTAINER PRINCIPAL
// -------------------------------

function renderizar(){

const app=document.getElementById("app-root");


if(!usuarioLogado){

    app.innerHTML=`

<div class="container fade">

${telaLogin()}

</div>

    `;

    return;

}


app.innerHTML=`

<div class="container fade">

<header>

<img src="icons/icon-192.png" alt="" class="logo">

<div>
<h1>Viveiro & Vendas</h1>
<p>Controle de mudas de café</p>
</div>

<button class="sair" onclick="fazerLogout()" title="Sair">Sair</button>

</header>


<div id="faixaConexao" class="faixa-offline" style="display:${navigator.onLine ? 'none' : 'block'}">
🔌 Sem internet — os lançamentos ficam guardados aqui e sobem sozinhos pro Firebase quando a conexão voltar.
</div>


<nav>

<button class="${telaAtual==='inicio'?'active':''}" onclick="abrirTela('inicio')">
Painel
</button>

<button class="${telaAtual==='estoque'?'active':''}" onclick="abrirTela('estoque')">
Estoque
</button>

<button class="${telaAtual==='clientes'?'active':''}" onclick="abrirTela('clientes')">
Clientes
</button>

<button class="${telaAtual==='vendas'?'active':''}" onclick="abrirTela('vendas')">
Vendas
</button>

<button class="${telaAtual==='ferramentas'?'active':''}" onclick="abrirTela('ferramentas')">
Ferramentas
</button>

</nav>


<div id="conteudo"></div>


</div>

`;


mostrarTela();

}


// -------------------------------
// TELA DE LOGIN
// -------------------------------

function telaLogin(){

if(modoLogin==="criar"){

return `

<div class="tela-login">

<div class="card login-card">

<img src="icons/icon-192.png" alt="" class="logo">

<h1>Criar conta</h1>
<p>Viveiro & Vendas</p>

<div class="form-grid">

<div>
<label>E-mail</label>
<input type="email" id="loginEmail" placeholder="seu@email.com" onkeydown="if(event.key==='Enter') criarConta()">
</div>

<div>
<label>Senha (mínimo 6 caracteres)</label>
<div class="campo-senha">
<input type="password" id="loginSenha" placeholder="Escolha uma senha" onkeydown="if(event.key==='Enter') criarConta()">
<button type="button" id="olhoSenha" class="olho" onclick="alternarSenha()">👁️</button>
</div>
</div>

<div>
<label>Confirmar senha</label>
<div class="campo-senha">
<input type="password" id="loginSenhaConfirma" placeholder="Digite a senha de novo" onkeydown="if(event.key==='Enter') criarConta()">
<button type="button" id="olhoSenhaConfirma" class="olho" onclick="alternarSenhaConfirma()">👁️</button>
</div>
</div>

</div>

<br>

<button class="primary" id="loginBotao" onclick="criarConta()">
Criar conta
</button>

<p class="helper" style="margin-top:16px;">
Já tem conta? <a href="javascript:void(0)" onclick="modoLogin='entrar'; renderizar();">Entrar</a>
</p>

</div>

</div>

`;

}

return `

<div class="tela-login">

<div class="card login-card">

<img src="icons/icon-192.png" alt="" class="logo">

<h1>Viveiro & Vendas</h1>
<p>Controle de mudas de café</p>

<div class="form-grid">

<div>
<label>E-mail</label>
<input type="email" id="loginEmail" placeholder="seu@email.com" onkeydown="if(event.key==='Enter') fazerLogin()">
</div>

<div>
<label>Senha</label>
<div class="campo-senha">
<input type="password" id="loginSenha" placeholder="Sua senha" onkeydown="if(event.key==='Enter') fazerLogin()">
<button type="button" id="olhoSenha" class="olho" onclick="alternarSenha()">👁️</button>
</div>
</div>

</div>

<br>

<button class="primary" id="loginBotao" onclick="fazerLogin()">
Entrar
</button>

<p class="helper" style="margin-top:16px;">
Não tem conta? <a href="javascript:void(0)" onclick="modoLogin='criar'; renderizar();">Criar conta</a>
</p>

</div>

</div>

`;

}



// -------------------------------
// TROCA DE TELAS
// -------------------------------

function abrirTela(nome){

    telaAtual=nome;

    renderizar();

}



function mostrarTela(){

const area=document.getElementById("conteudo");


if(telaAtual==="inicio"){

    area.innerHTML=telaInicio();

}


if(telaAtual==="clientes"){

    area.innerHTML=telaClientes();

}


if(telaAtual==="estoque"){

    area.innerHTML=telaEstoque();

}


if(telaAtual==="vendas"){

    area.innerHTML=telaVendas();

}


if(telaAtual==="ferramentas"){

    area.innerHTML=telaFerramentas();

}

}

// ======================================
// app.js - Parte 2
// Painel + Clientes
// ======================================


// -------------------------------
// TELA PRINCIPAL / DASHBOARD
// -------------------------------

function telaInicio(){

    let totalEstoque = dados.estoque.reduce(
        (s,item)=>s+Number(item.quantidade),
        0
    );


    let totalVendido = dados.vendas.reduce(
        (s,item)=>s+Number(item.quantidade),
        0
    );


    let faturamento = dados.vendas.reduce(
        (s,item)=> item.valor==null ? s : s+Number(item.valor),
        0
    );


    let jaRecebido = dados.vendas.reduce(
        (s,item)=>s+Number(item.valorPago||0),
        0
    );


    let aReceberReservado = dados.vendas.reduce(
        (s,item)=> item.status==="reservado" ? s+Number(item.valor||0) : s,
        0
    );


    let aReceberSinal = dados.vendas.reduce(
        (s,item)=> item.status==="parcial" ? s+(Number(item.valor)-Number(item.valorPago||0)) : s,
        0
    );


    let semPrecoDefinido = dados.vendas.filter(
        item=>item.status==="sem_preco"
    ).length;


    let sinalSemPreco = dados.vendas.reduce(
        (s,item)=> item.status==="sem_preco" ? s+Number(item.valorPago||0) : s,
        0
    );


return `

<div class="card">

<h2>Resumo geral</h2>


<div class="grid">


<div class="stat">
<small>Mudas em estoque</small>
<strong>${numero(totalEstoque)}</strong>
</div>


<div class="stat red">
<small>Mudas vendidas</small>
<strong>${numero(totalVendido)}</strong>
</div>


<div class="stat gold">
<small>Faturamento (vendas com preço definido)</small>
<strong>${dinheiro(faturamento)}</strong>
</div>


<div class="stat">
<small>Já recebido (inclui sinal de reservas sem preço)</small>
<strong>${dinheiro(jaRecebido)}</strong>
</div>


<div class="stat red">
<small>A receber (reservado, sem pagamento)</small>
<strong>${dinheiro(aReceberReservado)}</strong>
</div>


<div class="stat red">
<small>A receber (sinal/parcial)</small>
<strong>${dinheiro(aReceberSinal)}</strong>
</div>


${
semPrecoDefinido>0
?
`<div class="stat gold">
<small>Reservas com preço a definir (${numero(semPrecoDefinido)})</small>
<strong>${dinheiro(sinalSemPreco)} em sinal</strong>
</div>`
:
""
}


<div class="stat">
<small>Clientes</small>
<strong>${numero(dados.clientes.length)}</strong>
</div>


</div>

</div>



<div class="card">

<h2>Estoque atual</h2>


${
dados.estoque.length===0

?

`<div class="empty">
Nenhuma muda cadastrada.
</div>`

:

`

<table>

<thead>
<tr>
<th>Variedade</th>
<th>Quantidade</th>
</tr>
</thead>


<tbody>

${

dados.estoque.map(e=>`

<tr>

<td data-label="Variedade">
${e.nome}
</td>


<td data-label="Quantidade">
${numero(e.quantidade)}
</td>


</tr>

`).join("")

}

</tbody>

</table>

`

}

</div>

`;

}




// ======================================
// CLIENTES
// ======================================


function telaClientes(){


return `


<div class="card">

<h2>Novo cliente</h2>


<div class="form-grid">


<div>
<label>Nome</label>

<input id="clienteNome"
placeholder="Nome do cliente">
</div>



<div>
<label>Telefone</label>

<input id="clienteTelefone"
placeholder="Telefone">
</div>



<div>
<label>Cidade</label>

<input id="clienteCidade"
placeholder="Cidade">
</div>


</div>


<br>


<button class="primary"
onclick="adicionarCliente()">

Adicionar cliente

</button>


</div>





<div class="card">

<h2>Clientes cadastrados</h2>


${

dados.clientes.length===0

?

`<div class="empty">
Nenhum cliente cadastrado.
</div>`


:

`

<table>

<thead>

<tr>

<th>Nome</th>
<th>Telefone</th>
<th>Cidade</th>
<th>Contrato</th>
<th></th>

</tr>

</thead>


<tbody>


${

dados.clientes.map(c=>`

<tr>

<td data-label="Nome">
${c.nome}
</td>


<td data-label="Telefone">
${c.telefone || "-"}
</td>


<td data-label="Cidade">
${c.cidade || "-"}
</td>


<td data-label="Contrato">

${
c.contratoUrl
?
`<a href="${c.contratoUrl}" target="_blank" rel="noopener">📄 Ver contrato</a><br><button class="delete" style="margin-top:6px;margin-left:0;" onclick="removerContrato('${c.id}')">Remover</button>`
:
`<input type="file" accept="application/pdf" id="arquivoContrato-${c.id}" style="display:none" onchange="anexarContrato('${c.id}', this.files[0])">
<button class="primary" onclick="document.getElementById('arquivoContrato-${c.id}').click()">📎 Anexar PDF</button>`
}

</td>


<td>

<button
class="delete"
onclick="removerCliente('${c.id}')">

Excluir

</button>

</td>


</tr>


`).join("")

}


</tbody>

</table>

`

}


</div>


`;

}




function adicionarCliente(){


let nome =
document.getElementById("clienteNome").value.trim();


let telefone =
document.getElementById("clienteTelefone").value.trim();


let cidade =
document.getElementById("clienteCidade").value.trim();



if(!nome){

    mostrarToast("Digite o nome do cliente");

    return;

}



dados.clientes.push({

id:gerarId(),

nome,

telefone,

cidade

});


salvarDados();


mostrarToast(
"Cliente cadastrado"
);


mostrarTela();

}




function removerCliente(id){


if(!confirm("Excluir cliente?"))
return;


dados.clientes =
dados.clientes.filter(
c=>c.id!==id
);


salvarDados();


mostrarToast(
"Cliente removido"
);


mostrarTela();

}


// --------------------------------------
// CONTRATO EM PDF (Cloudinary, opcional)
// --------------------------------------

function anexarContrato(clienteId, arquivo){

    if(!arquivo) return;

    if(arquivo.type !== "application/pdf"){
        mostrarToast("Só é possível anexar arquivos PDF");
        return;
    }

    if(arquivo.size > LIMITE_CONTRATO_BYTES){
        mostrarToast(`PDF muito grande (máx. ${Math.round(LIMITE_CONTRATO_BYTES/1024/1024)}MB)`);
        return;
    }

    let cliente = dados.clientes.find(c=>c.id===clienteId);
    if(!cliente) return;

    mostrarToast("Enviando contrato...");

    enviarParaCloudinary(arquivo)
    .then(url=>{

        cliente.contratoUrl = url;
        cliente.contratoNome = arquivo.name;

        salvarDados();

        mostrarToast("Contrato anexado");

        mostrarTela();

    })
    .catch(erro=>{

        console.log("Erro ao enviar contrato:", erro);
        mostrarToast("Erro ao enviar o PDF — tenta de novo");

    });

}


function removerContrato(clienteId){

    if(!confirm("Remover o contrato desse cliente?"))
        return;

    let cliente = dados.clientes.find(c=>c.id===clienteId);
    if(!cliente) return;

    delete cliente.contratoUrl;
    delete cliente.contratoNome;

    salvarDados();

    mostrarToast("Contrato removido");

    mostrarTela();

}
// ======================================
// app.js - Parte 3
// Estoque de mudas
// ======================================



function telaEstoque(){


return `


<div class="card">


<h2>Nova variedade</h2>


<div class="form-grid">


<div>

<label>Nome da muda</label>

<input id="estoqueNome"
placeholder="Ex: Catuaí Vermelho">

</div>



<div>

<label>Quantidade</label>

<input 
type="number"
id="estoqueQuantidade"
placeholder="Ex: 5000">

</div>


</div>


<br>


<button
class="primary"
onclick="adicionarEstoque()">

Adicionar ao estoque

</button>


</div>






<div class="card">


<h2>Estoque cadastrado</h2>



${

dados.estoque.length===0

?

`

<div class="empty">

Nenhuma variedade cadastrada.

</div>

`


:

`

<table>


<thead>

<tr>

<th>Variedade</th>

<th>Quantidade</th>


<th></th>

</tr>


</thead>



<tbody>


${

dados.estoque.map(e=>{


let alerta =
Number(e.quantidade)<100
?
"low-stock"
:
"";


return `


<tr>


<td data-label="Variedade">

${e.nome}

</td>



<td 
data-label="Quantidade"
class="${alerta}">

${numero(e.quantidade)}

${

Number(e.quantidade)<100
?
" ⚠"
:
""

}

</td>


<td>



<button

class="delete"

onclick="removerEstoque('${e.id}')">

Excluir

</button>


</td>


</tr>


`;

}).join("")

}


</tbody>


</table>


`

}


</div>


`;

}





// ------------------------------------
// ADICIONAR ESTOQUE
// ------------------------------------


function adicionarEstoque(){


let nome =
document
.getElementById("estoqueNome")
.value
.trim();



let quantidade =
Number(
document
.getElementById("estoqueQuantidade")
.value
);



if(!nome || quantidade<=0){


mostrarToast(
"Preencha os dados corretamente"
);


return;

}



dados.estoque.push({

id:gerarId(),

nome,

quantidade

});



salvarDados();



mostrarToast(
"Muda adicionada ao estoque"
);



mostrarTela();


}




// ------------------------------------
// REMOVER ESTOQUE
// ------------------------------------


function removerEstoque(id){


if(!confirm(
"Excluir esta variedade?"
))

return;



dados.estoque =
dados.estoque.filter(
e=>e.id!==id
);



salvarDados();



mostrarToast(
"Variedade removida"
);



mostrarTela();


}

// ======================================
// app.js - Parte 4
// Vendas
// ======================================


function telaVendas(){

return `

<div class="card">

<h2>Registrar venda / reserva</h2>

<div class="form-grid">

<div>
<label>Cliente</label>

<select id="vendaCliente">
<option value="">Selecione...</option>
${
dados.clientes.map(c=>`
<option value="${c.id}">${c.nome}</option>
`).join("")
}
</select>
</div>

<div>
<label>Variedade</label>

<select id="vendaProduto">
<option value="">Selecione...</option>
${
dados.estoque.map(e=>`
<option value="${e.id}">${e.nome} (${numero(e.quantidade)})</option>
`).join("")
}
</select>
</div>

<div>
<label>Quantidade</label>
<input type="number" id="vendaQuantidade" placeholder="Quantidade">
</div>

<div>
<label>Valor da muda (por unidade) — deixe em branco se ainda não combinou</label>
<input type="number" step="0.01" id="vendaPreco" placeholder="Ex: 1.50">
</div>

<div>
<label>Valor de entrada (se ele já deu uma parte)</label>
<input type="number" step="0.01" id="vendaValorEntrada" placeholder="Ex: 20.00">
</div>

</div>

<p style="font-size:.9rem;opacity:.75;margin-top:6px;">
💡 A muda sai do estoque assim que reserva, mesmo sem preço definido. Se não pagou nada ainda, deixe "valor de entrada" em branco. Se pagou tudo, coloque o valor de entrada igual ao valor da muda × quantidade.
</p>

<br>

<button class="primary" onclick="registrarVenda()">
Registrar
</button>

</div>


<div class="card">

<h2>Histórico de vendas e reservas</h2>

<div class="form-grid" style="margin-bottom:16px;">
<div>
<label>Buscar por cliente</label>
<input type="text" id="buscaVendaCliente" placeholder="Digite o nome do cliente..." value="${buscaVendaCliente}" oninput="filtrarVendasPorCliente(this.value)">
</div>
</div>

${
(()=>{

let vendasFiltradas = dados.vendas.slice().reverse();

if(buscaVendaCliente.trim()!==""){

    let termo = buscaVendaCliente.trim().toLowerCase();

    vendasFiltradas = vendasFiltradas.filter(v=>{
        let cliente = dados.clientes.find(c=>c.id===v.clienteId);
        return cliente && cliente.nome.toLowerCase().includes(termo);
    });

}

if(vendasFiltradas.length===0){
    return dados.vendas.length===0
    ? `<div class="empty">Nenhuma venda ou reserva registrada.</div>`
    : `<div class="empty">Nenhuma venda encontrada pra esse cliente.</div>`;
}

return `
<table>
<thead>
<tr>
<th>Cliente</th>
<th>Muda</th>
<th>Qtd</th>
<th>Total</th>
<th>Situação</th>
<th></th>
</tr>
</thead>

<tbody>
${
vendasFiltradas.map(v=>{

let cliente =
dados.clientes.find(
c=>c.id===v.clienteId
);

let valorPago = Number(v.valorPago || 0);
let temPreco = v.valor !== null && v.valor !== undefined;
let restante = temPreco ? Number(v.valor) - valorPago : 0;
let status = v.status || "pago";

let situacaoHtml = "";

if(status==="sem_preco"){
    situacaoHtml = valorPago>0
        ? `🔵 Sinal ${dinheiro(valorPago)}<br><small>preço da muda a definir</small>`
        : `🔵 Reservado<br><small>preço a definir</small>`;
}else if(status==="pago"){
    situacaoHtml = `✅ Pago`;
}else if(status==="parcial"){
    situacaoHtml = `🟡 Sinal ${dinheiro(valorPago)}<br><small>falta ${dinheiro(restante)}</small>`;
}else{
    situacaoHtml = `🔴 Reservado<br><small>deve ${dinheiro(restante)}</small>`;
}

return `

<tr>

<td data-label="Cliente">
${cliente ? cliente.nome : "Removido"}
</td>

<td data-label="Muda">
${v.produto}
</td>

<td data-label="Quantidade">
${numero(v.quantidade)}
</td>

<td data-label="Valor">
${
temPreco
?
`${dinheiro(v.valor)}<br><small>${dinheiro(v.valor/v.quantidade)}/muda</small>`
:
"A definir"
}
</td>

<td data-label="Situação">
${situacaoHtml}
</td>

<td>
${
status==="sem_preco"
?
`<button class="primary" onclick="definirPreco('${v.id}')">💲 Definir preço</button>`
:
status!=="pago"
?
`<button class="primary" onclick="registrarPagamento('${v.id}')">💰 Receber</button>`
:
""
}
<button class="delete" onclick="cancelarVenda('${v.id}')">Excluir</button>
</td>

</tr>

`;
}).join("")
}
</tbody>
</table>
`;

})()
}

</div>

`;
}





// --------------------------------------
// REGISTRAR VENDA
// --------------------------------------


// --------------------------------------
// BUSCAR VENDA POR CLIENTE
// --------------------------------------

function filtrarVendasPorCliente(valor){

    buscaVendaCliente = valor;

    let campo = document.getElementById("buscaVendaCliente");
    let posicaoCursor = campo ? campo.selectionStart : null;

    mostrarTela();

    // sem isso, o campo perderia o foco a cada letra digitada
    // (a tela inteira é redesenhada de novo a cada busca)
    let campoNovo = document.getElementById("buscaVendaCliente");
    if(campoNovo){
        campoNovo.focus();
        if(posicaoCursor !== null){
            campoNovo.setSelectionRange(posicaoCursor, posicaoCursor);
        }
    }

}


function registrarVenda(){

let clienteId =
document
.getElementById("vendaCliente")
.value;

let produtoId =
document
.getElementById("vendaProduto")
.value;

let quantidade =
Number(
document
.getElementById("vendaQuantidade")
.value
);

let precoInformado =
document
.getElementById("vendaPreco")
.value;

let valorEntradaInformado =
document
.getElementById("vendaValorEntrada")
.value;

let cliente =
dados.clientes.find(
c=>c.id===clienteId
);

let produto =
dados.estoque.find(
e=>e.id===produtoId
);


if(!cliente || !produto || quantidade<=0){

mostrarToast(
"Preencha todos os campos"
);

return;
}


if(quantidade > produto.quantidade){

mostrarToast(
"Estoque insuficiente"
);

return;
}


produto.quantidade -= quantidade;

// Se o preço por muda não foi digitado, fica "a definir" — dá pra completar
// depois na entrega/retirada (função definirPreco). O valor de entrada
// (se ele já deu uma parte) fica guardado mesmo sem o preço total fechado.
let precoUnitario = Number(String(precoInformado).replace(",", "."));
let temPreco = precoInformado !== "" && precoUnitario > 0;

let valor = temPreco ? precoUnitario * quantidade : null;

let valorEntrada = Number(String(valorEntradaInformado).replace(",", ".")) || 0;
if(valorEntrada < 0) valorEntrada = 0;
if(temPreco && valorEntrada > valor) valorEntrada = valor;

let valorPago = valorEntrada;

// Situação calculada sozinha a partir dos valores digitados —
// não precisa escolher numa lista separada.
let status;
if(!temPreco){
    status = "sem_preco";
}else if(valorPago >= valor){
    status = "pago";
}else if(valorPago > 0){
    status = "parcial";
}else{
    status = "reservado";
}

dados.vendas.push({

id:gerarId(),

clienteId,

produtoId:produto.id,

produto:produto.nome,

quantidade,

valor,

valorPago,

status,

data:dataHoje()

});


salvarDados();

mostrarToast(
status==="pago" ? "Venda registrada" : "Muda reservada"
);

mostrarTela();

}







// --------------------------------------
// CANCELAR VENDA
// --------------------------------------


function cancelarVenda(id){



if(!confirm(
"Cancelar esta venda?"
))

return;



let venda =
dados.vendas.find(
v=>v.id===id
);



if(venda){


let produto =
dados.estoque.find(
e=>e.id===venda.produtoId
) ||
dados.estoque.find(
e=>e.nome===venda.produto
);



if(produto){

produto.quantidade += venda.quantidade;

}


}




dados.vendas =
dados.vendas.filter(
v=>v.id!==id
);



salvarDados();



mostrarToast(
"Venda cancelada"
);



mostrarTela();


}


// --------------------------------------
// RECEBER PAGAMENTO (reserva ou parcial)
// --------------------------------------

function registrarPagamento(id){

let venda =
dados.vendas.find(
v=>v.id===id
);

if(!venda) return;

let valorPago = Number(venda.valorPago || 0);
let restante = Number(venda.valor) - valorPago;

let entrada = prompt(
`Quanto ${venda.produto} (${venda.quantidade}un) recebeu agora? Falta ${dinheiro(restante)}.`,
restante.toFixed(2)
);

if(entrada===null) return;

let valorRecebido = Number(entrada.replace(",", "."));

if(!valorRecebido || valorRecebido<=0){
    mostrarToast("Digite um valor válido");
    return;
}

if(valorRecebido > restante) valorRecebido = restante;

venda.valorPago = valorPago + valorRecebido;
venda.status = venda.valorPago >= venda.valor ? "pago" : "parcial";

salvarDados();

mostrarToast(
venda.status==="pago" ? "Pagamento quitado" : "Pagamento registrado"
);

mostrarTela();

}


// --------------------------------------
// DEFINIR PREÇO (reserva feita sem preço)
// --------------------------------------

function definirPreco(id){

let venda =
dados.vendas.find(
v=>v.id===id
);

if(!venda) return;

let entrada = prompt(
`Combinado o preço de ${venda.produto}: quanto vai cobrar por muda? (${venda.quantidade} unidade${venda.quantidade>1?"s":""})`,
""
);

if(entrada===null) return;

let precoUnitario = Number(entrada.replace(",", "."));

if(!precoUnitario || precoUnitario<=0){
    mostrarToast("Digite um preço válido");
    return;
}

venda.valor = precoUnitario * venda.quantidade;

// mantém o sinal que já tinha sido dado antes do preço ser combinado
let valorPagoAtual = Number(venda.valorPago || 0);
if(valorPagoAtual > venda.valor) valorPagoAtual = venda.valor;
venda.valorPago = valorPagoAtual;

venda.status =
venda.valorPago >= venda.valor ? "pago" :
venda.valorPago > 0 ? "parcial" :
"reservado";

salvarDados();

mostrarToast(`Preço definido: ${dinheiro(venda.valor)}`);

mostrarTela();

}

// ======================================
// app.js - Parte 5
// Backup + Exportação + Ajustes finais
// ======================================


// -------------------------------
// EXPORTAR BACKUP JSON
// -------------------------------

function exportarBackup(){


const arquivo =
JSON.stringify(
    dados,
    null,
    2
);



const blob =
new Blob(
    [arquivo],
    {
        type:"application/json"
    }
);



const url =
URL.createObjectURL(blob);



const link =
document.createElement("a");


link.href=url;

link.download=
"backup-viveiro-cafe.json";


link.click();


URL.revokeObjectURL(url);


mostrarToast(
"Backup criado"
);


}





// -------------------------------
// IMPORTAR BACKUP JSON
// -------------------------------

function importarBackup(event){


const arquivo =
event.target.files[0];


if(!arquivo)
return;



const leitor =
new FileReader();



leitor.onload=function(e){


try{


const novosDados =
JSON.parse(
e.target.result
);


if(
!novosDados ||
typeof novosDados !== "object" ||
!Array.isArray(novosDados.clientes) ||
!Array.isArray(novosDados.estoque) ||
!Array.isArray(novosDados.vendas)
){

mostrarToast(
"Arquivo inválido: formato incorreto"
);

return;

}


dados = novosDados;



salvarDados();


mostrarToast(
"Backup restaurado"
);



renderizar();


}

catch(err){


mostrarToast(
"Arquivo inválido"
);


}


};



leitor.readAsText(arquivo);



}






// -------------------------------
// EXPORTAR EXCEL (.xlsx)
// -------------------------------

function estiloCabecalho(){

    return {
        font:{ bold:true, color:{ rgb:"FFFFFF" } },
        fill:{ patternType:"solid", fgColor:{ rgb:"7C9A54" } },
        alignment:{ horizontal:"center" }
    };

}


function celulaTexto(valor){

    return { v:String(valor), t:"s", s:estiloCabecalho() };

}


function celulaMoeda(valor){

    return { v:Number(valor||0), t:"n", z:'"R$" #,##0.00' };

}


function exportarExcel(){


if(typeof XLSX === "undefined"){

    mostrarToast(
    "Sem internet para gerar o Excel"
    );

    return;

}


const wb = XLSX.utils.book_new();



// --- CLIENTES ---

const cabecalhoClientes =
["Nome","Telefone","Cidade"].map(celulaTexto);

const linhasClientes =
dados.clientes.map(c=>[
c.nome,
c.telefone || "",
c.cidade || ""
]);

const wsClientes =
XLSX.utils.aoa_to_sheet(
[cabecalhoClientes, ...linhasClientes]
);

wsClientes["!cols"] =
[{wch:28},{wch:18},{wch:20}];

XLSX.utils.book_append_sheet(wb, wsClientes, "Clientes");



// --- ESTOQUE ---

const cabecalhoEstoque =
["Variedade","Quantidade"].map(celulaTexto);

const linhasEstoque =
dados.estoque.map(e=>[
e.nome,
Number(e.quantidade)
]);

const wsEstoque =
XLSX.utils.aoa_to_sheet(
[cabecalhoEstoque, ...linhasEstoque]
);

wsEstoque["!cols"] =
[{wch:28},{wch:15}];

XLSX.utils.book_append_sheet(wb, wsEstoque, "Estoque");



// --- VENDAS ---

const cabecalhoVendas =
["Data","Cliente","Produto","Quantidade","Valor","Situação","Valor Pago","Falta Receber"].map(celulaTexto);

const linhasVendas =
dados.vendas.map(v=>{

let cliente =
dados.clientes.find(
c=>c.id===v.clienteId
);

let temPreco = v.valor !== null && v.valor !== undefined;
let valorPago = Number(v.valorPago || 0);
let restante = temPreco ? Number(v.valor) - valorPago : 0;
let status = v.status || "pago";
let situacaoTexto =
status==="sem_preco" ? "Reservado (preço a definir)" :
status==="pago" ? "Pago" :
status==="parcial" ? "Parcial (sinal)" :
"Reservado";

return [
v.data,
cliente ? cliente.nome : "",
v.produto,
Number(v.quantidade),
temPreco ? celulaMoeda(v.valor) : celulaTexto("A definir"),
celulaTexto(situacaoTexto),
temPreco ? celulaMoeda(valorPago) : celulaTexto(""),
temPreco ? celulaMoeda(restante) : celulaTexto("")
];

});

const wsVendas =
XLSX.utils.aoa_to_sheet(
[cabecalhoVendas, ...linhasVendas]
);

wsVendas["!cols"] =
[{wch:12},{wch:26},{wch:26},{wch:12},{wch:14},{wch:16},{wch:14},{wch:14}];

XLSX.utils.book_append_sheet(wb, wsVendas, "Vendas");



XLSX.writeFile(wb, "dados-viveiro.xlsx");


mostrarToast(
"Excel exportado"
);


}





// -------------------------------
// LIMPAR TODOS OS DADOS
// -------------------------------

function apagarTudo(){


if(!confirm(
"Apagar todos os dados do sistema?"
))

return;



dados={

clientes:[],

estoque:[],

vendas:[]

};



salvarDados();


mostrarToast(
"Dados apagados"
);



renderizar();


}






// -------------------------------
// MENU DE FERRAMENTAS
// -------------------------------


function telaFerramentas(){


return `


<div class="card">


<h2>Ferramentas</h2>



<button
class="primary"
onclick="exportarBackup()">

Salvar backup

</button>



<br><br>



<label>
Restaurar backup:
</label>


<input
type="file"
accept=".json"
onchange="importarBackup(event)">



<br><br>



<button
class="primary"
onclick="exportarExcel()">

Exportar Excel (.xlsx)

</button>



<br><br>



<button
class="delete"
onclick="apagarTudo()">

Apagar dados

</button>


</div>


`;

}
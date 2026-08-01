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


// -------------------------------
// FIREBASE (nuvem) - configuração
// -------------------------------

const firebaseConfig = {
    apiKey: "AIzaSyCGUtsMPJ4equGi9RnTGLR52pQPfXwCnyA",
    authDomain: "viveiro-cafe.firebaseapp.com",
    databaseURL: "https://viveiro-cafe-default-rtdb.firebaseio.com",
    projectId: "viveiro-cafe",
    storageBucket: "viveiro-cafe.firebasestorage.app",
    messagingSenderId: "175298893236",
    appId: "1:175298893236:web:16654a0a1804346d324ee1"
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

const docRef = db.collection("viveiro").doc("dados");


// -------------------------------
// BANCO NA NUVEM (Firestore)
// -------------------------------

function salvarDados(){

    docRef.set(dados)
    .catch(err=>{

        console.log("Erro ao salvar na nuvem:", err);

        mostrarToast("Sem conexão, salvo só neste aparelho");

    });

    // cópia extra local, só por segurança
    try{

        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(dados)
        );

    }catch(e){

        console.log("Erro ao salvar cópia local:", e);

    }

}


function carregarDadosLocal(){

    const salvo = localStorage.getItem(STORAGE_KEY);

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

});



// -------------------------------
// CONTAINER PRINCIPAL
// -------------------------------

function renderizar(){

const app=document.getElementById("app-root");


app.innerHTML=`

<div class="container fade">

<header>

<img src="icons/icon-192.png" alt="" class="logo">

<div>
<h1>Viveiro & Vendas</h1>
<p>Controle de mudas de café</p>
</div>

</header>


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


    let aReceber = dados.vendas.reduce(
        (s,item)=> item.valor==null ? s : s+(Number(item.valor)-Number(item.valorPago||0)),
        0
    );


    let semPrecoDefinido = dados.vendas.filter(
        item=>item.status==="sem_preco"
    ).length;


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
<small>Faturamento</small>
<strong>${dinheiro(faturamento)}</strong>
</div>


<div class="stat red">
<small>A receber (reservas/sinal)</small>
<strong>${dinheiro(aReceber)}</strong>
</div>


${
semPrecoDefinido>0
?
`<div class="stat gold">
<small>Reservas com preço a definir</small>
<strong>${numero(semPrecoDefinido)}</strong>
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
<th>Preço</th>
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


<td data-label="Preço">
${dinheiro(e.preco)}
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



<div>

<label>Preço por muda</label>

<input
type="number"
step="0.01"
id="estoquePreco"
placeholder="Ex: 1.50">

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

<th>Preço</th>

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



<td data-label="Preço">

${dinheiro(e.preco)}

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



let preco =
Number(
document
.getElementById("estoquePreco")
.value
);



if(!nome || quantidade<=0 || preco<0){


mostrarToast(
"Preencha os dados corretamente"
);


return;

}



dados.estoque.push({

id:gerarId(),

nome,

quantidade,

preco

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
<label>Situação do pagamento</label>
<select id="vendaStatus">
<option value="pago">Pago (à vista)</option>
<option value="parcial">Pago parcial (sinal)</option>
<option value="reservado">Reservado (preço já combinado, sem pagamento)</option>
<option value="sem_preco">Reservado (preço a combinar depois)</option>
</select>
</div>

<div>
<label>Valor já pago agora (só se for sinal/parcial)</label>
<input type="number" step="0.01" id="vendaValorPago" placeholder="Ex: 20.00">
</div>

</div>

<p style="font-size:.9rem;opacity:.75;margin-top:6px;">
💡 Escolhendo "preço a combinar depois", a muda fica reservada e some do estoque, mas sem valor — dá pra definir o preço mais tarde na entrega/retirada.
</p>

<br>

<button class="primary" onclick="registrarVenda()">
Registrar
</button>

</div>


<div class="card">

<h2>Histórico de vendas e reservas</h2>

${
dados.vendas.length===0
?
`<div class="empty">Nenhuma venda ou reserva registrada.</div>`
:
`
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
dados.vendas.map(v=>{

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
    situacaoHtml = `🔵 Reservado<br><small>preço a definir</small>`;
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
${temPreco ? dinheiro(v.valor) : "A definir"}
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
`
}

</div>

`;
}





// --------------------------------------
// REGISTRAR VENDA
// --------------------------------------


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

let status =
document
.getElementById("vendaStatus")
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

// Se o preço ainda não foi combinado com o cliente, não calcula nada agora —
// fica "a definir" e é preenchido depois, na entrega/retirada (função definirPreco).
let valor =
status === "sem_preco"
? null
: quantidade * produto.preco;

// Quanto já foi pago, de acordo com a situação escolhida:
// pago -> valor cheio | reservado/sem_preco -> nada | parcial -> o que foi digitado no campo de sinal
let valorPago = 0;

if(status === "pago"){
    valorPago = valor;
}else if(status === "parcial"){
    valorPago =
    Number(
    document
    .getElementById("vendaValorPago")
    .value
    ) || 0;

    if(valorPago > valor) valorPago = valor;
    if(valorPago < 0) valorPago = 0;
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
venda.status = "reservado";
venda.valorPago = 0;

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
["Variedade","Quantidade","Preco"].map(celulaTexto);

const linhasEstoque =
dados.estoque.map(e=>[
e.nome,
Number(e.quantidade),
celulaMoeda(e.preco)
]);

const wsEstoque =
XLSX.utils.aoa_to_sheet(
[cabecalhoEstoque, ...linhasEstoque]
);

wsEstoque["!cols"] =
[{wch:28},{wch:15},{wch:15}];

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
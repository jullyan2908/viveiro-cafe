# Viveiro Café — versão 2

App de estoque, clientes e vendas das mudas de café. Funciona no celular e no computador, instala como aplicativo e continua funcionando sem internet.

## O que há de novo

- **Telas novas para o celular:** abas embaixo (Painel, Estoque, Vendas, Clientes, Mais), botões grandes, confirmações dentro do app e telas de carregamento, de erro e de "nada aqui ainda".
- **Painel que mostra o que importa:** quanto você tem a receber, estoque total, vendas para entregar, vendas sem preço, variedades com estoque baixo e **Quem me deve**, com botão para cobrar pelo WhatsApp.
- **Vendas completas:** várias variedades na mesma venda, total na hora, receber pagamento aos poucos, marcar entrega, editar, cancelar (as mudas voltam ao estoque) e excluir do histórico.
- **Estoque com histórico:** entrada, perda e contagem, cada uma com motivo opcional; estoque mínimo por variedade.
- **Clientes:** ligar, WhatsApp, extrato de compras e contrato em PDF.
- **Dados mais seguros:** lixeira de 30 dias, backup automático antes de "Apagar todos os dados", "Restaurar backup" mostrando o que vai mudar e aviso quando faz tempo que você não salva um backup.
- **Vários aparelhos ao mesmo tempo:** cada cliente, variedade e venda agora é um registro próprio; dois aparelhos lançando vendas no mesmo instante não sobrescrevem um ao outro.
- **Datas certas:** vendas lançadas à noite não caem mais no dia seguinte.
- **Abre sem piscar a tela de entrada**, funciona sem internet e avisa quando existe versão nova.

## Como publicar (nesta ordem)

**1. Guarde um backup do app atual.** No app de hoje: Mais → Salvar backup. É só garantia: a migração não apaga nem altera nada do que já existe.

**2. Publique as regras do Firestore.** No Console do Firebase: Firestore Database → aba Regras → cole o conteúdo de `firestore.rules` → Publicar. Faça isso **antes** de abrir a versão 2: sem essas regras o app mostra "Acesso negado".

**3. Feche o acesso para outras contas (recomendado).** Esconder o botão "Criar conta" (já vem escondido em `js/config.js`) não impede ninguém de criar conta direto no Firebase. Com a regra padrão, quem criar uma conta não enxerga os seus dados, mas ainda consegue guardar dados próprios no seu projeto. Para fechar de vez, use a variante comentada no fim de `firestore.rules`: troque a regra pela versão com `request.auth.token.email == "seu-email@exemplo.com"` (com o e-mail que você usa para entrar) e publique de novo. Pelo que consegui conferir, o Firebase comum não tem um botão para desligar cadastros; essa regra é o jeito de resolver.

**4. Publique os arquivos** no mesmo lugar onde o app já está hospedado (GitHub Pages, Netlify, Firebase Hosting…). Envie a pasta inteira, sem `node_modules`. Os arquivos antigos `app.js` e `style.css` não são mais usados e podem ser apagados.

**5. Abra o app em cada aparelho.** Se aparecer "Nova versão disponível", toque em Atualizar. Na primeira vez em uma conta com dados, aparece **Atualização dos seus dados** com o resumo do que foi encontrado (por exemplo, "5 clientes, 5 variedades e 8 vendas"). Toque em **Atualizar agora** e espere terminar. Precisa de internet nesse momento.

**6. Confira os números** do resumo com o que você esperava e dê uma olhada no Painel, em Estoque, em Clientes e em Vendas.

> **Atualize todos os aparelhos antes de lançar qualquer coisa.** Um aparelho que continuar com a versão antiga grava no lugar antigo, e a versão 2 não lê mais esse lugar depois da migração.

## Se algo der errado

- **Os dados antigos continuam intactos.** A migração só copia: o documento antigo (`usuarios/<conta>/viveiro/dados`) não é alterado. Se der qualquer erro, a tela explica e dá para tentar de novo.
- **Para voltar à versão antiga:** publique de novo os arquivos antigos. Ela lê o documento antigo, que está como estava. O que você lançar na versão 2 depois da migração não aparece na antiga, então só volte atrás se ainda não lançou nada de importante (ou guarde um backup da versão 2 antes).
- **Para restaurar um backup:** Mais → Restaurar backup. Backups do app antigo também funcionam; o app mostra o que vai ser substituído antes de você confirmar.
- **Apagou sem querer?** Mais → Lixeira guarda clientes, variedades e vendas por 30 dias.

## Contratos em PDF (Cloudinary)

Os PDFs ficam no Cloudinary, enviados sem senha pelo preset `viveiro-cafe`. Quem descobrir o nome da nuvem e do preset (eles aparecem no código do app) consegue enviar arquivos para a sua conta. Para reduzir o risco, no painel do Cloudinary vá em Settings → Upload → Upload presets → `viveiro-cafe` → Edit e:

- preencha **Allowed formats** com `pdf`;
- defina uma pasta fixa para os contratos (por exemplo `contratos`).

O app já recusa arquivos acima de 8 MB, mas isso não vale para quem usar o preset direto. Remover o contrato no app só apaga o link; o arquivo continua no Cloudinary e pode ser excluído por lá, na Media Library.

## Para quem mexe no código

- `npm test` roda os testes automáticos (precisa de Node 18 ou mais novo). Eles cobrem as contas, a migração, o backup, o Excel e a lista de arquivos para uso sem internet.
- **Depois de mudar qualquer arquivo do app, rode `npm run versao`** e publique. Isso atualiza `js/versao.js`, que faz os aparelhos perceberem a versão nova e guardarem os arquivos certos para uso sem internet. Se você esquecer, `npm test` avisa. Para mudar o número da versão: `npm run versao 2.1.0`.
- Para testar no computador: `npx serve .` (ou `python3 -m http.server 8080`) e abra `http://localhost:8080`.
- Ajustes simples ficam em `js/config.js`: estoque mínimo padrão, dias da lixeira, dias para o aviso de backup, botão "Criar conta" e dados do Cloudinary.
- Pastas: `js/` (lógica), `js/telas/` (uma tela por arquivo), `css/estilo.css`, `vendor/` (Firebase e Excel guardados no próprio app, sem depender de CDN), `testes/` e `tools/`.

## O que fica de fora ou merece atenção

- **Não testei com o seu Firebase de verdade.** Os testes rodaram contra um Firebase simulado. Faça a primeira migração com calma, em um aparelho, com o backup do passo 1 guardado.
- **Vendas antigas:** as feitas depois das 21h no app antigo podem estar com um dia a mais (o app antigo usava o horário universal, 3 horas à frente de Brasília). Se isso importar, abra a venda → Editar venda → Data da venda.
- **Excel:** vendas canceladas e itens da lixeira não entram na planilha.
- **Datas:** o campo de data usa o formato do aparelho (dia/mês/ano no Brasil).
- **Instalado na tela inicial:** o endereço de abertura do app não mudou, então quem já instalou não precisa instalar de novo. O nome e o ícone novos podem demorar a aparecer.

// ======================================
// Viveiro Café — service worker (funcionar sem internet)
//
// • Na instalação guarda uma cópia de TODOS os arquivos do app (lista em js/versao.js).
// • Ao abrir um arquivo tenta a internet primeiro (pega sempre a versão mais nova),
//   mas se ela demorar mais de 3 segundos usa a cópia guardada.
// • Só cuida de arquivos do próprio app (GET no mesmo endereço). Firebase, Cloudinary
//   e qualquer outro site passam direto, sem passar por aqui.
// • Quando uma versão nova assume, avisa as páginas abertas; elas mostram
//   "Nova versão disponível" e a pessoa escolhe quando atualizar.
// ======================================

importScripts("js/versao.js");

const VERSAO = `${self.VERSAO_APP}-${self.VERSAO_ARQUIVOS}`;
const PREFIXO = "viveiro-cafe-";
const NOME_CACHE = `${PREFIXO}${VERSAO}`;
const PRAZO_REDE_MS = 3000;

self.addEventListener("install", evento => {
    evento.waitUntil((async () => {
        const cache = await caches.open(NOME_CACHE);
        // cache: "reload" garante arquivos novos (não os da cópia do navegador)
        await Promise.all(self.ARQUIVOS_APP.map(url => cache.add(new Request(url, { cache: "reload" }))));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", evento => {
    evento.waitUntil((async () => {
        const chaves = await caches.keys();
        await Promise.all(chaves.filter(c => c.startsWith(PREFIXO) && c !== NOME_CACHE).map(c => caches.delete(c)));
        await self.clients.claim();
        const paginas = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
        paginas.forEach(p => p.postMessage({ tipo: "versao-ativa", versao: VERSAO }));
    })());
});

// páginas antigas do app pedem assim para o worker novo assumir
self.addEventListener("message", evento => {
    if (evento.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("fetch", evento => {
    const pedido = evento.request;
    if (pedido.method !== "GET") return;
    const url = new URL(pedido.url);
    if (url.origin !== self.location.origin) return;
    evento.respondWith(responder(evento, pedido));
});

async function responder(evento, pedido) {
    const cache = await caches.open(NOME_CACHE);

    // a internet continua tentando mesmo depois do prazo, para atualizar a cópia guardada
    const rede = fetch(pedido.url, { cache: "no-cache", credentials: "same-origin" }).then(async resposta => {
        if (resposta.ok) await cache.put(pedido, resposta.clone());
        return resposta;
    });
    rede.catch(() => { /* sem internet: tratado abaixo */ });
    evento.waitUntil(rede.then(() => {}, () => {}));

    const prazo = new Promise(resolver => setTimeout(() => resolver(null), PRAZO_REDE_MS));
    try {
        const resposta = await Promise.race([rede, prazo]);
        if (resposta) return resposta;
    } catch (erro) {
        // sem internet: usa a cópia
    }

    const guardado = await cache.match(pedido, { ignoreSearch: pedido.mode === "navigate" })
        || (pedido.mode === "navigate" ? await cache.match("index.html") : undefined);
    if (guardado) return guardado;
    return rede; // nada guardado: espera a internet até o fim
}

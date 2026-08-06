// ======================================
// Viveiro Café
// Service Worker
// Funcionamento offline
// ======================================

const CACHE_NAME = "viveiro-cafe-v7";

const ARQUIVOS = [
    "./",
    "./index.html",
    "./style.css",
    "./app.js",
    "./manifest.json"
];

// Instalação
self.addEventListener("install", evento => {
    self.skipWaiting(); // não espera todas as abas fecharem — assume o controle assim que possível
    evento.waitUntil(
        caches.open(CACHE_NAME)
        .then(cache => cache.addAll(ARQUIVOS))
    );
});

// Abrir arquivos: tenta a internet primeiro (pega sempre a versão mais nova).
// Só usa a cópia guardada se estiver sem sinal.
self.addEventListener("fetch", evento => {
    const url = evento.request.url;
    if (url.includes("googleapis.com") ||
        url.includes("firebaseio.com") ||
        url.includes("firebasestorage") ||
        url.includes("gstatic.com") ||
        url.includes("jsdelivr.net") ||
        url.includes("google.com")) {
        return;
    }

    evento.respondWith(
        fetch(evento.request)
            .then(resposta => {
                const copia = resposta.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(evento.request, copia));
                return resposta;
            })
            .catch(() => caches.match(evento.request))
    );
});

// Atualização do aplicativo
self.addEventListener("activate", evento => {
    evento.waitUntil(
        caches.keys()
        .then(chaves => Promise.all(
            chaves.map(chave => {
                if (chave !== CACHE_NAME) {
                    return caches.delete(chave);
                }
            })
        )).then(() => self.clients.claim())
    );
});

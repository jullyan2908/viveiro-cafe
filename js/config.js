// ======================================
// Viveiro Café — configurações
// Tudo que você pode querer ajustar fica aqui, num lugar só.
// ======================================

// Firebase (a chave é pública por natureza: quem protege os dados são as
// regras do Firestore — veja firestore.rules e o LEIA-ME.md)
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDxWnb382E4J1EPZ-Es9O4ytwceKgWEGMw",
    authDomain: "viveiro-cafe-pedro.firebaseapp.com",
    projectId: "viveiro-cafe-pedro",
    storageBucket: "viveiro-cafe-pedro.firebasestorage.app",
    messagingSenderId: "1008798649663",
    appId: "1:1008798649663:web:98e9ce0914fd4eb378178a"
};

// Cloudinary — guarda só o PDF do contrato de cada cliente (opcional)
export const CLOUDINARY = {
    nuvem: "tbic6pyg",
    preset: "viveiro-cafe",
    limiteBytes: 8 * 1024 * 1024 // 8 MB
};

// Mostra o botão "Criar conta" na tela de entrada?
// Deixe false depois de criar sua conta. Atenção: esconder o botão não bloqueia
// ninguém — para impedir cadastros de verdade, siga o passo 3 do LEIA-ME.md.
export const PERMITIR_CRIAR_CONTA = false;

// Estoque mínimo usado quando a variedade não tem um mínimo próprio
export const MINIMO_PADRAO = 100;

// Quantos dias um item excluído fica na lixeira antes de sumir de vez
export const DIAS_LIXEIRA = 30;

// Depois de quantos dias sem backup o painel avisa
export const DIAS_ALERTA_BACKUP = 14;

export const NOME_APP = "Viveiro Café";

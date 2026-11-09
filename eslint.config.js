import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["client/js/mock.js", "docs/**", "node_modules/**"],
  },
  {
    files: ["client/js/**/*.js", "client/sw.js", "scripts/**/*.mjs", "tools/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        self: "readonly",
        caches: "readonly",
        clients: "readonly",
        indexedDB: "readonly",
        IDBKeyRange: "readonly",
        crypto: "readonly",
        RTCPeerConnection: "readonly",
        RTCDataChannel: "readonly",
        BroadcastChannel: "readonly",
        navigator: "readonly",
        location: "readonly",
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        structuredClone: "readonly",
        btoa: "readonly",
        atob: "readonly",
        Blob: "readonly",
        FileReader: "readonly",
        FormData: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
        HTMLElement: "readonly",
        MutationObserver: "readonly",
        Notification: "readonly",
        ServiceWorkerRegistration: "readonly",
      },
    },
    rules: {
      // Limites do docs/HARDENING.md. No client/ são ERRO e quebram o CI (o código já está limpo).
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "max-lines-per-function": ["error", { max: 30, skipComments: true, skipBlankLines: true }],
      // 18 funções do client passam de 5 parâmetros (09/11): aviso até virarem objeto de opções.
      "max-params": ["warn", 5],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // scripts/ e tools/: mesmos limites como aviso até a dívida medida em 09/11 ser paga.
    files: ["scripts/**/*.mjs", "tools/**/*.mjs"],
    rules: {
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "max-lines-per-function": ["warn", { max: 30, skipComments: true, skipBlankLines: true }],
      "max-params": ["warn", 5],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

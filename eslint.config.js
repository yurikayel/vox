import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["client/js/mock.js", "docs/**", "node_modules/**"],
  },
  {
    files: ["client/js/**/*.js", "client/sw.js", "scripts/**/*.mjs", "tools/**/*.mjs", "tools/media-bench/**/*.js"],
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
      // Dívida zerada em 09/11 (17 funções viraram objeto de opções; 1 parâmetro morto removido): promovida a erro.
      "max-params": ["error", 5],
      // Perfil v3.2: arquivo de produção > 350 linhas (sem comentários e brancas) é aviso legado.
      "max-lines": ["warn", { max: 350, skipComments: true, skipBlankLines: true }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Testes: até 45 linhas por caso de teste (o callback de test/it), como aviso legado.
    files: ["tests/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.node, ...globals.browser } },
    rules: {
      "max-lines-per-function": ["warn", { max: 45, skipComments: true, skipBlankLines: true }],
      "max-depth": ["warn", 4],
      complexity: ["warn", 15],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // scripts/ e tools/: mesmos limites como aviso até a dívida medida em 09/11 ser paga.
    files: ["scripts/**/*.mjs", "tools/**/*.mjs", "tools/media-bench/**/*.js"],
    rules: {
      complexity: ["warn", 15],
      "max-depth": ["warn", 4],
      "max-lines-per-function": ["warn", { max: 30, skipComments: true, skipBlankLines: true }],
      "max-params": ["warn", 5],
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];

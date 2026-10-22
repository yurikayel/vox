/**
 * Setup de ambiente e mocks globais para execução dos testes unitários em Node.js.
 */

class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

class MockBroadcastChannel {
  static channels = new Map();

  constructor(name) {
    this.name = name;
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, new Set());
    }
    MockBroadcastChannel.channels.get(name).add(this);
    this.onmessage = null;
  }

  postMessage(data) {
    const set = MockBroadcastChannel.channels.get(this.name);
    if (set) {
      for (const ch of set) {
        if (ch !== this && typeof ch.onmessage === "function") {
          ch.onmessage({ data });
        }
      }
    }
  }

  close() {
    const set = MockBroadcastChannel.channels.get(this.name);
    if (set) set.delete(this);
  }
}

export class MockIndexedDBStore {
  constructor() {
    this.map = new Map();
  }
  get(key) {
    const req = { onsuccess: null, onerror: null, result: this.map.get(key) || null };
    queueMicrotask(() => req.onsuccess && req.onsuccess());
    return req;
  }
  put(entry) {
    this.map.set(entry.id, entry);
    const req = { onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess());
    return req;
  }
  getAll() {
    const req = { onsuccess: null, onerror: null, result: Array.from(this.map.values()) };
    queueMicrotask(() => req.onsuccess && req.onsuccess());
    return req;
  }
  clear() {
    this.map.clear();
    const req = { onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess());
    return req;
  }
  delete(key) {
    this.map.delete(key);
    const req = { onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess && req.onsuccess());
    return req;
  }
  createIndex() {}
  index() {
    return this;
  }
}

export const mockStores = new Map();

export const mockDB = {
  objectStoreNames: {
    contains: (name) => mockStores.has(name),
  },
  createObjectStore: (name) => {
    const s = new MockIndexedDBStore();
    mockStores.set(name, s);
    return s;
  },
  transaction: (storeName) => {
    if (!mockStores.has(storeName)) {
      mockStores.set(storeName, new MockIndexedDBStore());
    }
    const store = mockStores.get(storeName);
    const tx = {
      objectStore: () => store,
      oncomplete: null,
      onerror: null,
    };
    queueMicrotask(() => tx.oncomplete && tx.oncomplete());
    return tx;
  },
};

export function setupBrowserGlobals() {
  if (!globalThis.localStorage) {
    globalThis.localStorage = new MockLocalStorage();
  }
  if (!globalThis.window) {
    globalThis.window = globalThis;
  }
  globalThis.BroadcastChannel = MockBroadcastChannel;
  if (!globalThis.navigator) {
    globalThis.navigator = {
      connection: { type: "wifi", saveData: false },
    };
  }
  if (!globalThis.location) {
    globalThis.location = { hash: "#/" };
  }
  if (!globalThis.window.indexedDB) {
    globalThis.window.indexedDB = {
      open: () => {
        const req = {
          onsuccess: null,
          onerror: null,
          onupgradeneeded: null,
          result: mockDB,
        };
        queueMicrotask(() => {
          if (req.onupgradeneeded) {
            req.onupgradeneeded({ target: { result: mockDB } });
          }
          if (req.onsuccess) req.onsuccess({ target: { result: mockDB } });
        });
        return req;
      },
    };
  }
}

process.env.NODE_ENV = "test";
setupBrowserGlobals();

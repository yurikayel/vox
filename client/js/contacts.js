/** Agenda local de contatos (V-DIS-12). */

const STORAGE_KEY = "vox-contacts-v1";

function loadRaw() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRaw(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function listContacts() {
  return loadRaw().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export function addContact(routeId, label = "") {
  const id = String(routeId || "").trim();
  if (!id) return false;
  const list = loadRaw().filter((c) => c.routeId !== id);
  list.unshift({ routeId: id, label: String(label || "").trim(), addedAt: Date.now() });
  saveRaw(list);
  return true;
}

export function removeContact(routeId) {
  const id = String(routeId || "").trim();
  saveRaw(loadRaw().filter((c) => c.routeId !== id));
}

export function hasContact(routeId) {
  return loadRaw().some((c) => c.routeId === routeId);
}

export function __resetContactsForTests() {
  localStorage.removeItem(STORAGE_KEY);
}

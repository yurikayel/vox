/** LT-10 — voltagem por frase, backup e guardiões (ver `login-roundtrip-harness.js`). */
import test from "node:test";
import "./setup.js";
import { COVERED_KEYS, ensureSessionStorage, registerLt10Tests } from "./login-roundtrip-harness.js";

ensureSessionStorage();
registerLt10Tests(test, COVERED_KEYS);
/** LT-10 — voltagem por cofre, kit e link sync (ver `login-roundtrip-harness.js`). */
import test from "node:test";
import "./setup.js";
import { COVERED_VAULT, registerLt10Tests } from "./login-roundtrip-harness.js";

registerLt10Tests(test, COVERED_VAULT);
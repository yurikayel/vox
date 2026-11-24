/** Pessoa de teste com chave própria, assinando como o `signPayload` do app. */
import { computeRouteId } from "../client/js/identity/local-account.js";
import { canonicalString, withSigv } from "../client/js/sig-format.js";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export async function person() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const routeId = await computeRouteId(pubKey);
  const sign = async (payload) => {
    const base = { ...payload, author: routeId };
    const body = payload.sigv === undefined ? withSigv(base) : base;
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(canonicalString(body)));
    return { ...body, pubKey, sig: b64url(sig) };
  };
  return { routeId, sign };
}

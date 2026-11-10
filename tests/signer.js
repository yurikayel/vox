/** Pessoa de teste com chave própria, assinando como o `signPayload` do app. */
import { computeRouteId } from "../client/js/local-account.js";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const canonical = ({ sig: _s, pubKey: _p, ...rest }) => JSON.stringify(rest, Object.keys(rest).sort());

export async function person() {
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pubKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
  const routeId = await computeRouteId(pubKey);
  const sign = async (payload) => {
    const body = { ...payload, author: routeId };
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(canonical(body)));
    return { ...body, pubKey, sig: b64url(sig) };
  };
  return { routeId, sign };
}

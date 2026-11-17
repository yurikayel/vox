/**
 * @file Demo do lab `#/labs/frames`: petição fictícia que conversa com o host por postMessage (`of:ready`,
 * `of:resize`, `of:action`). Em arquivo próprio porque a CSP publicada (`_headers`) não deixa rodar script inline.
 */
let n = 0;
const post = (type, payload) => parent.postMessage({ type, payload }, "*");
post("of:ready", { frameId: "demo-petition" });
document.getElementById("sign").onclick = () => {
  n += 1;
  document.getElementById("n").textContent = String(n);
  post("of:action", { action: "sign", value: n });
  post("of:resize", { height: document.body.scrollHeight + 8 });
};
post("of:resize", { height: document.body.scrollHeight + 8 });

import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as airgap from "../client/js/airgap-webrtc.js";

class MockDataChannel {
  constructor(name) {
    this.name = name;
    this.readyState = "open";
  }
}

class MockRTCPeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.iceGatheringState = "complete";
    this.channels = [];
  }

  createDataChannel(name) {
    const dc = new MockDataChannel(name);
    this.channels.push(dc);
    return dc;
  }

  async createOffer() {
    return {
      type: "offer",
      sdp: "v=0\r\no=- 1234 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=extmap:1 urn:extra\r\nm=application 9 DTLS/SCTP 5000\r\na=mid:0\r\na=sctp-port:5000\r\na=ice-ufrag:testufrag\r\na=ice-pwd:testpwd\r\na=fingerprint:sha-256 00:11:22\r\n",
    };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }

  async createAnswer() {
    return {
      type: "answer",
      sdp: "v=0\r\no=- 5678 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=application 9 DTLS/SCTP 5000\r\na=mid:0\r\na=sctp-port:5000\r\na=ice-ufrag:ans_ufrag\r\na=ice-pwd:ans_pwd\r\na=fingerprint:sha-256 33:44:55\r\n",
    };
  }
}

test("airgap-webrtc - cleanSdp remove linhas de extmap e mantém sctp e ice", () => {
  const dirtySdp = "v=0\r\na=extmap:1 http://example.com\r\na=sctp-port:5000\r\na=mid:data\r\n";
  const cleaned = airgap.cleanSdp(dirtySdp);

  assert.ok(cleaned.includes("v=0"));
  assert.ok(cleaned.includes("a=sctp-port:5000"));
  assert.ok(cleaned.includes("a=mid:data"));
  assert.ok(!cleaned.includes("a=extmap"));
});

test("airgap-webrtc - encode e decode de envelope de SDP", () => {
  const rawSdp = "v=0\r\nm=application 9 DTLS/SCTP 5000\r\na=ice-ufrag:foo\r\n";
  const encoded = airgap.encodeSdpEnvelope("offer", rawSdp, "addr_alice");

  const decoded = airgap.decodeSdpEnvelope(encoded);
  assert.equal(decoded.valid, true);
  assert.equal(decoded.type, "offer");
  assert.equal(decoded.peerAddress, "addr_alice");
  assert.ok(decoded.sdp.includes("a=ice-ufrag:foo"));
});

test("airgap-webrtc - fluxo completo de handshake de 3 passos sem servidor", async () => {
  const pcAlice = new MockRTCPeerConnection();
  const pcBob = new MockRTCPeerConnection();

  // 1. Alice cria oferta óptica
  const { envelope: offerEnvelope, dataChannel } = await airgap.createAirgapOffer(pcAlice, "addr_alice");
  assert.ok(offerEnvelope.length > 0);
  assert.equal(dataChannel.name, airgap.AIRGAP_CHANNEL_NAME);

  // 2. Bob lê a oferta de Alice e gera a resposta óptica
  const { envelope: answerEnvelope, offerPeerAddress } = await airgap.createAirgapAnswer(pcBob, offerEnvelope, "addr_bob");
  assert.equal(offerPeerAddress, "addr_alice");
  assert.ok(answerEnvelope.length > 0);

  // 3. Alice lê a resposta de Bob e conclui o pareamento
  const result = await airgap.completeAirgapHandshake(pcAlice, answerEnvelope);
  assert.equal(result.success, true);
  assert.equal(result.answerPeerAddress, "addr_bob");

  assert.ok(pcAlice.remoteDescription);
  assert.equal(pcAlice.remoteDescription.type, "answer");
  assert.ok(pcBob.remoteDescription);
  assert.equal(pcBob.remoteDescription.type, "offer");
});

test("airgap-webrtc - decodeSdpEnvelope rejeita envelopes corrompidos", () => {
  assert.equal(airgap.decodeSdpEnvelope("").valid, false);
  assert.equal(airgap.decodeSdpEnvelope("string_nao_json").valid, false);
  assert.equal(airgap.decodeSdpEnvelope(JSON.stringify({ v: 2 })).valid, false);
});

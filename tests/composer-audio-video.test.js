import "../tests/setup.js";
import test from "node:test";
import assert from "node:assert/strict";
import * as composerMedia from "../client/js/composer-media.js";
import * as renderFeed from "../client/js/render/feed.js";
import * as renderTopic from "../client/js/render/topic.js";

test("composer-media - validateComposerAudioFile valida formatos e tamanhos de audio", () => {
  assert.equal(composerMedia.validateComposerAudioFile(null).ok, false);
  assert.equal(composerMedia.validateComposerAudioFile({ type: "image/png", size: 1000 }).ok, false);
  assert.equal(composerMedia.validateComposerAudioFile({ type: "audio/mpeg", size: 0 }).ok, false);
  assert.equal(composerMedia.validateComposerAudioFile({ type: "audio/mpeg", size: 20 * 1024 * 1024 }).ok, false);
  assert.equal(composerMedia.validateComposerAudioFile({ type: "audio/mpeg", size: 50 * 1024 }).ok, true);
  assert.equal(composerMedia.validateComposerAudioFile({ type: "audio/webm", size: 80 * 1024 }).ok, true);
  assert.equal(composerMedia.validateComposerAudioFile({ type: "audio/ogg", size: 90 * 1024 }).ok, true);
});

test("composer-media - validateComposerVideoFile valida formatos e tamanhos de video", () => {
  assert.equal(composerMedia.validateComposerVideoFile(null).ok, false);
  assert.equal(composerMedia.validateComposerVideoFile({ type: "text/plain", size: 1000 }).ok, false);
  assert.equal(composerMedia.validateComposerVideoFile({ type: "video/mp4", size: 0 }).ok, false);
  assert.equal(composerMedia.validateComposerVideoFile({ type: "video/mp4", size: 30 * 1024 * 1024 }).ok, false);
  assert.equal(composerMedia.validateComposerVideoFile({ type: "video/mp4", size: 500 * 1024 }).ok, true);
  assert.equal(composerMedia.validateComposerVideoFile({ type: "video/webm", size: 900 * 1024 }).ok, true);
});

test("feed - renderPostItem renderiza audio e video nativos quando presentes no post", () => {
  const audioPost = {
    id: "top_audio_1",
    author: "vx_autor_audio",
    body: "Mensagem com áudio de voz",
    audio: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQ8=",
    ts: Date.now(),
  };

  const videoPost = {
    id: "top_video_1",
    author: "vx_autor_video",
    body: "Mensagem com micro-vídeo de 2s",
    video: "data:video/webm;base64,GkXfo59ChoEBQveBAULygQ8=",
    ts: Date.now(),
  };

  const audioHtml = renderFeed.renderPostItem(audioPost);
  assert.ok(audioHtml.includes("post-media-audio"));
  assert.ok(audioHtml.includes("<audio"));

  const videoHtml = renderFeed.renderPostItem(videoPost);
  assert.ok(videoHtml.includes("post-media-video"));
  assert.ok(videoHtml.includes("<video"));
});

test("topic - renderTopic renderiza player de video e player de audio", () => {
  const main = { innerHTML: "" };
  renderTopic.renderTopic(main, "top_v1", {
    id: "top_v1",
    title: "Video Post",
    body: "Corpo do post de video",
    video: "data:video/mp4;base64,AAAA",
  }, []);

  assert.ok(main.innerHTML.includes("<video"));
  assert.ok(main.innerHTML.includes("post-media-video"));

  renderTopic.renderTopic(main, "top_a1", {
    id: "top_a1",
    title: "Audio Post",
    body: "Corpo do post de audio",
    audio: "data:audio/mp3;base64,AAAA",
  }, []);

  assert.ok(main.innerHTML.includes("<audio"));
  assert.ok(main.innerHTML.includes("post-media-audio"));
});

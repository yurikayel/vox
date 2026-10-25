/** @file Vox client entry — boot and route wiring. */
import { initSkyTheme } from "./sky-theme.js";
import * as demoSeed from "./demo-seed.js";
import { wireRoute, setupHashchangeListener, routeImpl as route } from "./app/route.js";
import { initDmListeners, initGossipListeners, initSocialInteractions } from "./app/init.js";
import { initPostMediaLightbox } from "./app/post-media-lightbox.js";
import { attachPostMoreMenuHandlers } from "./render/post-more-menu.js";
import { attachPosseSheetHandlers } from "./posse-dispatch.js";
import { attachPostOverlayActionMenuHandlers } from "./app/screens-home.js";
import { syncIdentity } from "./app/screens-network.js";

initSkyTheme();
wireRoute();
setupHashchangeListener();
initDmListeners();
initGossipListeners();
initSocialInteractions();
initPostMediaLightbox();
attachPostMoreMenuHandlers();
attachPosseSheetHandlers();
attachPostOverlayActionMenuHandlers();
syncIdentity();
demoSeed.ensureDemoSeed().finally(() => route());

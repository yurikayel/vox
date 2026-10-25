/** @file Vox client entry — boot and route wiring. */
import * as demoSeed from "./demo-seed.js";
import { wireRoute, setupHashchangeListener, routeImpl as route } from "./app/route.js";
import { initDmListeners, initGossipListeners, initSocialInteractions } from "./app/init.js";
import { syncIdentity } from "./app/screens-network.js";

wireRoute();
setupHashchangeListener();
initDmListeners();
initGossipListeners();
initSocialInteractions();
syncIdentity();
demoSeed.ensureDemoSeed().finally(() => route());

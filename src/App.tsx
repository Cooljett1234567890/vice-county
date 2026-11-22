import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { ActionError, useAction, useActor } from "@/lib/actors";
import type { GameSave } from "../backend/actors";
import { useTranslations } from "@/translations";

type CarKind = "sedan" | "coupe" | "boat" | "bike";
type Building = { x: number; y: number; w: number; h: number; tone: number; id: number; name?: string; kind?: string };
type Place = { id: string; key: "safehouse" | "cornerShop" | "clothingShop" | "garage" | "diner" | "club" | "marina" | "property"; x: number; y: number; w: number; h: number; doorX: number; doorY: number; kind: string };
type Car = { x: number; y: number; angle: number; speed: number; kind: CarKind; color: string; owned: boolean; route: "parked" | "horizontal" | "vertical"; direction: number; damage: number };
type Ped = { x: number; y: number; tx: number; ty: number; speed: number; shirt: string; pants: string; phase: number; panic: number };
type Stage = { x: number; y: number; key: "objectiveMeet" | "objectiveNight" | "objectivePatrol" | "objectiveHarbor" | "objectiveYard" | "objectiveHome" | "objectiveCounty" | "objectiveEscape"; escape?: boolean };
type Mission = { title: "mission1" | "mission2" | "mission3" | "mission4" | "mission5"; desc: "mission1Desc" | "mission2Desc" | "mission3Desc" | "mission4Desc" | "mission5Desc"; payout: number; stages: Stage[] };
type Game = { x: number; y: number; vx: number; vy: number; angle: number; health: number; cash: number; bank: number; reputation: number; mission: number; stage: number; active: boolean; lead: number; heat: number; heatClock: number; escapeClock: number; clock: number; elapsed: number; rain: boolean; cars: Car[]; carIndex: number | null; peds: Ped[]; cops: Car[]; buildings: Building[]; smokeClouds: { x: number; y: number; age: number }[]; snacks: number; smoke: number; ownsCar: boolean; ownsProperty: boolean; ownsClothes: boolean; outfit: number; propertyIncome: number; anim: number; message: string; messageTime: number; aimX: number; aimY: number };
type View = { paused: boolean; map: boolean; bag: boolean; interior: string | null };
type TKey = Parameters<ReturnType<typeof useTranslations>["t"]>[0];
type Translate = (key: TKey) => string;

const WORLD_W = 3200;
const WORLD_H = 2400;
const PLACES: Place[] = [
  { id: "safehouse", key: "safehouse", x: 110, y: 80, w: 154, h: 122, doorX: 187, doorY: 218, kind: "safehouse" },
  { id: "shop", key: "cornerShop", x: 510, y: 380, w: 160, h: 124, doorX: 590, doorY: 520, kind: "shop" },
  { id: "clothing", key: "clothingShop", x: 1310, y: 80, w: 168, h: 126, doorX: 1394, doorY: 224, kind: "clothing" },
  { id: "garage", key: "garage", x: 510, y: 980, w: 180, h: 136, doorX: 600, doorY: 1130, kind: "garage" },
  { id: "diner", key: "diner", x: 1710, y: 680, w: 176, h: 130, doorX: 1798, doorY: 824, kind: "diner" },
  { id: "club", key: "club", x: 2110, y: 80, w: 194, h: 134, doorX: 2206, doorY: 228, kind: "club" },
  { id: "marina", key: "marina", x: 2510, y: 1280, w: 180, h: 128, doorX: 2600, doorY: 1420, kind: "marina" },
  { id: "property", key: "property", x: 910, y: 1880, w: 166, h: 122, doorX: 993, doorY: 2015, kind: "property" },
];
const MISSIONS: Mission[] = [
  { title: "mission1", desc: "mission1Desc", payout: 450, stages: [{ x: 960, y: 560, key: "objectiveMeet" }] },
  { title: "mission2", desc: "mission2Desc", payout: 780, stages: [{ x: 1810, y: 560, key: "objectiveNight" }, { x: 700, y: 250, key: "objectiveEscape", escape: true }] },
  { title: "mission3", desc: "mission3Desc", payout: 920, stages: [{ x: 2640, y: 1360, key: "objectiveHarbor" }] },
  { title: "mission4", desc: "mission4Desc", payout: 1250, stages: [{ x: 2700, y: 1780, key: "objectiveYard" }, { x: 190, y: 250, key: "objectiveHome" }] },
  { title: "mission5", desc: "mission5Desc", payout: 2200, stages: [{ x: 2940, y: 1600, key: "objectiveCounty" }, { x: 700, y: 250, key: "objectiveEscape", escape: true }] },
];
const artCache: Record<string, string> = {};
function artColor(name: string) {
  if (artCache[name]) return artCache[name];
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--art-${name}`).trim();
  artCache[name] = value || "black";
  return artCache[name];
}
const CAR_COLORS = [artColor("e6b56c"), artColor("e47b69"), artColor("8ca9ba"), artColor("68a8a0"), artColor("a98bb2"), artColor("d2d3bd")];
const SHIRTS = [artColor("ee9a78"), artColor("6aa8a6"), artColor("d2c178"), artColor("8e83ae"), artColor("e3e1cf"), artColor("d57970"), artColor("65a16e")];
const PANTS = [artColor("303d4d"), artColor("525365"), artColor("735a4d"), artColor("313b37")];
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

function blocked(x: number, y: number, buildings: Building[]) {
  if (x < 24 || y < 24 || x > WORLD_W - 24 || y > WORLD_H - 24) return true;
  if (x > 3040 && y < 1700) return true;
  if (x > 2820 && y > 1970) return true;
  return buildings.some((b) => x > b.x - 12 && x < b.x + b.w + 12 && y > b.y - 12 && y < b.y + b.h + 12);
}
function nearestPlace(g: Game) {
  let found: Place | null = null; let best = 72;
  for (const p of PLACES) { const d = Math.hypot(g.x - p.doorX, g.y - p.doorY); if (d < best) { found = p; best = d; } }
  return found;
}
function makeGame(): Game {
  const buildings: Building[] = [];
  let id = 0;
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    if (PLACES.some((p) => Math.floor(p.x / 400) === col && Math.floor(p.y / 300) === row)) continue;
    const n = row * 8 + col;
    const x = col * 400 + 92 + hash(n + 11) * 55;
    const y = row * 300 + 72 + hash(n + 47) * 42;
    const w = 132 + hash(n + 83) * 72;
    const h = 104 + hash(n + 121) * 61;
    buildings.push({ x, y, w, h, tone: Math.floor(hash(n + 17) * 6), id: id++ });
    if (hash(n + 201) > 0.53) buildings.push({ x: x + 215, y: y + 38, w: 96, h: 92, tone: Math.floor(hash(n + 29) * 6), id: id++ });
  }
  for (const p of PLACES) buildings.push({ x: p.x, y: p.y, w: p.w, h: p.h, tone: p.kind === "club" ? 5 : p.kind === "shop" ? 3 : p.kind === "diner" ? 4 : p.kind === "marina" ? 2 : 1, id: id++, name: p.key, kind: p.kind });
  const cars: Car[] = [];
  for (let i = 0; i < 13; i++) {
    const horizontal = i % 2 === 0;
    const kind: CarKind = i === 9 ? "bike" : i === 11 ? "boat" : i % 4 === 1 ? "coupe" : "sedan";
    const x = horizontal ? 120 + hash(i + 15) * 2860 : 210 + Math.floor(hash(i + 21) * 7) * 400;
    const y = horizontal ? 150 + Math.floor(hash(i + 12) * 7) * 300 : 160 + hash(i + 91) * 2040;
    cars.push({ x, y, angle: horizontal ? 0 : Math.PI / 2, speed: 0, kind, color: CAR_COLORS[i % CAR_COLORS.length], owned: false, route: i < 8 ? horizontal ? "horizontal" : "vertical" : "parked", direction: hash(i + 5) > 0.5 ? 1 : -1, damage: 0 });
  }
  cars.push({ x: 2680, y: 1430, angle: 0, speed: 0, kind: "boat", color: artColor("70aeb0"), owned: false, route: "parked", direction: 1, damage: 0 });
  const peds: Ped[] = [];
  for (let i = 0; i < 36; i++) {
    const x = 70 + hash(i + 280) * 2920; const y = 55 + hash(i + 380) * 2240;
    peds.push({ x, y, tx: x + (hash(i + 480) - 0.5) * 230, ty: y + (hash(i + 580) - 0.5) * 190, speed: 19 + hash(i + 22) * 19, shirt: SHIRTS[i % SHIRTS.length], pants: PANTS[i % PANTS.length], phase: hash(i + 600) * 9, panic: 0 });
  }
  return { x: 185, y: 258, vx: 0, vy: 0, angle: -Math.PI / 2, health: 100, cash: 420, bank: 600, reputation: 0, mission: 0, stage: 0, active: false, lead: 0, heat: 0, heatClock: 0, escapeClock: 0, clock: 16.3, elapsed: 0, rain: false, cars, carIndex: null, peds, cops: [], buildings, smokeClouds: [], snacks: 1, smoke: 1, ownsCar: false, ownsProperty: false, ownsClothes: false, outfit: 0, propertyIncome: 0, anim: 0, message: "", messageTime: 0, aimX: 480, aimY: 270 };
}
function applySave(g: Game, s: GameSave) {
  g.x = clamp(s.x, 40, WORLD_W - 40); g.y = clamp(s.y, 40, WORLD_H - 40); g.cash = s.cash; g.bank = s.bank;
  g.mission = s.missionIndex; g.stage = clamp(s.missionStage, 0, Math.max(0, (MISSIONS[g.mission]?.stages.length ?? 1) - 1)); g.active = s.active && g.mission < MISSIONS.length; g.lead = s.character; g.heat = s.heat; g.heatClock = 9; g.health = s.health;
  g.snacks = s.snacks; g.smoke = s.smoke; g.ownsCar = s.ownsCar; g.ownsProperty = s.ownsProperty; g.ownsClothes = s.ownsClothes; g.reputation = s.reputation;
  if (s.ownsCar && !g.cars.some((c) => c.owned)) g.cars.push({ x: 600, y: 1170, angle: -Math.PI / 2, speed: 0, kind: "coupe", color: artColor("e47b69"), owned: true, route: "parked", direction: 1, damage: 0 });
}
function cleanSave(g: Game): GameSave {
  return { x: Math.round(g.x), y: Math.round(g.y), cash: g.cash, bank: g.bank, missionIndex: g.mission, active: g.active, missionStage: g.stage, character: g.lead, heat: g.heat, health: g.health, snacks: g.snacks, smoke: g.smoke, ownsCar: g.ownsCar, ownsProperty: g.ownsProperty, ownsClothes: g.ownsClothes, reputation: g.reputation };
}
function chooseTarget(p: Ped, g: Game) {
  const options = [
    { x: 185, y: 255 }, { x: 590, y: 555 }, { x: 1000, y: 850 }, { x: 1400, y: 525 },
    { x: 1800, y: 850 }, { x: 2200, y: 520 }, { x: 2600, y: 1450 }, { x: 970, y: 2010 },
    { x: 1050, y: 250 }, { x: 1450, y: 1150 }, { x: 2100, y: 1500 }, { x: 2650, y: 1850 },
  ];
  const pick = options[Math.floor(Math.random() * options.length)];
  p.tx = pick.x + (Math.random() - 0.5) * 46; p.ty = pick.y + (Math.random() - 0.5) * 40;
  if (dist(p, g) < 100) { p.tx += 210; p.ty += 140; }
}
function startMission(g: Game, say: (s: TKey) => void) {
  if (g.mission >= MISSIONS.length || g.active) return;
  g.active = true; g.stage = 0; say("jobStarted");
  if (g.mission === 1) { g.heat = 2; g.heatClock = 16; }
  if (g.mission === 4) { g.heat = 4; g.heatClock = 22; }
}
function stepGame(g: Game, dt: number, keys: Set<string>, say: (s: TKey) => void) {
  g.elapsed += dt; g.clock = (g.clock + dt * 0.095) % 24; g.anim += dt * 11;
  g.messageTime = Math.max(0, g.messageTime - dt);
  g.rain = (Math.floor(g.elapsed / 95) % 3 === 1) && (g.clock > 16 || g.clock < 5);
  const car = g.carIndex === null ? null : g.cars[g.carIndex];
  if (car) {
    const spec = car.kind === "coupe" ? { accel: 310, max: 410, turn: 2.45 } : car.kind === "boat" ? { accel: 165, max: 265, turn: 1.65 } : car.kind === "bike" ? { accel: 235, max: 330, turn: 2.9 } : { accel: 210, max: 290, turn: 1.9 };
    if (keys.has("w")) car.speed += spec.accel * dt;
    if (keys.has("s")) car.speed -= spec.accel * 0.82 * dt;
    car.speed *= Math.pow(0.983, dt * 60); car.speed = clamp(car.speed, -spec.max * 0.32, spec.max);
    const steer = (keys.has("a") ? -1 : 0) + (keys.has("d") ? 1 : 0);
    car.angle += steer * spec.turn * dt * clamp(Math.abs(car.speed) / 110, 0.22, 1) * (car.speed < 0 ? -1 : 1);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt; const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (blocked(nx, ny, g.buildings)) { car.speed *= -0.22; car.damage = Math.min(100, car.damage + Math.abs(car.speed) * 0.012); g.health = Math.max(1, g.health - 0.25); }
    else { car.x = nx; car.y = ny; }
    g.x = car.x; g.y = car.y; g.angle = car.angle;
  } else {
    let dx = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0); let dy = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0);
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const sprint = keys.has("shift") ? 1.55 : 1;
    const speed = (g.lead === 0 ? 150 : 136) * sprint;
    if (dx || dy) { g.angle = Math.atan2(dy, dx); g.anim += dt * 8; }
    const nx = g.x + dx * speed * dt; if (!blocked(nx, g.y, g.buildings)) g.x = nx;
    const ny = g.y + dy * speed * dt; if (!blocked(g.x, ny, g.buildings)) g.y = ny;
  }
  for (let i = 0; i < g.cars.length; i++) {
    const c = g.cars[i]; if (i === g.carIndex || c.route === "parked") continue;
    if (c.route === "horizontal") { c.x += c.direction * (c.kind === "bike" ? 104 : 70) * dt; if (c.x < 52 || c.x > WORLD_W - 52) c.direction *= -1; }
    else { c.y += c.direction * 62 * dt; if (c.y < 48 || c.y > WORLD_H - 48) c.direction *= -1; }
  }
  for (const p of g.peds) {
    const danger = g.heat > 0 && dist(p, g) < 290;
    if (danger) p.panic = Math.min(4, p.panic + dt); else p.panic = Math.max(0, p.panic - dt * 2);
    if (p.panic > 0.3) { const a = Math.atan2(p.y - g.y, p.x - g.x); p.tx = p.x + Math.cos(a) * 210; p.ty = p.y + Math.sin(a) * 170; }
    const d = Math.hypot(p.tx - p.x, p.ty - p.y);
    if (d < 12 || blocked(p.tx, p.ty, g.buildings)) chooseTarget(p, g);
    else { p.x += ((p.tx - p.x) / d) * p.speed * dt; p.y += ((p.ty - p.y) / d) * p.speed * dt; }
    p.phase += dt * (p.panic ? 14 : 6);
  }
  for (let i = g.smokeClouds.length - 1; i >= 0; i--) { g.smokeClouds[i].age += dt; if (g.smokeClouds[i].age > 8) g.smokeClouds.splice(i, 1); }
  if (g.heat > 0) {
    while (g.cops.length < g.heat) g.cops.push({ x: clamp(g.x + (Math.random() - 0.5) * 700, 60, WORLD_W - 60), y: clamp(g.y - 420 - Math.random() * 260, 60, WORLD_H - 60), angle: Math.PI / 2, speed: 0, kind: "sedan", color: artColor("d7e1d4"), owned: false, route: "parked", direction: 1, damage: 0 });
    for (const cop of g.cops) {
      const a = Math.atan2(g.y - cop.y, g.x - cop.x); cop.angle = a;
      const clouded = g.smokeClouds.some((s) => dist(s, cop) < 210 && s.age < 6);
      cop.speed = clouded ? 28 : 92 + g.heat * 20;
      const nx = cop.x + Math.cos(a) * cop.speed * dt; const ny = cop.y + Math.sin(a) * cop.speed * dt;
      if (!blocked(nx, ny, g.buildings)) { cop.x = nx; cop.y = ny; }
    }
    const seen = g.cops.some((c) => dist(c, g) < 310) && !g.smokeClouds.some((s) => dist(s, g) < 180 && s.age < 6);
    if (seen) { g.heatClock = Math.max(g.heatClock, 4); g.escapeClock = 0; }
    else { g.heatClock -= dt; g.escapeClock += dt; }
    if (g.heatClock <= 0 && g.escapeClock > 5) { g.heat = Math.max(0, g.heat - 1); g.heatClock = 10; g.escapeClock = 0; if (g.heat === 0) { g.cops = []; say("wantedEscaped"); } else g.cops.length = Math.min(g.cops.length, g.heat); }
    for (const c of g.cops) if (dist(c, g) < 32 && !car) { g.health -= dt * 7; }
    if (g.health <= 0) { g.health = 100; g.x = 185; g.y = 258; g.heat = 0; g.cops = []; g.cash = Math.max(0, g.cash - 80); say("healthLow"); }
  }
  if (g.active && g.mission < MISSIONS.length) {
    const target = MISSIONS[g.mission].stages[g.stage];
    if (target && dist(g, target) < 62 && (!target.escape || g.heat === 0)) {
      g.stage++;
      if (g.stage >= MISSIONS[g.mission].stages.length) {
        const payout = MISSIONS[g.mission].payout; g.cash += payout; g.propertyIncome += g.ownsProperty ? 120 : 0; g.reputation += Math.ceil(payout / 10); g.mission++; g.active = false; g.stage = 0; say("missionComplete");
      } else say("waypointReached");
    }
  }
}
function drawBuilding(ctx: CanvasRenderingContext2D, b: Building, camX: number, camY: number, t: Translate) {
  const x = Math.round(b.x - camX); const y = Math.round(b.y - camY);
  if (x + b.w < -30 || x > 990 || y + b.h < -30 || y > 570) return;
  const roofs = [artColor("647681"), artColor("b36f63"), artColor("777d70"), artColor("64708c"), artColor("a17a5d"), artColor("665e7c")];
  const walls = [artColor("c89a75"), artColor("d5bb8c"), artColor("b87969"), artColor("8e9b86"), artColor("a49ba0"), artColor("775f68")];
  const tone = b.tone % roofs.length;
  ctx.fillStyle = artColor("17252b"); ctx.fillRect(x + 8, y + 9, b.w, b.h);
  ctx.fillStyle = walls[tone]; ctx.fillRect(x, y, b.w, b.h);
  ctx.fillStyle = roofs[tone]; ctx.fillRect(x + 5, y + 4, b.w - 10, b.h - 10);
  ctx.fillStyle = artColor("d8c49b"); ctx.fillRect(x + 4, y + b.h - 11, b.w - 8, 7);
  ctx.fillStyle = artColor("3e5960");
  const cols = Math.max(2, Math.floor((b.w - 26) / 32)); const rows = Math.max(1, Math.floor((b.h - 40) / 28));
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const wx = x + 14 + c * 30; const wy = y + 16 + r * 25;
    ctx.fillStyle = (r + c + b.id) % 3 === 0 ? artColor("efc276") : artColor("6aabb0"); ctx.fillRect(wx, wy, 13, 9);
    ctx.fillStyle = artColor("31474e"); ctx.fillRect(wx + 1, wy + 8, 12, 2);
  }
  ctx.fillStyle = artColor("4e5556"); ctx.fillRect(x + b.w * 0.55, y + b.h * 0.34, 20, 13); ctx.fillRect(x + 17, y + 12, 16, 11);
  ctx.fillStyle = artColor("d9b866"); ctx.fillRect(x + Math.floor(b.w * 0.5) - 5, y + b.h - 18, 12, 14);
  if (b.kind === "club" || b.kind === "shop" || b.kind === "diner" || b.kind === "garage" || b.kind === "marina") {
    const label = b.kind === "club" ? t("signClub") : b.kind === "shop" ? t("signShop") : b.kind === "diner" ? t("signDiner") : b.kind === "garage" ? t("signGarage") : t("signMarina");
    ctx.fillStyle = b.kind === "club" ? artColor("e96d9a") : artColor("f1cc82"); ctx.fillRect(x + 16, y + 5, Math.min(b.w - 32, label.length * 8 + 14), 13);
    ctx.fillStyle = artColor("283542"); ctx.font = "bold 8px monospace"; ctx.fillText(label, x + 21, y + 14);
  }
}
function drawPalm(ctx: CanvasRenderingContext2D, x: number, y: number, camX: number, camY: number, phase: number) {
  const sx = Math.round(x - camX), sy = Math.round(y - camY);
  if (sx < -30 || sx > 990 || sy < -30 || sy > 570) return;
  ctx.fillStyle = artColor("283c3a"); ctx.fillRect(sx - 3, sy - 1, 8, 24);
  ctx.fillStyle = artColor("9b7955"); ctx.fillRect(sx, sy, 5, 25);
  const sway = Math.sin(phase + x) * 2;
  ctx.fillStyle = artColor("377c60"); ctx.fillRect(sx - 17 + sway, sy - 7, 17, 4); ctx.fillRect(sx + 5 + sway, sy - 7, 18, 4);
  ctx.fillStyle = artColor("4f9b6c"); ctx.fillRect(sx - 11, sy - 13, 14, 4); ctx.fillRect(sx + 1, sy - 15, 15, 4);
  ctx.fillStyle = artColor("79ad70"); ctx.fillRect(sx - 2, sy - 18, 5, 13);
}
function drawCar(ctx: CanvasRenderingContext2D, c: Car, camX: number, camY: number, police = false) {
  const x = Math.round(c.x - camX), y = Math.round(c.y - camY);
  if (x < -40 || x > 1000 || y < -40 || y > 580) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(c.angle);
  if (c.kind === "boat") {
    ctx.fillStyle = artColor("263b42"); ctx.fillRect(-18, -8, 42, 18); ctx.fillStyle = police ? artColor("e1e3d2") : c.color; ctx.fillRect(-16, -7, 34, 13);
    ctx.fillStyle = artColor("d5c996"); ctx.fillRect(-7, -5, 14, 9); ctx.fillStyle = artColor("6cabb0"); ctx.fillRect(9, -4, 7, 7);
  } else if (c.kind === "bike") {
    ctx.fillStyle = artColor("222c35"); ctx.fillRect(-14, -7, 28, 14); ctx.fillStyle = police ? artColor("e3e4d7") : c.color; ctx.fillRect(-10, -5, 20, 10); ctx.fillStyle = artColor("282c31"); ctx.fillRect(-13, -9, 6, 18); ctx.fillRect(8, -9, 6, 18); ctx.fillStyle = artColor("f2d89a"); ctx.fillRect(9, -3, 5, 6);
  } else {
    ctx.fillStyle = artColor("202c35"); ctx.fillRect(-21, -12, 43, 26);
    ctx.fillStyle = police ? artColor("e3e4d7") : c.color; ctx.fillRect(-19, -10, 38, 21);
    ctx.fillStyle = artColor("303943"); ctx.fillRect(-9, -8, 19, 16); ctx.fillStyle = artColor("85b9b6"); ctx.fillRect(-7, -7, 15, 6); ctx.fillRect(-7, 2, 15, 4);
    ctx.fillStyle = artColor("f8e6ae"); ctx.fillRect(16, -8, 4, 5); ctx.fillRect(16, 4, 4, 5);
    ctx.fillStyle = artColor("20252b"); ctx.fillRect(-15, -13, 9, 3); ctx.fillRect(7, -13, 9, 3); ctx.fillRect(-15, 10, 9, 3); ctx.fillRect(7, 10, 9, 3);
    if (police) { ctx.fillStyle = artColor("d75e68"); ctx.fillRect(-2, -13, 7, 3); ctx.fillStyle = artColor("6db0ba"); ctx.fillRect(4, -13, 7, 3); }
  }
  ctx.restore();
}
function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, camX: number, camY: number, shirt: string, pants: string, phase: number, lead = false, outfit = 0) {
  const sx = Math.round(x - camX), sy = Math.round(y - camY); if (sx < -15 || sx > 975 || sy < -18 || sy > 558) return;
  ctx.fillStyle = artColor("26322e"); ctx.fillRect(sx - 5, sy + 7, 12, 5);
  const step = Math.floor(Math.sin(phase) * 2);
  ctx.fillStyle = pants; ctx.fillRect(sx - 4, sy + 3, 4, 8 + step); ctx.fillRect(sx + 1, sy + 3, 4, 8 - step);
  ctx.fillStyle = lead && outfit ? artColor("e3bc69") : shirt; ctx.fillRect(sx - 6, sy - 6, 12, 11);
  ctx.fillStyle = artColor("d89b79"); ctx.fillRect(sx - 4, sy - 12, 9, 7);
  ctx.fillStyle = artColor("3c3033"); ctx.fillRect(sx - 5, sy - 13, 10, 3);
  if (lead) { ctx.fillStyle = artColor("f1d488"); ctx.fillRect(sx + 4, sy - 4, 2, 3); }
}
function drawCity(ctx: CanvasRenderingContext2D, g: Game, t: Translate) {
  const camX = clamp(g.x - 480, 0, WORLD_W - 960); const camY = clamp(g.y - 270, 0, WORLD_H - 540);
  ctx.fillStyle = artColor("748b68"); ctx.fillRect(0, 0, 960, 540);
  for (let row = Math.floor(camY / 48); row < Math.ceil((camY + 540) / 48) + 1; row++) for (let col = Math.floor(camX / 48); col < Math.ceil((camX + 960) / 48) + 1; col++) {
    const x = col * 48 - camX, y = row * 48 - camY;
    ctx.fillStyle = (row + col) % 3 === 0 ? artColor("71886a") : artColor("78906d"); ctx.fillRect(x, y, 48, 48);
    if ((row * 7 + col * 13) % 4 === 0) { ctx.fillStyle = artColor("83946c"); ctx.fillRect(x + 8, y + 12, 3, 4); ctx.fillRect(x + 30, y + 32, 4, 3); }
  }
  if (camX < 3030) { ctx.fillStyle = artColor("397c84"); ctx.fillRect(3040 - camX, 0, 240, 540); }
  if (camY + 540 > 1970) { ctx.fillStyle = artColor("347780"); ctx.fillRect(Math.max(0, 2790 - camX), Math.max(0, 1970 - camY), 420, 540); }
  const wave = Math.floor(g.elapsed * 7) % 24;
  ctx.fillStyle = artColor("62a6a0");
  for (let i = 0; i < 11; i++) { const wx = 3050 - camX + ((i * 43 + wave) % 165); const wy = ((i * 57 + wave * 2) % 525); ctx.fillRect(wx, wy, 14 + i % 3 * 5, 2); }
  for (let x = 0; x < WORLD_W; x += 400) {
    const sx = x - camX; if (sx < -60 || sx > 1000) continue;
    ctx.fillStyle = artColor("b2a987"); ctx.fillRect(sx - 5, 0, 74, 540); ctx.fillStyle = artColor("363e48"); ctx.fillRect(sx, 0, 62, 540);
    ctx.fillStyle = artColor("e6d9ac"); for (let y = -Math.floor(camY / 42) * 42; y < 560; y += 42) ctx.fillRect(sx + 29, y - camY % 42, 3, 18);
  }
  for (let y = 0; y < WORLD_H; y += 300) {
    const sy = y - camY; if (sy < -60 || sy > 600) continue;
    ctx.fillStyle = artColor("b2a987"); ctx.fillRect(0, sy - 5, 960, 70); ctx.fillStyle = artColor("363e48"); ctx.fillRect(0, sy, 960, 58);
    ctx.fillStyle = artColor("e6d9ac"); for (let x = -Math.floor(camX / 46) * 46; x < 970; x += 46) ctx.fillRect(x - camX % 46, sy + 27, 20, 3);
  }
  for (const b of g.buildings) drawBuilding(ctx, b, camX, camY, t);
  for (let i = 0; i < 52; i++) drawPalm(ctx, 48 + i * 61, 260 + ((i * 193) % 2070), camX, camY, g.elapsed);
  for (const p of g.peds) drawPerson(ctx, p.x, p.y, camX, camY, p.shirt, p.pants, p.phase);
  const target = g.active && g.mission < MISSIONS.length ? MISSIONS[g.mission].stages[g.stage] : null;
  if (target) {
    const tx = target.x - camX, ty = target.y - camY; const pulse = 14 + Math.sin(g.elapsed * 4) * 3;
    ctx.strokeStyle = artColor("ffe18a"); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = artColor("ffe18a"); ctx.fillRect(tx - 4, ty - 4, 8, 8);
  }
  for (const c of g.cars) drawCar(ctx, c, camX, camY);
  for (const c of g.cops) drawCar(ctx, c, camX, camY, true);
  for (const cloud of g.smokeClouds) {
    const sx = cloud.x - camX, sy = cloud.y - camY; const r = 18 + Math.min(cloud.age, 6) * 8;
    ctx.globalAlpha = Math.max(0.08, 0.30 - cloud.age * 0.04); ctx.fillStyle = artColor("d0dccc");
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; ctx.fillRect(sx + Math.cos(a) * r - 9, sy + Math.sin(a) * r - 8, 18, 16); }
    ctx.globalAlpha = 1;
  }
  const activeCar = g.carIndex === null ? null : g.cars[g.carIndex];
  if (!activeCar) drawPerson(ctx, g.x, g.y, camX, camY, g.lead === 0 ? artColor("d77d6e") : artColor("5ba1a0"), artColor("303a48"), g.anim, true, g.ownsClothes ? 1 : 0);
  const day = (Math.cos(((g.clock - 12) / 12) * Math.PI) + 1) / 2;
  const night = 0.31 * (1 - day);
  if (night > 0.015) { ctx.globalAlpha = night; ctx.fillStyle = artColor("0d142d"); ctx.fillRect(0, 0, 960, 540); ctx.globalAlpha = 1; }
  for (let i = 0; i < 10; i++) {
    const x = ((i * 177 + 70) % 3100) - camX; const y = ((i * 213 + 270) % 2100) - camY;
    if (night > 0.12 && x > 0 && x < 960 && y > 0 && y < 540) { ctx.fillStyle = artColor("efd687"); ctx.fillRect(Math.round(x), Math.round(y), 4, 4); ctx.globalAlpha = 0.12; ctx.fillStyle = artColor("f1cb7c"); ctx.fillRect(x - 10, y - 10, 24, 24); ctx.globalAlpha = 1; }
  }
  if (g.rain) {
    ctx.strokeStyle = artColor("c5dadd"); ctx.globalAlpha = 0.48; ctx.lineWidth = 1;
    for (let i = 0; i < 105; i++) { const x = (i * 113 + g.elapsed * 95) % 980; const y = (i * 71 + g.elapsed * 260) % 550; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 11); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  const mx = g.aimX; const my = g.aimY;
  if (mx >= 0 && mx <= 960 && my >= 0 && my <= 540) { ctx.strokeStyle = artColor("f1e4bb"); ctx.lineWidth = 1; ctx.strokeRect(Math.round(mx / 8) * 8 - 3, Math.round(my / 8) * 8 - 3, 6, 6); }
}
function drawInterior(ctx: CanvasRenderingContext2D, id: string, g: Game, t: Translate) {
  ctx.fillStyle = artColor("4e5e58"); ctx.fillRect(0, 0, 960, 540);
  for (let y = 0; y < 540; y += 32) for (let x = 0; x < 960; x += 32) { ctx.fillStyle = ((x / 32 + y / 32) % 2) ? artColor("66766a") : artColor("5d6e62"); ctx.fillRect(x, y, 31, 31); }
  ctx.fillStyle = artColor("baa787"); ctx.fillRect(48, 38, 864, 62); ctx.fillStyle = artColor("26353d"); ctx.fillRect(64, 51, 832, 35);
  const place = PLACES.find((p) => p.id === id); if (place) { ctx.fillStyle = artColor("f0d293"); ctx.font = "bold 18px monospace"; ctx.fillText(t(place.key), 84, 76); }
  ctx.fillStyle = artColor("bd8b68"); ctx.fillRect(106, 151, 190, 68); ctx.fillRect(348, 151, 250, 68); ctx.fillRect(656, 151, 190, 68);
  ctx.fillStyle = artColor("e0c58d"); ctx.fillRect(118, 163, 166, 42); ctx.fillRect(360, 163, 226, 42); ctx.fillRect(668, 163, 166, 42);
  if (id === "garage") {
    ctx.fillStyle = artColor("465660"); ctx.fillRect(175, 300, 610, 120); ctx.fillStyle = artColor("e3bb70"); ctx.fillRect(210, 324, 500, 60);
    drawCar(ctx, { x: 480, y: 354, angle: 0, speed: 0, kind: "coupe", color: artColor("e47b69"), owned: g.ownsCar, route: "parked", direction: 1, damage: 0 }, 0, 0);
  } else if (id === "diner" || id === "club") {
    for (let i = 0; i < 5; i++) { ctx.fillStyle = id === "club" ? artColor("b34f82") : artColor("729c98"); ctx.fillRect(165 + i * 136, 300, 72, 42); ctx.fillStyle = artColor("d4b474"); ctx.fillRect(174 + i * 136, 344, 54, 8); }
    ctx.fillStyle = artColor("27343d"); ctx.fillRect(80, 442, 800, 42);
  } else {
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? artColor("7b9b88") : artColor("b78968"); ctx.fillRect(116 + (i % 3) * 252, 294 + Math.floor(i / 3) * 104, 168, 70); ctx.fillStyle = artColor("dccb9d"); ctx.fillRect(126 + (i % 3) * 252, 304 + Math.floor(i / 3) * 104, 148, 14); }
  }
  ctx.fillStyle = artColor("31424c"); ctx.fillRect(412, 492, 136, 48); ctx.fillStyle = artColor("d7bf86"); ctx.fillRect(425, 497, 110, 29); ctx.fillStyle = artColor("26353d"); ctx.font = "11px monospace"; ctx.fillText(t("returnCity"), 435, 516);
  drawPerson(ctx, 480, 456, 0, 0, g.lead === 0 ? artColor("d77d6e") : artColor("5ba1a0"), artColor("303a48"), g.anim, true, g.ownsClothes ? 1 : 0);
}
function drawMini(ctx: CanvasRenderingContext2D, g: Game, width: number, height: number) {
  ctx.fillStyle = artColor("263a3f"); ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = artColor("5d795f"); ctx.fillRect(0, 0, width * 0.94, height * 0.92);
  ctx.fillStyle = artColor("347780"); ctx.fillRect(width * 0.9, 0, width * 0.1, height * 0.67); ctx.fillRect(width * 0.82, height * 0.82, width * 0.18, height * 0.18);
  ctx.fillStyle = artColor("424950");
  for (let x = 0; x < WORLD_W; x += 400) ctx.fillRect(x / WORLD_W * width, 0, 5, height);
  for (let y = 0; y < WORLD_H; y += 300) ctx.fillRect(0, y / WORLD_H * height, width, 4);
  for (const b of g.buildings) { ctx.fillStyle = artColor("be9273"); ctx.fillRect(b.x / WORLD_W * width, b.y / WORLD_H * height, Math.max(2, b.w / WORLD_W * width), Math.max(2, b.h / WORLD_H * height)); }
  if (g.active && g.mission < MISSIONS.length) { const s = MISSIONS[g.mission].stages[g.stage]; ctx.fillStyle = artColor("ffe18a"); ctx.fillRect(s.x / WORLD_W * width - 3, s.y / WORLD_H * height - 3, 7, 7); }
  ctx.fillStyle = artColor("f5e1ab"); ctx.fillRect(g.x / WORLD_W * width - 3, g.y / WORLD_H * height - 3, 7, 7);
}

export default function App() {
  const { t, locale } = useTranslations();
  const connection = useActor("progress");
  const loadAction = useAction(connection, "loadGame");
  const saveAction = useAction(connection, "saveGame");
  const gameRef = useRef<Game | null>(null);
  if (!gameRef.current) gameRef.current = makeGame();
  const g = gameRef.current;
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false); readyRef.current = ready;
  const [view, setView] = useState<View>({ paused: false, map: false, bag: false, interior: null });
  const viewRef = useRef(view); viewRef.current = view;
  const [tick, setTick] = useState(0);
  const [sound, setSound] = useState(false);
  const [selectedItem, setSelectedItem] = useState<"smoke" | "none">("none");
  const [toast, setToast] = useState("");
  const keys = useRef(new Set<string>());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const largeMapRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const restoreStarted = useRef(false);
  const toastTimer = useRef<number | null>(null);
  const aim = useRef({ x: 480, y: 270 });

  const notify = useCallback((key: TKey) => {
    setToast(t(key));
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, [t]);
  const restore = useCallback(async () => {
    const saved = await loadAction.run({});
    if (saved && gameRef.current) applySave(gameRef.current, saved);
    setReady(true);
  }, [loadAction.run]);
  useEffect(() => {
    if (connection.status === "connected" && !restoreStarted.current) { restoreStarted.current = true; void restore(); }
    if (connection.status === "disconnected") setReady(true);
  }, [connection.status, restore]);
  useEffect(() => { readyRef.current = ready; }, [ready]);
  useEffect(() => {
    const canvas = canvasRef.current; const ctx = canvas?.getContext("2d"); if (!canvas || !ctx) return;
    let frame = 0; let last = 0; let hudAt = 0; let alive = true;
    ctx.imageSmoothingEnabled = false;
    const paint = (now: number) => {
      if (!alive) return;
      const dt = last ? Math.min(0.04, (now - last) / 1000) : 0; last = now;
      const game = gameRef.current!;
      if (readyRef.current && !viewRef.current.paused && !viewRef.current.interior) {
        stepGame(game, dt, keys.current, (key) => notify(key));
      }
      if (viewRef.current.interior) drawInterior(ctx, viewRef.current.interior, game, t);
      else drawCity(ctx, game, t);
      if (!readyRef.current) { ctx.globalAlpha = 0.55; ctx.fillStyle = artColor("0d1620"); ctx.fillRect(0, 0, 960, 540); ctx.globalAlpha = 1; ctx.fillStyle = artColor("f3d792"); ctx.font = "bold 18px monospace"; ctx.fillText(t("loading"), 48, 500); }
      const mini = miniRef.current?.getContext("2d"); if (mini) drawMini(mini, game, mini.canvas.width, mini.canvas.height);
      const large = largeMapRef.current?.getContext("2d"); if (large) drawMini(large, game, large.canvas.width, large.canvas.height);
      if (audioRef.current) {
        const active = game.carIndex === null ? 0 : Math.abs(game.cars[game.carIndex]?.speed ?? 0);
        audioRef.current.gain.gain.value = active > 0 ? Math.min(0.035, 0.006 + active / 14000) : 0.001;
        audioRef.current.osc.frequency.value = active > 0 ? 65 + active * 0.72 : 54;
      }
      if (now - hudAt > 130) { hudAt = now; setTick((v) => v + 1); }
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [notify, t]);

  const saveProgress = useCallback(async () => {
    if (!gameRef.current || connection.status !== "connected") return;
    const saved = await saveAction.run({ save: cleanSave(gameRef.current) });
    if (saved) notify("saved");
  }, [connection.status, saveAction.run, notify]);
  useEffect(() => {
    if (!ready || connection.status !== "connected") return;
    const timer = window.setInterval(() => { if (!saveAction.pending && gameRef.current) void saveAction.run({ save: cleanSave(gameRef.current) }); }, 45000);
    return () => window.clearInterval(timer);
  }, [ready, connection.status, saveAction.pending, saveAction.run]);

  const performInteract = useCallback(() => {
    const game = gameRef.current!; const ui = viewRef.current;
    if (ui.interior) { setView((v) => ({ ...v, interior: null })); return; }
    if (game.carIndex !== null) { notify("leaveVehicle"); return; }
    const place = nearestPlace(game);
    if (place) { setView((v) => ({ ...v, interior: place.id })); return; }
    let best = 58; let idx = -1;
    game.cars.forEach((car, i) => { const d = dist(game, car); if (d < best) { best = d; idx = i; } });
    if (idx >= 0) {
      const car = game.cars[idx]; game.carIndex = idx; car.route = "parked"; car.speed = 0;
      if (!car.owned) { game.heat = Math.max(1, game.heat); game.heatClock = 14; notify("vehicleStolen"); }
      return;
    }
    notify("locationHint");
  }, [notify]);
  const exitVehicle = useCallback(() => {
    const game = gameRef.current!; if (game.carIndex === null) return;
    const car = game.cars[game.carIndex]; game.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30; game.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    game.carIndex = null; game.vx = 0; game.vy = 0;
  }, []);
  const useSmoke = useCallback((x?: number, y?: number) => {
    const game = gameRef.current!; if (game.smoke < 1) { notify("emptyItem"); return; }
    const px = x ?? aim.current.x;
    const py = y ?? aim.current.y;
    const camX = clamp(game.x - 480, 0, WORLD_W - 960); const camY = clamp(game.y - 270, 0, WORLD_H - 540);
    game.smoke--; game.smokeClouds.push({ x: x === undefined ? px + camX : x, y: y === undefined ? py + camY : y, age: 0 });
    setSelectedItem("none");
  }, [notify]);
  const handlersRef = useRef({ interact: performInteract, exit: exitVehicle, save: saveProgress, smoke: useSmoke });
  handlersRef.current = { interact: performInteract, exit: exitVehicle, save: saveProgress, smoke: useSmoke };
  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "shift", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
        event.preventDefault(); keys.current.add(key.startsWith("arrow") ? key.slice(5) : key); return;
      }
      if (event.repeat) return;
      if (key === "e") { event.preventDefault(); handlersRef.current.interact(); }
      if (key === "f") handlersRef.current.exit();
      if (key === "c") gameRef.current!.lead = 1 - gameRef.current!.lead;
      if (key === "tab") { event.preventDefault(); setView((v) => ({ ...v, bag: !v.bag })); }
      if (key === "m") setView((v) => ({ ...v, map: !v.map }));
      if (key === "escape") setView((v) => ({ ...v, paused: !v.paused, map: false, bag: false }));
      if (key === " " && selectedItem === "smoke") { event.preventDefault(); handlersRef.current.smoke(); }
    };
    const onUp = (event: KeyboardEvent) => { const key = event.key.toLowerCase(); keys.current.delete(key.startsWith("arrow") ? key.slice(5) : key); };
    window.addEventListener("keydown", onDown); window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [selectedItem]);

  const startSound = () => {
    if (!sound) {
      try {
        const AudioCtx = window.AudioContext;
        const ctx = new AudioCtx(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = "sawtooth"; gain.gain.value = 0.001; osc.connect(gain); gain.connect(ctx.destination); osc.start(); audioRef.current = { ctx, osc, gain };
        void ctx.resume(); setSound(true);
      } catch { setSound(false); }
    } else { audioRef.current?.osc.stop(); void audioRef.current?.ctx.close(); audioRef.current = null; setSound(false); }
  };
  useEffect(() => () => { if (audioRef.current) { audioRef.current.osc.stop(); void audioRef.current.ctx.close(); } if (toastTimer.current !== null) window.clearTimeout(toastTimer.current); }, []);

  const buy = (what: "meal" | "smoke" | "car" | "property" | "clothes") => {
    const game = gameRef.current!;
    const price = what === "meal" ? 18 : what === "smoke" ? 75 : what === "car" ? 850 : what === "property" ? 1800 : 120;
    if (what === "car" && game.ownsCar) { notify("ownedCar"); return; }
    if (what === "property" && game.ownsProperty) { notify("owned"); return; }
    if (what === "clothes" && game.ownsClothes) { notify("owned"); return; }
    if (game.cash < price) { notify("needMoney"); return; }
    game.cash -= price;
    if (what === "meal") { game.health = Math.min(100, game.health + 48); game.snacks++; notify("mealBought"); }
    if (what === "smoke") { game.smoke++; notify("smokeBought"); }
    if (what === "car") { game.ownsCar = true; game.cars.push({ x: 600, y: 1170, angle: -Math.PI / 2, speed: 0, kind: "coupe", color: artColor("e47b69"), owned: true, route: "parked", direction: 1, damage: 0 }); notify("carBought"); }
    if (what === "property") { game.ownsProperty = true; notify("propertyBought"); }
    if (what === "clothes") { game.ownsClothes = true; game.outfit = 1; notify("clothesBought"); }
    void saveProgress();
  };
  const takeMeal = () => { const game = gameRef.current!; if (game.snacks < 1) { notify("emptyItem"); return; } game.snacks--; game.health = Math.min(100, game.health + 45); notify("mealBought"); };
  const takeJob = () => { startMission(gameRef.current!, (key) => notify(key)); void saveProgress(); };
  const setDirection = (direction: string, pressed: boolean) => { if (pressed) keys.current.add(direction); else keys.current.delete(direction); };
  const game = g; const currentMission = game.active && game.mission < MISSIONS.length ? MISSIONS[game.mission] : null;
  const currentStage = currentMission?.stages[game.stage]; const place = nearestPlace(game);
  const inside = view.interior ? PLACES.find((p) => p.id === view.interior) ?? null : null;
  const hour = Math.floor(game.clock); const cashFmt = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const leadName = game.lead === 0 ? t("leadNia") : t("leadMateo");
  const district = game.x > 2300 && game.y > 1800 ? t("wetlands") : game.y > 1500 ? t("industrial") : game.x > 2050 ? t("beach") : game.x < 1200 && game.y < 1200 ? t("residential") : t("downtown");
  const nearCar = game.carIndex === null && game.cars.some((c) => dist(c, game) < 58);
  const canStart = view.interior === "safehouse" && !game.active && game.mission < MISSIONS.length;
  const serviceButtons = inside?.kind === "shop" ? [
    { label: t("buyMeal", { price: cashFmt.format(18) }), action: () => buy("meal") },
    { label: t("buyScreen", { price: cashFmt.format(75) }), action: () => buy("smoke") },
  ] : inside?.kind === "diner" ? [{ label: t("buyMeal", { price: cashFmt.format(18) }), action: () => buy("meal") }] : inside?.kind === "clothing" ? [{ label: game.ownsClothes ? t("owned") : t("buyClothes", { price: cashFmt.format(120) }), action: () => buy("clothes") }] : inside?.kind === "garage" ? [{ label: game.ownsCar ? t("ownedCar") : t("buyCoupe", { price: cashFmt.format(850) }), action: () => buy("car") }] : inside?.kind === "property" ? [{ label: game.ownsProperty ? t("owned") : t("buyLot", { price: cashFmt.format(1800) }), action: () => buy("property") }] : [];
  const placeTitle = inside ? t(inside.key) : place ? t(place.key) : null;
  const onCanvasClick = (event: MouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect(); aim.current = { x: (event.clientX - rect.left) / rect.width * 960, y: (event.clientY - rect.top) / rect.height * 540 };
    gameRef.current!.aimX = aim.current.x; gameRef.current!.aimY = aim.current.y;
    if (selectedItem === "smoke") useSmoke();
  };
  const onCanvasMove = (event: MouseEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); aim.current = { x: (event.clientX - rect.left) / rect.width * 960, y: (event.clientY - rect.top) / rect.height * 540 }; gameRef.current!.aimX = aim.current.x; gameRef.current!.aimY = aim.current.y; };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-border px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center border border-border bg-muted font-mono text-xs font-bold">VC</span>
          <div className="min-w-0"><h1 className="truncate text-base font-semibold uppercase tracking-wide">{t("title")}</h1><p className="text-[11px] text-muted-foreground">{t("subtitle")} · {leadName}</p></div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={startSound} aria-label={sound ? t("soundOn") : t("soundOff")} className="min-h-9 border border-border px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{sound ? "♫" : "♪"}<span className="hidden sm:inline"> {sound ? t("soundOn") : t("soundOff")}</span></button>
          <button type="button" onClick={() => setView((v) => ({ ...v, map: !v.map }))} className="min-h-9 border border-border px-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{view.map ? t("closeMap") : t("map")}</button>
          <button type="button" onClick={() => setView((v) => ({ ...v, paused: !v.paused }))} aria-label={t("pause")} className="min-h-9 border border-border px-3 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{view.paused ? t("resume") : "Ⅱ"}</button>
        </div>
      </header>
      <main className="grid gap-4 p-3 sm:p-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0">
          <div className="relative aspect-[16/9] overflow-hidden border border-border bg-card shadow-sm">
            <canvas ref={canvasRef} width={960} height={540} aria-label={t("title")} onClick={onCanvasClick} onMouseMove={onCanvasMove} className="absolute inset-0 h-full w-full cursor-crosshair [image-rendering:pixelated]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:p-3">
              <div className="border border-border/70 bg-card/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider sm:text-xs">{district} <span className="ml-1 font-normal text-muted-foreground">· {String(hour).padStart(2, "0")}:00 · {game.rain ? t("rain") : hour > 19 || hour < 6 ? t("night") : t("day")}</span></div>
              <div className="border border-border/70 bg-card/90 px-2 py-1 font-mono text-[10px] text-muted-foreground sm:text-xs"><span className="text-foreground">{cashFmt.format(game.cash)}</span><span className="mx-2">·</span>{t("health")} {Math.round(game.health)}%</div>
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 border border-border/70 bg-card/90 px-2 py-1 sm:bottom-3 sm:left-3">
              {Array.from({ length: 5 }, (_, i) => <span key={i} className={i < game.heat ? "text-amber-400 dark:text-amber-300" : "text-muted-foreground/50"}>★</span>)}
              <span className="ml-1 text-[10px] text-muted-foreground">{t("wanted")}</span>
            </div>
            {view.map && <div className="absolute inset-2 z-20 flex items-center justify-center bg-background/90 p-3 sm:inset-8"><div className="w-full max-w-3xl border border-border bg-card p-3"><div className="mb-2 flex items-center justify-between text-xs font-semibold"><span>{t("mapTitle")}</span><button type="button" onClick={() => setView((v) => ({ ...v, map: false }))} aria-label={t("closeMap")} className="min-h-8 px-2 hover:bg-muted">×</button></div><canvas ref={largeMapRef} width={900} height={580} aria-label={t("mapTitle")} className="max-h-[65vh] w-full border border-border [image-rendering:pixelated]" /></div></div>}
            {view.bag && <div className="absolute left-2 top-14 z-10 w-[min(18rem,calc(100%-1rem))] border border-border bg-card/95 p-3 shadow-sm sm:left-4"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("inventory")}</h2><button type="button" onClick={() => setView((v) => ({ ...v, bag: false }))} aria-label={t("close")} className="min-h-8 px-2 hover:bg-muted">×</button></div><p className="mb-1 text-xs text-muted-foreground">{t("snacks")}: {game.snacks}</p><button type="button" onClick={takeMeal} disabled={!game.snacks} className="mb-2 min-h-9 border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">{t("use")} · {t("snacks")}</button><p className="mb-2 text-xs text-muted-foreground">{t("smoke")}: {game.smoke}</p><button type="button" onClick={() => { setSelectedItem("smoke"); setView((v) => ({ ...v, bag: false })); }} disabled={!game.smoke} className="min-h-9 border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">{t("useSmoke")}</button><p className="mt-2 text-[11px] text-muted-foreground">{t("inventoryHint")}</p></div>}
            {view.paused && <div className="absolute inset-0 z-30 grid place-items-center bg-background/85 p-4"><div className="w-full max-w-sm border border-border bg-card p-4 shadow-sm"><h2 className="mb-1 text-lg font-semibold">{t("pause")}</h2><p className="mb-4 text-xs text-muted-foreground">{t("settingsSound")}</p><div className="mb-4 grid grid-cols-2 gap-2 text-xs"><span>{t("cash")}</span><span className="text-right tabular-nums">{cashFmt.format(game.cash)}</span><span>{t("bank")}</span><span className="text-right tabular-nums">{cashFmt.format(game.bank)}</span><span>{t("outfit")}</span><span className="text-right">{game.ownsClothes ? t("owned") : "—"}</span></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => setView((v) => ({ ...v, paused: false }))} className="min-h-10 border border-border px-3 text-sm hover:bg-muted">{t("resume")}</button><button type="button" onClick={startSound} className="min-h-10 border border-border px-3 text-sm hover:bg-muted">{sound ? t("soundOn") : t("soundOff")}</button><button type="button" onClick={() => void saveProgress()} disabled={saveAction.pending || connection.status !== "connected"} className="min-h-10 border border-border px-3 text-sm hover:bg-muted disabled:opacity-50">{saveAction.pending ? t("saving") : t("saveNow")}</button></div><div className="mt-4 border-t border-border pt-3"><h3 className="mb-2 text-xs font-semibold">{t("controls")}</h3><div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground"><span>W A S D · {t("move")}</span><span>Shift · {t("sprint")}</span><span>E · {t("interactKey")}</span><span>F · {t("leaveVehicle")}</span><span>C · {t("switchKey")}</span><span>Tab · {t("bagKey")}</span><span>M · {t("mapKey")}</span><span>Esc · {t("pauseKey")}</span></div></div></div></div>}
            {toast && <div role="status" className="absolute bottom-12 left-1/2 z-40 -translate-x-1/2 border border-border bg-card px-3 py-2 text-center text-xs shadow-sm">{toast}</div>}
            <div className="absolute bottom-2 right-2 z-10 grid grid-cols-3 gap-1 sm:hidden" onPointerLeave={() => { ["w", "a", "s", "d", "shift"].forEach((k) => keys.current.delete(k)); }}>
              <span /><button type="button" aria-label={t("touchUp")} onPointerDown={(e) => { e.preventDefault(); setDirection("w", true); }} onPointerUp={() => setDirection("w", false)} className="size-9 border border-border bg-card/90 text-xs">↑</button><span />
              <button type="button" aria-label={t("touchLeft")} onPointerDown={(e) => { e.preventDefault(); setDirection("a", true); }} onPointerUp={() => setDirection("a", false)} className="size-9 border border-border bg-card/90 text-xs">←</button><button type="button" aria-label={t("touchDown")} onPointerDown={(e) => { e.preventDefault(); setDirection("s", true); }} onPointerUp={() => setDirection("s", false)} className="size-9 border border-border bg-card/90 text-xs">↓</button><button type="button" aria-label={t("touchRight")} onPointerDown={(e) => { e.preventDefault(); setDirection("d", true); }} onPointerUp={() => setDirection("d", false)} className="size-9 border border-border bg-card/90 text-xs">→</button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 text-[11px] text-muted-foreground">
            <span>{game.carIndex === null ? t("statusOnFoot") : `${t("statusDriving")} · ${t(game.cars[game.carIndex]?.kind === "coupe" ? "vehicleSport" : game.cars[game.carIndex]?.kind === "boat" ? "vehicleBoat" : game.cars[game.carIndex]?.kind === "bike" ? "vehicleBike" : "vehicleSedan")}`}{game.carIndex !== null ? ` · ${Math.round(Math.abs(game.cars[game.carIndex]?.speed ?? 0) * 0.42)} ${t("speed")}` : ""}</span>
            <span>{t("protagonist")}: {leadName} · {t("districtLabel")}: {district}</span>
          </div>
          {selectedItem === "smoke" && <p className="mt-2 text-xs text-muted-foreground">{t("inventoryHint")} <button type="button" onClick={() => useSmoke()} className="ml-2 underline underline-offset-2">{t("useSmoke")}</button></p>}
          {connection.status !== "connected" && connection.status !== "connecting" && <div className="mt-2"><ActionError error={connection.error} /></div>}
        </section>
        <aside className="min-w-0 space-y-3">
          <section className="border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{currentMission ? t("activeMission") : t("missionBoard")}</h2><span className="text-[10px] text-muted-foreground">{game.mission}/{MISSIONS.length}</span></div>
            {currentMission ? <><h3 className="text-xs font-semibold">{t(currentMission.title)}</h3><p className="mt-1 text-xs text-muted-foreground">{currentStage ? t(currentStage.key) : t("missionComplete")}</p><div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-muted-foreground">{t("reward")}</span><span className="tabular-nums">{cashFmt.format(currentMission.payout)}</span></div><p className="mt-2 text-[10px] text-muted-foreground">{t("jobHint")}</p></> : game.mission < MISSIONS.length ? <><h3 className="text-xs font-semibold">{t(MISSIONS[game.mission].title)}</h3><p className="mt-1 text-xs text-muted-foreground">{t(MISSIONS[game.mission].desc)}</p><p className="mt-2 text-[10px] text-muted-foreground">{canStart ? t("jobHint") : t("noMission")}</p><button type="button" onClick={takeJob} disabled={!canStart} className="mt-3 min-h-10 w-full border border-border px-3 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50">{t("acceptJob")}</button></> : <p className="text-xs text-muted-foreground">{t("noLeads")}</p>}
            <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">{t("leadNia")} · {t("leadMateo")} · {t("help")}</p>
          </section>
          <section className="border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{t("map")}</h2><span className="text-[10px] text-muted-foreground">{district}</span></div>
            <canvas ref={miniRef} width={360} height={190} aria-label={t("mapTitle")} className="w-full border border-border [image-rendering:pixelated]" />
            <p className="mt-2 text-[10px] text-muted-foreground">{t("weather")}: {game.rain ? t("rain") : t("clear")} · {hour > 19 || hour < 6 ? t("night") : t("day")}</p>
          </section>
          <section className="border border-border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{t("nearby")}</h2><span className="text-[10px] text-muted-foreground">{t("cash")}: {cashFmt.format(game.cash)}</span></div>
            {inside ? <><h3 className="text-xs font-semibold">{placeTitle}</h3><p className="mt-1 text-xs text-muted-foreground">{inside.kind === "safehouse" ? t("safehouseHint") : inside.kind === "property" ? t("propertyHint") : inside.kind === "garage" ? t("garageHint", { price: cashFmt.format(850) }) : t("shopHint")}</p>
              {inside.kind === "safehouse" && <button type="button" onClick={takeJob} disabled={!canStart} className="mt-3 min-h-10 w-full border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">{t("acceptJob")}</button>}
              {inside.kind === "safehouse" && <button type="button" onClick={() => { game.bank += game.propertyIncome; game.propertyIncome = 0; notify("propertyIncome"); }} disabled={!game.propertyIncome} className="mt-2 min-h-9 w-full border border-border px-3 text-xs hover:bg-muted disabled:opacity-50">{t("bankDeposit")} · {cashFmt.format(game.bank)} {game.propertyIncome ? `(+${cashFmt.format(game.propertyIncome)})` : ""}</button>}
              {serviceButtons.map((item, index) => <button key={index} type="button" onClick={item.action} className="mt-2 min-h-10 w-full border border-border px-3 text-xs hover:bg-muted">{item.label}</button>)}
              <button type="button" onClick={() => setView((v) => ({ ...v, interior: null }))} className="mt-2 min-h-9 w-full border border-border px-3 text-xs hover:bg-muted">{t("returnCity")}</button>
            </> : place ? <><h3 className="text-xs font-semibold">{t(place.key)}</h3><p className="mt-1 text-xs text-muted-foreground">{place.id === "safehouse" ? t("safehouseHint") : place.id === "property" ? t("propertyHint") : t("locationHint")}</p><button type="button" onClick={performInteract} className="mt-3 min-h-10 w-full border border-border px-3 text-xs hover:bg-muted">E · {t("enter")}</button></> : nearCar ? <><h3 className="text-xs font-semibold">{t("vehicle")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("vehicleStolen")}</p><button type="button" onClick={performInteract} className="mt-3 min-h-10 w-full border border-border px-3 text-xs hover:bg-muted">E · {t("interact")}</button></> : <p className="text-xs text-muted-foreground">{t("locationHint")}</p>}
          </section>
          <section className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[10px] text-muted-foreground"><span>{t("bank")}: {cashFmt.format(game.bank)}</span><span>{t("reputation")}</span></section>
          <div className="text-xs"><ActionError error={loadAction.error} onRetry={() => void restore()} /><ActionError error={saveAction.error} onRetry={() => void saveProgress()} /></div>
          {toast === t("saveError") && <p className="text-xs text-muted-foreground">{t("saveRetry")}</p>}
        </aside>
      </main>
    </div>
  );
}

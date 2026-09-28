(() => {
  "use strict";

  const canvas = document.querySelector("#gameCanvas");
  const ctx = canvas.getContext("2d");
  const $ = (selector) => document.querySelector(selector);
  const WORLD = { width: 1280, height: 720 };
  const saveKey = "starfall-endless-save-v1";

  const ships = [
    {
      id: "lancer", name: "Lancer", tier: "MK-I · RECON", description: "Balanced reconnaissance craft", tagline: "A nimble all-rounder built for the first jump into danger.",
      price: 0, damage: 12, fireRate: 0.19, hull: 100, speed: 445, color: "#65e7ff", accent: "#3676ff",
    },
    {
      id: "striker", name: "Striker", tier: "MK-II · PURSUIT", description: "High-velocity interceptor", tagline: "Pursuit thrusters and a precision laser channel for aggressive pilots.",
      price: 700, damage: 17, fireRate: 0.17, hull: 92, speed: 520, color: "#b8ff74", accent: "#51dca4",
    },
    {
      id: "sentinel", name: "Sentinel", tier: "MK-III · BULWARK", description: "Armored siege fighter", tagline: "Reinforced plating lets this heavy interceptor absorb the impossible.",
      price: 2200, damage: 25, fireRate: 0.21, hull: 154, speed: 380, color: "#bd91ff", accent: "#7176ff",
    },
    {
      id: "nova", name: "Nova", tier: "MK-IV · EXPERIMENTAL", description: "Prototype starship", tagline: "A forbidden reactor delivers devastating, beautifully unstable output.",
      price: 5400, damage: 34, fireRate: 0.14, hull: 125, speed: 475, color: "#ff83b1", accent: "#ffb35c",
    },
  ];

  const upgradeTypes = [
    { id: "damage", icon: "✦", name: "Laser Core", description: "+24% base laser damage per tier.", baseCost: 110 },
    { id: "rate", icon: "≋", name: "Cycle Array", description: "Fire 16 milliseconds faster per tier.", baseCost: 130 },
    { id: "hull", icon: "⬡", name: "Hull Weave", description: "+22 maximum hull integrity per tier.", baseCost: 100 },
  ];

  const sectorNames = ["ORION VEIL", "SABLE DRIFT", "VANTA REACH", "HELIOS SCAR", "THE RED GULF", "MIRAGE SPINE", "OBSIDIAN WAKE", "CROWN OF IO", "BLACKLIGHT SEA", "NIGHTFALL GATE"];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;
  const rand = (min, max) => Math.random() * (max - min) + min;
  const chance = (amount) => Math.random() < amount;
  const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  const number = new Intl.NumberFormat("en-US");

  function defaultSave() {
    return {
      credits: 350,
      owned: ["lancer"],
      selected: "lancer",
      upgrades: { lancer: { damage: 0, rate: 0, hull: 0 } },
      highSector: 0,
    };
  }

  function loadSave() {
    try {
      const saved = JSON.parse(localStorage.getItem(saveKey));
      if (!saved || typeof saved !== "object") return defaultSave();
      const backup = defaultSave();
      const owned = Array.isArray(saved.owned) && saved.owned.includes("lancer") ? saved.owned.filter((id) => ships.some((ship) => ship.id === id)) : backup.owned;
      const selected = owned.includes(saved.selected) ? saved.selected : "lancer";
      const upgrades = {};
      owned.forEach((id) => {
        upgrades[id] = { ...backup.upgrades.lancer, ...(saved.upgrades?.[id] || {}) };
      });
      return {
        credits: Number.isFinite(saved.credits) ? Math.max(0, Math.floor(saved.credits)) : backup.credits,
        owned,
        selected,
        upgrades,
        highSector: Number.isFinite(saved.highSector) ? saved.highSector : 0,
      };
    } catch {
      return defaultSave();
    }
  }

  let save = loadSave();
  let toastTimer;

  const ui = {
    credits: $("#creditCount"), hangarCredits: $("#hangarCredits"), activeShipName: $("#activeShipName"), activeShipDescription: $("#activeShipDescription"),
    sectorNumber: $("#sectorNumber"), sectorName: $("#sectorName"), enemyReadout: $("#enemyReadout"), threatLabel: $("#threatLabel"), threatFill: $("#threatFill"),
    healthNumber: $("#healthNumber"), healthFill: $("#healthFill"), shieldFill: $("#shieldFill"), toast: $("#statusToast"),
    intro: $("#introPanel"), pause: $("#pausePanel"), gameover: $("#gameoverPanel"), pauseButton: $("#pauseButton"),
    gameoverSector: $("#gameoverSector"), gameoverCredits: $("#gameoverCredits"), hangar: $("#hangarModal"), shipGrid: $("#shipGrid"), upgradeGrid: $("#upgradeGrid"),
  };

  function storeSave() {
    localStorage.setItem(saveKey, JSON.stringify(save));
  }

  function selectedShip() {
    return ships.find((ship) => ship.id === save.selected) || ships[0];
  }

  function getUpgrades(shipId = save.selected) {
    if (!save.upgrades[shipId]) save.upgrades[shipId] = { damage: 0, rate: 0, hull: 0 };
    return save.upgrades[shipId];
  }

  function getStats(shipId = save.selected) {
    const ship = ships.find((candidate) => candidate.id === shipId) || ships[0];
    const upgrades = getUpgrades(ship.id);
    return {
      damage: Math.round(ship.damage * (1 + upgrades.damage * 0.24)),
      fireRate: Math.max(0.07, ship.fireRate - upgrades.rate * 0.016),
      hull: ship.hull + upgrades.hull * 22,
      speed: ship.speed,
      color: ship.color,
      accent: ship.accent,
    };
  }

  function updatePersistentUI() {
    const ship = selectedShip();
    ui.credits.textContent = number.format(save.credits);
    ui.hangarCredits.textContent = number.format(save.credits);
    ui.activeShipName.textContent = ship.name.toUpperCase();
    ui.activeShipDescription.textContent = ship.description;
  }

  function flashToast(message, tone = "cyan") {
    clearTimeout(toastTimer);
    ui.toast.textContent = message;
    ui.toast.style.borderColor = tone === "danger" ? "rgba(255, 98, 149, .55)" : tone === "gold" ? "rgba(185, 255, 114, .55)" : "rgba(121, 229, 255, .48)";
    ui.toast.classList.add("visible");
    toastTimer = setTimeout(() => ui.toast.classList.remove("visible"), 2150);
  }

  class Game {
    constructor() {
      this.stars = Array.from({ length: 156 }, () => ({ x: rand(0, WORLD.width), y: rand(0, WORLD.height), z: rand(0.25, 1.35), size: rand(0.35, 1.8), hue: chance(0.12) ? rand(190, 280) : 205 }));
      this.nebulas = Array.from({ length: 7 }, () => ({ x: rand(0, WORLD.width), y: rand(-80, WORLD.height), r: rand(120, 350), hue: chance(0.5) ? 227 : 277, alpha: rand(0.025, 0.07) }));
      this.keys = new Set();
      this.pointer = { active: false, x: WORLD.width / 2, y: WORLD.height - 150 };
      this.running = false;
      this.paused = false;
      this.gameOver = false;
      this.lastTime = performance.now();
      this.lastHudUpdate = 0;
      this.raf = 0;
      this.resetRun();
      this.bindInput();
      this.resize();
      addEventListener("resize", () => this.resize());
      this.loop = this.loop.bind(this);
      this.raf = requestAnimationFrame(this.loop);
    }

    resetRun() {
      const stats = getStats();
      this.level = 1;
      this.killCount = 0;
      this.runCredits = 0;
      this.enemies = [];
      this.lasers = [];
      this.enemyLasers = [];
      this.pickups = [];
      this.particles = [];
      this.rings = [];
      this.spawnQueue = [];
      this.spawnCooldown = 0;
      this.nextSectorTimer = 0;
      this.bannerTimer = 0;
      this.bannerText = "";
      this.screenShake = 0;
      this.time = 0;
      this.player = {
        x: WORLD.width / 2, y: WORLD.height - 105, radius: 20, hp: stats.hull, maxHp: stats.hull,
        shield: 100, maxShield: 100, cooldown: 0, invincible: 0, engine: 0, tilt: 0,
      };
      this.beginSector();
      this.updateHud(true);
    }

    bindInput() {
      const inputKeys = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyP", "Escape"]);
      addEventListener("keydown", (event) => {
        if (inputKeys.has(event.code)) event.preventDefault();
        if (event.code === "KeyP" || event.code === "Escape") {
          if (this.running && !ui.hangar.classList.contains("hidden")) return;
          if (this.running) this.togglePause();
          return;
        }
        this.keys.add(event.code);
      });
      addEventListener("keyup", (event) => this.keys.delete(event.code));
      canvas.addEventListener("pointermove", (event) => {
        const box = canvas.getBoundingClientRect();
        this.pointer.x = clamp((event.clientX - box.left) / box.width * WORLD.width, 0, WORLD.width);
        this.pointer.y = clamp((event.clientY - box.top) / box.height * WORLD.height, 0, WORLD.height);
      });
      canvas.addEventListener("pointerdown", (event) => {
        this.pointer.active = true;
        canvas.setPointerCapture?.(event.pointerId);
        if (!this.running && !this.gameOver) startMission();
      });
      canvas.addEventListener("pointerup", () => { this.pointer.active = false; });
      canvas.addEventListener("pointercancel", () => { this.pointer.active = false; });
      canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }

    resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(WORLD.width * ratio);
      canvas.height = Math.round(WORLD.height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    start() {
      this.resetRun();
      this.running = true;
      this.paused = false;
      this.gameOver = false;
      ui.intro.classList.add("hidden");
      ui.gameover.classList.add("hidden");
      ui.pause.classList.add("hidden");
      ui.pauseButton.classList.remove("hidden");
      flashToast("SECTOR 01 — HOSTILES INBOUND");
    }

    applyLoadout() {
      const stats = getStats();
      const healthRatio = this.player ? this.player.hp / this.player.maxHp : 1;
      if (this.player) {
        this.player.maxHp = stats.hull;
        this.player.hp = clamp(Math.round(stats.hull * healthRatio), 1, stats.hull);
      }
      this.updateHud(true);
    }

    togglePause(force) {
      if (!this.running || this.gameOver) return;
      this.paused = typeof force === "boolean" ? force : !this.paused;
      ui.pause.classList.toggle("hidden", !this.paused);
      ui.pauseButton.textContent = this.paused ? "▶" : "Ⅱ";
    }

    beginSector() {
      const isBossSector = this.level % 5 === 0;
      this.spawnQueue = [];
      if (isBossSector) {
        this.spawnQueue.push({ type: "boss", delay: 1.35 });
        this.bannerText = `SECTOR ${String(this.level).padStart(2, "0")} — BOSS SIGNAL`;
      } else {
        const count = 5 + Math.floor(this.level * 1.9);
        for (let index = 0; index < count; index += 1) {
          let type = "scout";
          const roll = Math.random();
          if (this.level >= 7 && roll > 0.74) type = "crusher";
          else if (this.level >= 3 && roll > 0.47) type = "orbiter";
          this.spawnQueue.push({ type, delay: index === 0 ? 0.65 : rand(0.34, 0.87) });
        }
        this.bannerText = `SECTOR ${String(this.level).padStart(2, "0")} — ${sectorNames[(this.level - 1) % sectorNames.length]}`;
      }
      this.spawnCooldown = this.spawnQueue[0]?.delay || 0;
      this.bannerTimer = 2.8;
      this.nextSectorTimer = 0;
    }

    spawnEnemy(type) {
      const scaling = 1 + (this.level - 1) * 0.12;
      const x = rand(80, WORLD.width - 80);
      const base = {
        x, y: -75, age: 0, hit: 0, flash: 0, shoot: rand(0.7, 1.65), phase: rand(0, Math.PI * 2), dead: false,
      };
      if (type === "scout") {
        this.enemies.push({ ...base, type, radius: 20, hp: Math.round(29 * scaling), maxHp: Math.round(29 * scaling), speed: rand(56, 93) + this.level * 2, value: 17 + this.level * 2, color: "#ff779e", wobble: rand(20, 50) });
      } else if (type === "orbiter") {
        this.enemies.push({ ...base, type, radius: 26, hp: Math.round(58 * scaling), maxHp: Math.round(58 * scaling), speed: rand(40, 58), value: 33 + this.level * 3, color: "#ab8cff", orbitX: x, wobble: rand(34, 78) });
      } else if (type === "crusher") {
        this.enemies.push({ ...base, type, radius: 35, hp: Math.round(132 * scaling), maxHp: Math.round(132 * scaling), speed: rand(25, 36), value: 76 + this.level * 5, color: "#ffa85c", wobble: rand(12, 25) });
      } else {
        const hp = Math.round(550 + this.level * 170);
        this.enemies.push({ ...base, type: "boss", radius: 89, hp, maxHp: hp, speed: 0, value: 330 + this.level * 34, color: "#ff5f9b", x: WORLD.width / 2, y: -140, targetY: 158, shoot: 1.7, burst: 0, phase: 0 });
        flashToast("⚠ ANOMALY CLASS BOSS DETECTED", "danger");
      }
    }

    update(dt) {
      this.time += dt;
      this.screenShake = Math.max(0, this.screenShake - dt * 2.8);
      this.stars.forEach((star) => {
        star.y += (16 + star.z * 65) * dt;
        if (star.y > WORLD.height + 3) { star.y = -3; star.x = rand(0, WORLD.width); }
      });
      this.nebulas.forEach((nebula) => {
        nebula.y += 3.5 * dt;
        if (nebula.y - nebula.r > WORLD.height) { nebula.y = -nebula.r; nebula.x = rand(0, WORLD.width); }
      });
      if (!this.running || this.paused || this.gameOver) return;

      this.updatePlayer(dt);
      this.updateSpawns(dt);
      this.updateLasers(dt);
      this.updateEnemies(dt);
      this.updateEnemyLasers(dt);
      this.updatePickups(dt);
      this.updateParticles(dt);
      this.updateRings(dt);
      this.checkSectorClear(dt);
      this.updateHud();
    }

    updatePlayer(dt) {
      const player = this.player;
      const stats = getStats();
      let horizontal = (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) - (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
      let vertical = (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) - (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
      if (horizontal || vertical) {
        const magnitude = Math.hypot(horizontal, vertical);
        horizontal /= magnitude;
        vertical /= magnitude;
        player.x += horizontal * stats.speed * dt;
        player.y += vertical * stats.speed * dt;
      }
      if (this.pointer.active) {
        player.x = lerp(player.x, this.pointer.x, Math.min(1, dt * 5.5));
        player.y = lerp(player.y, this.pointer.y, Math.min(1, dt * 5.5));
      }
      player.x = clamp(player.x, 35, WORLD.width - 35);
      player.y = clamp(player.y, 290, WORLD.height - 42);
      player.tilt = lerp(player.tilt, horizontal * 0.38, Math.min(1, dt * 8));
      player.cooldown -= dt;
      player.invincible = Math.max(0, player.invincible - dt);
      player.shield = clamp(player.shield + dt * 2.1, 0, player.maxShield);
      player.engine += dt * 12;
      if ((this.keys.has("Space") || this.pointer.active) && player.cooldown <= 0) {
        this.firePlayerLaser(stats);
        player.cooldown = stats.fireRate;
      }
    }

    firePlayerLaser(stats) {
      const player = this.player;
      const spread = save.selected === "nova" ? 11 : 8;
      const damage = stats.damage;
      this.lasers.push(
        { x: player.x - spread, y: player.y - 25, vx: -22, vy: -790, damage, radius: 5, color: stats.color },
        { x: player.x + spread, y: player.y - 25, vx: 22, vy: -790, damage, radius: 5, color: stats.color },
      );
      if (save.selected === "nova" && chance(0.55)) this.lasers.push({ x: player.x, y: player.y - 34, vx: 0, vy: -860, damage: Math.round(damage * 0.8), radius: 4, color: "#ffd071" });
      this.spark(player.x, player.y - 25, stats.color, 3, 95, 0.24);
    }

    updateSpawns(dt) {
      if (!this.spawnQueue.length) return;
      this.spawnCooldown -= dt;
      if (this.spawnCooldown > 0) return;
      const next = this.spawnQueue.shift();
      this.spawnEnemy(next.type);
      this.spawnCooldown = this.spawnQueue[0]?.delay || 0;
    }

    updateLasers(dt) {
      for (let index = this.lasers.length - 1; index >= 0; index -= 1) {
        const laser = this.lasers[index];
        laser.x += laser.vx * dt;
        laser.y += laser.vy * dt;
        if (laser.y < -40 || laser.x < -40 || laser.x > WORLD.width + 40) { this.lasers.splice(index, 1); continue; }
        let hit = false;
        for (const enemy of this.enemies) {
          if (enemy.dead || distanceSquared(laser, enemy) > (enemy.radius + laser.radius) ** 2) continue;
          this.damageEnemy(enemy, laser.damage);
          this.spark(laser.x, laser.y, laser.color, 5, 120, 0.25);
          hit = true;
          break;
        }
        if (hit) this.lasers.splice(index, 1);
      }
    }

    updateEnemies(dt) {
      const player = this.player;
      for (let index = this.enemies.length - 1; index >= 0; index -= 1) {
        const enemy = this.enemies[index];
        enemy.age += dt;
        enemy.hit = Math.max(0, enemy.hit - dt * 5);
        enemy.flash = Math.max(0, enemy.flash - dt * 4);
        enemy.shoot -= dt;
        if (enemy.type === "scout") {
          enemy.y += enemy.speed * dt;
          enemy.x += Math.sin(enemy.age * 2.5 + enemy.phase) * enemy.wobble * dt;
          if (enemy.y > 70 && enemy.shoot <= 0) { this.enemyShot(enemy, player, 210 + this.level * 3, 11, "#ff83ad"); enemy.shoot = rand(1.4, 2.45); }
        } else if (enemy.type === "orbiter") {
          enemy.y += enemy.speed * dt;
          enemy.x = enemy.orbitX + Math.sin(enemy.age * 1.65 + enemy.phase) * enemy.wobble * 2.2;
          if (enemy.y > 70 && enemy.shoot <= 0) {
            [-0.28, 0, 0.28].forEach((offset) => this.enemyShot(enemy, player, 190 + this.level * 2, 10, "#ae8fff", offset));
            enemy.shoot = rand(1.7, 2.4);
          }
        } else if (enemy.type === "crusher") {
          enemy.y += enemy.speed * dt;
          enemy.x += Math.sin(enemy.age * 1.15 + enemy.phase) * enemy.wobble * dt;
          if (enemy.y > 60 && enemy.shoot <= 0) { this.enemyShot(enemy, player, 165 + this.level * 2, 16, "#ffb05d"); enemy.shoot = rand(1.2, 1.9); }
        } else if (enemy.type === "boss") {
          if (enemy.y < enemy.targetY) enemy.y = Math.min(enemy.targetY, enemy.y + 90 * dt);
          else {
            enemy.x = WORLD.width / 2 + Math.sin(enemy.age * 0.46) * 285;
            enemy.y = enemy.targetY + Math.sin(enemy.age * 1.15) * 25;
            if (enemy.shoot <= 0) {
              const count = 10 + Math.min(9, Math.floor(this.level / 2));
              for (let bullet = 0; bullet < count; bullet += 1) {
                const angle = Math.PI * 0.5 + (Math.PI * 2 * bullet / count) + enemy.age * 0.38;
                this.enemyLasers.push({ x: enemy.x, y: enemy.y + 12, vx: Math.cos(angle) * 145, vy: Math.sin(angle) * 145, radius: 8, damage: 13, color: "#ff5f9b", life: 6 });
              }
              this.enemyShot(enemy, player, 255, 18, "#ff94c6", -0.16);
              this.enemyShot(enemy, player, 255, 18, "#ff94c6", 0.16);
              enemy.shoot = 1.35;
              this.rings.push({ x: enemy.x, y: enemy.y + 10, radius: 10, max: 132, color: "#ff75ad", life: 0.52, age: 0 });
            }
          }
        }
        if (enemy.x < -110 || enemy.x > WORLD.width + 110 || enemy.y > WORLD.height + 110) { this.enemies.splice(index, 1); continue; }
        if (distanceSquared(player, enemy) < (player.radius + enemy.radius - 5) ** 2) {
          this.hurtPlayer(enemy.type === "boss" ? 38 : enemy.type === "crusher" ? 25 : 16);
          this.destroyEnemy(enemy, false);
          this.enemies.splice(index, 1);
        }
      }
    }

    enemyShot(enemy, player, speed, damage, color, angleOffset = 0) {
      const angle = Math.atan2(player.y - enemy.y, player.x - enemy.x) + angleOffset;
      this.enemyLasers.push({ x: enemy.x, y: enemy.y + enemy.radius * 0.45, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, radius: Math.max(5, damage * 0.42), damage, color, life: 6 });
    }

    updateEnemyLasers(dt) {
      for (let index = this.enemyLasers.length - 1; index >= 0; index -= 1) {
        const laser = this.enemyLasers[index];
        laser.x += laser.vx * dt;
        laser.y += laser.vy * dt;
        laser.life -= dt;
        if (laser.life <= 0 || laser.x < -50 || laser.x > WORLD.width + 50 || laser.y < -50 || laser.y > WORLD.height + 50) { this.enemyLasers.splice(index, 1); continue; }
        if (distanceSquared(laser, this.player) < (laser.radius + this.player.radius) ** 2) {
          this.hurtPlayer(laser.damage);
          this.spark(laser.x, laser.y, laser.color, 5, 125, 0.26);
          this.enemyLasers.splice(index, 1);
        }
      }
    }

    damageEnemy(enemy, amount) {
      enemy.hp -= amount;
      enemy.hit = 1;
      enemy.flash = 1;
      if (enemy.hp <= 0) {
        enemy.dead = true;
        this.destroyEnemy(enemy, true);
        const index = this.enemies.indexOf(enemy);
        if (index !== -1) this.enemies.splice(index, 1);
      }
    }

    destroyEnemy(enemy, grantReward) {
      const huge = enemy.type === "boss";
      this.screenShake = Math.max(this.screenShake, huge ? 0.8 : 0.28);
      this.rings.push({ x: enemy.x, y: enemy.y, radius: enemy.radius * 0.4, max: enemy.radius * (huge ? 2.7 : 1.75), color: enemy.color, life: huge ? 0.9 : 0.42, age: 0 });
      this.spark(enemy.x, enemy.y, enemy.color, huge ? 65 : 22, huge ? 390 : 230, huge ? 1.25 : 0.74);
      if (!grantReward) return;
      this.killCount += 1;
      const reward = enemy.value;
      const drops = huge ? 9 : Math.max(1, Math.ceil(reward / 18));
      for (let drop = 0; drop < drops; drop += 1) {
        this.pickups.push({ x: enemy.x + rand(-enemy.radius * 0.4, enemy.radius * 0.4), y: enemy.y + rand(-enemy.radius * 0.35, enemy.radius * 0.35), vx: rand(-100, 100), vy: rand(-80, 60), value: Math.ceil(reward / drops), radius: huge ? 8 : 5, age: 0, life: 8 });
      }
      if (huge) flashToast("BOSS ELIMINATED — MASSIVE SALVAGE RECOVERED", "gold");
    }

    hurtPlayer(amount) {
      const player = this.player;
      if (player.invincible > 0 || this.gameOver) return;
      let remaining = amount;
      if (player.shield > 0) {
        const shieldHit = Math.min(player.shield, remaining);
        player.shield -= shieldHit;
        remaining -= shieldHit;
      }
      if (remaining > 0) player.hp -= remaining;
      player.invincible = 0.18;
      this.screenShake = Math.max(this.screenShake, 0.34);
      this.spark(player.x, player.y, remaining > 0 ? "#ff7c9e" : "#af91ff", 17, 220, 0.65);
      if (player.hp <= 0) this.endRun();
    }

    updatePickups(dt) {
      for (let index = this.pickups.length - 1; index >= 0; index -= 1) {
        const pickup = this.pickups[index];
        pickup.age += dt;
        pickup.life -= dt;
        const dx = this.player.x - pickup.x;
        const dy = this.player.y - pickup.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 180) {
          pickup.vx += dx / Math.max(distance, 1) * 700 * dt;
          pickup.vy += dy / Math.max(distance, 1) * 700 * dt;
        }
        pickup.x += pickup.vx * dt;
        pickup.y += pickup.vy * dt;
        pickup.vx *= 0.988;
        pickup.vy *= 0.988;
        if (distance < this.player.radius + pickup.radius + 4) {
          save.credits += pickup.value;
          this.runCredits += pickup.value;
          storeSave();
          this.spark(pickup.x, pickup.y, "#c9ff7b", 5, 105, 0.26);
          this.pickups.splice(index, 1);
        } else if (pickup.life <= 0) this.pickups.splice(index, 1);
      }
    }

    spark(x, y, color, count, force, life) {
      for (let particle = 0; particle < count; particle += 1) {
        const angle = rand(0, Math.PI * 2);
        const speed = rand(force * 0.23, force);
        this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: rand(1, 3.7), life: rand(life * 0.42, life), maxLife: life, color });
      }
    }

    updateParticles(dt) {
      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index];
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vx *= 0.965;
        particle.vy *= 0.965;
        if (particle.life <= 0) this.particles.splice(index, 1);
      }
    }

    updateRings(dt) {
      for (let index = this.rings.length - 1; index >= 0; index -= 1) {
        this.rings[index].age += dt;
        if (this.rings[index].age >= this.rings[index].life) this.rings.splice(index, 1);
      }
    }

    checkSectorClear(dt) {
      if (this.spawnQueue.length || this.enemies.length) return;
      this.nextSectorTimer += dt;
      if (this.nextSectorTimer < 2.2) return;
      const bonus = 16 + this.level * 7;
      save.credits += bonus;
      this.runCredits += bonus;
      save.highSector = Math.max(save.highSector, this.level);
      storeSave();
      flashToast(`SECTOR CLEARED +${bonus} STARDUST`, "gold");
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + Math.ceil(this.player.maxHp * 0.14));
      this.player.shield = Math.min(this.player.maxShield, this.player.shield + 36);
      this.level += 1;
      this.beginSector();
    }

    endRun() {
      this.gameOver = true;
      this.running = false;
      ui.pauseButton.classList.add("hidden");
      ui.gameoverSector.textContent = `sector ${String(this.level).padStart(2, "0")}`;
      ui.gameoverCredits.textContent = `${number.format(this.runCredits)} stardust`;
      ui.gameover.classList.remove("hidden");
      storeSave();
    }

    updateHud(force = false) {
      if (!force && this.time - this.lastHudUpdate < 0.085) return;
      this.lastHudUpdate = this.time;
      const player = this.player;
      const boss = this.enemies.find((enemy) => enemy.type === "boss");
      const name = sectorNames[(this.level - 1) % sectorNames.length];
      ui.sectorNumber.textContent = String(this.level).padStart(2, "0");
      ui.sectorName.textContent = name;
      const hostileCount = this.enemies.length + this.spawnQueue.length;
      ui.enemyReadout.textContent = boss ? "BOSS ANOMALY LOCKED" : hostileCount ? `${hostileCount} HOSTILE${hostileCount === 1 ? "" : "S"} DETECTED` : "SECTOR SECURED";
      ui.threatLabel.textContent = boss ? "ANOMALY INTEGRITY" : `SECTOR ${String(this.level).padStart(2, "0")}`;
      const progress = boss ? boss.hp / boss.maxHp * 100 : this.spawnQueue.length || this.enemies.length ? clamp(100 - (hostileCount / (5 + Math.floor(this.level * 1.9))) * 100, 0, 100) : 100;
      ui.threatFill.style.width = `${progress}%`;
      ui.healthNumber.textContent = `${Math.max(0, Math.ceil(player.hp / player.maxHp * 100))}%`;
      ui.healthFill.style.width = `${Math.max(0, player.hp / player.maxHp * 100)}%`;
      ui.shieldFill.style.width = `${player.shield / player.maxShield * 100}%`;
      updatePersistentUI();
    }

    draw() {
      ctx.save();
      ctx.clearRect(0, 0, WORLD.width, WORLD.height);
      const shake = this.screenShake ? this.screenShake * 8 : 0;
      ctx.translate(rand(-shake, shake), rand(-shake, shake));
      this.drawBackground();
      this.drawRings();
      this.drawPickups();
      this.drawLasers();
      this.drawEnemies();
      this.drawEnemyLasers();
      this.drawParticles();
      this.drawPlayer();
      ctx.restore();
      this.drawBanner();
    }

    drawBackground() {
      const gradient = ctx.createLinearGradient(0, 0, 0, WORLD.height);
      gradient.addColorStop(0, "#020714");
      gradient.addColorStop(0.52, "#061333");
      gradient.addColorStop(1, "#03091a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, WORLD.width, WORLD.height);
      this.nebulas.forEach((nebula) => {
        const glow = ctx.createRadialGradient(nebula.x, nebula.y, 0, nebula.x, nebula.y, nebula.r);
        glow.addColorStop(0, `hsla(${nebula.hue}, 85%, 60%, ${nebula.alpha})`);
        glow.addColorStop(1, `hsla(${nebula.hue}, 85%, 40%, 0)`);
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(nebula.x, nebula.y, nebula.r, 0, Math.PI * 2); ctx.fill();
      });
      this.stars.forEach((star) => {
        ctx.fillStyle = `hsla(${star.hue}, 85%, ${78 + star.z * 14}%, ${0.33 + star.z * 0.48})`;
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });
      ctx.strokeStyle = "rgba(86, 142, 220, .075)";
      ctx.lineWidth = 1;
      for (let y = 152; y < WORLD.height; y += 58) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD.width, y + 45); ctx.stroke(); }
      const vignette = ctx.createRadialGradient(WORLD.width / 2, WORLD.height / 2, WORLD.height * 0.15, WORLD.width / 2, WORLD.height / 2, WORLD.width * 0.65);
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)"); vignette.addColorStop(1, "rgba(0, 0, 0, .42)");
      ctx.fillStyle = vignette; ctx.fillRect(0, 0, WORLD.width, WORLD.height);
    }

    drawPlayer() {
      const player = this.player;
      const stats = getStats();
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.tilt);
      if (player.invincible > 0 && Math.floor(player.invincible * 24) % 2 === 0) ctx.globalAlpha = 0.42;
      const engine = 18 + Math.sin(player.engine) * 5;
      ctx.shadowBlur = 23; ctx.shadowColor = stats.color; ctx.fillStyle = stats.color;
      ctx.beginPath(); ctx.moveTo(-12, 25); ctx.lineTo(0, 25 + engine); ctx.lineTo(12, 25); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 17; ctx.shadowColor = stats.accent; ctx.fillStyle = stats.accent;
      ctx.beginPath(); ctx.moveTo(-5, 20); ctx.lineTo(0, 29 + engine * 0.55); ctx.lineTo(5, 20); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 16; ctx.shadowColor = stats.color;
      ctx.fillStyle = stats.color;
      ctx.beginPath();
      ctx.moveTo(0, -30); ctx.lineTo(18, -6); ctx.lineTo(34, 20); ctx.lineTo(12, 15); ctx.lineTo(0, 27); ctx.lineTo(-12, 15); ctx.lineTo(-34, 20); ctx.lineTo(-18, -6); ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#102549";
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(9, 0); ctx.lineTo(0, 12); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#d9ffff"; ctx.shadowBlur = 10; ctx.shadowColor = "#e4ffff";
      ctx.beginPath(); ctx.ellipse(0, -6, 5, 10, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (player.shield > 2) {
        ctx.save(); ctx.globalAlpha = 0.06 + player.shield / 100 * 0.09; ctx.strokeStyle = "#9a86ff"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(player.x, player.y, 31, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }

    drawLasers() {
      this.lasers.forEach((laser) => {
        ctx.save(); ctx.strokeStyle = laser.color; ctx.shadowColor = laser.color; ctx.shadowBlur = 15; ctx.lineWidth = laser.radius * 0.8; ctx.beginPath(); ctx.moveTo(laser.x, laser.y + 14); ctx.lineTo(laser.x - laser.vx * 0.03, laser.y - 12); ctx.stroke(); ctx.restore();
      });
    }

    drawEnemyLasers() {
      this.enemyLasers.forEach((laser) => {
        ctx.save(); ctx.fillStyle = laser.color; ctx.shadowColor = laser.color; ctx.shadowBlur = 15; ctx.beginPath(); ctx.arc(laser.x, laser.y, laser.radius, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#fff2f7"; ctx.shadowBlur = 0; ctx.beginPath(); ctx.arc(laser.x, laser.y, Math.max(1.5, laser.radius * 0.35), 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
    }

    drawEnemies() {
      this.enemies.forEach((enemy) => {
        ctx.save(); ctx.translate(enemy.x, enemy.y); ctx.rotate(Math.sin(enemy.age * 1.1 + enemy.phase) * 0.09);
        ctx.shadowBlur = enemy.type === "boss" ? 32 : 17; ctx.shadowColor = enemy.color; ctx.fillStyle = enemy.hit > 0 ? "#ffffff" : enemy.color;
        if (enemy.type === "scout") {
          ctx.beginPath(); ctx.moveTo(0, 25); ctx.lineTo(24, -15); ctx.lineTo(8, -26); ctx.lineTo(0, -17); ctx.lineTo(-8, -26); ctx.lineTo(-24, -15); ctx.closePath(); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "#291532"; ctx.beginPath(); ctx.arc(0, -3, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffe4f0"; ctx.beginPath(); ctx.arc(0, -3, 3, 0, Math.PI * 2); ctx.fill();
        } else if (enemy.type === "orbiter") {
          ctx.rotate(enemy.age * 0.8);
          for (let arm = 0; arm < 4; arm += 1) { ctx.rotate(Math.PI / 2); ctx.fillRect(-4, -31, 8, 25); }
          ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#241c4d"; ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#e6ddff"; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
        } else if (enemy.type === "crusher") {
          ctx.beginPath(); ctx.moveTo(0, -39); ctx.lineTo(33, -12); ctx.lineTo(25, 31); ctx.lineTo(0, 42); ctx.lineTo(-25, 31); ctx.lineTo(-33, -12); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0; ctx.fillStyle = "#442337"; ctx.fillRect(-20, -4, 40, 17); ctx.fillStyle = "#fff3cf"; ctx.fillRect(-11, 0, 22, 5);
        } else {
          ctx.rotate(Math.sin(enemy.age * 0.4) * 0.05);
          for (let arm = 0; arm < 6; arm += 1) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(32, -91); ctx.lineTo(18, -25); ctx.closePath(); ctx.fill(); }
          ctx.beginPath(); ctx.ellipse(0, 0, 68, 58, 0, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = "#3d173c"; ctx.beginPath(); ctx.ellipse(0, 0, 39, 34, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ffe8f3"; ctx.shadowBlur = 16; ctx.shadowColor = "#fff3fa"; ctx.beginPath(); ctx.ellipse(0, -2, 14, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ff3d87"; ctx.shadowBlur = 10; ctx.shadowColor = "#ff3d87"; ctx.beginPath(); ctx.arc(0, -2, 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        if (enemy.type !== "scout" || enemy.hp < enemy.maxHp) this.drawEnemyHealth(enemy);
      });
    }

    drawEnemyHealth(enemy) {
      const width = enemy.type === "boss" ? 128 : enemy.radius * 1.55;
      const y = enemy.y - enemy.radius - 17;
      ctx.save(); ctx.fillStyle = "rgba(2, 7, 20, .76)"; ctx.fillRect(enemy.x - width / 2, y, width, 3); ctx.fillStyle = enemy.type === "boss" ? "#ff6295" : enemy.color; ctx.fillRect(enemy.x - width / 2, y, width * clamp(enemy.hp / enemy.maxHp, 0, 1), 3); ctx.restore();
    }

    drawPickups() {
      this.pickups.forEach((pickup) => {
        const pulse = 1 + Math.sin(pickup.age * 8) * 0.16;
        ctx.save(); ctx.translate(pickup.x, pickup.y); ctx.rotate(pickup.age * 4); ctx.scale(pulse, pulse); ctx.shadowColor = "#b9ff72"; ctx.shadowBlur = 15; ctx.fillStyle = "#caff87"; ctx.beginPath(); ctx.moveTo(0, -pickup.radius); ctx.lineTo(pickup.radius, 0); ctx.lineTo(0, pickup.radius); ctx.lineTo(-pickup.radius, 0); ctx.closePath(); ctx.fill(); ctx.restore();
      });
    }

    drawParticles() {
      this.particles.forEach((particle) => { ctx.save(); ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1); ctx.fillStyle = particle.color; ctx.shadowBlur = 8; ctx.shadowColor = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    }

    drawRings() {
      this.rings.forEach((ring) => { const progress = ring.age / ring.life; ctx.save(); ctx.globalAlpha = 1 - progress; ctx.strokeStyle = ring.color; ctx.shadowColor = ring.color; ctx.shadowBlur = 14; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ring.x, ring.y, lerp(ring.radius, ring.max, progress), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); });
    }

    drawBanner() {
      if (!this.bannerTimer || this.bannerTimer <= 0) return;
      this.bannerTimer = Math.max(0, this.bannerTimer - 1 / 60);
      const alpha = Math.min(1, this.bannerTimer * 2, (2.8 - this.bannerTimer) * 3);
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#e5f9ff"; ctx.font = "600 15px DM Mono"; ctx.textAlign = "center"; ctx.letterSpacing = "3px"; ctx.fillText(this.bannerText, WORLD.width / 2, 138); ctx.strokeStyle = "rgba(100, 231, 255, .55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(WORLD.width / 2 - 175, 149); ctx.lineTo(WORLD.width / 2 + 175, 149); ctx.stroke(); ctx.restore();
    }

    loop(timestamp) {
      const dt = Math.min(0.035, (timestamp - this.lastTime) / 1000 || 0);
      this.lastTime = timestamp;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  const game = new Game();

  function startMission() {
    closeHangar();
    game.start();
  }

  function openHangar() {
    const wasPlaying = game.running && !game.paused;
    ui.hangar.dataset.resume = String(wasPlaying);
    if (wasPlaying) game.togglePause(true);
    renderHangar();
    ui.hangar.classList.remove("hidden");
  }

  function closeHangar() {
    if (ui.hangar.classList.contains("hidden")) return;
    const shouldResume = ui.hangar.dataset.resume === "true";
    ui.hangar.classList.add("hidden");
    if (shouldResume) game.togglePause(false);
  }

  function renderHangar() {
    updatePersistentUI();
    const activeStats = getStats();
    ui.shipGrid.innerHTML = ships.map((ship) => {
      const owned = save.owned.includes(ship.id);
      const selected = save.selected === ship.id;
      const stats = getStats(ship.id);
      const action = selected ? "EQUIPPED" : owned ? "SELECT SHIP" : `BUY · ✦ ${number.format(ship.price)}`;
      return `<article class="ship-option ${selected ? "selected" : ""} ${owned ? "" : "locked"}" style="--ship-color:${ship.color}">
        <div class="option-strip"></div><div class="option-tier">${ship.tier}</div><h4>${ship.name}</h4><p>${ship.tagline}</p><div class="ship-glyph"></div>
        <div class="ship-stats"><span>POWER<b>${stats.damage}</b></span><span>HULL<b>${stats.hull}</b></span><span>DRIVE<b>${stats.speed}</b></span></div>
        <button class="ship-action" data-ship="${ship.id}" ${selected ? "disabled" : ""}>${action}</button>
      </article>`;
    }).join("");
    ui.upgradeGrid.innerHTML = upgradeTypes.map((upgrade) => {
      const level = getUpgrades()[upgrade.id];
      const cost = upgradeCost(upgrade, level);
      return `<article class="upgrade-card"><div class="upgrade-top"><span class="upgrade-icon">${upgrade.icon}</span><h4>${upgrade.name}</h4></div><p>${upgrade.description}</p><div class="upgrade-level">TIER ${level} · ${upgradePreview(upgrade.id, activeStats)}</div><button class="upgrade-action" data-upgrade="${upgrade.id}" ${save.credits < cost ? "disabled" : ""}>UPGRADE · ✦ ${number.format(cost)}</button></article>`;
    }).join("");
  }

  function upgradeCost(upgrade, level) {
    const shipIndex = Math.max(0, ships.findIndex((ship) => ship.id === save.selected));
    return Math.round(upgrade.baseCost * (level + 1) * (1 + level * 0.34) * (1 + shipIndex * 0.16));
  }

  function upgradePreview(id, stats) {
    if (id === "damage") return `${stats.damage} DMG`;
    if (id === "rate") return `${Math.round(stats.fireRate * 1000)}ms CYCLE`;
    return `${stats.hull} HULL`;
  }

  ui.shipGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-ship]");
    if (!button) return;
    const ship = ships.find((candidate) => candidate.id === button.dataset.ship);
    if (!ship) return;
    if (!save.owned.includes(ship.id)) {
      if (save.credits < ship.price) { flashToast("NOT ENOUGH STARDUST", "danger"); return; }
      save.credits -= ship.price;
      save.owned.push(ship.id);
      save.upgrades[ship.id] = { damage: 0, rate: 0, hull: 0 };
      flashToast(`${ship.name.toUpperCase()} ADDED TO FLEET`, "gold");
    }
    save.selected = ship.id;
    storeSave();
    game.applyLoadout();
    renderHangar();
  });

  ui.upgradeGrid.addEventListener("click", (event) => {
    const button = event.target.closest("[data-upgrade]");
    if (!button) return;
    const upgrade = upgradeTypes.find((candidate) => candidate.id === button.dataset.upgrade);
    if (!upgrade) return;
    const upgrades = getUpgrades();
    const cost = upgradeCost(upgrade, upgrades[upgrade.id]);
    if (save.credits < cost) { flashToast("NOT ENOUGH STARDUST", "danger"); return; }
    save.credits -= cost;
    upgrades[upgrade.id] += 1;
    storeSave();
    game.applyLoadout();
    flashToast(`${upgrade.name.toUpperCase()} UPGRADED`, "gold");
    renderHangar();
  });

  $("#launchButton").addEventListener("click", startMission);
  $("#restartButton").addEventListener("click", startMission);
  $("#resumeButton").addEventListener("click", () => game.togglePause(false));
  ui.pauseButton.addEventListener("click", () => game.togglePause());
  $("#hangarButton").addEventListener("click", openHangar);
  $("#changeShipButton").addEventListener("click", openHangar);
  $("#closeHangarButton").addEventListener("click", closeHangar);
  ui.hangar.addEventListener("click", (event) => { if (event.target === ui.hangar) closeHangar(); });

  updatePersistentUI();
})();

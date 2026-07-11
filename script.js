const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const intro = $('intro');
const gameOver = $('gameOver');
const startButton = $('startButton');
const restartButton = $('restartButton');
const statusText = $('status');
const scoreText = $('score');
const livesText = $('lives');
const endLabel = $('endLabel');
const endTitle = $('endTitle');
const endText = $('endText');
const message = $('message');

let running = false;
let score = 0;
let lives = 3;
let level = 1;
let lastTime = 0;
let animationId = 0;
let baseBeta = null;
let baseGamma = null;
let orientationBound = false;
let fireCooldown = 0;
let enemySpawnTimer = 0;
let enemyFireTimer = 0;
let shake = 0;

const ship = { x: 0, y: 0, vx: 0, vy: 0, w: 34, h: 46, invulnerable: 0 };
const bullets = [];
const enemyBullets = [];
const enemies = [];
const particles = [];
const stars = [];
let input = { x: 0, y: 0 };

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!running) {
    ship.x = innerWidth / 2;
    ship.y = innerHeight * 0.78;
  }
  makeStars();
}

function makeStars() {
  stars.length = 0;
  const count = Math.max(55, Math.floor(innerWidth * innerHeight / 9000));
  for (let i = 0; i < count; i += 1) {
    stars.push({
      x: Math.random() * innerWidth,
      y: Math.random() * innerHeight,
      size: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 45 + 18,
      alpha: Math.random() * 0.7 + 0.25
    });
  }
}

function permissionPromise(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') return Promise.resolve('granted');
  return EventType.requestPermission();
}

function handleOrientation(event) {
  if (!running) return;
  if (baseBeta === null && Number.isFinite(event.beta)) baseBeta = event.beta;
  if (baseGamma === null && Number.isFinite(event.gamma)) baseGamma = event.gamma;
  const beta = Number.isFinite(event.beta) ? event.beta - baseBeta : 0;
  const gamma = Number.isFinite(event.gamma) ? event.gamma - baseGamma : 0;
  input.x = Math.max(-1, Math.min(1, gamma / 24));
  input.y = Math.max(-1, Math.min(1, beta / 28));
}

function spawnEnemy() {
  const heavy = Math.random() < Math.min(0.12 + level * 0.02, 0.35);
  const r = heavy ? 24 : 15 + Math.random() * 7;
  enemies.push({
    x: 28 + Math.random() * (innerWidth - 56),
    y: -40,
    vx: (Math.random() - 0.5) * (35 + level * 6),
    vy: 55 + level * 9 + Math.random() * 28,
    r,
    hp: heavy ? 3 : 1,
    maxHp: heavy ? 3 : 1,
    phase: Math.random() * Math.PI * 2,
    heavy
  });
}

function shoot() {
  bullets.push({ x: ship.x - 8, y: ship.y - 25, vy: -720, r: 3 });
  bullets.push({ x: ship.x + 8, y: ship.y - 25, vy: -720, r: 3 });
}

function enemyShoot(enemy) {
  const dx = ship.x - enemy.x;
  const dy = ship.y - enemy.y;
  const length = Math.hypot(dx, dy) || 1;
  const speed = 175 + level * 14;
  enemyBullets.push({
    x: enemy.x,
    y: enemy.y + enemy.r,
    vx: dx / length * speed,
    vy: dy / length * speed,
    r: enemy.heavy ? 6 : 4
  });
}

function explode(x, y, color, amount = 14) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 50 + Math.random() * 220;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45 + Math.random() * 0.55,
      maxLife: 1,
      size: 1.5 + Math.random() * 3.5,
      color
    });
  }
}

function resetGame() {
  cancelAnimationFrame(animationId);
  score = 0;
  lives = 3;
  level = 1;
  fireCooldown = 0;
  enemySpawnTimer = 0;
  enemyFireTimer = 0;
  shake = 0;
  baseBeta = null;
  baseGamma = null;
  bullets.length = 0;
  enemyBullets.length = 0;
  enemies.length = 0;
  particles.length = 0;
  ship.x = innerWidth / 2;
  ship.y = innerHeight * 0.8;
  ship.vx = 0;
  ship.vy = 0;
  ship.invulnerable = 0;
  scoreText.textContent = '0';
  livesText.textContent = '3';
  intro.classList.add('hidden');
  gameOver.classList.add('hidden');
  message.textContent = 'Incline para pilotar. Tiros automáticos.';
  running = true;
  lastTime = performance.now();
  animationId = requestAnimationFrame(loop);
}

function hitShip() {
  if (ship.invulnerable > 0) return;
  lives -= 1;
  livesText.textContent = String(lives);
  ship.invulnerable = 1.8;
  shake = 12;
  explode(ship.x, ship.y, '#67dfff', 28);
  if (navigator.vibrate) navigator.vibrate([40, 40, 80]);
  if (lives <= 0) finish();
}

function circleHit(a, b, radiusA, radiusB) {
  return Math.hypot(a.x - b.x, a.y - b.y) < radiusA + radiusB;
}

function update(dt) {
  level = 1 + Math.floor(score / 250);
  ship.invulnerable = Math.max(0, ship.invulnerable - dt);
  ship.vx += input.x * 900 * dt;
  ship.vy += input.y * 700 * dt;
  ship.vx *= Math.pow(0.0008, dt);
  ship.vy *= Math.pow(0.0015, dt);
  ship.x += ship.vx * dt;
  ship.y += ship.vy * dt;
  ship.x = Math.max(24, Math.min(innerWidth - 24, ship.x));
  ship.y = Math.max(100, Math.min(innerHeight - 42, ship.y));

  fireCooldown -= dt;
  if (fireCooldown <= 0) {
    shoot();
    fireCooldown = Math.max(0.12, 0.24 - level * 0.01);
  }

  enemySpawnTimer -= dt;
  if (enemySpawnTimer <= 0) {
    spawnEnemy();
    enemySpawnTimer = Math.max(0.35, 0.95 - level * 0.06);
  }

  enemyFireTimer -= dt;
  if (enemyFireTimer <= 0 && enemies.length) {
    const shooters = enemies.filter((e) => e.y > 40 && e.y < innerHeight * 0.62);
    if (shooters.length) enemyShoot(shooters[Math.floor(Math.random() * shooters.length)]);
    enemyFireTimer = Math.max(0.45, 1.25 - level * 0.07);
  }

  for (const star of stars) {
    star.y += star.speed * dt;
    if (star.y > innerHeight + 4) { star.y = -4; star.x = Math.random() * innerWidth; }
  }

  for (const bullet of bullets) bullet.y += bullet.vy * dt;
  for (const bullet of enemyBullets) { bullet.x += bullet.vx * dt; bullet.y += bullet.vy * dt; }

  for (const enemy of enemies) {
    enemy.phase += dt * 2.2;
    enemy.x += (enemy.vx + Math.sin(enemy.phase) * 26) * dt;
    enemy.y += enemy.vy * dt;
    if (enemy.x < enemy.r || enemy.x > innerWidth - enemy.r) enemy.vx *= -1;
    if (enemy.y > innerHeight + 50) {
      enemy.dead = true;
      hitShip();
    }
    if (!enemy.dead && circleHit(enemy, ship, enemy.r, 18)) {
      enemy.dead = true;
      explode(enemy.x, enemy.y, '#ff5f87', 18);
      hitShip();
    }
  }

  for (const bullet of bullets) {
    if (bullet.dead) continue;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      if (circleHit(bullet, enemy, bullet.r, enemy.r)) {
        bullet.dead = true;
        enemy.hp -= 1;
        explode(bullet.x, bullet.y, '#ffe96d', 5);
        if (enemy.hp <= 0) {
          enemy.dead = true;
          score += enemy.heavy ? 40 : 10;
          scoreText.textContent = String(score);
          explode(enemy.x, enemy.y, enemy.heavy ? '#b47cff' : '#ff5f87', enemy.heavy ? 30 : 18);
          if (navigator.vibrate) navigator.vibrate(18);
        }
        break;
      }
    }
  }

  for (const bullet of enemyBullets) {
    if (!bullet.dead && circleHit(bullet, ship, bullet.r, 16)) {
      bullet.dead = true;
      hitShip();
    }
  }

  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.pow(0.05, dt);
    p.vy *= Math.pow(0.05, dt);
    p.life -= dt;
  }

  removeDead(bullets, (b) => b.dead || b.y < -30);
  removeDead(enemyBullets, (b) => b.dead || b.y > innerHeight + 30 || b.x < -30 || b.x > innerWidth + 30);
  removeDead(enemies, (e) => e.dead);
  removeDead(particles, (p) => p.life <= 0);
  shake *= Math.pow(0.01, dt);
}

function removeDead(array, predicate) {
  for (let i = array.length - 1; i >= 0; i -= 1) if (predicate(array[i])) array.splice(i, 1);
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, innerHeight);
  gradient.addColorStop(0, '#061022');
  gradient.addColorStop(0.55, '#090d20');
  gradient.addColorStop(1, '#02040a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, innerWidth, innerHeight);

  for (const star of stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = '#fff';
    ctx.fillRect(star.x, star.y, star.size, star.size * 2.4);
  }
  ctx.globalAlpha = 1;

  const planetY = innerHeight + 110;
  const planet = ctx.createRadialGradient(innerWidth / 2, planetY - 80, 20, innerWidth / 2, planetY, innerWidth * 0.72);
  planet.addColorStop(0, '#26a8d7');
  planet.addColorStop(0.55, '#0d4f7f');
  planet.addColorStop(1, '#03101d');
  ctx.fillStyle = planet;
  ctx.beginPath();
  ctx.arc(innerWidth / 2, planetY, innerWidth * 0.72, Math.PI, Math.PI * 2);
  ctx.fill();
}

function drawShip() {
  if (ship.invulnerable > 0 && Math.floor(ship.invulnerable * 12) % 2 === 0) return;
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(input.x * 0.18);
  ctx.shadowColor = '#52d8ff';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#dff8ff';
  ctx.beginPath();
  ctx.moveTo(0, -25);
  ctx.lineTo(18, 20);
  ctx.lineTo(7, 14);
  ctx.lineTo(0, 22);
  ctx.lineTo(-7, 14);
  ctx.lineTo(-18, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#53cfff';
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(7, 10);
  ctx.lineTo(-7, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff9b3f';
  ctx.beginPath();
  ctx.moveTo(-6, 20); ctx.lineTo(0, 36 + Math.random() * 8); ctx.lineTo(6, 20); ctx.fill();
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.rotate(Math.sin(enemy.phase) * 0.12);
    ctx.shadowColor = enemy.heavy ? '#b47cff' : '#ff5f87';
    ctx.shadowBlur = enemy.heavy ? 24 : 15;
    ctx.fillStyle = enemy.heavy ? '#8e5cff' : '#f23d70';
    ctx.beginPath();
    ctx.moveTo(0, enemy.r);
    ctx.lineTo(enemy.r, -enemy.r * 0.7);
    ctx.lineTo(enemy.r * 0.34, -enemy.r * 0.45);
    ctx.lineTo(0, -enemy.r);
    ctx.lineTo(-enemy.r * 0.34, -enemy.r * 0.45);
    ctx.lineTo(-enemy.r, -enemy.r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffd7e4';
    ctx.fillRect(-enemy.r * 0.38, -3, enemy.r * 0.76, 5);
    if (enemy.maxHp > 1) {
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(-enemy.r, enemy.r + 8, enemy.r * 2, 3);
      ctx.fillStyle = '#b47cff';
      ctx.fillRect(-enemy.r, enemy.r + 8, enemy.r * 2 * (enemy.hp / enemy.maxHp), 3);
    }
    ctx.restore();
  }
}

function drawProjectiles() {
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#ffe96d';
  ctx.fillStyle = '#fff8a8';
  for (const b of bullets) ctx.fillRect(b.x - 2, b.y - 9, 4, 18);
  ctx.shadowColor = '#ff4e78';
  ctx.fillStyle = '#ff668c';
  for (const b of enemyBullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  drawProjectiles();
  drawEnemies();
  drawShip();
  drawParticles();
  ctx.restore();
}

function loop(now) {
  if (!running) return;
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  draw();
  animationId = requestAnimationFrame(loop);
}

function finish() {
  if (!running) return;
  running = false;
  cancelAnimationFrame(animationId);
  endLabel.textContent = 'NAVE DESTRUÍDA';
  endTitle.textContent = `${score} pontos`;
  endText.textContent = score >= 500
    ? 'Defesa impecável. Os alienígenas abriram uma reclamação formal.'
    : score >= 200
      ? 'Boa resistência. O planeta sobreviveu mais do que a burocracia terrestre esperava.'
      : 'A invasão venceu esta rodada. Pelo menos o iPhone saiu ileso.';
  gameOver.classList.remove('hidden');
  message.textContent = `Nível alcançado: ${level}`;
}

async function prepareAndStart() {
  startButton.disabled = true;
  statusText.textContent = 'Solicitando acesso aos sensores...';
  try {
    const [orientationPermission, motionPermission] = await Promise.all([
      permissionPromise(window.DeviceOrientationEvent),
      permissionPromise(window.DeviceMotionEvent)
    ]);
    if (orientationPermission !== 'granted' || motionPermission !== 'granted') {
      throw new Error(`Permissões: ${orientationPermission}/${motionPermission}`);
    }
    if (!orientationBound) {
      window.addEventListener('deviceorientation', handleOrientation, true);
      orientationBound = true;
    }
    resetGame();
  } catch (error) {
    statusText.textContent = `Não foi possível iniciar: ${error.message || error}`;
    startButton.disabled = false;
  }
}

startButton.addEventListener('click', prepareAndStart);
restartButton.addEventListener('click', resetGame);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();
draw();
const $ = (id) => document.getElementById(id);
const canvas = $('game');
const ctx = canvas.getContext('2d');
const intro = $('intro');
const gameOver = $('gameOver');
const startButton = $('startButton');
const restartButton = $('restartButton');
const statusText = $('status');
const remainingText = $('remaining');
const timeText = $('time');
const endLabel = $('endLabel');
const endTitle = $('endTitle');
const endText = $('endText');
const message = $('message');

const BALL_COUNT = 12;
let balls = [];
let hole = { x: 0, y: 0, radius: 42 };
let gravity = { x: 0, y: 240 };
let running = false;
let remaining = BALL_COUNT;
let timeLeft = 60;
let lastTime = 0;
let animationId = 0;
let timerId = 0;
let baseBeta = null;
let baseGamma = null;
let orientationBound = false;

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  hole.x = innerWidth * 0.5;
  hole.y = innerHeight * 0.57;
  hole.radius = Math.max(34, Math.min(innerWidth, innerHeight) * 0.065);
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
  gravity.x = Math.max(-650, Math.min(650, gamma * 24));
  gravity.y = Math.max(-650, Math.min(650, beta * 24));
}

function randomBall(index) {
  const radius = 12 + Math.random() * 5;
  let x;
  let y;
  do {
    x = 35 + Math.random() * (innerWidth - 70);
    y = 100 + Math.random() * (innerHeight - 180);
  } while (Math.hypot(x - hole.x, y - hole.y) < hole.radius + 80);

  return {
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    color: `hsl(${(index * 31 + 185) % 360} 82% 62%)`,
    active: true,
    shrink: 1
  };
}

function resetGame() {
  clearInterval(timerId);
  cancelAnimationFrame(animationId);
  baseBeta = null;
  baseGamma = null;
  remaining = BALL_COUNT;
  timeLeft = 60;
  remainingText.textContent = String(remaining);
  timeText.textContent = String(timeLeft);
  balls = Array.from({ length: BALL_COUNT }, (_, index) => randomBall(index));
  running = true;
  lastTime = performance.now();
  intro.classList.add('hidden');
  gameOver.classList.add('hidden');
  message.textContent = 'Incline o iPhone e conduza as bolas ao buraco';
  timerId = setInterval(() => {
    timeLeft -= 1;
    timeText.textContent = String(Math.max(0, timeLeft));
    if (timeLeft <= 0) finish(false);
  }, 1000);
  animationId = requestAnimationFrame(loop);
}

function resolveBallCollision(a, b) {
  if (!a.active || !b.active) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy) || 0.001;
  const minimum = a.radius + b.radius;
  if (distance >= minimum) return;

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = minimum - distance;
  a.x -= nx * overlap * 0.5;
  a.y -= ny * overlap * 0.5;
  b.x += nx * overlap * 0.5;
  b.y += ny * overlap * 0.5;

  const relative = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (relative > 0) return;
  const impulse = -(1.72) * relative / 2;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
}

function update(dt) {
  const damping = Math.pow(0.992, dt * 60);
  for (const ball of balls) {
    if (!ball.active) {
      ball.shrink *= Math.pow(0.04, dt);
      continue;
    }

    ball.vx = (ball.vx + gravity.x * dt) * damping;
    ball.vy = (ball.vy + gravity.y * dt) * damping;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 900) {
      ball.vx *= 900 / speed;
      ball.vy *= 900 / speed;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.radius < 0) { ball.x = ball.radius; ball.vx *= -0.72; }
    if (ball.x + ball.radius > innerWidth) { ball.x = innerWidth - ball.radius; ball.vx *= -0.72; }
    if (ball.y - ball.radius < 72) { ball.y = 72 + ball.radius; ball.vy *= -0.72; }
    if (ball.y + ball.radius > innerHeight) { ball.y = innerHeight - ball.radius; ball.vy *= -0.72; }

    const distanceToHole = Math.hypot(ball.x - hole.x, ball.y - hole.y);
    if (distanceToHole < hole.radius - ball.radius * 0.15) {
      ball.active = false;
      ball.vx = 0;
      ball.vy = 0;
      remaining -= 1;
      remainingText.textContent = String(remaining);
      if (navigator.vibrate) navigator.vibrate(25);
      if (remaining === 0) finish(true);
    }
  }

  for (let i = 0; i < balls.length; i += 1) {
    for (let j = i + 1; j < balls.length; j += 1) resolveBallCollision(balls[i], balls[j]);
  }
}

function drawBoard() {
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  const grid = 28;
  ctx.strokeStyle = 'rgba(255,255,255,.035)';
  ctx.lineWidth = 1;
  for (let x = 0; x < innerWidth; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 70); ctx.lineTo(x, innerHeight); ctx.stroke();
  }
  for (let y = 70; y < innerHeight; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(innerWidth, y); ctx.stroke();
  }

  const shadow = ctx.createRadialGradient(hole.x, hole.y, 2, hole.x, hole.y, hole.radius * 1.5);
  shadow.addColorStop(0, '#000');
  shadow.addColorStop(.63, '#020305');
  shadow.addColorStop(.72, 'rgba(0,0,0,.9)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(110,214,255,.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(hole.x, hole.y, hole.radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawBalls() {
  for (const ball of balls) {
    if (ball.shrink < 0.03) continue;
    ctx.save();
    ctx.translate(ball.x, ball.y);
    ctx.scale(ball.shrink, ball.shrink);
    const gradient = ctx.createRadialGradient(-ball.radius * .35, -ball.radius * .4, 2, 0, 0, ball.radius);
    gradient.addColorStop(0, '#fff');
    gradient.addColorStop(.18, ball.color);
    gradient.addColorStop(1, '#111827');
    ctx.shadowColor = ball.color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function loop(now) {
  if (!running) return;
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;
  update(dt);
  drawBoard();
  drawBalls();
  animationId = requestAnimationFrame(loop);
}

function finish(won) {
  if (!running) return;
  running = false;
  clearInterval(timerId);
  cancelAnimationFrame(animationId);
  endLabel.textContent = won ? 'VITÓRIA' : 'TEMPO ESGOTADO';
  endTitle.textContent = won ? `${60 - timeLeft}s` : `${remaining} restantes`;
  endText.textContent = won
    ? 'Todas as bolas caíram. A gravidade, por algum milagre administrativo, colaborou.'
    : 'Algumas bolas resistiram heroicamente ao buraco. Tente movimentos menores e mais controlados.';
  gameOver.classList.remove('hidden');
  message.textContent = won ? 'Todas as bolas capturadas' : 'Fim de jogo';
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
drawBoard();
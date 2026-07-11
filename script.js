const $ = (id) => document.getElementById(id);
const video = $('camera');
const canvas = $('game');
const ctx = canvas.getContext('2d');
const intro = $('intro');
const gameOver = $('gameOver');
const startButton = $('startButton');
const restartButton = $('restartButton');
const statusText = $('status');
const scoreText = $('score');
const timeText = $('time');
const finalScoreText = $('finalScore');
const resultText = $('resultText');
const crosshair = $('crosshair');
const hint = $('hint');

let running = false;
let score = 0;
let timeLeft = 30;
let timerId = null;
let animationId = null;
let target = null;
let tiltX = 0;
let tiltY = 0;
let baseBeta = null;
let baseGamma = null;
let cameraStream = null;
let lastFrame = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function permissionPromise(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') {
    return Promise.resolve('granted');
  }
  return EventType.requestPermission();
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Câmera não disponível neste navegador.');
  }

  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { ideal: 1280 },
      height: { ideal: 720 }
    },
    audio: false
  });

  video.srcObject = cameraStream;
  await video.play();
}

function handleOrientation(event) {
  if (!running) return;
  if (baseBeta === null && typeof event.beta === 'number') baseBeta = event.beta;
  if (baseGamma === null && typeof event.gamma === 'number') baseGamma = event.gamma;

  const beta = typeof event.beta === 'number' ? event.beta - (baseBeta || 0) : 0;
  const gamma = typeof event.gamma === 'number' ? event.gamma - (baseGamma || 0) : 0;
  tiltX = Math.max(-1, Math.min(1, gamma / 28));
  tiltY = Math.max(-1, Math.min(1, beta / 28));
}

function spawnTarget() {
  const margin = 60;
  const radius = 24 + Math.random() * 16;
  target = {
    x: margin + Math.random() * Math.max(1, innerWidth - margin * 2),
    y: 120 + Math.random() * Math.max(1, innerHeight - 240),
    radius,
    pulse: 0,
    hue: 72 + Math.random() * 55
  };
}

function crosshairPosition() {
  const x = innerWidth / 2 + tiltX * innerWidth * 0.36;
  const y = innerHeight * 0.58 + tiltY * innerHeight * 0.31;
  return {
    x: Math.max(45, Math.min(innerWidth - 45, x)),
    y: Math.max(90, Math.min(innerHeight - 55, y))
  };
}

function drawTarget(now) {
  if (!target) return;
  target.pulse = (Math.sin(now / 180) + 1) / 2;
  const glow = target.radius + target.pulse * 12;
  const gradient = ctx.createRadialGradient(target.x, target.y, 2, target.x, target.y, glow * 1.7);
  gradient.addColorStop(0, `hsla(${target.hue},100%,82%,1)`);
  gradient.addColorStop(.28, `hsla(${target.hue},100%,62%,.95)`);
  gradient.addColorStop(1, `hsla(${target.hue},100%,55%,0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(target.x, target.y, glow * 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `hsla(${target.hue},100%,82%,.95)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(target.x, target.y, target.radius + target.pulse * 5, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.beginPath();
  ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
  ctx.fill();
}

function checkHit() {
  if (!target || !running) return;
  const aim = crosshairPosition();
  crosshair.style.left = `${aim.x}px`;
  crosshair.style.top = `${aim.y}px`;

  const distance = Math.hypot(aim.x - target.x, aim.y - target.y);
  if (distance < target.radius + 26) {
    score += 1;
    scoreText.textContent = String(score);
    crosshair.classList.remove('hit');
    void crosshair.offsetWidth;
    crosshair.classList.add('hit');
    if (navigator.vibrate) navigator.vibrate(35);
    spawnTarget();
  }
}

function loop(now) {
  if (!running) return;
  const delta = now - lastFrame;
  if (delta > 16) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    drawTarget(now);
    checkHit();
    lastFrame = now;
  }
  animationId = requestAnimationFrame(loop);
}

function finishGame() {
  running = false;
  clearInterval(timerId);
  cancelAnimationFrame(animationId);
  finalScoreText.textContent = String(score);
  resultText.textContent = score >= 15
    ? 'Reflexos suspeitosamente bons. A humanidade ainda tem alguma chance.'
    : score >= 8
      ? 'Nada mal. O retângulo de vidro obedeceu razoavelmente.'
      : 'Os pontos sobreviveram. Sua dignidade talvez também.';
  gameOver.classList.remove('hidden');
  hint.textContent = 'Jogo encerrado';
}

function beginGame() {
  score = 0;
  timeLeft = 30;
  baseBeta = null;
  baseGamma = null;
  scoreText.textContent = '0';
  timeText.textContent = '30';
  intro.classList.add('hidden');
  gameOver.classList.add('hidden');
  hint.textContent = 'Incline o aparelho para mover a mira';
  spawnTarget();
  running = true;
  lastFrame = performance.now();
  animationId = requestAnimationFrame(loop);
  timerId = setInterval(() => {
    timeLeft -= 1;
    timeText.textContent = String(timeLeft);
    if (timeLeft <= 0) finishGame();
  }, 1000);
}

async function prepareAndStart() {
  startButton.disabled = true;
  statusText.textContent = 'Solicitando câmera e sensores...';

  if (!window.isSecureContext) {
    statusText.textContent = 'Abra por HTTPS.';
    startButton.disabled = false;
    return;
  }

  try {
    const orientationRequest = permissionPromise(window.DeviceOrientationEvent);
    const motionRequest = permissionPromise(window.DeviceMotionEvent);
    const cameraRequest = startCamera();
    const [orientationPermission, motionPermission] = await Promise.all([
      orientationRequest,
      motionRequest,
      cameraRequest.then(() => 'camera-ok')
    ]);

    if (orientationPermission !== 'granted' || motionPermission !== 'granted') {
      throw new Error(`Sensores negados: ${orientationPermission}/${motionPermission}`);
    }

    window.addEventListener('deviceorientation', handleOrientation, true);
    beginGame();
  } catch (error) {
    statusText.textContent = `Não foi possível iniciar: ${error.message || error}`;
    startButton.disabled = false;
  }
}

startButton.addEventListener('click', prepareAndStart);
restartButton.addEventListener('click', beginGame);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
resize();

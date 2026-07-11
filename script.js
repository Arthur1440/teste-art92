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
const detectedText = $('detected');

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
let objectModel = null;
let surfaceModel = null;
let objectDetections = [];
let surfaceAnchors = [];
let lastFrame = 0;
let detecting = false;
let detectionTimer = null;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(innerWidth * dpr);
  canvas.height = Math.round(innerHeight * dpr);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function permissionPromise(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') return Promise.resolve('granted');
  return EventType.requestPermission();
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Câmera não disponível neste navegador.');
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 }, height: { ideal: 540 } },
    audio: false
  });
  video.srcObject = cameraStream;
  await video.play();
}

async function loadModels() {
  statusText.textContent = 'Carregando reconhecimento de objetos...';
  if (!window.cocoSsd) throw new Error('Modelo de objetos não carregou. Atualize a página.');
  objectModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

  statusText.textContent = 'Carregando reconhecimento de chão e parede...';
  try {
    if (window.deeplab) {
      surfaceModel = await deeplab.load({ base: 'ade20k', quantizationBytes: 2 });
    }
  } catch (error) {
    console.warn('Segmentação indisponível; usando estimativa visual.', error);
    surfaceModel = null;
  }
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

function videoToScreen(x, y, width, height) {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const scale = Math.max(innerWidth / vw, innerHeight / vh);
  const drawnW = vw * scale;
  const drawnH = vh * scale;
  const offsetX = (innerWidth - drawnW) / 2;
  const offsetY = (innerHeight - drawnH) / 2;
  return {
    x: offsetX + (x / width) * drawnW,
    y: offsetY + (y / height) * drawnH
  };
}

function findSurfaceAnchors(segmentation) {
  const anchors = [];
  const map = segmentation?.segmentationMap;
  const width = segmentation?.width;
  const height = segmentation?.height;
  const legend = segmentation?.legend || {};
  if (!map || !width || !height) return anchors;

  const wanted = [];
  Object.entries(legend).forEach(([name, rgb]) => {
    const normalized = name.toLowerCase();
    if (normalized.includes('wall')) wanted.push({ type: 'parede', rgb });
    if (normalized.includes('floor')) wanted.push({ type: 'chão', rgb });
  });

  const step = Math.max(4, Math.floor(Math.min(width, height) / 40));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const index = (y * width + x) * 4;
      const match = wanted.find((item) => item.rgb[0] === map[index] && item.rgb[1] === map[index + 1] && item.rgb[2] === map[index + 2]);
      if (!match) continue;
      const p = videoToScreen(x, y, width, height);
      if (p.x > 30 && p.x < innerWidth - 30 && p.y > 90 && p.y < innerHeight - 60) {
        anchors.push({ x: p.x, y: p.y, type: match.type });
      }
    }
  }
  return anchors;
}

function estimatedSurfaces() {
  return [
    { x: innerWidth * 0.25, y: innerHeight * 0.36, type: 'parede estimada' },
    { x: innerWidth * 0.72, y: innerHeight * 0.42, type: 'parede estimada' },
    { x: innerWidth * 0.32, y: innerHeight * 0.76, type: 'chão estimado' },
    { x: innerWidth * 0.68, y: innerHeight * 0.82, type: 'chão estimado' }
  ];
}

async function runDetection() {
  if (!running || detecting || video.readyState < 2 || !objectModel) return;
  detecting = true;
  try {
    const predictions = await objectModel.detect(video, 8, 0.5);
    objectDetections = predictions.map((prediction) => {
      const [x, y, w, h] = prediction.bbox;
      const topLeft = videoToScreen(x, y, video.videoWidth, video.videoHeight);
      const bottomRight = videoToScreen(x + w, y + h, video.videoWidth, video.videoHeight);
      return {
        label: prediction.class,
        score: prediction.score,
        x: topLeft.x,
        y: topLeft.y,
        w: bottomRight.x - topLeft.x,
        h: bottomRight.y - topLeft.y
      };
    });

    if (surfaceModel) {
      try {
        const segmentation = await surfaceModel.segment(video);
        const anchors = findSurfaceAnchors(segmentation);
        surfaceAnchors = anchors.length ? anchors : estimatedSurfaces();
      } catch (error) {
        surfaceAnchors = estimatedSurfaces();
      }
    } else {
      surfaceAnchors = estimatedSurfaces();
    }

    const names = [...new Set(objectDetections.map((item) => item.label))].slice(0, 3);
    const hasWall = surfaceAnchors.some((item) => item.type.includes('parede'));
    const hasFloor = surfaceAnchors.some((item) => item.type.includes('chão'));
    const parts = [];
    if (hasWall) parts.push('parede');
    if (hasFloor) parts.push('chão');
    parts.push(...names);
    detectedText.textContent = parts.length ? `Detectado: ${parts.join(' • ')}` : 'Procure objetos, chão ou parede';
  } catch (error) {
    console.warn(error);
    detectedText.textContent = 'IA ajustando a leitura do ambiente...';
  } finally {
    detecting = false;
  }
}

function chooseAnchor() {
  const objectAnchors = objectDetections
    .filter((item) => item.w > 35 && item.h > 35)
    .map((item) => ({
      x: item.x + item.w * (0.25 + Math.random() * 0.5),
      y: item.y + item.h * (0.25 + Math.random() * 0.5),
      type: item.label
    }));
  const candidates = [...objectAnchors, ...surfaceAnchors];
  if (!candidates.length) return { x: innerWidth / 2, y: innerHeight * 0.55, type: 'ambiente' };
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function spawnTarget() {
  const anchor = chooseAnchor();
  target = {
    x: Math.max(50, Math.min(innerWidth - 50, anchor.x)),
    y: Math.max(105, Math.min(innerHeight - 65, anchor.y)),
    radius: 24 + Math.random() * 12,
    pulse: 0,
    hue: 72 + Math.random() * 55,
    label: anchor.type
  };
  hint.textContent = `Alvo em: ${target.label}`;
}

function crosshairPosition() {
  const x = innerWidth / 2 + tiltX * innerWidth * 0.36;
  const y = innerHeight * 0.58 + tiltY * innerHeight * 0.31;
  return {
    x: Math.max(45, Math.min(innerWidth - 45, x)),
    y: Math.max(90, Math.min(innerHeight - 55, y))
  };
}

function drawDetections() {
  ctx.save();
  ctx.font = '700 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  objectDetections.forEach((item) => {
    ctx.strokeStyle = 'rgba(183,255,106,.8)';
    ctx.fillStyle = 'rgba(183,255,106,.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(item.x, item.y, item.w, item.h);
    ctx.fillRect(item.x, item.y, item.w, item.h);
    ctx.fillStyle = '#e7ffd0';
    ctx.fillText(`${item.label} ${Math.round(item.score * 100)}%`, item.x + 5, Math.max(88, item.y - 6));
  });
  ctx.restore();
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
  ctx.fillStyle = 'rgba(255,255,255,.96)';
  ctx.beginPath();
  ctx.arc(target.x, target.y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = '700 12px -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(target.label, target.x, target.y + target.radius + 24);
}

function checkHit() {
  if (!target || !running) return;
  const aim = crosshairPosition();
  crosshair.style.left = `${aim.x}px`;
  crosshair.style.top = `${aim.y}px`;
  if (Math.hypot(aim.x - target.x, aim.y - target.y) < target.radius + 26) {
    score += target.label.includes('parede') || target.label.includes('chão') ? 2 : 1;
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
  if (now - lastFrame > 16) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    drawDetections();
    drawTarget(now);
    checkHit();
    lastFrame = now;
  }
  animationId = requestAnimationFrame(loop);
}

function finishGame() {
  running = false;
  clearInterval(timerId);
  clearInterval(detectionTimer);
  cancelAnimationFrame(animationId);
  finalScoreText.textContent = String(score);
  resultText.textContent = score >= 18
    ? 'Você venceu a sala. Móveis e paredes estão reconsiderando suas escolhas.'
    : score >= 10
      ? 'Boa leitura do ambiente. O iPhone trabalhou, fato historicamente raro.'
      : 'A IA encontrou o cômodo. Você encontrou algumas luzes. Cooperação aceitável.';
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
  surfaceAnchors = estimatedSurfaces();
  running = true;
  spawnTarget();
  lastFrame = performance.now();
  animationId = requestAnimationFrame(loop);
  runDetection();
  detectionTimer = setInterval(runDetection, 1800);
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
    await loadModels();
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
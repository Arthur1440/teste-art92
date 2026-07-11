const $ = (id) => document.getElementById(id);
const startButton = $('startButton');
const statusText = $('status');
let listenersStarted = false;

function number(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '--';
}

function setStatus(message, type = '') {
  statusText.textContent = message;
  statusText.className = `status ${type}`.trim();
}

function checkEnvironment() {
  const secure = window.isSecureContext;
  const framed = window.self !== window.top;
  const orientationSupported = 'DeviceOrientationEvent' in window;
  const motionSupported = 'DeviceMotionEvent' in window;

  const notes = [];
  notes.push(secure ? 'HTTPS ativo' : 'sem HTTPS');
  notes.push(framed ? 'página incorporada' : 'página direta');
  notes.push(orientationSupported ? 'orientação disponível' : 'orientação indisponível');
  notes.push(motionSupported ? 'movimento disponível' : 'movimento indisponível');

  $('environmentText').textContent = notes.join(' • ');
  $('environmentNotice').classList.toggle('warning', !secure || framed);
}

async function requestPermission(EventType) {
  if (!EventType || typeof EventType.requestPermission !== 'function') {
    return 'granted';
  }
  return EventType.requestPermission();
}

function startListeners() {
  if (listenersStarted) return;
  listenersStarted = true;

  window.addEventListener('deviceorientation', (event) => {
    const heading = typeof event.webkitCompassHeading === 'number'
      ? event.webkitCompassHeading
      : event.alpha;

    $('alpha').textContent = number(event.alpha) + (event.alpha != null ? '°' : '');
    $('beta').textContent = number(event.beta) + (event.beta != null ? '°' : '');
    $('gamma').textContent = number(event.gamma) + (event.gamma != null ? '°' : '');
    $('heading').textContent = number(heading, 0) + (heading != null ? '°' : '');

    const beta = Math.max(-90, Math.min(90, event.beta || 0));
    const gamma = Math.max(-90, Math.min(90, event.gamma || 0));
    $('phone').style.transform = `rotateX(${beta * -0.6}deg) rotateY(${gamma * 0.8}deg) rotateZ(${(event.alpha || 0) * -0.08}deg)`;
    $('needle').style.transform = `translate(-50%, -92%) rotate(${-(heading || 0)}deg)`;
  }, true);

  window.addEventListener('devicemotion', (event) => {
    const acc = event.accelerationIncludingGravity || event.acceleration || {};
    const rotation = event.rotationRate || {};

    $('accX').textContent = number(acc.x);
    $('accY').textContent = number(acc.y);
    $('accZ').textContent = number(acc.z);
    $('rotAlpha').textContent = number(rotation.alpha);
    $('rotBeta').textContent = number(rotation.beta);
    $('rotGamma').textContent = number(rotation.gamma);
  }, true);
}

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  setStatus('Solicitando permissão...');

  if (!window.isSecureContext) {
    setStatus('Abra a página por HTTPS para usar os sensores.', 'error');
    startButton.disabled = false;
    return;
  }

  if (window.self !== window.top) {
    setStatus('Abra a página diretamente no Safari, fora do modo incorporado.', 'error');
    startButton.disabled = false;
    return;
  }

  try {
    const orientationPermission = await requestPermission(window.DeviceOrientationEvent);
    const motionPermission = await requestPermission(window.DeviceMotionEvent);

    if (orientationPermission !== 'granted' || motionPermission !== 'granted') {
      setStatus('Permissão negada. Revise a permissão do site no Safari e tente novamente.', 'error');
      startButton.disabled = false;
      return;
    }

    startListeners();
    setStatus('Sensores ativos. Movimente o iPhone.', 'success');
    startButton.textContent = 'Sensores ativados';
  } catch (error) {
    setStatus(`Não foi possível ativar: ${error.message || error}`, 'error');
    startButton.disabled = false;
  }
});

checkEnvironment();
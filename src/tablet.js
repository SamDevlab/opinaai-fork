import './tablet.css';

const KEYS = {
  deviceId: 'opina_device_id',
  secret: 'opina_device_secret',
  activation: 'opina_activation_code',
  pending: 'opina_pending_responses',
  surveyCache: 'opina_last_valid_survey',
};
const APP_VERSION = 'web-kiosk/0.3.0';
const MAX_PENDING = 200;

function randomSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function activationCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function identity() {
  let deviceId = localStorage.getItem(KEYS.deviceId);
  let secret = localStorage.getItem(KEYS.secret);
  let activation = localStorage.getItem(KEYS.activation);
  if (!deviceId) { deviceId = crypto.randomUUID(); localStorage.setItem(KEYS.deviceId, deviceId); }
  if (!secret) { secret = randomSecret(); localStorage.setItem(KEYS.secret, secret); }
  if (!activation) { activation = activationCode(); localStorage.setItem(KEYS.activation, activation); }
  return { deviceId, secret, activation };
}

function ensureActivation(id) {
  const stored = localStorage.getItem(KEYS.activation);
  if (stored) { id.activation = stored; return; }
  id.activation = activationCode();
  localStorage.setItem(KEYS.activation, id.activation);
}

async function deviceRequest(path, id, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${id.secret}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error || 'Falha de comunicação');
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

function pendingQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem(KEYS.pending) || '[]');
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  const unique = [];
  const seen = new Set();
  for (const item of queue) {
    if (!item?.submissionId || seen.has(item.submissionId)) continue;
    seen.add(item.submissionId);
    unique.push(item);
  }
  localStorage.setItem(KEYS.pending, JSON.stringify(unique.slice(-MAX_PENDING)));
}

function cachedSurvey() {
  try { return JSON.parse(localStorage.getItem(KEYS.surveyCache) || 'null'); }
  catch { return null; }
}

function saveSurveyCache(survey) {
  if (survey?.id && Array.isArray(survey.questions)) localStorage.setItem(KEYS.surveyCache, JSON.stringify(survey));
}

function isTransientError(error) {
  return !error?.status || error.status === 408 || error.status >= 500;
}

export async function renderTablet(root) {
  const id = identity();
  let activeSurvey = null;
  let busy = false;

  root.innerHTML = '<main class="tablet-shell"><section class="tablet-card"><p class="tablet-kicker">OPINA AI</p><h1>Preparando este tablet...</h1><p class="tablet-copy">Conectando ao serviço.</p></section></main>';

  async function register() {
    ensureActivation(id);
    const body = { deviceId: id.deviceId, activationCode: id.activation, deviceSecretHash: await sha256(id.secret) };
    const response = await fetch('/api/devices/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (response.status === 409 && data.error === 'activation_code_conflict') {
      id.activation = activationCode();
      localStorage.setItem(KEYS.activation, id.activation);
      return register();
    }
    if (!response.ok && data.error !== 'device_already_paired') throw new Error(data.error || 'registration_failed');
    return data;
  }

  function renderPairing() {
    root.innerHTML = `<main class="tablet-shell"><section class="tablet-card pairing-card"><p class="tablet-kicker">PAREAMENTO</p><h1>Conecte este tablet</h1><p class="tablet-copy">No painel do Opina AI, abra <strong>Parear tablet</strong> e digite:</p><div class="pairing-code">${escapeHtml(id.activation)}</div><p class="device-hint">O código expira em até 24 horas. Este dispositivo continuará aguardando automaticamente.</p></section></main>`;
  }

  function renderWaiting(deviceName) {
    root.innerHTML = `<main class="tablet-shell"><section class="tablet-card waiting-card"><p class="tablet-kicker">${escapeHtml(deviceName || 'TABLET PAREADO')}</p><h1>Pronto para receber uma pesquisa</h1><p class="tablet-copy">Assim que uma pesquisa for associada no painel, ela aparecerá aqui automaticamente.</p><div class="waiting-dot" aria-hidden="true"></div></section></main>`;
  }

  function renderSurvey(survey, offline = false) {
    activeSurvey = survey;
    const questions = Array.isArray(survey.questions) ? survey.questions : [];
    const quickSubmit = questions.length === 1;
    root.innerHTML = `<main class="tablet-shell"><section class="survey-kiosk"><header><p class="tablet-kicker">SUA OPINIÃO IMPORTA</p><h1>${escapeHtml(survey.title)}</h1>${survey.description ? `<p>${escapeHtml(survey.description)}</p>` : ''}${offline ? '<p class="offline-badge" role="status">Modo offline · respostas serão sincronizadas</p>' : ''}</header><form id="kiosk-form" data-quick-submit="${quickSubmit}">${questions.map(renderQuestion).join('')}${quickSubmit ? '' : '<button class="kiosk-submit" type="submit">Enviar avaliação</button>'}</form><footer>Opina AI · Pesquisa de satisfação</footer></section></main>`;
    const form = root.querySelector('#kiosk-form');
    form.onsubmit = submitSurvey;
    if (quickSubmit) form.addEventListener('change', submitSurvey);
  }

  function renderQuestion(question) {
    const name = `q-${question.id}`;
    if (question.type === 'scale') {
      return `<fieldset class="question"><legend>${escapeHtml(question.text)}</legend><div class="scale-grid">${Array.from({ length: 10 }, (_, index) => index + 1).map((value) => `<label><input type="radio" name="${name}" value="${value}" required><span>${value}</span></label>`).join('')}</div></fieldset>`;
    }
    if (question.type === 'options') {
      return `<fieldset class="question"><legend>${escapeHtml(question.text)}</legend><div class="option-grid">${(question.options || []).map((option) => `<label><input type="radio" name="${name}" value="${escapeHtml(option)}" required><span>${escapeHtml(option)}</span></label>`).join('')}</div></fieldset>`;
    }
    const faces = [['1', '😡', 'Péssimo'], ['2', '😕', 'Ruim'], ['3', '😐', 'Regular'], ['4', '🙂', 'Bom'], ['5', '😍', 'Ótimo']];
    return `<fieldset class="question"><legend>${escapeHtml(question.text)}</legend><div class="emoji-grid">${faces.map(([value, emoji, label]) => `<label><input type="radio" name="${name}" value="${value}" required><span class="emoji-face">${emoji}</span><small>${label}</small></label>`).join('')}</div></fieldset>`;
  }

  async function submitSurvey(event) {
    event.preventDefault();
    if (busy || !activeSurvey) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const answers = {};
    for (const question of activeSurvey.questions) {
      const value = values.get(`q-${question.id}`);
      if (value === null) return;
      answers[question.id] = value;
    }
    busy = true;
    form.querySelectorAll('input,button').forEach((element) => { element.disabled = true; });
    const submission = { surveyId: activeSurvey.id, submissionId: crypto.randomUUID(), answeredAt: new Date().toISOString(), answers };
    let queued = false;
    try {
      await deviceRequest('/api/devices/responses', id, { method: 'POST', body: JSON.stringify({ deviceId: id.deviceId, ...submission }) });
    } catch (error) {
      if (!isTransientError(error)) {
        busy = false;
        renderSurvey(activeSurvey);
        return;
      }
      const queue = pendingQueue();
      queue.push(submission);
      saveQueue(queue);
      queued = true;
    }
    const submittedSurvey = activeSurvey;
    renderThanks(queued);
    setTimeout(() => {
      busy = false;
      if (activeSurvey?.id === submittedSurvey.id && !root.querySelector('#kiosk-form')) renderSurvey(submittedSurvey);
    }, 2200);
  }

  function renderThanks(queued) {
    root.innerHTML = `<main class="tablet-shell"><section class="tablet-card thanks-card"><div class="thanks-icon">✓</div><h1>Obrigado pela sua opinião!</h1><p class="tablet-copy">${queued ? 'A avaliação ficou salva neste tablet e será sincronizada quando a conexão voltar.' : 'Sua avaliação foi registrada com sucesso.'}</p></section></main>`;
  }

  async function flushPending() {
    const queue = pendingQueue();
    if (!queue.length) return;
    const remaining = [];
    for (const submission of queue) {
      try {
        await deviceRequest('/api/devices/responses', id, { method: 'POST', body: JSON.stringify({ deviceId: id.deviceId, ...submission }) });
      } catch (error) {
        if (isTransientError(error)) remaining.push(submission);
      }
    }
    saveQueue(remaining);
  }

  async function refreshConfig() {
    try {
      const config = await deviceRequest(`/api/devices/config?deviceId=${encodeURIComponent(id.deviceId)}`, id);
      if (config.status === 'unpaired') {
        activeSurvey = null;
        ensureActivation(id);
        await register();
        renderPairing();
        return;
      }
      localStorage.removeItem(KEYS.activation);
      await flushPending();
      if (!config.survey) { activeSurvey = null; renderWaiting(config.deviceName); return; }
      saveSurveyCache(config.survey);
      if (!activeSurvey || activeSurvey.id !== config.survey.id || !root.querySelector('#kiosk-form')) renderSurvey(config.survey);
    } catch {
      const cached = cachedSurvey();
      if (!activeSurvey && cached) renderSurvey(cached, true);
      else if (!activeSurvey) root.innerHTML = '<main class="tablet-shell"><section class="tablet-card"><p class="tablet-kicker">OPINA AI</p><h1>Sem conexão</h1><p class="tablet-copy">A pesquisa anterior ficará disponível assim que o cache local for criado. Tentando novamente...</p></section></main>';
    }
  }

  async function heartbeat() {
    try {
      await deviceRequest('/api/devices/heartbeat', id, { method: 'POST', body: JSON.stringify({ deviceId: id.deviceId, appVersion: APP_VERSION }) });
      await flushPending();
    } catch { /* o polling seguinte tenta novamente */ }
  }

  try { await register(); } catch { /* refreshConfig exibirá o estado de conexão */ }
  await refreshConfig();
  setInterval(refreshConfig, 10_000);
  setInterval(heartbeat, 30_000);
  window.addEventListener('online', () => { heartbeat(); refreshConfig(); });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&#38;', '<': '&#60;', '>': '&#62;', "'": '&#39;', '"': '&#34;' })[char]);
}

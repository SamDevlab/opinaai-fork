import './styles.css';
import './admin.css';
import { renderTablet } from './tablet.js';

const app = document.querySelector('#app');
const nativeKiosk = Boolean(globalThis.Capacitor?.Plugins?.OpinaRuntime);

if (nativeKiosk) {
  renderTablet(app).catch((error) => {
    console.error('Falha ao iniciar o kiosk Opina AI', error);
    app.innerHTML = '<main class="tablet-shell"><section class="tablet-card"><p class="tablet-kicker">OPINA AI</p><h1>Falha ao iniciar este tablet</h1><p class="tablet-copy">Reabra o aplicativo para tentar novamente.</p></section></main>';
  });
} else if (location.pathname === '/tablet' || location.pathname.startsWith('/tablet/')) {
  renderTablet(app).catch((error) => {
    console.error('Falha ao iniciar o kiosk Opina AI', error);
    app.innerHTML = '<main class="tablet-shell"><section class="tablet-card"><p class="tablet-kicker">OPINA AI</p><h1>Falha ao iniciar este tablet</h1><p class="tablet-copy">Reabra o aplicativo para tentar novamente.</p></section></main>';
  });
} else {
  renderAdmin(app);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[char]);
}

async function api(path, options = {}) {
  const token = localStorage.getItem('opina_token');
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Não foi possível concluir a operação.');
  return data;
}

function renderAdmin(root) {
  root.innerHTML = `
    <section class="login-shell" aria-label="Acesso administrativo Opina AI">
      <div class="brand-panel">
        <div class="brand-panel__rings" aria-hidden="true"></div>
        <div class="brand-panel__content">
          <p class="eyebrow">PESQUISA DE SATISFAÇÃO DIGITAL</p>
          <h1>Pesquisas de<br><span>satisfação</span></h1>
          <p class="intro">Colete opiniões no tablet e acompanhe a experiência em tempo real.</p>
          <div class="feedback-visual" aria-label="Cartão ilustrativo de opiniões">
            <div class="feedback-visual__glow"></div>
            <div class="feedback-card">
              <div class="feedback-card__brand"><span class="sparkle-icon" aria-hidden="true">✦</span><strong>Opina <em>AI</em></strong></div>
              <div class="faces" aria-hidden="true"><img class="faces-reference" src="/assets/faces-reference.png" alt=""></div>
            </div>
          </div>
          <p class="tagline">Tablet, pesquisa e resultado. Sem distrações.</p>
        </div>
      </div>
      <div class="form-panel">
        <div class="form-panel__content">
          <p class="eyebrow eyebrow--blue">ÁREA ADMINISTRATIVA</p>
          <h2>Bem-vindo de volta</h2>
          <p class="form-intro">Entre para gerenciar empresas, tablets e pesquisas.</p>
          <form id="login-form" class="login-form">
            <label for="email">E-mail</label>
            <input id="email" name="email" type="email" placeholder="seu@email.com" autocomplete="username" required>
            <label for="password">Senha</label>
            <div class="password-field">
              <input id="password" name="password" type="password" placeholder="Digite sua senha" autocomplete="current-password" required>
              <button id="toggle-password" class="icon-button" type="button" aria-label="Mostrar senha" title="Mostrar senha">◉</button>
            </div>
            <button class="submit-button" type="submit">Entrar</button>
            <p id="form-message" class="form-message" role="status" aria-live="polite"></p>
          </form>
        </div>
      </div>
    </section>`;

  const passwordInput = root.querySelector('#password');
  const togglePassword = root.querySelector('#toggle-password');
  const loginForm = root.querySelector('#login-form');
  const formMessage = root.querySelector('#form-message');

  togglePassword.addEventListener('click', () => {
    const isHidden = passwordInput.type === 'password';
    passwordInput.type = isHidden ? 'text' : 'password';
    togglePassword.textContent = isHidden ? '◉' : '◌';
    togglePassword.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    formMessage.textContent = 'Entrando...';
    formMessage.classList.add('form-message--visible');
    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: root.querySelector('#email').value, password: passwordInput.value }),
      });
      localStorage.setItem('opina_token', data.token);
      await renderDashboard(root, data.user);
    } catch (error) {
      formMessage.textContent = error.message;
    }
  });

  const token = localStorage.getItem('opina_token');
  if (token) {
    api('/api/me').then((user) => renderDashboard(root, user)).catch(() => localStorage.removeItem('opina_token'));
  }
}

async function renderDashboard(root, user) {
  let selectedTenantId = user.tenantId || '';
  let tenants = [];
  if (user.role === 'SUPERADMIN') tenants = await api('/api/tenants');
  if (!selectedTenantId && tenants.length) selectedTenantId = tenants[0].id;

  const tenantOptions = () => tenants.map((tenant) => `<option value="${tenant.id}" ${String(tenant.id) === String(selectedTenantId) ? 'selected' : ''}>${escapeHtml(tenant.name)}</option>`).join('');

  root.innerHTML = `
    <main class="dashboard">
      <header class="dashboard-header">
        <div><p class="eyebrow eyebrow--blue">OPINA AI</p><h2>Painel de satisfação</h2><p>Olá, ${escapeHtml(user.name)}. Gerencie a pesquisa que aparece em cada tablet.</p></div>
        <div class="dashboard-actions"><a class="outline-button tablet-link" href="/tablet" target="_blank">Abrir modo tablet</a><button id="logout" class="outline-button">Sair</button></div>
      </header>
      ${user.role === 'SUPERADMIN' ? `
        <section class="dashboard-card control-strip">
          <label>Empresa em foco<select id="tenant-filter">${tenantOptions()}</select></label>
        </section>
        <section class="dashboard-grid">
          <article class="dashboard-card"><h3>Nova empresa</h3><form id="tenant-form"><label>Nome</label><input name="name" required><label>E-mail do administrador</label><input name="email" type="email" required><label>Senha inicial</label><input name="password" type="password" minlength="8" required><button class="submit-button compact" type="submit">Criar empresa</button><p class="inline-message" id="tenant-message"></p></form></article>
          <article class="dashboard-card"><h3>Fluxo do tablet</h3><p class="muted-copy">Abra <strong>/tablet</strong> no dispositivo, anote o código de 6 dígitos e faça o pareamento abaixo. Depois associe uma pesquisa ao tablet.</p></article>
        </section>` : ''}
      <section class="dashboard-grid">
        <article class="dashboard-card">
          <h3>Nova pesquisa</h3>
          <form id="survey-form">
            <label>Título</label><input name="title" required placeholder="Ex.: Como foi seu atendimento?">
            <label>Pergunta</label><input name="question" required placeholder="Como você avalia sua experiência?">
            <label>Tipo de resposta</label><select name="type"><option value="emoji">5 níveis de satisfação</option><option value="scale">Nota de 1 a 10</option><option value="options">Opções personalizadas</option></select>
            <label class="options-field is-hidden">Opções separadas por vírgula</label><input class="options-field is-hidden" name="options" placeholder="Ótimo, Bom, Regular, Ruim">
            <button class="submit-button compact" type="submit">Cadastrar pesquisa</button><p class="inline-message" id="survey-message"></p>
          </form>
        </article>
        <article class="dashboard-card">
          <h3>Parear tablet</h3>
          <form id="pair-form">
            <label>Código exibido no tablet</label><input name="activationCode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="123456">
            <label>Nome do tablet</label><input name="deviceName" placeholder="Tablet Recepção">
            <label>Unidade / local</label><input name="locationName" value="Recepção" required>
            <button class="submit-button compact" type="submit">Parear dispositivo</button><p class="inline-message" id="pair-message"></p>
          </form>
        </article>
      </section>
      <section class="dashboard-card"><div class="card-title"><h3>Tablets</h3><span id="device-count">Carregando...</span></div><div id="device-list"></div></section>
      <section class="dashboard-grid lower-grid">
        <article class="dashboard-card"><h3>Pesquisas</h3><div id="survey-list">Carregando...</div></article>
        <article class="dashboard-card report-card"><div class="card-title"><h3>Relatório de satisfação</h3><span id="report-total">Carregando...</span></div><div class="date-row"><label>De <input id="from" type="date"></label><label>Até <input id="to" type="date"></label></div><div class="report-filters"><label>Pesquisa<select id="report-survey"><option value="">Todas</option></select></label><label>Unidade<select id="report-location"><option value="">Todas</option></select></label><label>Tablet<select id="report-device"><option value="">Todos</option></select></label></div><button id="load-report" class="outline-button">Atualizar relatório</button><div id="report-metrics" class="metric-grid"></div><div id="report-distribution" class="distribution-list"></div><div id="report-list"></div></article>
      </section>
    </main>`;

  root.querySelector('#logout').onclick = () => { localStorage.removeItem('opina_token'); location.reload(); };

  if (user.role === 'SUPERADMIN') {
    root.querySelector('#tenant-filter').onchange = async (event) => {
      selectedTenantId = event.target.value;
      await loadDashboardData();
    };
    root.querySelector('#tenant-form').onsubmit = async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const message = root.querySelector('#tenant-message');
      try {
        const created = await api('/api/tenants', { method: 'POST', body: JSON.stringify(Object.fromEntries(form)) });
        message.textContent = 'Empresa criada.';
        tenants = await api('/api/tenants');
        selectedTenantId = created.tenant.id;
        await renderDashboard(root, user);
      } catch (error) { message.textContent = error.message; }
    };
  }

  const typeSelect = root.querySelector('#survey-form [name=type]');
  const toggleOptions = () => root.querySelectorAll('.options-field').forEach((node) => node.classList.toggle('is-hidden', typeSelect.value !== 'options'));
  typeSelect.onchange = toggleOptions;
  toggleOptions();

  root.querySelector('#survey-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const options = String(form.get('options') || '').split(',').map((item) => item.trim()).filter(Boolean);
    const payload = {
      tenantId: selectedTenantId || undefined,
      title: form.get('title'),
      description: form.get('question'),
      questions: [{ text: form.get('question'), type: form.get('type'), options }],
    };
    const message = root.querySelector('#survey-message');
    try {
      await api('/api/surveys', { method: 'POST', body: JSON.stringify(payload) });
      message.textContent = 'Pesquisa cadastrada. Agora associe-a a um tablet.';
      event.target.reset(); toggleOptions(); await loadDashboardData();
    } catch (error) { message.textContent = error.message; }
  };

  root.querySelector('#pair-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const message = root.querySelector('#pair-message');
    try {
      await api('/api/devices/pair', {
        method: 'POST',
        body: JSON.stringify({ ...Object.fromEntries(form), tenantId: selectedTenantId || undefined }),
      });
      message.textContent = 'Tablet pareado com sucesso.';
      event.target.reset(); event.target.querySelector('[name=locationName]').value = 'Recepção';
      await loadDashboardData();
    } catch (error) { message.textContent = error.message; }
  };

  root.querySelector('#load-report').onclick = loadDashboardData;

  async function loadDashboardData() {
    const suffix = selectedTenantId ? `?tenantId=${encodeURIComponent(selectedTenantId)}` : '';
    const reportParams = new URLSearchParams();
    if (selectedTenantId) reportParams.set('tenantId', selectedTenantId);
    if (root.querySelector('#from').value) reportParams.set('from', root.querySelector('#from').value);
    if (root.querySelector('#to').value) reportParams.set('to', root.querySelector('#to').value);
    const reportFilterNames = { 'report-survey': 'surveyId', 'report-location': 'locationId', 'report-device': 'deviceId' };
    for (const id of Object.keys(reportFilterNames)) {
      const value = root.querySelector(`#${id}`).value;
      if (value) reportParams.set(reportFilterNames[id], value);
    }
    const [surveys, devices, reports] = await Promise.all([
      api(`/api/surveys${suffix}`),
      api(`/api/devices${suffix}`),
      api(`/api/reports?${reportParams}`),
    ]);

    root.querySelector('#survey-list').innerHTML = surveys.length
      ? surveys.map((survey) => `<div class="survey-row"><div><strong>${escapeHtml(survey.title)}</strong><small>${survey.assigned_devices || 0} tablet(s) associado(s)</small></div><div class="row-actions"><span>${survey.published ? 'Ativa' : 'Inativa'}</span><button class="outline-button edit-survey" data-survey="${survey.id}">Editar</button><button class="outline-button toggle-survey" data-survey="${survey.id}" data-published="${survey.published}">${survey.published ? 'Desativar' : 'Ativar'}</button></div></div>`).join('')
      : '<p class="empty-state">Nenhuma pesquisa cadastrada.</p>';

    root.querySelector('#device-count').textContent = `${devices.length} dispositivo(s)`;
    root.querySelector('#device-list').innerHTML = devices.length ? devices.map((device) => `
      <div class="device-row ${device.active ? '' : 'device-row--inactive'}">
        <div><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(device.location_name || 'Sem unidade')} · ${device.runtime_status === 'online' ? 'Online' : 'Offline'}${device.last_seen_at ? ` · visto ${escapeHtml(new Date(device.last_seen_at).toLocaleString('pt-BR'))}` : ''}${device.active ? '' : ' · Desativado'}</small><small>Pesquisa: ${escapeHtml(device.active_survey_title || '—')} · App: ${escapeHtml(device.app_version || '—')}</small><small>Modelo: ${escapeHtml(device.manufacturer || '—')} ${escapeHtml(device.model || '')} · Android: ${escapeHtml(device.android_version || '—')} · Bateria: ${device.battery_level === null || device.battery_level === undefined ? '—' : `${device.battery_level}%`}${device.charging === true ? ' carregando' : ''}</small><small>Rede: ${escapeHtml(device.network_state || '—')} · Pendentes: ${device.pending_responses ?? '—'} · Orientação: ${escapeHtml(device.orientation || '—')}</small></div>
        <div class="device-assign"><select data-survey-for="${device.id}"><option value="">Escolha uma pesquisa</option>${surveys.map((survey) => `<option value="${survey.id}" ${String(survey.id) === String(device.active_survey_id) ? 'selected' : ''}>${escapeHtml(survey.title)}</option>`).join('')}</select><button class="outline-button assign-button" data-device="${device.id}">Aplicar</button><button class="outline-button refresh-config" data-device="${device.id}">Atualizar config.</button><button class="outline-button clear-survey" data-device="${device.id}">Remover pesquisa</button><button class="outline-button edit-device" data-device="${device.id}" data-name="${escapeHtml(device.name)}" data-location="${escapeHtml(device.location_name || '')}">Editar</button><button class="outline-button unpair-device" data-device="${device.id}">Desparear</button>${device.active ? `<button class="outline-button danger-button deactivate-device" data-device="${device.id}">Desativar</button>` : ''}</div>
      </div>`).join('') : '<p class="empty-state">Nenhum tablet pareado.</p>';

    root.querySelectorAll('.assign-button').forEach((button) => {
      button.onclick = async () => {
        const surveyId = root.querySelector(`[data-survey-for="${button.dataset.device}"]`).value;
        if (!surveyId) return;
        button.disabled = true;
        try { await api(`/api/devices/${button.dataset.device}/assign-survey`, { method: 'POST', body: JSON.stringify({ surveyId }) }); await loadDashboardData(); }
        finally { button.disabled = false; }
      };
    });

    root.querySelector('#report-survey').innerHTML = `<option value="">Todas</option>${surveys.map((survey) => `<option value="${survey.id}">${escapeHtml(survey.title)}</option>`).join('')}`;
    root.querySelector('#report-location').innerHTML = `<option value="">Todas</option>${[...new Map(devices.filter((device) => device.location_id).map((device) => [device.location_id, device.location_name])).entries()].map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`).join('')}`;
    root.querySelector('#report-device').innerHTML = `<option value="">Todos</option>${devices.map((device) => `<option value="${device.id}">${escapeHtml(device.name)}</option>`).join('')}`;
    const report = reports?.metrics ? reports : { metrics: { total: 0, averageScore: null, satisfiedRate: 0, neutralRate: 0, dissatisfiedRate: 0 }, distribution: [], rows: [] };
    const metrics = report.metrics;
    root.querySelector('#report-total').textContent = `${metrics.total} avaliação(ões)`;
    root.querySelector('#report-metrics').innerHTML = `<div class="metric-card"><strong>${metrics.total}</strong><span>Avaliações</span></div><div class="metric-card"><strong>${Number(metrics.satisfiedRate || 0).toLocaleString('pt-BR')}%</strong><span>Satisfeitos</span></div><div class="metric-card"><strong>${metrics.averageScore === null ? '—' : Number(metrics.averageScore).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong><span>Média (1–5)</span></div><div class="metric-card"><strong>${Number(metrics.dissatisfiedRate || 0).toLocaleString('pt-BR')}%</strong><span>Insatisfeitos</span></div>`;
    root.querySelector('#report-distribution').innerHTML = report.distribution?.length
      ? report.distribution.map((item) => `<div class="distribution-row"><span class="distribution-label">${item.emoji} ${escapeHtml(item.label)}</span><span class="distribution-bar"><i style="width:${metrics.total ? Math.min(100, (item.count / metrics.total) * 100) : 0}%"></i></span><strong>${item.count}</strong></div>`).join('')
      : '<p class="empty-state">Sem distribuição no período.</p>';
    root.querySelector('#report-list').innerHTML = report.rows?.length
      ? report.rows.slice(0, 30).map((row) => `<p><strong>${escapeHtml(row.survey_title)}</strong> · ${escapeHtml(row.location_name || row.device_name || 'Tablet')} · ${escapeHtml(row.day)}: ${row.total}</p>`).join('')
      : '<p class="empty-state">Sem respostas no período.</p>';

    root.querySelectorAll('.clear-survey').forEach((button) => {
      button.onclick = async () => { button.disabled = true; try { await api(`/api/devices/${button.dataset.device}/remove-survey`, { method: 'POST' }); await loadDashboardData(); } finally { button.disabled = false; } };
    });
    root.querySelectorAll('.refresh-config').forEach((button) => {
      button.onclick = async () => { button.disabled = true; try { await api(`/api/devices/${button.dataset.device}/refresh-config`, { method: 'POST' }); await loadDashboardData(); } finally { button.disabled = false; } };
    });
    root.querySelectorAll('.edit-device').forEach((button) => {
      button.onclick = async () => {
        const name = prompt('Nome do tablet', button.dataset.name);
        if (name === null) return;
        const locationName = prompt('Unidade / local', button.dataset.location || 'Recepção');
        if (locationName === null) return;
        await api(`/api/devices/${button.dataset.device}`, { method: 'PATCH', body: JSON.stringify({ name, locationName }) });
        await loadDashboardData();
      };
    });
    root.querySelectorAll('.unpair-device').forEach((button) => {
      button.onclick = async () => { if (!confirm('Desparear este tablet? A pesquisa ativa será removida.')) return; await api(`/api/devices/${button.dataset.device}/unpair`, { method: 'POST' }); await loadDashboardData(); };
    });
    root.querySelectorAll('.deactivate-device').forEach((button) => {
      button.onclick = async () => { if (!confirm('Desativar este tablet?')) return; await api(`/api/devices/${button.dataset.device}`, { method: 'DELETE' }); await loadDashboardData(); };
    });
    root.querySelectorAll('.edit-survey').forEach((button) => {
      button.onclick = async () => {
        const survey = await api(`/api/surveys/${button.dataset.survey}`);
        const question = survey.questions?.[0];
        const title = prompt('Título da pesquisa', survey.title);
        if (title === null) return;
        const questionText = prompt('Pergunta', question?.text || survey.description || '');
        if (questionText === null) return;
        const options = question?.type === 'options' ? prompt('Opções separadas por vírgula', (question.options || []).join(', ')) : null;
        const nextQuestion = { text: questionText, type: question?.type || 'emoji', options: options === null ? (question?.options || []) : options.split(',').map((item) => item.trim()).filter(Boolean) };
        await api(`/api/surveys/${survey.id}`, { method: 'PATCH', body: JSON.stringify({ title, description: questionText, questions: [nextQuestion] }) });
        await loadDashboardData();
      };
    });
    root.querySelectorAll('.toggle-survey').forEach((button) => {
      button.onclick = async () => { await api(`/api/surveys/${button.dataset.survey}`, { method: 'PATCH', body: JSON.stringify({ published: button.dataset.published !== 'true' }) }); await loadDashboardData(); };
    });
    for (const id of ['report-survey', 'report-location', 'report-device']) root.querySelector(`#${id}`).onchange = loadDashboardData;
  }

  await loadDashboardData();
}

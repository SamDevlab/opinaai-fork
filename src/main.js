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
    <main class="dashboard dashboard-shell">
      <aside class="dashboard-sidebar">
        <div class="sidebar-brand"><span class="brand-symbol" aria-hidden="true">✦</span><div><strong>Opina <em>AI</em></strong><small>Painel de satisfação</small></div></div>
        <p class="sidebar-label">NAVEGAÇÃO</p>
        <nav class="dashboard-nav" aria-label="Navegação do painel">
          <a class="dashboard-nav__item is-active" href="#overview"><span aria-hidden="true">⌂</span> Visão geral</a>
          <a class="dashboard-nav__item" href="#operations"><span aria-hidden="true">＋</span> Ações rápidas</a>
          <a class="dashboard-nav__item" href="#tablets"><span aria-hidden="true">▣</span> Tablets</a>
          <a class="dashboard-nav__item" href="#surveys"><span aria-hidden="true">▤</span> Pesquisas</a>
          <a class="dashboard-nav__item" href="#reports"><span aria-hidden="true">◒</span> Relatórios</a>
        </nav>
        <div class="sidebar-note"><span class="sidebar-note__icon" aria-hidden="true">✦</span><strong>Experiência em foco</strong><p>Uma visão simples para transformar cada resposta em melhoria.</p></div>
        <div class="sidebar-profile"><span class="profile-avatar">${escapeHtml(String(user.name || 'A').slice(0, 1).toUpperCase())}</span><div><strong>${escapeHtml(user.name)}</strong><span>Administrador</span></div></div>
      </aside>
      <section class="dashboard-content">
        <header class="dashboard-topbar">
          <div class="mobile-brand"><span class="brand-symbol" aria-hidden="true">✦</span><strong>Opina <em>AI</em></strong></div>
          <div class="topbar-actions"><span class="sync-status"><i aria-hidden="true"></i> Dados atualizados ao abrir</span><a class="primary-button" href="/tablet" target="_blank">Abrir modo tablet <span aria-hidden="true">↗</span></a><button id="logout" class="topbar-logout" type="button">Sair</button></div>
        </header>
        <section id="overview" class="dashboard-hero">
          <div><p class="eyebrow eyebrow--blue">VISÃO GERAL</p><h1>Olá, ${escapeHtml(user.name)} <span aria-hidden="true">👋</span></h1><p>Acompanhe o que seus clientes estão sentindo e mantenha cada tablet pronto para ouvir.</p></div>
          <div class="hero-illustration" aria-hidden="true"><span>😍</span><span>🙂</span><span>😐</span></div>
        </section>
        ${user.role === 'SUPERADMIN' ? `<section class="tenant-bar"><div><span class="tenant-bar__label">EMPRESA EM FOCO</span><strong>Escolha o espaço que deseja acompanhar</strong></div><select id="tenant-filter" aria-label="Empresa em foco">${tenantOptions()}</select></section>` : ''}
        <section class="dashboard-section overview-section">
          <div class="section-heading"><div><p class="section-kicker">RESUMO DO PERÍODO</p><h2>O que está acontecendo</h2></div><span class="section-caption">Visão consolidada das avaliações</span></div>
          <div id="report-metrics" class="metric-grid overview-metrics"></div>
        </section>
        <section id="operations" class="dashboard-section">
          <div class="section-heading"><div><p class="section-kicker">COMECE POR AQUI</p><h2>Ações rápidas</h2></div><span class="section-caption">Deixe tudo pronto em poucos passos</span></div>
          <div class="dashboard-grid action-grid">
            <article class="dashboard-card action-card action-card--survey"><div class="action-card__icon" aria-hidden="true">✦</div><div class="action-card__intro"><h3>Criar uma pesquisa</h3><p>Monte uma pergunta rápida para começar a ouvir seus clientes.</p></div><form id="survey-form" class="form-stack"><div class="form-grid"><label>Título da pesquisa<input name="title" required placeholder="Ex.: Experiência de atendimento"></label><label>Pergunta para o cliente<input name="question" required placeholder="Como você avalia sua experiência?"></label></div><label>Tipo de resposta<select name="type"><option value="emoji">5 níveis de satisfação</option><option value="scale">Nota de 1 a 10</option><option value="options">Opções personalizadas</option></select></label><label class="options-field is-hidden">Opções separadas por vírgula<input class="options-field is-hidden" name="options" placeholder="Ótimo, Bom, Regular, Ruim"></label><div class="form-submit-row"><button class="submit-button compact" type="submit">Cadastrar pesquisa <span aria-hidden="true">→</span></button><p class="inline-message" id="survey-message" role="status"></p></div></form></article>
            <article class="dashboard-card action-card action-card--pair"><div class="action-card__icon" aria-hidden="true">▣</div><div class="action-card__intro"><h3>Conectar um tablet</h3><p>Abra o modo tablet, informe o código e coloque a pesquisa para rodar.</p></div><form id="pair-form" class="form-stack"><label>Código exibido no tablet<input name="activationCode" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required placeholder="Ex.: 482913"></label><div class="form-grid"><label>Nome do tablet<input name="deviceName" placeholder="Tablet Recepção"></label><label>Unidade / local<input name="locationName" value="Recepção" required></label></div><div class="form-submit-row"><button class="submit-button compact" type="submit">Parear dispositivo <span aria-hidden="true">→</span></button><p class="inline-message" id="pair-message" role="status"></p></div></form></article>
          </div>
        </section>
        ${user.role === 'SUPERADMIN' ? `<section id="companies" class="dashboard-section admin-tools"><div class="section-heading"><div><p class="section-kicker">ADMINISTRAÇÃO</p><h2>Empresas</h2></div><span class="section-caption">Crie e organize novos espaços</span></div><article class="dashboard-card"><form id="tenant-form" class="form-grid form-grid--tenant"><label>Nome da empresa<input name="name" required></label><label>E-mail do administrador<input name="email" type="email" required></label><label>Senha inicial<input name="password" type="password" minlength="8" required></label><div class="form-submit-row"><button class="submit-button compact" type="submit">Criar empresa <span aria-hidden="true">→</span></button><p class="inline-message" id="tenant-message" role="status"></p></div></form></article></section>` : ''}
        <section id="tablets" class="dashboard-section"><div class="section-heading"><div><p class="section-kicker">OPERAÇÃO</p><h2>Seus tablets</h2></div><div class="section-heading__action"><span id="device-count" class="section-counter">Carregando...</span><a href="#operations" class="text-link">+ Parear tablet</a></div></div><div class="dashboard-card dashboard-card--flush"><div id="device-list" class="device-list">Carregando...</div></div></section>
        <section id="surveys" class="dashboard-section"><div class="section-heading"><div><p class="section-kicker">CONTEÚDO</p><h2>Pesquisas</h2></div><span class="section-caption">Perguntas que estão ativas no seu atendimento</span></div><div class="dashboard-card"><div id="survey-list" class="survey-list">Carregando...</div></div></section>
        <section id="reports" class="dashboard-section report-section"><div class="section-heading"><div><p class="section-kicker">LEITURA DOS RESULTADOS</p><h2>Relatório de satisfação</h2></div><span id="report-total" class="section-counter">Carregando...</span></div><div class="dashboard-card report-card"><div class="report-toolbar"><div class="date-row"><label>De <input id="from" type="date"></label><label>Até <input id="to" type="date"></label></div><div class="report-filters"><label>Pesquisa<select id="report-survey"><option value="">Todas</option></select></label><label>Unidade<select id="report-location"><option value="">Todas</option></select></label><label>Tablet<select id="report-device"><option value="">Todos</option></select></label></div><button id="load-report" class="outline-button" type="button">Atualizar dados <span aria-hidden="true">↻</span></button></div><div class="report-results"><div class="report-results__header"><h3>Distribuição das avaliações</h3><span>Percepção dos clientes</span></div><div id="report-distribution" class="distribution-list"></div><div id="report-list" class="report-list"></div></div></div></section>
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
      ? surveys.map((survey) => `<div class="survey-row"><div class="survey-row__icon" aria-hidden="true">✦</div><div class="survey-row__body"><strong>${escapeHtml(survey.title)}</strong><small><span class="status-pill ${survey.published ? 'status-pill--active' : 'status-pill--muted'}">${survey.published ? 'Ativa' : 'Inativa'}</span><span>${survey.assigned_devices || 0} tablet(s) associado(s)</span></small></div><div class="row-actions"><button class="outline-button edit-survey" data-survey="${survey.id}">Editar</button><button class="outline-button toggle-survey" data-survey="${survey.id}" data-published="${survey.published}">${survey.published ? 'Desativar' : 'Ativar'}</button></div></div>`).join('')
      : '<p class="empty-state">Nenhuma pesquisa cadastrada.</p>';

    root.querySelector('#device-count').textContent = `${devices.length} dispositivo(s)`;
    root.querySelector('#device-list').innerHTML = devices.length ? devices.map((device) => `
      <div class="device-row ${device.active ? '' : 'device-row--inactive'}">
        <div class="device-summary"><div class="device-name-row"><span class="status-dot ${device.runtime_status === 'online' ? 'status-dot--online' : 'status-dot--offline'}" aria-hidden="true"></span><strong>${escapeHtml(device.name)}</strong><span class="device-status-label">${device.runtime_status === 'online' ? 'Online' : 'Offline'}</span>${device.active ? '' : '<span class="status-pill status-pill--muted">Desativado</span>'}</div><small class="device-location">${escapeHtml(device.location_name || 'Sem unidade')}${device.last_seen_at ? ` · visto ${escapeHtml(new Date(device.last_seen_at).toLocaleString('pt-BR'))}` : ''}</small><div class="device-meta"><span>Pesquisa: <strong>${escapeHtml(device.active_survey_title || '—')}</strong></span><span>${escapeHtml(device.manufacturer || '—')} ${escapeHtml(device.model || '')} · Android ${escapeHtml(device.android_version || '—')}</span><span>Bateria ${device.battery_level === null || device.battery_level === undefined ? '—' : `${device.battery_level}%`}${device.charging === true ? ' · carregando' : ''} · ${escapeHtml(device.network_state || '—')}</span><span>Pendentes: ${device.pending_responses ?? '—'} · ${escapeHtml(device.orientation || '—')}</span></div></div>
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
    root.querySelector('#report-metrics').innerHTML = `<div class="metric-card metric-card--blue"><div class="metric-card__top"><span class="metric-card__icon" aria-hidden="true">◒</span><span>Total recebido</span></div><strong>${metrics.total}</strong><small>Avaliações no período</small></div><div class="metric-card metric-card--green"><div class="metric-card__top"><span class="metric-card__icon" aria-hidden="true">♥</span><span>Satisfação</span></div><strong>${Number(metrics.satisfiedRate || 0).toLocaleString('pt-BR')}%</strong><small>Clientes satisfeitos</small></div><div class="metric-card metric-card--purple"><div class="metric-card__top"><span class="metric-card__icon" aria-hidden="true">★</span><span>Nota média</span></div><strong>${metrics.averageScore === null ? '—' : Number(metrics.averageScore).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</strong><small>De 1 a 5</small></div><div class="metric-card metric-card--orange"><div class="metric-card__top"><span class="metric-card__icon" aria-hidden="true">!</span><span>Atenção</span></div><strong>${Number(metrics.dissatisfiedRate || 0).toLocaleString('pt-BR')}%</strong><small>Clientes insatisfeitos</small></div>`;
    root.querySelector('#report-distribution').innerHTML = report.distribution?.length
      ? report.distribution.map((item) => `<div class="distribution-row"><span class="distribution-label">${item.emoji} ${escapeHtml(item.label)}</span><span class="distribution-bar"><i style="width:${metrics.total ? Math.min(100, (item.count / metrics.total) * 100) : 0}%"></i></span><strong>${item.count}</strong></div>`).join('')
      : '<p class="empty-state">Sem distribuição no período.</p>';
    root.querySelector('#report-list').innerHTML = report.rows?.length
      ? report.rows.slice(0, 30).map((row) => `<div class="report-row"><span class="report-row__dot" aria-hidden="true"></span><div><strong>${escapeHtml(row.survey_title)}</strong><small>${escapeHtml(row.location_name || row.device_name || 'Tablet')} · ${escapeHtml(row.day)}</small></div><b>${row.total}</b></div>`).join('')
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

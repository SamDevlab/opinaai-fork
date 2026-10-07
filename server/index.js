import 'dotenv/config';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'node:path';
import { createHash, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://opina:opina@localhost:5433/opina_ai',
});

const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'dev-only-change-me');
if (!jwtSecret) throw new Error('JWT_SECRET é obrigatória em produção.');

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'dist')));

function asPositiveInt(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value, max = 200) {
  const normalized = String(value ?? '').trim();
  return normalized ? normalized.slice(0, max) : '';
}

function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function secureHashEqual(left, right) {
  if (!/^[a-f0-9]{64}$/.test(left || '') || !/^[a-f0-9]{64}$/.test(right || '')) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

async function runMigrations() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort();
  for (const filename of files) {
    const already = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [filename]);
    if (already.rowCount) continue;

    const client = await pool.connect();
    try {
      const sql = await readFile(path.join(migrationsDir, filename), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES($1)', [filename]);
      await client.query('COMMIT');
      console.log(`Migration aplicada: ${filename}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function bootstrapAdmin() {
  const email = cleanText(process.env.BOOTSTRAP_ADMIN_EMAIL, 180);
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  const name = cleanText(process.env.BOOTSTRAP_ADMIN_NAME || 'Administrador Opina AI', 160);
  if (!email && !password) return;
  if (!email || password.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL e BOOTSTRAP_ADMIN_PASSWORD (mín. 12 caracteres) devem ser definidos juntos.');
  }

  const exists = await pool.query('SELECT id FROM users WHERE lower(email)=lower($1)', [email]);
  if (exists.rowCount) return;
  await pool.query(
    'INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)',
    [name, email, await bcrypt.hash(password, 12), 'SUPERADMIN'],
  );
  console.log(`SUPERADMIN bootstrap criado para ${email}.`);
}

async function auth(req, res, next) {
  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, jwtSecret);
    const result = await pool.query(
      'SELECT id,tenant_id,name,email,role,active FROM users WHERE id=$1 AND active=true',
      [payload.id],
    );
    if (!result.rowCount) return res.status(401).json({ error: 'Não autorizado' });
    const user = result.rows[0];
    req.user = {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Não autorizado' });
  }
}

async function deviceAuth(req, res, next) {
  try {
    const deviceId = cleanText(req.body?.deviceId || req.query?.deviceId, 80);
    const secret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!deviceId || !secret) return res.status(401).json({ error: 'device_auth_failed' });
    const result = await pool.query('SELECT * FROM devices WHERE device_id=$1', [deviceId]);
    if (!result.rowCount || !secureHashEqual(result.rows[0].device_secret_hash, sha256(secret))) {
      return res.status(401).json({ error: 'device_auth_failed' });
    }
    req.device = result.rows[0];
    next();
  } catch {
    res.status(401).json({ error: 'device_auth_failed' });
  }
}

function tenantForUser(req, suppliedTenantId) {
  if (req.user.role === 'SUPERADMIN') return asPositiveInt(suppliedTenantId) || req.user.tenantId || null;
  return req.user.tenantId;
}

function requireSuperadmin(req, res) {
  if (req.user.role !== 'SUPERADMIN') {
    res.status(403).json({ error: 'Acesso restrito ao SUPERADMIN.' });
    return false;
  }
  return true;
}

app.post('/api/auth/login', async (req, res) => {
  const email = cleanText(req.body?.email, 180);
  const password = String(req.body?.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Informe usuário e senha.' });

  const result = await pool.query('SELECT * FROM users WHERE lower(email)=lower($1) AND active=true', [email]);
  if (!result.rowCount || !(await bcrypt.compare(password, result.rows[0].password_hash))) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  const user = result.rows[0];
  const token = jwt.sign({ id: user.id }, jwtSecret, { expiresIn: '8h' });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, tenantId: user.tenant_id },
  });
});

app.get('/api/me', auth, (req, res) => res.json(req.user));

app.get('/api/tenants', auth, async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  const result = await pool.query('SELECT id,name,created_at FROM tenants ORDER BY name');
  res.json(result.rows);
});

app.post('/api/tenants', auth, async (req, res) => {
  if (!requireSuperadmin(req, res)) return;
  const name = cleanText(req.body?.name, 160);
  const email = cleanText(req.body?.email, 180);
  const password = String(req.body?.password || '');
  if (!name || !email || password.length < 8) {
    return res.status(400).json({ error: 'Informe empresa, e-mail e senha com pelo menos 8 caracteres.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tenant = await client.query('INSERT INTO tenants(name) VALUES($1) RETURNING *', [name]);
    const user = await client.query(
      'INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role,tenant_id',
      [tenant.rows[0].id, name, email, await bcrypt.hash(password, 12), 'ADMIN'],
    );
    await client.query('COMMIT');
    res.status(201).json({ tenant: tenant.rows[0], user: user.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/surveys', auth, async (req, res) => {
  const requestedTenant = asPositiveInt(req.query.tenantId);
  if (req.user.role === 'SUPERADMIN' && !requestedTenant) {
    const result = await pool.query('SELECT * FROM surveys ORDER BY created_at DESC');
    return res.json(result.rows);
  }
  const tenantId = tenantForUser(req, requestedTenant);
  if (!tenantId) return res.json([]);
  const result = await pool.query('SELECT * FROM surveys WHERE tenant_id=$1 ORDER BY created_at DESC', [tenantId]);
  res.json(result.rows);
});

app.post('/api/surveys', auth, async (req, res) => {
  const tenantId = tenantForUser(req, req.body?.tenantId);
  const title = cleanText(req.body?.title, 200);
  const description = cleanText(req.body?.description, 1000);
  const questions = Array.isArray(req.body?.questions) ? req.body.questions.slice(0, 20) : [];
  if (!tenantId || !title || !questions.length) {
    return res.status(400).json({ error: 'Empresa, título e ao menos uma pergunta são obrigatórios.' });
  }

  const allowedTypes = new Set(['emoji', 'scale', 'options']);
  const normalizedQuestions = questions.map((question, index) => ({
    text: cleanText(question?.text, 500),
    type: allowedTypes.has(question?.type) ? question.type : 'emoji',
    position: index,
    options: Array.isArray(question?.options)
      ? question.options.map((item) => cleanText(item, 120)).filter(Boolean).slice(0, 12)
      : [],
  }));
  if (normalizedQuestions.some((question) => !question.text || (question.type === 'options' && question.options.length < 2))) {
    return res.status(400).json({ error: 'Revise as perguntas e opções da pesquisa.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const survey = await client.query(
      'INSERT INTO surveys(tenant_id,title,description) VALUES($1,$2,$3) RETURNING *',
      [tenantId, title, description || null],
    );
    for (const question of normalizedQuestions) {
      await client.query(
        'INSERT INTO questions(survey_id,text,type,position,options) VALUES($1,$2,$3,$4,$5::jsonb)',
        [survey.rows[0].id, question.text, question.type, question.position, JSON.stringify(question.options)],
      );
    }
    await client.query('COMMIT');
    res.status(201).json(survey.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/reports', auth, async (req, res) => {
  const tenantId = tenantForUser(req, req.query.tenantId);
  const from = req.query.from || null;
  const to = req.query.to || null;
  const params = [from, to];
  let tenantClause = '';
  if (req.user.role !== 'SUPERADMIN' || tenantId) {
    if (!tenantId) return res.json([]);
    params.push(tenantId);
    tenantClause = `AND s.tenant_id=$${params.length}`;
  }

  const result = await pool.query(
    `SELECT r.survey_id, s.title AS survey_title, r.device_id, d.name AS device_name,
            l.name AS location_name, COUNT(*)::int AS total,
            date_trunc('day',COALESCE(r.answered_at,r.created_at))::date AS day
       FROM responses r
       JOIN surveys s ON s.id=r.survey_id
       LEFT JOIN devices d ON d.id=r.device_id
       LEFT JOIN locations l ON l.id=r.location_id
      WHERE COALESCE(r.answered_at,r.created_at) >= COALESCE($1::date, current_date-30)
        AND COALESCE(r.answered_at,r.created_at) < COALESCE(($2::date + interval '1 day'), current_date+1)
        ${tenantClause}
      GROUP BY r.survey_id,s.title,r.device_id,d.name,l.name,day
      ORDER BY day DESC`,
    params,
  );
  res.json(result.rows);
});

app.post('/api/devices/register', async (req, res) => {
  const deviceId = cleanText(req.body?.deviceId, 80);
  const activationCode = cleanText(req.body?.activationCode, 6);
  const deviceSecretHash = cleanText(req.body?.deviceSecretHash, 64).toLowerCase();
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(deviceId)) return res.status(400).json({ error: 'invalid_device_id' });
  if (!/^\d{6}$/.test(activationCode)) return res.status(400).json({ error: 'invalid_activation_code' });
  if (!/^[a-f0-9]{64}$/.test(deviceSecretHash)) return res.status(400).json({ error: 'invalid_device_secret_hash' });

  const existing = await pool.query('SELECT * FROM devices WHERE device_id=$1', [deviceId]);
  if (existing.rowCount) {
    const device = existing.rows[0];
    if (device.tenant_id) {
      if (!secureHashEqual(device.device_secret_hash, deviceSecretHash)) {
        return res.status(409).json({ error: 'device_already_paired' });
      }
      return res.json({ status: 'paired', deviceId: device.id });
    }
    try {
      await pool.query(
        `UPDATE devices
            SET device_secret_hash=$1, activation_code=$2,
                activation_expires_at=now()+interval '24 hours', updated_at=now()
          WHERE id=$3`,
        [deviceSecretHash, activationCode, device.id],
      );
      return res.json({ status: 'unpaired', activationCode });
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'activation_code_conflict' });
      throw error;
    }
  }

  try {
    await pool.query(
      `INSERT INTO devices(device_id,device_secret_hash,activation_code,activation_expires_at)
       VALUES($1,$2,$3,now()+interval '24 hours')`,
      [deviceId, deviceSecretHash, activationCode],
    );
    res.status(201).json({ status: 'unpaired', activationCode });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'activation_code_conflict' });
    throw error;
  }
});

app.post('/api/devices/pair', auth, async (req, res) => {
  const activationCode = cleanText(req.body?.activationCode, 6);
  const tenantId = tenantForUser(req, req.body?.tenantId);
  const locationName = cleanText(req.body?.locationName || 'Recepção', 160);
  const deviceName = cleanText(req.body?.deviceName || `Tablet ${activationCode}`, 160);
  if (!tenantId || !/^\d{6}$/.test(activationCode)) {
    return res.status(400).json({ error: 'Empresa e código de pareamento são obrigatórios.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deviceResult = await client.query(
      `SELECT * FROM devices
        WHERE activation_code=$1 AND tenant_id IS NULL AND activation_expires_at > now()
        FOR UPDATE`,
      [activationCode],
    );
    if (!deviceResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Código inválido ou expirado.' });
    }
    let locationResult = await client.query(
      'SELECT id,name FROM locations WHERE tenant_id=$1 AND lower(name)=lower($2) LIMIT 1',
      [tenantId, locationName],
    );
    if (!locationResult.rowCount) {
      locationResult = await client.query(
        'INSERT INTO locations(tenant_id,name) VALUES($1,$2) RETURNING id,name',
        [tenantId, locationName],
      );
    }
    const updated = await client.query(
      `UPDATE devices
          SET tenant_id=$1, location_id=$2, name=$3, activation_code=NULL,
              activation_expires_at=NULL, paired_at=now(), updated_at=now()
        WHERE id=$4
        RETURNING id,device_id,name,tenant_id,location_id,paired_at`,
      [tenantId, locationResult.rows[0].id, deviceName, deviceResult.rows[0].id],
    );
    await client.query('COMMIT');
    res.json({ ...updated.rows[0], location: locationResult.rows[0].name });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/api/devices', auth, async (req, res) => {
  const tenantId = tenantForUser(req, req.query.tenantId);
  const params = [];
  let where = '';
  if (req.user.role !== 'SUPERADMIN' || tenantId) {
    if (!tenantId) return res.json([]);
    params.push(tenantId);
    where = 'WHERE d.tenant_id=$1';
  }
  const result = await pool.query(
    `SELECT d.id,d.device_id,d.name,d.tenant_id,d.active_survey_id,d.app_version,d.last_seen_at,d.paired_at,
            l.name AS location_name,s.title AS active_survey_title,
            CASE WHEN d.last_seen_at >= now()-interval '90 seconds' THEN 'online' ELSE 'offline' END AS runtime_status
       FROM devices d
       LEFT JOIN locations l ON l.id=d.location_id
       LEFT JOIN surveys s ON s.id=d.active_survey_id
       ${where}
       ORDER BY d.created_at DESC`,
    params,
  );
  res.json(result.rows);
});

app.post('/api/devices/:id/assign-survey', auth, async (req, res) => {
  const deviceId = asPositiveInt(req.params.id);
  const surveyId = asPositiveInt(req.body?.surveyId);
  if (!deviceId || !surveyId) return res.status(400).json({ error: 'Tablet e pesquisa são obrigatórios.' });

  const device = await pool.query('SELECT id,tenant_id FROM devices WHERE id=$1', [deviceId]);
  if (!device.rowCount || !device.rows[0].tenant_id) return res.status(404).json({ error: 'Tablet não encontrado.' });
  const tenantId = device.rows[0].tenant_id;
  if (req.user.role !== 'SUPERADMIN' && req.user.tenantId !== tenantId) return res.sendStatus(403);
  const survey = await pool.query('SELECT id FROM surveys WHERE id=$1 AND tenant_id=$2', [surveyId, tenantId]);
  if (!survey.rowCount) return res.status(400).json({ error: 'A pesquisa não pertence à empresa do tablet.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE devices SET active_survey_id=$1,updated_at=now() WHERE id=$2', [surveyId, deviceId]);
    await client.query('UPDATE surveys SET published=true WHERE id=$1', [surveyId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

app.post('/api/devices/heartbeat', deviceAuth, async (req, res) => {
  const appVersion = cleanText(req.body?.appVersion, 40) || 'unknown';
  await pool.query(
    `UPDATE devices SET status='online',app_version=$1,last_seen_at=now(),updated_at=now() WHERE id=$2`,
    [appVersion, req.device.id],
  );
  res.json({ ok: true });
});

app.get('/api/devices/config', deviceAuth, async (req, res) => {
  await pool.query('UPDATE devices SET last_seen_at=now(),updated_at=now() WHERE id=$1', [req.device.id]);
  if (!req.device.tenant_id) return res.json({ status: 'unpaired', survey: null });
  if (!req.device.active_survey_id) {
    return res.json({ status: 'paired', deviceId: req.device.id, deviceName: req.device.name, survey: null });
  }

  const survey = await pool.query(
    'SELECT id,title,description,theme FROM surveys WHERE id=$1 AND tenant_id=$2 AND published=true',
    [req.device.active_survey_id, req.device.tenant_id],
  );
  if (!survey.rowCount) return res.json({ status: 'paired', survey: null });
  const questions = await pool.query(
    'SELECT id,text,type,position,options FROM questions WHERE survey_id=$1 ORDER BY position,id',
    [survey.rows[0].id],
  );
  res.json({
    status: 'paired',
    deviceId: req.device.id,
    deviceName: req.device.name,
    survey: { ...survey.rows[0], questions: questions.rows },
  });
});

app.post('/api/devices/responses', deviceAuth, async (req, res) => {
  const surveyId = asPositiveInt(req.body?.surveyId);
  const submissionId = cleanText(req.body?.submissionId, 80);
  const answers = req.body?.answers;
  if (!surveyId || !/^[a-zA-Z0-9-]{16,80}$/.test(submissionId) || !answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return res.status(400).json({ error: 'invalid_response' });
  }
  if (!req.device.tenant_id) return res.status(409).json({ error: 'device_not_paired' });
  const survey = await pool.query(
    'SELECT id FROM surveys WHERE id=$1 AND tenant_id=$2 AND published=true',
    [surveyId, req.device.tenant_id],
  );
  if (!survey.rowCount) return res.status(409).json({ error: 'survey_not_available_for_device' });

  const questions = await pool.query('SELECT id,type,options FROM questions WHERE survey_id=$1 ORDER BY position,id', [surveyId]);
  const questionMap = new Map(questions.rows.map((row) => [String(row.id), row]));
  const submittedIds = Object.keys(answers);
  if (submittedIds.length !== questionMap.size || submittedIds.some((id) => !questionMap.has(String(id)))) {
    return res.status(400).json({ error: 'invalid_answers' });
  }
  for (const [questionId, value] of Object.entries(answers)) {
    const question = questionMap.get(String(questionId));
    const normalized = String(value ?? '').trim();
    const valid = question.type === 'emoji'
      ? /^[1-5]$/.test(normalized)
      : question.type === 'scale'
        ? /^(10|[1-9])$/.test(normalized)
        : Array.isArray(question.options) && question.options.includes(normalized);
    if (!valid) return res.status(400).json({ error: 'invalid_answers' });
  }

  let answeredAt = null;
  if (req.body?.answeredAt) {
    const timestamp = Date.parse(req.body.answeredAt);
    const now = Date.now();
    if (Number.isFinite(timestamp) && timestamp <= now + 5 * 60_000 && timestamp >= now - 30 * 24 * 60 * 60_000) {
      answeredAt = new Date(timestamp).toISOString();
    }
  }

  const inserted = await pool.query(
    `INSERT INTO responses(survey_id,device_id,location_id,submission_id,answered_at,answers)
     VALUES($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id,created_at`,
    [surveyId, req.device.id, req.device.location_id, submissionId, answeredAt, JSON.stringify(answers)],
  );
  await pool.query('UPDATE devices SET last_seen_at=now(),updated_at=now() WHERE id=$1', [req.device.id]);
  res.status(inserted.rowCount ? 201 : 200).json({ ok: true, deduplicated: !inserted.rowCount });
});

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
});

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Erro interno.' });
});

runMigrations()
  .then(bootstrapAdmin)
  .then(() => app.listen(process.env.PORT || 4000, () => console.log('Opina API em http://localhost:4000')))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

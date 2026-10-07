import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL || 'postgres://opina:opina@localhost:5433/opina_ai' });
const secret = process.env.JWT_SECRET || 'local-opina-secret';
app.use(cors()); app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'dist')));

async function seed() {
  await pool.query(`CREATE TABLE IF NOT EXISTS tenants (id SERIAL PRIMARY KEY, name VARCHAR(160) NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE, name VARCHAR(160) NOT NULL, email VARCHAR(180) UNIQUE NOT NULL, password_hash TEXT NOT NULL, role VARCHAR(20) NOT NULL, active BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now());`);
  const exists = await pool.query('SELECT id FROM users WHERE email=$1', ['Pesquisa@AdminAdmin']);
  if (!exists.rowCount) await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4)', ['Pesquisa@AdminAdmin', 'Pesquisa@AdminAdmin', await bcrypt.hash('12345678', 10), 'SUPERADMIN']);
}
function auth(req,res,next){ try { req.user=jwt.verify((req.headers.authorization||'').replace('Bearer ','') ,secret); next(); } catch { res.status(401).json({error:'Não autorizado'}); } }
app.post('/api/auth/login', async (req,res)=>{ const {email,password}=req.body; const r=await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1) AND active=true',[email]); if(!r.rowCount || !(await bcrypt.compare(password,r.rows[0].password_hash))) return res.status(401).json({error:'Usuário ou senha inválidos'}); const u=r.rows[0]; res.json({token:jwt.sign({id:u.id,email:u.email,role:u.role,tenantId:u.tenant_id},secret,{expiresIn:'8h'}),user:{id:u.id,name:u.name,email:u.email,role:u.role}}); });
app.get('/api/me',auth,(req,res)=>res.json(req.user));
app.get('/api/surveys',auth,async(req,res)=>{ const r=await pool.query('SELECT * FROM surveys WHERE ($1=$3 OR tenant_id=$2) ORDER BY created_at DESC',[req.user.role,req.user.tenantId,'SUPERADMIN']); res.json(r.rows); });
app.post('/api/surveys',auth,async(req,res)=>{ const {title,description,questions=[]}=req.body; const s=await pool.query('INSERT INTO surveys(tenant_id,title,description) VALUES($1,$2,$3) RETURNING *',[req.user.tenantId,title,description]); for(const [i,q] of questions.entries()) await pool.query('INSERT INTO questions(survey_id,text,type,position,options) VALUES($1,$2,$3,$4,$5)',[s.rows[0].id,q.text,q.type||'emoji',i,JSON.stringify(q.options||[])]); res.status(201).json(s.rows[0]); });
app.get('/api/reports',auth,async(req,res)=>{ const {from,to}=req.query; const r=await pool.query(`SELECT survey_id, COUNT(*)::int AS total, date_trunc('day',created_at)::date AS day FROM responses WHERE created_at >= COALESCE($1::date, current_date-30) AND created_at < COALESCE($2::date, current_date+1) GROUP BY survey_id,day ORDER BY day`,[from||null,to||null]); res.json(r.rows); });
app.post('/api/tenants',auth,async(req,res)=>{ if(req.user.role!=='SUPERADMIN') return res.sendStatus(403); const {name,email,password}=req.body; const t=await pool.query('INSERT INTO tenants(name) VALUES($1) RETURNING *',[name]); const u=await pool.query('INSERT INTO users(tenant_id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role',[t.rows[0].id,name,email,await bcrypt.hash(password,10),'ADMIN']); res.status(201).json({tenant:t.rows[0],user:u.rows[0]}); });
app.get('/api/health',(req,res)=>res.json({ok:true}));
app.get('*',(req,res)=>{ if (!req.path.startsWith('/api/')) res.sendFile(path.join(__dirname,'..','dist','index.html')); });
seed().then(()=>app.listen(process.env.PORT||4000,()=>console.log('Opina API em http://localhost:4000'))).catch(e=>{console.error(e);process.exit(1)});

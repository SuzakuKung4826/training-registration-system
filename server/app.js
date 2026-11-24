import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AppError, parse } from './validation.js';
import { now, hash, secret, audit, listCourses, getCourse, saveCourse, removeCourse, register, registrationStatus, cancelRegistration, changeStatuses } from './service.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const userSchema=z.object({name:z.string().trim().min(1).max(200),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),password:z.string().min(12,'รหัสผ่านอย่างน้อย 12 ตัวอักษร').max(100),role:z.enum(['admin','staff'])});
const cookieValue=(req,name)=>{const v=(req.headers.cookie||'').split(';').map(c=>c.trim()).find(c=>c.startsWith(`${name}=`));return v?.slice(name.length+1);};
const safeCsv=value=>{let text=String(value??'');if (/^[\s]*[=+@\-\t\r]/.test(text)) text=`'${text}`;return `"${text.replaceAll('"','""')}"`;};

export function createApp(db, { testing = false } = {}) {
  const app=express(); const production=process.env.NODE_ENV==='production';
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY==='1') app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://challenges.cloudflare.com'],styleSrc:["'self'"],imgSrc:["'self'",'data:','https:'],frameSrc:['https://challenges.cloudflare.com'],connectSrc:["'self'",'https://challenges.cloudflare.com'],upgradeInsecureRequests:production?[]:null}},strictTransportSecurity:production?{maxAge:31536000,includeSubDomains:true}:false,referrerPolicy:{policy:'no-referrer'}}));
  app.use(express.json({limit:'100kb'}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  const cookieOptions={httpOnly:true,secure:production,sameSite:'strict',path:'/'};
  const ok=(res,data,status=200)=>res.status(status).json({ok:true,data});
  app.use((req,res,next)=>{
    if(!production||req.secure||req.path==='/api/health')return next();
    if(req.method==='GET'||req.method==='HEAD')return res.redirect(308,(process.env.APP_URL||'').replace(/\/$/,'')+req.originalUrl);
    throw new AppError('HTTPS_REQUIRED','กรุณาเชื่อมต่อผ่าน HTTPS',400);
  });
  async function limited(req,key,max=30,window=60000) {
    if (testing) return;
    const bucket=`${key}:${req.ip}`; const timestamp=now();
    const row=await db.transaction(async tx=>{
      return (await tx.query(`INSERT INTO rate_limits (key,hits,reset_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.reset_at<? THEN 1 ELSE rate_limits.hits+1 END,reset_at=CASE WHEN rate_limits.reset_at<? THEN ? ELSE rate_limits.reset_at END RETURNING hits`,[bucket,new Date(Date.now()+window).toISOString(),timestamp,timestamp,new Date(Date.now()+window).toISOString()])).rows[0];
    });
    if (Number(row.hits)>max) throw new AppError('RATE_LIMITED','ทำรายการบ่อยเกินไป กรุณารอสักครู่',429);
  }
  app.get('/api/health',async(_req,res)=>{await db.query('SELECT 1');ok(res,{status:'healthy'});});
  app.get('/api/config',async(req,res)=>{
    let csrf=cookieValue(req,'training_csrf');
    if (!csrf || !/^[a-f0-9]{64}$/.test(csrf)) {csrf=secret();res.cookie('training_csrf',csrf,{...cookieOptions,maxAge:86400000});}
    ok(res,{csrf_token:csrf,captcha_site_key:process.env.TURNSTILE_SITE_KEY||'',email_mode:process.env.SMTP_HOST?'smtp':'local',privacy_contact:process.env.PRIVACY_CONTACT||'privacy@example.com',retention_days:Number(process.env.RETENTION_DAYS)||365});
  });
  app.use('/api',async(req,res,next)=>{
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const origin=req.headers.origin; const configured=new URL(process.env.APP_URL||'http://localhost:3100').origin;
    if (origin && origin!==configured) throw new AppError('CSRF_ERROR','ต้นทางคำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่',403);
    const cookie=cookieValue(req,'training_csrf');
    if (!cookie || !/^[a-f0-9]{64}$/.test(cookie) || cookie!==req.headers['x-csrf-token']) throw new AppError('CSRF_ERROR','กรุณาโหลดหน้าใหม่ก่อนทำรายการ',403);
    next();
  });
  app.get('/api/courses',async(req,res)=>ok(res,await listCourses(db,{search:String(req.query.search||'').slice(0,200),format:req.query.format,date:req.query.date})));
  app.get('/api/courses/:id',async(req,res)=>ok(res,await getCourse(db,req.params.id)));
  app.post('/api/courses/:id/register',async(req,res)=>{
    await limited(req,'register',100,300000);
    if (req.body?.website) throw new AppError('SPAM_DETECTED','ไม่สามารถส่งแบบฟอร์มได้',422);
    if (process.env.TURNSTILE_SECRET_KEY) {
      let result;
      try {
        const response=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:new URLSearchParams({secret:process.env.TURNSTILE_SECRET_KEY,response:req.body?.captcha_token||'',remoteip:req.ip}),signal:AbortSignal.timeout(10000)});
        result=await response.json();
      } catch {throw new AppError('CAPTCHA_UNAVAILABLE','ระบบยืนยันตัวตนไม่พร้อมใช้งาน กรุณาลองใหม่',503);}
      if (!result.success || result.action!=='register' || (production && result.hostname!==new URL(process.env.APP_URL).hostname)) throw new AppError('CAPTCHA_FAILED','กรุณายืนยันว่าไม่ใช่โปรแกรมอัตโนมัติ',422);
    }
    ok(res,await register(db,req.params.id,req.body),201);
  });
  app.post('/api/registrations/lookup',async(req,res)=>{
    await limited(req,'lookup',20);
    const input=parse(z.object({code:z.string().regex(/^REG-\d{4}-\d{6,}$/),email:z.string().email()}),req.body);
    const details=await registrationStatus(db,input.code,{email:input.email});
    // Short-lived cancellation capability; the permanent email link stays valid.
    const token=secret();
    await db.query('INSERT INTO registration_grants (token_hash,registration_id,expires_at) VALUES (?,?,?)',[hash(token),details.id,new Date(Date.now()+900000).toISOString()]);
    ok(res,{...details,token});
  });
  app.get('/api/registrations/:code',async(req,res)=>{await limited(req,'token-status',30);ok(res,await registrationStatus(db,req.params.code,{token:req.headers['x-registration-token']}));});
  app.post('/api/registrations/:code/cancel',async(req,res)=>{await limited(req,'cancel',20);const input=parse(z.object({token:z.string().length(64)}),req.body);ok(res,await cancelRegistration(db,req.params.code,input));});
  app.post('/api/admin/login',async(req,res)=>{
    await limited(req,'login',10,900000);
    const input=parse(z.object({email:z.string().trim().email().transform(v=>v.toLowerCase()),password:z.string().min(1).max(100)}),req.body);
    const user=(await db.query('SELECT * FROM users WHERE email=? AND is_active=1',[input.email])).rows[0];
    const valid=await bcrypt.compare(input.password,user?.password_hash||'$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW');
    if (!user||!valid) throw new AppError('INVALID_CREDENTIALS','อีเมลหรือรหัสผ่านไม่ถูกต้อง',401);
    const token=secret();const csrf=secret();
    await db.query('INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES (?,?,?,?)',[hash(token),user.id,csrf,new Date(Date.now()+(Number(process.env.SESSION_HOURS)||8)*3600000).toISOString()]);
    res.cookie('training_session',token,{...cookieOptions,maxAge:(Number(process.env.SESSION_HOURS)||8)*3600000});
    res.cookie('training_csrf',csrf,{...cookieOptions,maxAge:(Number(process.env.SESSION_HOURS)||8)*3600000});
    await audit(db,{id:user.id,ip:req.ip},'user.login','users',user.id,null,null);
    ok(res,{user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf_token:csrf});
  });
  app.use('/api/admin',async(req,res,next)=>{
    const token=cookieValue(req,'training_session');
    if (!token||!/^[a-f0-9]{64}$/.test(token)) throw new AppError('UNAUTHENTICATED','กรุณาเข้าสู่ระบบ',401);
    const session=(await db.query('SELECT s.*,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1',[hash(token),now()])).rows[0];
    if (!session) throw new AppError('SESSION_EXPIRED','เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่',401);
    if (!['GET','HEAD'].includes(req.method) && session.csrf_token!==req.headers['x-csrf-token']) throw new AppError('CSRF_ERROR','เซสชันเปลี่ยนไป กรุณาโหลดหน้าใหม่',403);
    req.user={id:session.user_id,name:session.name,email:session.email,role:session.role,ip:req.ip};req.sessionHash=hash(token);next();
  });
  const admin=(req,_res,next)=>{if(req.user.role!=='admin')throw new AppError('FORBIDDEN','เฉพาะผู้ดูแลระบบเท่านั้น',403);next();};
  app.get('/api/admin/me',(req,res)=>ok(res,req.user));
  app.post('/api/admin/logout',async(req,res)=>{await db.query('DELETE FROM sessions WHERE token_hash=?',[req.sessionHash]);res.clearCookie('training_session',cookieOptions);ok(res,{});});
  app.get('/api/admin/summary',async(_req,res)=>{
    const courses=(await db.query('SELECT COUNT(*) count FROM courses WHERE deleted_at IS NULL')).rows[0];
    const statuses=(await db.query('SELECT r.status,COUNT(*) count FROM registrations r JOIN courses c ON c.id=r.course_id WHERE c.deleted_at IS NULL GROUP BY r.status')).rows;
    const mails=(await db.query('SELECT status,COUNT(*) count FROM email_logs GROUP BY status')).rows;
    ok(res,{courses:Number(courses.count),registrations:Object.fromEntries(statuses.map(r=>[r.status,Number(r.count)])),emails:Object.fromEntries(mails.map(r=>[r.status,Number(r.count)]))});
  });
  app.get('/api/admin/courses',async(_req,res)=>ok(res,await listCourses(db,{admin:true})));
  app.get('/api/admin/courses/:id',admin,async(req,res)=>ok(res,await getCourse(db,req.params.id,true)));
  app.post('/api/admin/courses',admin,async(req,res)=>ok(res,await saveCourse(db,req.body,req.user),201));
  app.put('/api/admin/courses/:id',admin,async(req,res)=>ok(res,await saveCourse(db,req.body,req.user,req.params.id)));
  app.delete('/api/admin/courses/:id',admin,async(req,res)=>{await removeCourse(db,req.params.id,req.user);ok(res,{});});
  app.post('/api/admin/courses/:id/duplicate',admin,async(req,res)=>{
    const course=await getCourse(db,req.params.id,true);
    const copy={...course,title:`${course.title.slice(0,187)} (สำเนา)`,slug:`${course.slug.slice(0,120)}-copy-${Date.now()}`,status:'draft',fields:course.fields.map(({id,...f})=>f)};
    ok(res,await saveCourse(db,copy,req.user),201);
  });
  async function roster(req,paginate=true) {
    const c=(await db.query('SELECT id FROM courses WHERE id=? AND deleted_at IS NULL',[req.params.id])).rows[0];if(!c) throw new AppError('NOT_FOUND','ไม่พบหลักสูตร',404);
    const clauses=['course_id=?'];const params=[req.params.id];
    if (['pending','confirmed','waitlisted','rejected','cancelled'].includes(req.query.status)) {clauses.push('status=?');params.push(req.query.status);}
    if (req.query.search) {clauses.push('(LOWER(first_name) LIKE ? OR LOWER(last_name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(code) LIKE ?)');params.push(...Array(4).fill(`%${String(req.query.search).slice(0,200).toLowerCase()}%`));}
    const count=Number((await db.query(`SELECT COUNT(*) count FROM registrations WHERE ${clauses.join(' AND ')}`,params)).rows[0].count);
    const page=Math.max(1,Math.min(100000,Number.parseInt(req.query.page)||1));const size=20;
    const order={oldest:'created_at ASC,id ASC',newest:'created_at DESC,id DESC',name:'first_name ASC,last_name ASC,id ASC',waitlist:'waitlist_position ASC,created_at ASC,id ASC'}[req.query.sort]||'created_at DESC,id DESC';
    const rows=(await db.query(`SELECT id,code,title,first_name,last_name,email,phone,organization,position,status,waitlist_position,custom_answers,pdpa_consented_at,created_at,reason FROM registrations WHERE ${clauses.join(' AND ')} ORDER BY ${order}${paginate?' LIMIT ? OFFSET ?':''}`,paginate?[...params,size,(page-1)*size]:params)).rows;
    return {rows,total:count,page,page_size:size};
  }
  app.get('/api/admin/courses/:id/registrations',async(req,res)=>ok(res,await roster(req)));
  app.patch('/api/admin/registrations/bulk/status',async(req,res)=>{const input=parse(z.object({ids:z.array(z.string().uuid()).min(1).max(100),status:z.enum(['confirmed','pending','rejected','cancelled']),reason:z.string().max(2000).default('')}),req.body);ok(res,await changeStatuses(db,input.ids,input.status,input.reason,req.user));});
  app.patch('/api/admin/registrations/:id/status',async(req,res)=>{const input=parse(z.object({status:z.enum(['confirmed','pending','rejected','cancelled']),reason:z.string().max(2000).default('')}),req.body);ok(res,await changeStatuses(db,[req.params.id],input.status,input.reason,req.user));});
  app.get('/api/admin/courses/:id/export.csv',async(req,res)=>{
    const data=await roster(req,false);const fields=(await db.query('SELECT * FROM course_fields WHERE course_id=? ORDER BY sort_order,id',[req.params.id])).rows;
    const lines=[['รหัสสมัคร','คำนำหน้า','ชื่อ','นามสกุล','อีเมล','เบอร์โทร','หน่วยงาน','ตำแหน่ง','สถานะ','ลำดับสำรอง','วันสมัคร (กรุงเทพฯ)','เวลายินยอม PDPA (กรุงเทพฯ)',...fields.map(f=>f.label)].map(safeCsv).join(',')];
    for (const r of data.rows) {const answers=JSON.parse(r.custom_answers);const date=v=>new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(v));lines.push([r.code,r.title,r.first_name,r.last_name,r.email,r.phone,r.organization,r.position,r.status,r.waitlist_position,date(r.created_at),date(r.pdpa_consented_at),...fields.map(f=>answers[f.id]??'')].map(safeCsv).join(','));}
    await audit(db,req.user,'registration.export','courses',req.params.id,null,{rows:data.total});
    res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="registrations-${req.params.id}.csv"`});res.send('\uFEFF'+lines.join('\r\n'));
  });
  app.get('/api/admin/users',admin,async(_req,res)=>ok(res,(await db.query('SELECT id,name,email,role,is_active,created_at FROM users ORDER BY created_at')).rows));
  app.post('/api/admin/users',admin,async(req,res)=>{
    const input=parse(userSchema,req.body);const id=randomUUID();const password=await bcrypt.hash(input.password,12);
    await db.transaction(async tx=>{await tx.query('INSERT INTO users (id,name,email,password_hash,role,is_active,created_at) VALUES (?,?,?,?,?,1,?)',[id,input.name,input.email,password,input.role,now()]);await audit(tx,req.user,'user.create','users',id,null,{name:input.name,email:input.email,role:input.role});});ok(res,{id},201);
  });
  app.patch('/api/admin/users/:id',admin,async(req,res)=>{
    const input=parse(z.object({name:z.string().trim().min(1).max(200),role:z.enum(['admin','staff']),is_active:z.boolean(),password:z.string().min(12).max(100).optional()}),req.body);
    if (req.user.id===req.params.id && (!input.is_active||input.role!=='admin')) throw new AppError('SELF_LOCKOUT','ไม่สามารถลดสิทธิ์หรือปิดบัญชีตนเองได้',409);
    const password=input.password ? await bcrypt.hash(input.password,12) : null;
    await db.transaction(async tx=>{const before=(await tx.query('SELECT id,name,role,is_active FROM users WHERE id=?',[req.params.id])).rows[0];if(!before)throw new AppError('NOT_FOUND','ไม่พบผู้ใช้',404);
      await tx.query(`UPDATE users SET name=?,role=?,is_active=?${password?',password_hash=?':''} WHERE id=?`,[input.name,input.role,Number(input.is_active),...(password?[password]:[]),req.params.id]);
      await tx.query('DELETE FROM sessions WHERE user_id=?',[req.params.id]);await audit(tx,req.user,'user.update','users',req.params.id,before,{name:input.name,role:input.role,is_active:input.is_active,password_changed:!!password});});ok(res,{});
  });
  app.get('/api/admin/audit',admin,async(req,res)=>{const page=Math.max(1,Number.parseInt(req.query.page)||1);const total=Number((await db.query('SELECT COUNT(*) count FROM audit_logs')).rows[0].count);ok(res,{rows:(await db.query('SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id LIMIT 30 OFFSET ?',[(page-1)*30])).rows,total,page,page_size:30});});
  app.get('/api/admin/emails',admin,async(req,res)=>{const page=Math.max(1,Number.parseInt(req.query.page)||1);const total=Number((await db.query('SELECT COUNT(*) count FROM email_logs')).rows[0].count);ok(res,{rows:(await db.query('SELECT id,type,to_email,subject,status,error,attempts,sent_at,created_at FROM email_logs ORDER BY created_at DESC,id LIMIT 30 OFFSET ?',[(page-1)*30])).rows,total,page,page_size:30});});
  app.post('/api/admin/emails/:id/retry',admin,async(req,res)=>{
    const result=await db.query("UPDATE email_logs SET status='queued',attempts=0,error=NULL,next_attempt_at=?,claimed_at=NULL WHERE id=? AND status='failed'",[now(),req.params.id]);
    if(!result.rowCount)throw new AppError('INVALID_EMAIL','ไม่พบอีเมลที่ส่งล้มเหลว',409);
    await audit(db,req.user,'email.retry','email_logs',req.params.id,null,null);ok(res,{});
  });
  app.use('/api',(_req,_res)=>{throw new AppError('NOT_FOUND','ไม่พบ API',404);});
  app.use('/admin/users',async(req,_res,next)=>{
    const token=cookieValue(req,'training_session');
    const user=token?(await db.query('SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.is_active=1',[hash(token),now()])).rows[0]:null;
    if(user?.role==='staff')throw new AppError('FORBIDDEN','เฉพาะผู้ดูแลระบบเท่านั้น',403);next();
  });
  app.use(express.static(root,{index:false,maxAge:production?'1h':0}));
  app.get(/^\/(?:$|courses(?:\/.*)?$|registrations(?:\/.*)?$|privacy$|admin(?:\/.*)?$)/,(_req,res)=>res.sendFile(resolve(root,'index.html')));
  app.use((_req,res)=>res.status(404).send('ไม่พบหน้าที่ต้องการ'));
  app.use((err,req,res,_next)=>{
    let error=err;
    if (err.code==='23505'||String(err.code).includes('SQLITE_CONSTRAINT_UNIQUE')||/UNIQUE constraint failed/.test(err.message)) error=new AppError('DUPLICATE','ข้อมูลนี้มีอยู่แล้ว กรุณาตรวจสอบอีเมลหรือ URL หลักสูตร',409);
    if (err.type==='entity.parse.failed') error=new AppError('INVALID_JSON','รูปแบบข้อมูลไม่ถูกต้อง',400);
    if (err.type==='entity.too.large') error=new AppError('PAYLOAD_TOO_LARGE','ข้อมูลมีขนาดใหญ่เกินไป',413);
    if (!(error instanceof AppError)) console.error(JSON.stringify({time:now(),method:req.method,path:req.path,error:err.message,stack:production?undefined:err.stack}));
    res.status(error.status||500).json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error instanceof AppError?error.message:'ระบบขัดข้อง กรุณาลองใหม่อีกครั้ง',...(error.fields?{fields:error.fields}:{})}});
  });
  return app;
}

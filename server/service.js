import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { AppError, courseSchema, registrationSchema, parse } from './validation.js';

export const now = () => new Date().toISOString();
export const hash = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('hex');
const holding = ['pending','confirmed'];
const appUrl = () => (process.env.APP_URL || 'http://localhost:3100').replace(/\/$/, '');

export async function audit(tx, actor, action, entity, id, before, after) {
  await tx.query('INSERT INTO audit_logs (id,user_id,action,entity,entity_id,before_data,after_data,ip,created_at) VALUES (?,?,?,?,?,?,?,?,?)', [randomUUID(), actor?.id || null, action, entity, id, before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, actor?.ip || null, now()]);
}
export async function queueMail(tx, registration, type, subject, body, dedupeKey = null) {
  await tx.query(`INSERT INTO email_logs (id,registration_id,type,to_email,subject,body,status,next_attempt_at,dedupe_key,created_at) VALUES (?,?,?,?,?,?,'queued',?,?,?) ON CONFLICT(dedupe_key) DO NOTHING`, [randomUUID(), registration.id, type, registration.email, subject, body, now(), dedupeKey, now()]);
}
async function lockCourse(tx, id) {
  const { rows } = await tx.query(`SELECT * FROM courses WHERE id=? AND deleted_at IS NULL${tx.dialect === 'postgres' ? ' FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw new AppError('NOT_FOUND', 'ไม่พบหลักสูตร', 404);
  return rows[0];
}
export async function occupied(tx, id) {
  return Number((await tx.query("SELECT COUNT(*) AS count FROM registrations WHERE course_id=? AND status IN ('pending','confirmed')", [id])).rows[0].count);
}
export async function courseStatus(tx, course) {
  const used = await occupied(tx, course.id);
  const effective = ['open','full'].includes(course.status) ? (used >= course.capacity ? 'full' : 'open') : course.status;
  if (course.status !== effective) await tx.query('UPDATE courses SET status=?,updated_at=? WHERE id=?', [effective, now(), course.id]);
  return { ...course, status: effective, used, remaining: Math.max(0, course.capacity - used) };
}
export async function getCourse(db, idOrSlug, admin = false) {
  const { rows } = await db.query(`SELECT * FROM courses WHERE (id=? OR slug=?) AND deleted_at IS NULL${admin ? '' : " AND status!='draft'"}`, [idOrSlug, idOrSlug]);
  if (!rows[0]) throw new AppError('NOT_FOUND', 'ไม่พบหลักสูตร', 404);
  const c = rows[0]; const used = await occupied(db, c.id);
  const fields = (await db.query('SELECT * FROM course_fields WHERE course_id=? ORDER BY sort_order,id', [c.id])).rows.map(f => ({ ...f, options: JSON.parse(f.options), is_required: !!f.is_required }));
  return { ...c, price: Number(c.price), requires_approval: !!c.requires_approval, used, remaining: Math.max(0, c.capacity-used), fields, accepting: ['open','full'].includes(c.status) && c.reg_open_at <= now() && c.reg_close_at >= now() && c.start_at > now(), online_url: admin ? c.online_url : undefined };
}
export async function listCourses(db, { admin = false, search = '', format = '', date = '' } = {}) {
  const conditions = ['deleted_at IS NULL']; const params = [];
  if (!admin) conditions.push("status IN ('open','full')");
  if (search) { conditions.push('(LOWER(title) LIKE ? OR LOWER(speaker) LIKE ?)'); params.push(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`); }
  if (['onsite','online','hybrid'].includes(format)) { conditions.push('format=?'); params.push(format); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) { const start = new Date(`${date}T00:00:00+07:00`); conditions.push('start_at>=? AND start_at<?'); params.push(start.toISOString(), new Date(start.getTime()+86400000).toISOString()); }
  const { rows } = await db.query(`SELECT id FROM courses WHERE ${conditions.join(' AND ')} ORDER BY start_at,id`, params);
  return Promise.all(rows.map(r => getCourse(db, r.id, admin)));
}
export async function saveCourse(db, input, actor, id = null) {
  const data = parse(courseSchema, input);
  return db.transaction(async tx => {
    const before = id ? await lockCourse(tx, id) : null;
    if (before && data.capacity < await occupied(tx, id)) throw new AppError('CAPACITY_TOO_LOW', 'จำนวนที่นั่งต้องไม่น้อยกว่าจำนวนผู้ถือที่นั่งปัจจุบัน', 409);
    const courseId = id || randomUUID(); const timestamp = now();
    const { fields, ...values } = data;
    values.requires_approval = Number(values.requires_approval);
    if (id) {
      await tx.query(`UPDATE courses SET ${Object.keys(values).map(k => `${k}=?`).join(',')},updated_at=? WHERE id=?`, [...Object.values(values), timestamp, courseId]);
      const existingFields = (await tx.query('SELECT id FROM course_fields WHERE course_id=?', [id])).rows.map(f => f.id);
      for (const f of fields) if (f.id && !existingFields.includes(f.id)) throw new AppError('INVALID_FIELD', 'ฟิลด์เพิ่มเติมไม่ใช่ของหลักสูตรนี้');
      await tx.query('DELETE FROM course_fields WHERE course_id=?', [id]);
    } else {
      await tx.query(`INSERT INTO courses (id,${Object.keys(values).join(',')},created_by,created_at,updated_at) VALUES (${Array(Object.keys(values).length+4).fill('?').join(',')})`, [courseId, ...Object.values(values), actor.id, timestamp, timestamp]);
    }
    for (const [i, f] of fields.entries()) await tx.query('INSERT INTO course_fields (id,course_id,label,type,options,is_required,sort_order) VALUES (?,?,?,?,?,?,?)', [f.id || randomUUID(), courseId, f.label, f.type, JSON.stringify(f.options), Number(f.is_required), i]);
    const course = await lockCourse(tx, courseId);
    if (before) await promote(tx, course);
    await courseStatus(tx, course);
    await audit(tx, actor, id ? 'course.update' : 'course.create', 'courses', courseId, before, data);
    if (before && ['title','start_at','end_at','location','online_url','status','description','speaker'].some(k => String(before[k]) !== String(data[k]))) {
      const attendees = (await tx.query("SELECT * FROM registrations WHERE course_id=? AND status IN ('confirmed','pending','waitlisted')", [courseId])).rows;
      for (const r of attendees) await queueMail(tx, r, 'course_changed', `แจ้งเปลี่ยนแปลงหลักสูตร: ${data.title}`, `หลักสูตร ${data.title} มีการปรับปรุงข้อมูล\nเริ่ม ${data.start_at}\nสถานที่ ${data.location || 'ออนไลน์'}\nตรวจสอบ: ${appUrl()}/courses/${data.slug}`);
    }
    return { id: courseId };
  });
}
export async function removeCourse(db, id, actor) {
  return db.transaction(async tx => {
    const c = await lockCourse(tx, id);
    const regs = (await tx.query("SELECT * FROM registrations WHERE course_id=? AND status IN ('pending','confirmed','waitlisted')", [id])).rows;
    for (const r of regs) {
      await queueMail(tx, r, 'course_cancelled', `ยกเลิกหลักสูตร: ${c.title}`, `ขอแจ้งยกเลิกหลักสูตร ${c.title}\nรหัสการสมัคร ${r.code}\nกรุณาติดต่อผู้จัดเพื่อสอบถามรายละเอียด`);
      await tx.query("UPDATE registrations SET status='cancelled',waitlist_position=NULL,updated_at=? WHERE id=?", [now(), r.id]);
    }
    await tx.query("UPDATE courses SET deleted_at=?,status='closed',updated_at=? WHERE id=?", [now(),now(),id]);
    await audit(tx, actor, 'course.delete', 'courses', id, c, { notified: regs.length });
  });
}
export async function register(db, courseId, input) {
  const data = parse(registrationSchema, input);
  return db.transaction(async tx => {
    const c = await lockCourse(tx, courseId); const timestamp = now();
    if (!['open','full'].includes(c.status) || timestamp < c.reg_open_at || timestamp > c.reg_close_at || timestamp >= c.start_at) throw new AppError('REGISTRATION_CLOSED', 'หลักสูตรนี้ยังไม่เปิดหรือปิดรับสมัครแล้ว', 409);
    if ((await tx.query("SELECT id FROM registrations WHERE course_id=? AND email=? AND status!='cancelled'", [c.id,data.email])).rows.length) throw new AppError('DUPLICATE_REGISTRATION', 'อีเมลนี้สมัครหลักสูตรนี้แล้ว กรุณาตรวจสอบสถานะการสมัคร', 409);
    const fields = (await tx.query('SELECT * FROM course_fields WHERE course_id=?', [c.id])).rows;
    const answers = {};
    for (const f of fields) {
      const answer = data.custom_answers[f.id];
      if (f.is_required && (answer === undefined || answer === '' || answer === false)) throw new AppError('VALIDATION_ERROR', `กรุณากรอก ${f.label}`, 422, { [`custom_${f.id}`]: ['กรุณากรอกข้อมูลนี้'] });
      if (answer !== undefined) {
        if (f.type === 'checkbox' ? typeof answer !== 'boolean' : typeof answer !== 'string') throw new AppError('INVALID_ANSWER', `ข้อมูล ${f.label} ไม่ถูกต้อง`);
        if (f.type === 'select' && answer && !JSON.parse(f.options).includes(answer)) throw new AppError('INVALID_ANSWER', `ตัวเลือก ${f.label} ไม่ถูกต้อง`);
        answers[f.id] = answer;
      }
    }
    const used = await occupied(tx, c.id);
    const status = used >= c.capacity ? 'waitlisted' : (c.requires_approval || Number(c.price)>0 ? 'pending' : 'confirmed');
    const waiting = Number((await tx.query("SELECT COALESCE(MAX(waitlist_position),0) AS max FROM registrations WHERE course_id=? AND status='waitlisted'", [c.id])).rows[0].max);
    const year = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Bangkok', year: 'numeric' }).format(new Date());
    const sequence = (await tx.query('INSERT INTO counters (name,value) VALUES (?,1) ON CONFLICT(name) DO UPDATE SET value=counters.value+1 RETURNING value', [`registration-${year}`])).rows[0].value;
    const id = randomUUID(); const token = secret(); const code = `REG-${year}-${String(sequence).padStart(6,'0')}`;
    await tx.query('INSERT INTO registrations (id,code,course_id,title,first_name,last_name,email,phone,organization,position,custom_answers,status,waitlist_position,pdpa_consented_at,access_token_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [id,code,c.id,data.title,data.first_name,data.last_name,data.email,data.phone,data.organization,data.position,JSON.stringify(answers),status,status==='waitlisted' ? waiting+1 : null,timestamp,hash(token),timestamp,timestamp]);
    await queueMail(tx, { id, email: data.email }, 'registered', `ยืนยันการสมัคร ${code} — ${c.title}`, `เรียน ${data.first_name} ${data.last_name}\nรหัสการสมัคร: ${code}\nหลักสูตร: ${c.title}\nสถานะ: ${{ confirmed: 'ยืนยันแล้ว', pending: 'รอการอนุมัติ/ชำระเงิน', waitlisted: 'คิวสำรอง' }[status]}\nวันเวลา: ${c.start_at}\nสถานที่: ${c.location || 'ออนไลน์'}\nดูสถานะและยกเลิก: ${appUrl()}/registrations/${code}#token=${token}\nกรุณาเก็บลิงก์นี้เป็นความลับ`);
    await courseStatus(tx,c);
    return { code, token, status };
  });
}
async function reindexWaitlist(tx, id) {
  const rows = (await tx.query("SELECT id FROM registrations WHERE course_id=? AND status='waitlisted' ORDER BY waitlist_position,created_at,id", [id])).rows;
  for (const [i,r] of rows.entries()) await tx.query('UPDATE registrations SET waitlist_position=? WHERE id=?', [i+1,r.id]);
}
async function promote(tx, c) {
  if (!['open','full'].includes(c.status) || now() > c.reg_close_at || now() >= c.start_at) return;
  let free = c.capacity - await occupied(tx,c.id);
  const rows = (await tx.query("SELECT * FROM registrations WHERE course_id=? AND status='waitlisted' ORDER BY waitlist_position,created_at,id", [c.id])).rows;
  for (const r of rows) {
    if (free-- <= 0) break;
    const status = c.requires_approval || Number(c.price)>0 ? 'pending' : 'confirmed';
    await tx.query('UPDATE registrations SET status=?,waitlist_position=NULL,updated_at=? WHERE id=?', [status,now(),r.id]);
    await queueMail(tx,r,'waitlist_promoted',`คุณได้รับที่นั่งแล้ว — ${c.title}`,`รหัสการสมัคร ${r.code}\nหลักสูตร ${c.title}\nคุณได้รับการเลื่อนจากคิวสำรอง สถานะ ${status==='pending' ? 'รอการอนุมัติ/ชำระเงิน' : 'ยืนยันแล้ว'}\nตรวจสอบโดยใช้รหัสและอีเมลที่ ${appUrl()}/registrations`);
    await audit(tx,null,'registration.promote','registrations',r.id,{ status: 'waitlisted' },{ status });
  }
  await reindexWaitlist(tx,c.id);
}
export async function changeStatuses(db, ids, status, reason, actor) {
  if (!Array.isArray(ids) || !ids.length || ids.length>100 || !ids.every(v=>typeof v==='string')) throw new AppError('INVALID_SELECTION','กรุณาเลือก 1–100 รายการ');
  if (!['confirmed','rejected','cancelled','pending'].includes(status)) throw new AppError('INVALID_STATUS','สถานะไม่ถูกต้อง');
  return db.transaction(async tx => {
    let rows = (await tx.query(`SELECT * FROM registrations WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY course_id,id`,ids)).rows;
    if (rows.length !== new Set(ids).size) throw new AppError('NOT_FOUND','ไม่พบการสมัครบางรายการ',404);
    const courses = new Map();
    for (const id of [...new Set(rows.map(r=>r.course_id))].sort()) courses.set(id,await lockCourse(tx,id));
    // Re-read after acquiring course locks: a concurrent transaction may have
    // changed a registration while this transaction was waiting for its lock.
    rows = (await tx.query(`SELECT * FROM registrations WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY course_id,waitlist_position,created_at,id`,ids)).rows;
    const results=[];
    for (const r of rows) {
      if (r.status===status) continue;
      if (['cancelled','rejected'].includes(r.status)) throw new AppError('INVALID_TRANSITION','รายการที่ยกเลิกหรือปฏิเสธแล้วเปลี่ยนสถานะไม่ได้',409);
      const c=courses.get(r.course_id);
      if (holding.includes(status) && !holding.includes(r.status)) {
        if (!['open','full'].includes(c.status) || now()>c.reg_close_at) throw new AppError('REGISTRATION_CLOSED','หลักสูตรปิดรับแล้ว',409);
        const first=(await tx.query("SELECT id FROM registrations WHERE course_id=? AND status='waitlisted' ORDER BY waitlist_position,created_at,id LIMIT 1",[c.id])).rows[0];
        if (first?.id!==r.id) throw new AppError('WAITLIST_ORDER','กรุณาเลื่อนคิวสำรองตามลำดับก่อน',409);
        if (await occupied(tx,c.id)>=c.capacity) throw new AppError('COURSE_FULL','ที่นั่งเต็มแล้ว',409);
      }
      await tx.query('UPDATE registrations SET status=?,waitlist_position=NULL,reason=?,updated_at=? WHERE id=?',[status,reason||'',now(),r.id]);
      await audit(tx,actor,'registration.status','registrations',r.id,{ status:r.status },{ status,reason });
      await queueMail(tx,r,'status_changed',`ผลการสมัคร ${r.code}`,`หลักสูตร ${c.title}\nสถานะ: ${{ confirmed:'ยืนยันแล้ว',pending:'รออนุมัติ',rejected:'ไม่ผ่านการพิจารณา',cancelled:'ยกเลิกแล้ว' }[status]}\n${reason ? `เหตุผล: ${reason}` : ''}\nดูสถานะ: ${appUrl()}/registrations`);
      results.push(r.id);
    }
    for (const c of courses.values()) { await promote(tx,c); await reindexWaitlist(tx,c.id); await courseStatus(tx,c); }
    return { updated:results.length };
  });
}
export async function registrationStatus(db, code, { token, email }={}) {
  const r=(await db.query('SELECT * FROM registrations WHERE code=?',[code])).rows[0];
  const grant=r && token && hash(token)!==r.access_token_hash ? (await db.query('SELECT token_hash FROM registration_grants WHERE token_hash=? AND registration_id=? AND expires_at>?',[hash(token),r.id,now()])).rows[0] : null;
  if (!r || !(token && (hash(token)===r.access_token_hash || grant) || email && email.trim().toLowerCase()===r.email)) throw new AppError('NOT_FOUND','ไม่พบการสมัคร หรือข้อมูลยืนยันไม่ถูกต้อง',404);
  const c=(await db.query('SELECT * FROM courses WHERE id=?',[r.course_id])).rows[0];
  const canCancel=['confirmed','pending','waitlisted'].includes(r.status) && !c.deleted_at && new Date(c.start_at).getTime()-c.cancel_deadline_days*86400000>Date.now();
  const { access_token_hash, ...safe }=r;
  return { ...safe, custom_answers:JSON.parse(r.custom_answers), course:{ title:c.title,slug:c.slug,start_at:c.start_at,end_at:c.end_at,location:c.location,online_url:r.status==='confirmed' ? c.online_url : '',cancel_deadline_days:c.cancel_deadline_days },can_cancel:!!canCancel };
}
export async function cancelRegistration(db, code, credentials) {
  if (!credentials?.token) throw new AppError('TOKEN_REQUIRED','กรุณายืนยันสิทธิ์ด้วยลิงก์ส่วนตัวหรือตรวจสอบรหัสและอีเมลอีกครั้ง',403);
  const found=await registrationStatus(db,code,credentials);
  return db.transaction(async tx=>{
    const c=await lockCourse(tx,found.course_id);
    const r=(await tx.query('SELECT * FROM registrations WHERE id=?',[found.id])).rows[0];
    if (!['confirmed','pending','waitlisted'].includes(r.status)) throw new AppError('INVALID_STATUS','การสมัครนี้ยกเลิกแล้วหรือไม่สามารถยกเลิกได้',409);
    if (new Date(c.start_at).getTime()-c.cancel_deadline_days*86400000<=Date.now()) throw new AppError('CANCELLATION_CLOSED','พ้นกำหนดยกเลิกการสมัครแล้ว',409);
    await tx.query("UPDATE registrations SET status='cancelled',waitlist_position=NULL,updated_at=? WHERE id=?",[now(),r.id]);
    await queueMail(tx,r,'cancelled',`ยกเลิกการสมัคร ${r.code}`,`ยกเลิกการสมัครหลักสูตร ${c.title} เรียบร้อยแล้ว`);
    await audit(tx,null,'registration.cancel','registrations',r.id,{ status:r.status },{ status:'cancelled' });
    await promote(tx,c); await reindexWaitlist(tx,c.id); await courseStatus(tx,c);
    return { status:'cancelled' };
  });
}

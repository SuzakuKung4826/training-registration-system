import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { now, queueMail } from './service.js';

export async function scheduleReminders(db) {
  for (const days of [3,1]) {
    const start=new Date(Date.now()+(days-1)*86400000).toISOString();const end=new Date(Date.now()+days*86400000).toISOString();
    const rows=(await db.query("SELECT r.id,r.email,r.code,c.id AS course_id,c.title AS course_title,c.start_at,c.location,c.online_url FROM registrations r JOIN courses c ON c.id=r.course_id WHERE r.status='confirmed' AND c.deleted_at IS NULL AND c.status NOT IN ('draft','finished') AND c.start_at>? AND c.start_at<=?",[start,end])).rows;
    for (const r of rows) await queueMail(db,r,`reminder_${days}`,`แจ้งเตือนก่อนอบรม ${days} วัน — ${r.course_title}`,`รหัสการสมัคร ${r.code}\nหลักสูตร ${r.course_title}\nวันเวลา: ${new Intl.DateTimeFormat('th-TH',{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(r.start_at))}\nสถานที่: ${r.location}\n${r.online_url ? `ลิงก์อบรม: ${r.online_url}` : ''}`,`reminder:${r.id}:${days}:${r.start_at}`);
  }
  await db.query('DELETE FROM sessions WHERE expires_at<?',[now()]);
  await db.query('DELETE FROM registration_grants WHERE expires_at<?',[now()]);
  await db.query('DELETE FROM rate_limits WHERE reset_at<?',[now()]);
}
export async function processMail(db,{send}={}) {
  const smtp=process.env.SMTP_HOST?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT)||587,secure:process.env.SMTP_SECURE==='true',...(process.env.SMTP_USER?{auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD}}:{}),connectionTimeout:10000,socketTimeout:20000}):null;
  let count=0;
  for (let i=0;i<50;i++) {
    const mail=await db.transaction(async tx=>{
      const expired=new Date(Date.now()-300000).toISOString();
      const row=(await tx.query(`SELECT * FROM email_logs WHERE ((status IN ('queued','failed') AND attempts<5 AND next_attempt_at<=?) OR (status='sending' AND claimed_at<?)) ORDER BY created_at,id LIMIT 1${tx.dialect==='postgres'?' FOR UPDATE SKIP LOCKED':''}`,[now(),expired])).rows[0];
      if(!row)return null;
      await tx.query("UPDATE email_logs SET status='sending',claimed_at=?,attempts=attempts+1 WHERE id=?",[now(),row.id]);return row;
    });
    if(!mail)break;
    try {
      const message={from:process.env.MAIL_FROM||'Training <training@example.com>',to:mail.to_email,subject:mail.subject,text:mail.body,messageId:`<${mail.id}@training.local>`};
      if(send)await send(message);
      else if(smtp)await smtp.sendMail(message);
      else {
        if(process.env.NODE_ENV==='production')throw new Error('SMTP is required in production');
        const directory=resolve('data/outbox');await mkdir(directory,{recursive:true});
        const transport=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});const result=await transport.sendMail(message);
        await writeFile(resolve(directory,`${mail.id}.eml`),result.message,{mode:0o600});
      }
      // Local messages are saved, not marked as externally delivered.
      await db.query('UPDATE email_logs SET status=?,sent_at=?,error=NULL,claimed_at=NULL WHERE id=?',[!send&&!smtp?'local':'sent',now(),mail.id]);count++;
    } catch(e) {
      await db.query("UPDATE email_logs SET status='failed',error=?,next_attempt_at=?,claimed_at=NULL WHERE id=?",[String(e.message).slice(0,1000),new Date(Date.now()+Math.min(3600000,30000*2**mail.attempts)).toISOString(),mail.id]);
      console.error(JSON.stringify({time:now(),event:'mail_failed',id:mail.id,error:e.message}));
    }
  }
  return count;
}

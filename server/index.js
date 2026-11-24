import { connectDatabase, migrate } from './db.js';
import { createApp } from './app.js';
import { processMail, scheduleReminders } from './mail.js';

if(process.env.NODE_ENV==='production') {
  for(const key of ['DATABASE_URL','APP_URL','SMTP_HOST','MAIL_FROM','TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY','PRIVACY_CONTACT']) if(!process.env[key])throw new Error(`Production requires ${key}`);
  if(!process.env.APP_URL.startsWith('https://'))throw new Error('Production APP_URL must use HTTPS');
}
const db=await connectDatabase();await migrate(db);
const app=createApp(db);const server=app.listen(Number(process.env.PORT)||3100,'0.0.0.0',()=>console.log(`Training Registration: ${process.env.APP_URL||'http://localhost:3100'}`));
let running=false;
const tick=async()=>{if(running)return;running=true;try{await scheduleReminders(db);await processMail(db);}catch(e){console.error(JSON.stringify({event:'worker_error',error:e.message}));}finally{running=false;}};
const timer=setInterval(tick,10000);void tick();
let stopping=false;
async function stop(){if(stopping)return;stopping=true;clearInterval(timer);server.close(async()=>{while(running)await new Promise(r=>setTimeout(r,50));await db.close();process.exit(0);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);

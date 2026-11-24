import { randomUUID } from 'node:crypto';
Object.assign(process.env,{NODE_ENV:'development',PORT:'3010',APP_URL:'http://127.0.0.1:3010',DATABASE_URL:'',SQLITE_PATH:`data/e2e-${randomUUID()}.sqlite`,ADMIN_EMAIL:'admin@example.com',ADMIN_PASSWORD:'BrowserTestOnly!2026',SMTP_HOST:'',TURNSTILE_SITE_KEY:'',TURNSTILE_SECRET_KEY:'',TRUST_PROXY:'0'});
await import('../server/seed.js');
await import('../server/index.js');

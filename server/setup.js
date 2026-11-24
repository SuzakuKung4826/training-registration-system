import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';

try {
  const template=await readFile(new URL('../.env.example',import.meta.url),'utf8');
  await writeFile(new URL('../.env',import.meta.url),template.replace('ADMIN_PASSWORD=','ADMIN_PASSWORD='+randomBytes(24).toString('base64url')),{flag:'wx',mode:0o600});
  console.log('Created .env with a random admin password.');
}catch(error){if(error.code!=='EEXIST')throw error;console.log('Using existing .env (not overwritten).');}
dotenv.config({path:new URL('../.env',import.meta.url)});
await import('./seed.js');
console.log('Ready. Admin email: '+(process.env.ADMIN_EMAIL||'admin@example.com'));
console.log('Read ADMIN_PASSWORD in .env for the login password. Start with: npm start');

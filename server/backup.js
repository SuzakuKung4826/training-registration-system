import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { connectDatabase } from './db.js';
const directory=resolve('backups');await mkdir(directory,{recursive:true});
const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
if(process.env.DATABASE_URL){
  const child=spawn('pg_dump',['--format=custom','--file',resolve(directory,`${stamp}.dump`)],{stdio:'inherit',env:{...process.env,PGDATABASE:process.env.DATABASE_URL}});
  child.on('error',()=>{console.error('Install PostgreSQL client tools (pg_dump) to create PostgreSQL backups.');process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code||0;});
}else{
  const db=await connectDatabase();try{await db.query('VACUUM INTO ?',[resolve(directory,`${stamp}.sqlite`)]);console.log(`Backup saved: ${stamp}.sqlite`);}finally{await db.close();}
}

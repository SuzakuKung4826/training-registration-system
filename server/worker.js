import { connectDatabase, migrate } from './db.js';
import { processMail, scheduleReminders } from './mail.js';
const db=await connectDatabase();
try {await migrate(db);await scheduleReminders(db);console.log(`Processed ${await processMail(db)} messages`);}finally{await db.close();}

import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { connectDatabase, migrate } from './db.js';
import { now, saveCourse } from './service.js';

const db=await connectDatabase();
try {
  await migrate(db);
  const email=(process.env.ADMIN_EMAIL||'admin@example.com').toLowerCase();
  let admin=(await db.query('SELECT * FROM users WHERE email=?',[email])).rows[0];
  if(!admin){
    const password=process.env.ADMIN_PASSWORD;
    if(!password||password.length<12)throw new Error('Set ADMIN_PASSWORD in .env to at least 12 characters before seeding.');
    admin={id:randomUUID()};await db.query("INSERT INTO users (id,name,email,password_hash,role,is_active,created_at) VALUES (?,?,?,?,'admin',1,?)",[admin.id,process.env.ADMIN_NAME||'ผู้ดูแลระบบ',email,await bcrypt.hash(password,12),now()]);
    console.log(`Created admin: ${email}`);
  }
  if(Number((await db.query('SELECT COUNT(*) count FROM courses')).rows[0].count)===0){
    const samples=[
      {title:'ทำงานให้ฉลาดขึ้นด้วย Generative AI',slug:'generative-ai-at-work',description:'เปลี่ยน AI ให้เป็นผู้ช่วยในการทำงานของคุณ เรียนรู้การเขียน Prompt การสรุปข้อมูล การระดมความคิด และสร้างเวิร์กโฟลว์ที่นำไปใช้ได้จริง ผ่านกิจกรรม Workshop ที่ไม่ต้องมีพื้นฐานการเขียนโปรแกรม\n\nสิ่งที่คุณจะได้เรียนรู้\n• เข้าใจศักยภาพและข้อจำกัดของ Generative AI\n• เขียน Prompt ให้ได้ผลลัพธ์ตรงใจ\n• สร้างผู้ช่วยสำหรับงานเอกสารและการวิเคราะห์\n• ใช้ AI อย่างรับผิดชอบและรักษาข้อมูลขององค์กร\n\nเหมาะสำหรับบุคลากรทุกสายงาน กรุณานำคอมพิวเตอร์โน้ตบุ๊กมาด้วย',speaker:'ดร. ณัฐพล วิริยะกุล',format:'onsite',location:'ห้อง Innovation Lab ชั้น 3 ศูนย์การเรียนรู้',capacity:30,days:14},
      {title:'Data Storytelling เล่าเรื่องให้ข้อมูลมีพลัง',slug:'data-storytelling',description:'ฝึกเปลี่ยนข้อมูลซับซ้อนให้เป็นเรื่องราวที่เข้าใจง่าย เรียนรู้การเลือกกราฟ การออกแบบ Dashboard และการนำเสนอข้อมูลเพื่อประกอบการตัดสินใจ\n\nWorkshop ครอบคลุมตั้งแต่การตั้งคำถาม การสำรวจข้อมูล ไปจนถึงการเล่าเรื่องด้วยภาพ เหมาะสำหรับผู้ทำงานกับข้อมูลและผู้สนใจพัฒนาทักษะการนำเสนอ',speaker:'อ. พิมพ์ชนก สุขสวัสดิ์',format:'online',location:'',online_url:'https://meet.google.com/',capacity:50,days:21},
      {title:'Design Thinking ออกแบบไอเดียสู่การลงมือทำ',slug:'design-thinking',description:'ค้นหาโอกาสใหม่ผ่านกระบวนการคิดเชิงออกแบบ เรียนรู้การเข้าใจผู้ใช้ นิยามปัญหา ระดมไอเดีย สร้างต้นแบบ และทดสอบแนวคิด\n\nร่วมแลกเปลี่ยนมุมมองกับผู้เรียนจากหลากหลายหน่วยงาน และนำเครื่องมือกลับไปพัฒนางานของคุณได้ทันที เหมาะสำหรับทีมพัฒนาผลิตภัณฑ์ บุคลากร และผู้สนใจนวัตกรรม',speaker:'อ. ธนกร จิตต์อารี',format:'hybrid',location:'ห้อง Creative Space ศูนย์การเรียนรู้',online_url:'https://meet.google.com/',capacity:25,requires_approval:true,days:28},
      {title:'Excel for Productivity จัดการงานอย่างมืออาชีพ',slug:'excel-for-productivity',description:'ยกระดับการใช้ Excel เพื่อจัดการข้อมูลอย่างเป็นระบบ ฝึกใช้สูตรที่จำเป็น Pivot Table และเทคนิคการทำรายงานที่ช่วยลดงานซ้ำ\n\nเรียนรู้ผ่านโจทย์งานจริง พร้อมไฟล์ตัวอย่างสำหรับฝึกปฏิบัติ เหมาะสำหรับผู้ที่มีพื้นฐาน Excel และต้องการใช้งานได้คล่องขึ้น',speaker:'อ. ศิริพร วัฒนกิจ',format:'onsite',location:'ห้อง Computer Lab อาคารฝึกอบรม',capacity:35,days:35}
    ];
    for(const s of samples){const start=new Date(Date.now()+s.days*86400000);start.setUTCHours(2,0,0,0);await saveCourse(db,{...s,start_at:start.toISOString(),end_at:new Date(start.getTime()+6*3600000).toISOString(),reg_open_at:new Date(Date.now()-86400000).toISOString(),reg_close_at:new Date(start.getTime()-2*86400000).toISOString(),status:'open',price:0,cancel_deadline_days:1,fields:[]},admin);}
    console.log('Created 4 sample courses (no sample personal data).');
  }
}finally{await db.close();}

# เรียนรู้ — ระบบลงทะเบียนอบรม

ระบบ Phase 1 MVP ตาม `spec.md` ใช้ Node.js 22.13+ / Express / PostgreSQL และมี SQLite สำหรับพัฒนาในเครื่อง หน้าเว็บภาษาไทยแบบ responsive โดยไม่ต้อง build frontend

## GitHub

Repository: [SuzakuKung4826/training-registration-system](https://github.com/SuzakuKung4826/training-registration-system) (Private)

GitHub Actions รันทดสอบอัตโนมัติเมื่อ push เข้า `main` และเมื่อเปิด Pull Request ได้แก่ integration tests บน SQLite/PostgreSQL และ browser tests บน Chromium พร้อมเก็บภาพหน้าจอ/trace ไว้ 7 วัน ใช้เฉพาะข้อมูลทดสอบ ไม่ต้องนำรหัสผ่านหรือฐานข้อมูลจริงขึ้น GitHub

Clone แล้วรันตามขั้นตอนด้านล่างเพื่อสร้าง `.env` และฐานข้อมูลของแต่ละเครื่องใหม่ ไฟล์ `.env`, ฐานข้อมูล, อีเมลในเครื่อง, สำเนาสำรอง และ `node_modules` ไม่ถูกนำเข้า Git

## เริ่มใช้งานในเครื่อง

```powershell
npm install
npm run setup
npm start
```

`setup` สร้าง `.env` พร้อมรหัสผ่าน Admin แบบสุ่ม และสร้างหลักสูตรตัวอย่าง เปิดดูบัญชี/รหัสผ่านที่ `ADMIN_EMAIL` และ `ADMIN_PASSWORD` ใน `.env` คำสั่งนี้ไม่เขียนทับ `.env` เดิม

หากต้องการตั้งค่าด้วยตนเอง ให้คัดลอก `.env.example` เป็น `.env` และกำหนด `ADMIN_EMAIL`, `ADMIN_PASSWORD` อย่างน้อย 12 ตัวอักษร จากนั้น:

```powershell
npm run seed
npm start
```

เปิด http://localhost:3100 และเข้าสู่ระบบเจ้าหน้าที่ที่ http://localhost:3100/admin/login ด้วยบัญชีที่กำหนดใน `.env` คำสั่ง seed ทำงานซ้ำได้ ไม่เปลี่ยนรหัสผ่านบัญชีเดิม และสร้างหลักสูตรตัวอย่าง 4 หลักสูตรเฉพาะฐานข้อมูลที่ยังไม่มีหลักสูตร

- SQLite ถูกสร้างใน `data/training.sqlite` โดยอัตโนมัติ ไม่ต้องติดตั้งฐานข้อมูลเพิ่ม
- อีเมลโหมดพัฒนาถูกบันทึกใน `data/outbox/*.eml` ภายในประมาณ 10 วินาที **ยังไม่ได้ส่งเข้ากล่องจดหมายจริง**; เปิดด้วยโปรแกรมอีเมลหรือ text editor สถานะในระบบเป็น `local`
- ไม่ใส่ Turnstile key ในเครื่องได้ โดยยังมี honeypot และ rate limit; **production บังคับตั้ง CAPTCHA**
- ไม่มีรหัสผ่านเริ่มต้นที่ฝังในโค้ด และไม่เก็บข้อมูลผู้สมัครตัวอย่าง
- ต้องรัน SQLite ด้วย Node process เดียว สำหรับหลาย process/หลายเครื่องใช้ PostgreSQL

## สิ่งที่ทำได้

- ค้นหา/กรองหลักสูตรตามวันที่และ Onsite / Online / Hybrid
- ดูรายละเอียด สมัคร ยินยอม PDPA ฟิลด์เพิ่มเติมแบบ text/select/checkbox
- รับรหัส `REG-YYYY-000001` ดูสถานะผ่านลิงก์ลับหรือรหัส + อีเมล และยกเลิกตามกำหนด
- จองที่นั่งใน transaction; `pending` และ `confirmed` ถือที่นั่ง เมื่อเต็มเข้า FIFO waitlist และเลื่อนอัตโนมัติเมื่อมีที่ว่าง
- Admin สร้าง/แก้ไข/ทำสำเนา/soft delete หลักสูตร กำหนดความจุ เวลา ราคา และการอนุมัติ
- Admin/Staff ค้นหารายชื่อ กรอง เรียง แบ่งหน้า อนุมัติ/ปฏิเสธ/ยกเลิกแบบรายคนหรือกลุ่ม
- Export CSV พร้อม UTF-8 BOM และป้องกันสูตรใน Excel
- Admin จัดการผู้ใช้/บทบาท ปิดบัญชี เปลี่ยนรหัสผ่าน ดู audit log และ email log
- bcrypt, session timeout, HttpOnly/SameSite cookies, CSRF, CSP, validation ฝั่ง client/server และ server-side authorization
- คิวอีเมลที่บันทึกพร้อม transaction แจ้งสมัคร ผลอนุมัติ เลื่อนคิว แก้ไข/ยกเลิกหลักสูตร และเตือนล่วงหน้า 3/1 วัน
- Worker ตรวจคิวทุก 10 วินาที ลองส่งซ้ำไม่เกิน 5 ครั้งแบบ exponential backoff และกด retry จากหน้า Admin ได้
- เก็บเวลา UTC และแสดง Asia/Bangkok

## PostgreSQL และ production

ตั้ง `DATABASE_URL=postgresql://user:password@host:5432/training` ระบบสร้างตารางและ index เมื่อเริ่มทำงาน การจอง/คืนที่นั่งล็อกแถวหลักสูตรด้วย `SELECT ... FOR UPDATE` ภายใน transaction; SQLite ใช้ `BEGIN IMMEDIATE` และคิวภายใน process

Production (`NODE_ENV=production`) ต้องกำหนด:

| ค่า | ใช้สำหรับ |
|---|---|
| `APP_URL` | URL จริงที่ขึ้นต้น `https://` |
| `DATABASE_URL` | PostgreSQL |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | SMTP (`587`+`false` สำหรับ STARTTLS, `465`+`true` สำหรับ TLS) |
| `SMTP_USER`, `SMTP_PASSWORD` | บัญชี SMTP หากผู้ให้บริการกำหนด |
| `MAIL_FROM` | อีเมลผู้ส่งที่ยืนยันกับผู้ให้บริการแล้ว |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile สำหรับโดเมนจริง |
| `PRIVACY_CONTACT` | ช่องทางติดต่อผู้รับผิดชอบข้อมูลจริง |
| `RETENTION_DAYS` | ระยะเวลาเก็บข้อมูลตามนโยบายองค์กร (เริ่มต้น 365 วัน) |
| `SESSION_HOURS` | อายุ session แบบ absolute (เริ่มต้น 8 ชั่วโมง) |
| `TRUST_PROXY` | `1` เฉพาะเมื่ออยู่หลัง reverse proxy 1 ตัว |

CAPTCHA ตรวจทั้ง action `register` และ hostname ฝั่ง server บัญชี SMTP ต้องมีความสามารถส่งอย่างน้อยตามปริมาณผู้สมัคร (เป้าหมายสเปก 200 คน/นาที) การส่งจริงอาจขึ้นกับความเร็ว SMTP จึงควรทดสอบกับผู้ให้บริการก่อนเปิดรับสมัคร

### Docker Compose

กำหนด `POSTGRES_PASSWORD` เป็นรหัสผ่านฐานข้อมูลที่รัดกุมและ URL-safe ใน `.env` พร้อมค่าของ production ด้านบน:

```powershell
docker compose up -d --build
docker compose run --rm app node server/seed.js
```

ตั้ง reverse proxy/TLS เช่น Caddy ด้วย `Caddyfile` ที่ให้มา (แก้โดเมน) เพื่อส่งต่อไป `127.0.0.1:3100` ไม่เปิดพอร์ตฐานข้อมูลสู่ภายนอก แอปตรวจสุขภาพที่ `/api/health` คิวอีเมลอยู่ใน process ของเซิร์ฟเวอร์และเก็บงานลงฐานข้อมูล จึงทำงานต่อได้หลังรีสตาร์ต

Compose มีบริการ `backup` ที่สำรอง PostgreSQL ทุก 24 ชั่วโมงลง `./backups` โดยเริ่มครั้งแรกเมื่อฐานข้อมูลพร้อม สำเนายังอยู่บนเครื่องเดียวกัน ผู้ดูแลต้องกำหนดการส่งสำเนาไปพื้นที่แยกและระยะเวลาเก็บรักษาให้เหมาะกับองค์กร

แยกรัน worker แบบ one-shot สำหรับ cron ได้ด้วย `npm run worker` (เคลมงานใน transaction ป้องกัน worker หยิบงานเดียวกันพร้อมกัน) อีเมลอาจถูกส่งซ้ำได้หาก worker หยุดระหว่าง SMTP รับข้อความแล้วกับบันทึกผลสำเร็จ ใช้ Message-ID คงที่เพื่อลดข้อความซ้ำ

## สำรองและกู้คืน

```powershell
npm run backup
```

SQLite ใช้ `VACUUM INTO` เป็น snapshot ที่สอดคล้องกัน; PostgreSQL ใช้ `pg_dump --format=custom` และต้องติดตั้ง PostgreSQL client tools ตั้ง Windows Task Scheduler หรือ cron ให้รันคำสั่งนี้ทุกวัน พร้อมสำรองไฟล์ไปพื้นที่เข้ารหัสที่แยกจากเซิร์ฟเวอร์ กำหนดสิทธิ์จำกัดและระยะเวลาเก็บสำเนาตามนโยบาย

ใน Docker ใช้:

```powershell
docker compose exec db pg_dump -U training -d training --format=custom --file=/tmp/training.dump
docker compose cp db:/tmp/training.dump ./backups/training.dump
```

สร้างโฟลเดอร์ `backups` ก่อนใช้คำสั่ง ตัวอย่างกู้คืน PostgreSQL (ใช้ฐานข้อมูลเปล่าและหยุดแอปก่อน): `pg_restore --dbname=YOUR_DATABASE_URL backups/FILE.dump` สำหรับ SQLite หยุดแอปแล้วนำไฟล์สำรองมาแทน `data/training.sqlite` และนำไฟล์ `-wal`/`-shm` เดิมออกก่อนเริ่มใหม่ ทดสอบกู้คืนเป็นระยะ

## ทดสอบ

```powershell
npm run check
npm test
```

Integration tests ใช้ฐานข้อมูล SQLite ในหน่วยความจำที่แยกจากข้อมูลจริง ครอบคลุม concurrency 50 HTTP requests / 5 ที่นั่ง, waitlist FIFO, การยินยอมและ validation, สมัครซ้ำ, deadline, bulk status, audit log, role 403, session/CSRF, CSV BOM/formula และอีเมล/retry/reminder

ใช้ PostgreSQL สำหรับทดสอบชุดเดียวกันได้ โดยตั้ง `TEST_DATABASE_URL` เป็น **ฐานข้อมูลทดสอบว่างที่แยกจาก production** แต่ละรอบสร้างข้อมูลใหม่และไม่ล้างข้อมูลเดิมโดยอัตโนมัติ

Browser tests:

```powershell
npm run test:browser
```

ใช้ Chrome ที่ติดตั้งในเครื่อง (กำหนด `BROWSER_EXECUTABLE` หาก path ต่างออกไป) หรือ `npx playwright install chromium` แล้วเอา executable override ออกจาก config ผลลัพธ์/ภาพหน้าจอเก็บใน `test-results/`

## ขอบเขตและการตั้งค่าที่เหลือ

Phase 2/3 ในสเปก (ชำระเงิน PromptPay/สลิป, เช็คอิน QR, PDF ใบประกาศ/ใบเสร็จ, แบบประเมิน, รายงานเชิงลึก, LINE และสองภาษา) ยังไม่รวมใน MVP หลักสูตรมีค่าใช้จ่ายจะคง `pending` เพื่อให้เจ้าหน้าที่พิจารณา ไม่มีการเรียกเก็บหรือยืนยันการชำระอัตโนมัติ

ก่อนเปิดจริง ผู้จัดต้องกำหนดนโยบายองค์กร/ผู้ให้บริการและช่องทางติดต่อใน `/privacy` ให้ตรงการใช้งาน การลบ/แก้ไขข้อมูลตามคำขอและการลบเมื่อพ้นระยะเวลาเป็นงานของผู้ดูแลใน MVP โดยต้องรวม audit, อีเมล และสำเนาสำรองที่เกี่ยวข้องตามนโยบาย ไม่อ้างว่าสถานะความสอดคล้อง PDPA ได้รับการรับรองโดยระบบ

ยังไม่มีระบบรับอีเมลตีกลับ/complaint webhook; `sent` หมายถึง SMTP รับข้อความแล้ว ไม่ยืนยันว่าผู้รับอ่านหรือได้รับใน inbox เป้าหมายโหลดหน้า <2 วินาทีบน 4G และประสิทธิภาพ production ต้องวัดบนโครงสร้างพื้นฐานจริง

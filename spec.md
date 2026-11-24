# Spec: ระบบลงทะเบียนอบรม (Training Registration System)

> เอกสารนี้ใช้เป็น requirement หลักสำหรับพัฒนาเว็บ แบ่งเป็น MVP (Phase 1) และ Phase ถัดไป
> หากมีส่วนที่ไม่ชัดเจน ให้ยึดหลัก "ทำให้เรียบง่ายที่สุดที่ผ่าน Acceptance Criteria"

---

## 1. ภาพรวม (Overview)

**วัตถุประสงค์:** เว็บไซต์สำหรับเปิดรับสมัครและจัดการผู้เข้าอบรม ตั้งแต่สร้างหลักสูตร รับลงทะเบียน จัดการที่นั่ง แจ้งเตือน ไปจนถึงเช็คอินและออกใบประกาศนียบัตร

**ผู้ใช้งาน (Roles)**

| Role | คำอธิบาย | สิทธิ์หลัก |
|---|---|---|
| Visitor / Attendee | ผู้สมัครอบรม | ดูหลักสูตร, สมัคร, ยกเลิก, ดูสถานะของตนเอง |
| Staff | เจ้าหน้าที่ | ดูรายชื่อ, เช็คอิน, อนุมัติการสมัคร |
| Admin | ผู้ดูแลระบบ | ทุกอย่าง + จัดการหลักสูตร, ผู้ใช้, รายงาน |

**หลักการออกแบบ**
- Mobile-first (ผู้สมัครส่วนใหญ่ใช้มือถือ)
- UI ภาษาไทยเป็นหลัก (รองรับ i18n ในอนาคต)
- ปลอดภัยและสอดคล้อง PDPA

---

## 2. ขอบเขต (Scope)

### Phase 1 — MVP (ต้องทำ)
1. จัดการหลักสูตร/รอบอบรม
2. ฟอร์มลงทะเบียน
3. จัดการที่นั่ง + Waitlist
4. อีเมลแจ้งเตือน
5. หน้า Admin (รายชื่อ, อนุมัติ, Export CSV)

### Phase 2
6. ชำระเงิน (PromptPay QR / แนบสลิป) + ใบเสร็จ
7. เช็คอินด้วย QR Code
8. ใบประกาศนียบัตร (PDF) + แบบประเมิน
9. Dashboard และรายงาน

### Phase 3 (Nice to have)
- สองภาษา TH/EN, LINE Login / LINE OA, สมัครเป็นกลุ่ม, Add to Calendar (.ics), ปรับปรุงเชื่อม Zoom/Meet, Pre/Post-test

### นอกขอบเขต (Out of Scope)
- ระบบ LMS / เรียนออนไลน์เต็มรูปแบบ
- ระบบบัญชีการเงินเต็มรูปแบบ

---

## 3. Functional Requirements

### FR-1 การจัดการหลักสูตร (Admin)
- FR-1.1 สร้าง/แก้ไข/ลบ (soft delete) หลักสูตร
- FR-1.2 ฟิลด์: ชื่อ, รายละเอียด, รูปปก, วิทยากร, รูปแบบ (onsite / online / hybrid), สถานที่หรือลิงก์, วันเวลาเริ่ม-จบ, จำนวนที่นั่ง, ค่าลงทะเบียน (0 = ฟรี), ช่วงเวลารับสมัคร, ต้องอนุมัติหรือไม่ (`requires_approval`)
- FR-1.3 สถานะ: `draft` → `open` → `full` → `closed` → `finished` (เปลี่ยน `full` อัตโนมัติเมื่อที่นั่งหมด และกลับเป็น `open` เมื่อมีที่ว่าง)
- FR-1.4 กำหนดฟิลด์เพิ่มเติมของฟอร์มต่อหลักสูตรได้ (custom fields: text, select, checkbox)
- FR-1.5 ทำสำเนา (duplicate) หลักสูตรได้

### FR-2 หน้าสาธารณะ (Attendee)
- FR-2.1 หน้าแรก: รายการหลักสูตรที่เปิดรับ พร้อมค้นหา/กรอง (วันที่, รูปแบบ)
- FR-2.2 หน้ารายละเอียดหลักสูตร: แสดงที่นั่งคงเหลือ, ปุ่ม "ลงทะเบียน" (เปลี่ยนเป็น "เข้าคิวสำรอง" เมื่อเต็ม, ปิดปุ่มเมื่อปิดรับ)
- FR-2.3 หน้าตรวจสอบสถานะการสมัคร (ด้วยลิงก์ใน email หรือรหัสการสมัคร + email)

### FR-3 ฟอร์มลงทะเบียน
- FR-3.1 ฟิลด์พื้นฐาน: คำนำหน้า, ชื่อ, นามสกุล, อีเมล, เบอร์โทร, หน่วยงาน, ตำแหน่ง
- FR-3.2 Validation ทั้งฝั่ง client และ server (อีเมล, เบอร์โทรไทย 10 หลัก)
- FR-3.3 ป้องกันสมัครซ้ำ: อีเมลเดียวกัน + หลักสูตรเดียวกัน ห้ามซ้ำ (ยกเว้นสถานะ `cancelled`)
- FR-3.4 Checkbox ยอมรับนโยบายข้อมูลส่วนบุคคล (PDPA) — จำเป็นต้องติ๊กก่อนส่ง และบันทึกเวลาที่ยินยอม
- FR-3.5 Anti-spam: CAPTCHA (เช่น Cloudflare Turnstile) และ rate limit ต่อ IP
- FR-3.6 หลังสมัครสำเร็จ แสดงหน้าสรุป + รหัสการสมัคร (เช่น `REG-2026-000123`) และส่งอีเมลยืนยัน

### FR-4 การจัดการที่นั่งและ Waitlist
- FR-4.1 นับที่นั่งคงเหลือจากจำนวนการสมัครที่สถานะ `confirmed` + `pending` (ที่ถือที่นั่ง)
- FR-4.2 **ห้าม overbooking** — ตรวจสอบและจองที่นั่งภายใน database transaction เดียว (ใช้ `SELECT ... FOR UPDATE` หรือ atomic update)
- FR-4.3 เมื่อที่นั่งเต็ม ผู้สมัครใหม่เข้า `waitlisted` ตามลำดับเวลา
- FR-4.4 เมื่อมีคนยกเลิก ระบบเลื่อนคนแรกใน waitlist เป็น `pending`/`confirmed` อัตโนมัติ และส่งอีเมลแจ้ง
- FR-4.5 ผู้สมัครยกเลิกเองได้จนถึงก่อนเริ่มอบรม X วัน (ตั้งค่าได้ต่อหลักสูตร)

### FR-5 การแจ้งเตือน (Email)
| Trigger | เนื้อหา |
|---|---|
| สมัครสำเร็จ | ยืนยันการสมัคร + รายละเอียดหลักสูตร + ลิงก์ดูสถานะ/ยกเลิก |
| ได้รับอนุมัติ / ถูกปฏิเสธ | ผลการพิจารณา (พร้อมเหตุผลถ้ามี) |
| เลื่อนจาก waitlist | แจ้งว่าได้ที่นั่งแล้ว |
| ก่อนอบรม 3 วัน และ 1 วัน | แจ้งเตือนพร้อมสถานที่/ลิงก์ |
| หลักสูตรเปลี่ยนแปลง/ยกเลิก | แจ้งผู้สมัครทุกคนที่เกี่ยวข้อง |

- ใช้ Job queue / scheduled job สำหรับการส่งเตือนล่วงหน้า
- บันทึกสถานะการส่ง (sent / failed) และ retry เมื่อล้มเหลว

### FR-6 ระบบ Admin
- FR-6.1 Login ด้วย email + password (hash ด้วย bcrypt/argon2), รองรับ session timeout
- FR-6.2 หน้ารายชื่อผู้สมัครต่อหลักสูตร: ค้นหา, กรองตามสถานะ, เรียงลำดับ, แบ่งหน้า (pagination)
- FR-6.3 เปลี่ยนสถานะผู้สมัคร: อนุมัติ / ปฏิเสธ / ยกเลิก / ย้ายจาก waitlist (ทำทีละรายการและแบบกลุ่ม)
- FR-6.4 Export รายชื่อเป็น CSV (รองรับ UTF-8 with BOM เพื่อเปิดภาษาไทยใน Excel ได้ถูกต้อง)
- FR-6.5 จัดการผู้ใช้ระบบและกำหนด Role (เฉพาะ Admin)
- FR-6.6 Audit log: บันทึกว่าใครทำอะไรกับข้อมูลใด เมื่อไร

### FR-7 การชำระเงิน (Phase 2)
- PromptPay QR (สร้างตามยอดเงิน) และ/หรืออัปโหลดสลิปให้ Admin ตรวจสอบ
- สถานะการชำระ: `unpaid` / `pending_verification` / `paid` / `refunded`
- กำหนดเวลาชำระ (เช่น 24 ชม.) หากเกินให้ปล่อยที่นั่งอัตโนมัติ
- ออกใบเสร็จ PDF, โค้ดส่วนลด, บันทึกการคืนเงิน

### FR-8 เช็คอิน (Phase 2)
- สร้าง QR Code ต่อการสมัคร (ส่งทางอีเมล / แสดงในหน้าสถานะ)
- หน้า Staff สแกน QR ผ่านกล้องมือถือ → บันทึกเวลาเข้างาน
- รองรับหลายวัน/หลายช่วง (session) ต่อหลักสูตร
- กันสแกนซ้ำและแจ้งเตือนเมื่อ QR ไม่ถูกต้อง

### FR-9 ใบประกาศนียบัตรและแบบประเมิน (Phase 2)
- เงื่อนไขออกใบประกาศฯ: เข้าร่วมครบตามเกณฑ์ (%) ที่ตั้งไว้ต่อหลักสูตร
- สร้าง PDF จากเทมเพลต พร้อมเลขที่ใบประกาศฯ และ QR ตรวจสอบความถูกต้อง
- แบบประเมินความพึงพอใจหลังอบรม (ต้องตอบก่อนดาวน์โหลดใบประกาศฯ — ตั้งค่าได้)

### FR-10 Dashboard (Phase 2)
- จำนวนผู้สมัคร / ยืนยัน / เข้าร่วมจริง / ยกเลิก ต่อหลักสูตร
- รายได้รวม, อัตราการเข้าร่วม, สรุปตามหน่วยงาน
- กรองตามช่วงวันที่

---

## 4. Non-functional Requirements

| หัวข้อ | ข้อกำหนด |
|---|---|
| **Performance** | หน้าสาธารณะโหลด < 2 วินาที บน 4G; รองรับผู้สมัครพร้อมกันอย่างน้อย 200 คน/นาที |
| **Security** | HTTPS เท่านั้น, CSRF protection, ป้องกัน SQL injection/XSS, hash รหัสผ่าน, ตรวจสิทธิ์ทุก endpoint ฝั่ง server |
| **PDPA** | ขอความยินยอม, เก็บเฉพาะข้อมูลที่จำเป็น, มีนโยบายระยะเวลาเก็บข้อมูล, มีช่องทางขอลบ/แก้ไขข้อมูล, จำกัดการเข้าถึงข้อมูลส่วนบุคคลตาม Role |
| **Availability** | Backup ฐานข้อมูลรายวัน |
| **Accessibility** | Contrast เพียงพอ, ใช้งานด้วยคีย์บอร์ดได้, label ครบทุกฟิลด์ |
| **Compatibility** | Chrome, Safari, Edge, Firefox เวอร์ชันล่าสุด; iOS/Android browser |
| **Observability** | Error logging, log การส่งอีเมล |
| **Timezone** | จัดเก็บเวลาเป็น UTC แสดงผลเป็น Asia/Bangkok |

---

## 5. Tech Stack (ข้อเสนอแนะ — ปรับเปลี่ยนได้)

| ส่วน | ตัวเลือกแนะนำ |
|---|---|
| Frontend | HTML/CSS/JS หรือ React/Next.js + Tailwind CSS |
| Backend | Node.js (Express/Next.js API) หรือ Python (FastAPI/Django) |
| Database | **MySQL 8** (หรือ PostgreSQL) |
| ORM | Prisma / SQLAlchemy / Django ORM |
| Email | SMTP, Resend, หรือ SendGrid |
| Job/Scheduler | cron + queue (BullMQ / Celery) |
| PDF | PDFKit / WeasyPrint / Puppeteer |
| QR | `qrcode` library (สร้าง) + `html5-qrcode` (สแกน) |
| Deploy | VPS / Render / Railway / Vercel + Managed DB |

---

## 6. Data Model

```
users
  id PK, name, email UNIQUE, password_hash,
  role ENUM('admin','staff'), is_active, created_at

courses
  id PK, title, slug UNIQUE, description, cover_image,
  speaker, format ENUM('onsite','online','hybrid'),
  location, online_url,
  start_at, end_at,
  reg_open_at, reg_close_at,
  capacity INT, price DECIMAL(10,2) DEFAULT 0,
  requires_approval BOOL, cancel_deadline_days INT,
  status ENUM('draft','open','full','closed','finished'),
  created_by FK users, created_at, updated_at, deleted_at

course_fields            -- custom fields ต่อหลักสูตร
  id PK, course_id FK, label, type ENUM('text','select','checkbox'),
  options JSON, is_required BOOL, sort_order

registrations
  id PK, code UNIQUE,            -- เช่น REG-2026-000123
  course_id FK,
  title, first_name, last_name, email, phone,
  organization, position,
  custom_answers JSON,
  status ENUM('pending','confirmed','waitlisted','rejected','cancelled'),
  waitlist_position INT NULL,
  pdpa_consented_at DATETIME,
  access_token,                  -- ใช้ดู/ยกเลิกผ่านลิงก์
  created_at, updated_at
  UNIQUE(course_id, email) ที่ status != 'cancelled'  (บังคับที่ logic ชั้น app)

payments                 -- Phase 2
  id PK, registration_id FK, amount, method,
  status ENUM('unpaid','pending_verification','paid','refunded'),
  slip_url, paid_at, verified_by FK users, receipt_no

course_sessions          -- Phase 2 (หลายวัน/หลายช่วง)
  id PK, course_id FK, title, start_at, end_at

checkins                 -- Phase 2
  id PK, registration_id FK, session_id FK,
  checked_in_at, checked_in_by FK users

certificates             -- Phase 2
  id PK, registration_id FK, cert_no UNIQUE, issued_at, file_url

feedback                 -- Phase 2
  id PK, registration_id FK, rating INT, comment TEXT, created_at

email_logs
  id PK, registration_id FK NULL, type, to_email,
  status ENUM('queued','sent','failed'), error, sent_at

audit_logs
  id PK, user_id FK NULL, action, entity, entity_id,
  before JSON, after JSON, ip, created_at
```

**Index ที่ควรมี:** `registrations(course_id, status)`, `registrations(email)`, `courses(status, start_at)`

---

## 7. API / Routes (ตัวอย่าง)

### Public
| Method | Path | คำอธิบาย |
|---|---|---|
| GET | `/` | รายการหลักสูตรที่เปิดรับ |
| GET | `/courses/:slug` | รายละเอียดหลักสูตร |
| POST | `/api/courses/:id/register` | ส่งฟอร์มสมัคร |
| GET | `/registrations/:code?token=...` | ดูสถานะการสมัคร |
| POST | `/api/registrations/:code/cancel` | ยกเลิกการสมัคร (ต้องมี token) |

### Admin / Staff (ต้อง login)
| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| POST | `/api/admin/login` | — | เข้าสู่ระบบ |
| GET/POST | `/api/admin/courses` | admin | รายการ/สร้างหลักสูตร |
| PUT/DELETE | `/api/admin/courses/:id` | admin | แก้ไข/ลบ |
| GET | `/api/admin/courses/:id/registrations` | admin, staff | รายชื่อผู้สมัคร (filter, paginate) |
| PATCH | `/api/admin/registrations/:id/status` | admin, staff | อนุมัติ/ปฏิเสธ/ยกเลิก |
| GET | `/api/admin/courses/:id/export.csv` | admin, staff | Export CSV |
| GET/POST | `/api/admin/users` | admin | จัดการผู้ใช้ |
| POST | `/api/admin/checkin` | admin, staff | เช็คอิน (Phase 2) |

### รูปแบบ Response
- สำเร็จ: `{ "ok": true, "data": ... }`
- ผิดพลาด: `{ "ok": false, "error": { "code": "COURSE_FULL", "message": "..." } }`

---

## 8. Business Rules สำคัญ

1. **การถือที่นั่ง:** สถานะ `pending` (หลักสูตรที่ต้องอนุมัติหรือรอชำระเงิน) และ `confirmed` ถือที่นั่ง; `waitlisted`, `rejected`, `cancelled` ไม่ถือ
2. **Race condition:** ขั้นตอน "ตรวจที่นั่ง → สร้างการสมัคร" ต้องอยู่ใน transaction เดียว
3. **รับสมัครได้เมื่อ:** `status = open` และเวลาปัจจุบันอยู่ระหว่าง `reg_open_at` – `reg_close_at`
4. **หลักสูตรฟรี + ไม่ต้องอนุมัติ:** สมัครแล้ว `confirmed` ทันที
5. **หลักสูตรมีค่าใช้จ่าย:** สมัครแล้ว `pending` จนกว่าจะชำระเงิน (Phase 2) หากไม่ชำระภายในเวลาที่กำหนด → `cancelled` และปล่อยที่นั่ง
6. **ลดจำนวนที่นั่งต่ำกว่าจำนวนที่ยืนยันแล้ว:** ห้ามบันทึก
7. **ลบหลักสูตรที่มีผู้สมัคร:** ทำได้เฉพาะ soft delete และต้องแจ้งผู้สมัครก่อน
8. **ข้อความแจ้งเตือนผู้ใช้:** ไม่เปิดเผยข้อมูลผู้สมัครคนอื่น

---

## 9. หน้าจอ (UI Pages)

**Public**
- `/` รายการหลักสูตร
- `/courses/:slug` รายละเอียด + ปุ่มสมัคร
- `/courses/:slug/register` ฟอร์มสมัคร
- `/registrations/:code` สถานะการสมัคร
- `/privacy` นโยบายข้อมูลส่วนบุคคล

**Admin**
- `/admin/login`
- `/admin` Dashboard (Phase 2: กราฟ, MVP: ตารางสรุปง่ายๆ)
- `/admin/courses` และ `/admin/courses/new`, `/admin/courses/:id/edit`
- `/admin/courses/:id/registrations`
- `/admin/users`
- `/admin/checkin` (Phase 2)

**UX Notes**
- แสดง error ใต้ฟิลด์ที่ผิดพร้อมข้อความภาษาไทยที่เข้าใจง่าย
- ปุ่ม submit ปิดการกดซ้ำระหว่างส่ง (ป้องกันสมัครซ้ำ)
- แสดงสถานะ loading / empty / error ทุกหน้า

---

## 10. Acceptance Criteria (MVP)

- [ ] Admin สร้างหลักสูตร กำหนดที่นั่ง 30 ที่ และเปิดรับสมัครได้
- [ ] ผู้สมัครกรอกฟอร์มครบและติ๊ก PDPA แล้วได้รหัสการสมัครและอีเมลยืนยันภายใน 1 นาที
- [ ] อีเมลเดียวกันสมัครหลักสูตรเดียวกันซ้ำไม่ได้
- [ ] เมื่อมีคนสมัครพร้อมกัน 50 request ขณะเหลือ 5 ที่ ต้องได้ผู้สมัครสำเร็จ 5 คนพอดี ที่เหลือเข้า waitlist
- [ ] เมื่อมีผู้ยกเลิก คนแรกใน waitlist ถูกเลื่อนและได้รับอีเมล
- [ ] หลักสูตรที่ต้องอนุมัติ: Admin อนุมัติ/ปฏิเสธแล้ว ผู้สมัครได้รับอีเมลตามผล
- [ ] ผู้สมัครไม่สามารถสมัครเมื่อหลักสูตรปิดรับหรือพ้นช่วงเวลา
- [ ] Export CSV เปิดใน Excel แล้วภาษาไทยไม่เพี้ยน
- [ ] Staff เข้าถึงหน้าจัดการผู้ใช้ไม่ได้ (ได้ 403)
- [ ] ทุกการเปลี่ยนสถานะโดย Admin ถูกบันทึกใน audit log
- [ ] ใช้งานได้ปกติบนหน้าจอมือถือ (กว้าง 360px)

---

## 11. แผนการพัฒนา (Milestones)

| ช่วง | งาน |
|---|---|
| 1 | ตั้งค่าโปรเจกต์, ออกแบบ DB, ระบบ login Admin |
| 2 | CRUD หลักสูตร, หน้าสาธารณะ (รายการ + รายละเอียด) |
| 3 | ฟอร์มสมัคร, ตรรกะที่นั่ง + transaction, waitlist |
| 4 | ระบบอีเมล + scheduled reminder, หน้ารายชื่อ + Export |
| 5 | Audit log, ทดสอบ concurrency, ทดสอบมือถือ, deploy MVP |
| 6+ | Phase 2: ชำระเงิน, เช็คอิน QR, ใบประกาศนียบัตร, Dashboard |

---

## 12. คำถามที่ต้องตัดสินใจก่อนเริ่ม (Open Questions)

- ระบบสำหรับองค์กร/มหาวิทยาลัย/งานทั่วไป และต้องผูกกับระบบล็อกอินเดิมหรือไม่
- มีค่าลงทะเบียนหรือไม่ และใช้ช่องทางชำระเงินใด
- ต้องมีการอนุมัติผู้สมัครก่อนยืนยันที่นั่งหรือไม่
- ผู้ดูแลระบบมีกี่คน/กี่ Role และมีผู้สมัครประมาณกี่คนต่อรอบ
- ต้องการ LINE OA แจ้งเตือนนอกเหนือจากอีเมลหรือไม่
- ระยะเวลาเก็บข้อมูลส่วนบุคคลตามนโยบายขององค์กร

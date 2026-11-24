import { z } from 'zod';

const required = z.string().trim().min(1, 'กรุณากรอกข้อมูล').max(200, 'ข้อมูลยาวเกินไป');
const datetime = z.string().datetime({ offset: true, message: 'วันเวลาไม่ถูกต้อง' }).transform(v => new Date(v).toISOString());
export const registrationSchema = z.object({
  title: z.enum(['นาย','นาง','นางสาว','ดร.','อื่น ๆ']), first_name: required, last_name: required,
  email: z.string().trim().email('รูปแบบอีเมลไม่ถูกต้อง').max(254).transform(v => v.toLowerCase()),
  phone: z.string().regex(/^0\d{9}$/, 'กรุณากรอกเบอร์โทรไทย 10 หลัก เริ่มต้นด้วย 0'),
  organization: required, position: required, pdpa_consent: z.literal(true, { errorMap: () => ({ message: 'กรุณายอมรับนโยบายข้อมูลส่วนบุคคล' }) }),
  custom_answers: z.record(z.union([z.string().max(2000), z.boolean()])).default({}),
  captcha_token: z.string().max(3000).optional(), website: z.string().max(200).optional(),
});
export const courseSchema = z.object({
  title: required, slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'ใช้ตัวอักษรอังกฤษตัวเล็ก ตัวเลข และขีดกลาง').max(150),
  description: z.string().trim().min(10, 'กรุณาระบุรายละเอียดอย่างน้อย 10 ตัวอักษร').max(20000),
  cover_image: z.union([z.literal(''), z.string().url().refine(v => v.startsWith('https://'), 'ใช้ URL แบบ HTTPS')]).default(''),
  speaker: required, format: z.enum(['onsite','online','hybrid']), location: z.string().trim().max(500).default(''),
  online_url: z.union([z.literal(''), z.string().url().refine(v => v.startsWith('https://'), 'ใช้ URL แบบ HTTPS')]).default(''),
  start_at: datetime, end_at: datetime, reg_open_at: datetime, reg_close_at: datetime,
  capacity: z.coerce.number().int().min(1).max(100000), price: z.coerce.number().min(0).max(99999999).default(0),
  requires_approval: z.boolean().default(false), cancel_deadline_days: z.coerce.number().int().min(0).max(365).default(1),
  status: z.enum(['draft','open','closed','finished']).default('draft'),
  fields: z.array(z.object({ id: z.string().uuid().optional(), label: required, type: z.enum(['text','select','checkbox']), options: z.array(z.string().trim().min(1).max(200)).max(50).default([]), is_required: z.boolean().default(false) }).refine(v => v.type !== 'select' || v.options.length > 0, { message: 'กรุณาระบุตัวเลือก', path: ['options'] })).max(20).default([]),
}).superRefine((v, ctx) => {
  if (v.end_at <= v.start_at) ctx.addIssue({ code: 'custom', path: ['end_at'], message: 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' });
  if (v.reg_close_at <= v.reg_open_at || v.reg_close_at > v.start_at) ctx.addIssue({ code: 'custom', path: ['reg_close_at'], message: 'ปิดรับสมัครหลังเวลาเปิดและไม่เกินเวลาเริ่มอบรม' });
  if (v.format !== 'online' && !v.location) ctx.addIssue({ code: 'custom', path: ['location'], message: 'กรุณาระบุสถานที่' });
  if (v.format !== 'onsite' && !v.online_url) ctx.addIssue({ code: 'custom', path: ['online_url'], message: 'กรุณาระบุลิงก์อบรม' });
});
export class AppError extends Error {
  constructor(code, message, status = 400, fields) { super(message); Object.assign(this, { code, status, fields }); }
}
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError('VALIDATION_ERROR', 'กรุณาตรวจสอบข้อมูลที่กรอก', 422, result.error.flatten().fieldErrors);
  return result.data;
}

import { test, expect } from '@playwright/test';

test('public registration, private status, lookup and cancellation work in a browser',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:'ค้นหาการเรียนรู้ครั้งถัดไป'})).toBeVisible();
  await page.locator('.course-card').first().getByRole('link',{name:'ดูรายละเอียด'}).click();
  await page.getByRole('link',{name:'ลงทะเบียนอบรม',exact:true}).click();
  await page.getByLabel('คำนำหน้า').selectOption('นาย');await page.getByLabel('ชื่อ').fill('สมชาย');await page.getByLabel('นามสกุล').fill('ทดสอบ');
  await page.getByLabel('อีเมล').fill('browser-attendee@example.com');await page.getByLabel('เบอร์โทรศัพท์').fill('0812345678');await page.getByLabel('หน่วยงาน / องค์กร').fill('ทีมทดสอบ');await page.getByLabel('ตำแหน่ง').fill('นักพัฒนา');
  await page.locator('[name=pdpa_consent]').check();await page.getByRole('button',{name:'ยืนยันการลงทะเบียน'}).click();
  await expect(page.getByRole('heading',{name:'พร้อมแล้วสำหรับการเรียนรู้'})).toBeVisible();const code=await page.locator('.registration-code').textContent();
  await page.reload();await expect(page.locator('.registration-code')).toHaveText(code);
  await page.getByRole('button',{name:'ยกเลิกการสมัคร',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'ยืนยัน',exact:true}).click();await expect(page.getByRole('heading',{name:'ยกเลิกการสมัครเรียบร้อย'})).toBeVisible();
  await page.getByRole('link',{name:'ตรวจสอบการสมัคร',exact:true}).click();await page.getByLabel('รหัสการสมัคร').fill(code);await page.getByLabel('อีเมลที่ใช้สมัคร').fill('browser-attendee@example.com');await page.getByRole('button',{name:'ตรวจสอบสถานะ'}).click();await expect(page.getByRole('heading',{name:'ยกเลิกการสมัครเรียบร้อย'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('Admin creates a course with custom fields, duplicates it and manages a staff user',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/admin/login');await page.getByLabel('อีเมล').fill('admin@example.com');await page.getByLabel('รหัสผ่าน').fill('BrowserTestOnly!2026');await page.getByRole('button',{name:'เข้าสู่ระบบ',exact:true}).click();
  await expect(page.getByRole('heading',{name:'ภาพรวมการอบรม'})).toBeVisible();await page.screenshot({path:'test-results/admin-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'สร้างหลักสูตร',exact:true}).click();await page.getByLabel('ชื่อหลักสูตร').fill('หลักสูตรใหม่จาก Browser');await page.getByLabel('URL หลักสูตร').fill('browser-new-course');await page.getByLabel('วิทยากร').fill('วิทยากรทดสอบ');await page.getByLabel('รายละเอียด').fill('รายละเอียดหลักสูตรสำหรับทดสอบการสร้างผ่านหน้าเว็บ');await page.getByLabel('สถานที่').fill('ห้องทดสอบ');
  const relativeDate=days=>new Date(Date.now()+days*86400000+7*3600000).toISOString().slice(0,16);
  await page.locator('#field-start_at').fill(relativeDate(14));await page.locator('#field-end_at').fill(relativeDate(14.25));await page.locator('#field-reg_open_at').fill(relativeDate(-1));await page.locator('#field-reg_close_at').fill(relativeDate(13));await page.getByLabel('สถานะหลักสูตร').selectOption('open');
  await page.getByRole('button',{name:'เพิ่มฟิลด์'}).click();await page.getByLabel('ชื่อฟิลด์').fill('ประสบการณ์');await page.getByRole('button',{name:'บันทึกหลักสูตร',exact:true}).click();
  await expect(page.getByRole('heading',{name:'หลักสูตรและรอบอบรม'})).toBeVisible();await page.getByRole('link',{name:'แก้ไข หลักสูตรใหม่จาก Browser'}).click();await page.getByRole('button',{name:'ทำสำเนา'}).click();await page.getByRole('dialog').getByRole('button',{name:'ยืนยัน',exact:true}).click();await expect(page.getByLabel('ชื่อหลักสูตร')).toHaveValue('หลักสูตรใหม่จาก Browser (สำเนา)');await expect(page.getByLabel('ชื่อฟิลด์')).toHaveValue('ประสบการณ์');
  await page.getByRole('link',{name:'ผู้ใช้ระบบ',exact:true}).click();await page.getByLabel('ชื่อ').fill('เจ้าหน้าที่ทดสอบ');await page.getByLabel('อีเมล').fill('staff-browser@example.com');await page.getByLabel('รหัสผ่าน').fill('StaffBrowserTest!2026');await page.getByRole('button',{name:'บันทึกผู้ใช้'}).click();await expect(page.getByRole('cell').filter({hasText:'staff-browser@example.com'})).toBeVisible();
  expect(errors).toEqual([]);
});
test('360px mobile view has no horizontal overflow across public and registration pages',async({page})=>{
  await page.setViewportSize({width:360,height:800});await page.goto('/');await expect(page.locator('.course-card').first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await page.screenshot({path:'test-results/home-mobile-360.png',fullPage:true});
  await page.getByRole('button',{name:'Online',exact:true}).click();await expect(page.locator('.course-card')).toHaveCount(1);
  await page.getByRole('link',{name:'ดูรายละเอียด'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('link',{name:'ลงทะเบียนอบรม',exact:true}).click();await expect(page.getByRole('heading',{name:'ลงทะเบียนอบรม'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);await page.screenshot({path:'test-results/register-mobile-360.png',fullPage:true});
  await page.goto('/registrations');await expect(page.getByRole('heading',{name:'ตรวจสอบการสมัคร'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
test('search and empty results stay usable by keyboard',async({page})=>{
  await page.goto('/');await expect(page.locator('.course-card').first()).toBeVisible();await page.getByLabel('ค้นหาหลักสูตรหรือวิทยากร').fill('ไม่มีหลักสูตรนี้');await expect(page.getByRole('heading',{name:'ยังไม่พบหลักสูตรที่ตรงใจ'})).toBeVisible();await page.getByLabel('ค้นหาหลักสูตรหรือวิทยากร').fill('');await expect(page.locator('.course-card').first()).toBeVisible();await page.getByLabel('ค้นหาหลักสูตรหรือวิทยากร').press('Tab');await expect(page.locator('#filter-date')).toBeFocused();
});

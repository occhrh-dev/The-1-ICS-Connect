# ปรับคำขอซ้ำและลม — 5 ตุลาคม 2026

ขอบเขตรอบแรกที่ผู้ใช้อนุญาต: frontend เท่านั้น ไม่แตะ GAS/Supabase/Workers ไม่เปลี่ยนรอบ polling ของคำขอช่วยเหลือ กู้ภัย หรือแดชบอร์ด และยังไม่ลดรายละเอียด geometry ตำบล

- Inline bridge ใน index.html (เป็นตัวที่เว็บใช้จริง ไม่ใช่ไฟล์ gas_bridge.js): แชร์เฉพาะคำขออ่านที่ action และ JSON body เหมือนกันทุกค่าและยัง pending สำหรับ getOCState/getAllLiveLocations/getEvacuationPoints. แยก agency/token/body เสมอ ล้างทันทีเมื่อจบ/ผิดพลาด ไม่มี completed-result cache. แต่ละ callback ได้ข้อมูลคนละ object ไม่ทำให้ข้อมูลของอีก callback ถูกแก้ไปด้วย คำขอบันทึกไม่รวมกันและไม่เปลี่ยน payload
- Shared reads timeout 20 วินาทีเพื่อไม่ให้คำขอค้างล็อกการอ่านตลอดไป ส่ง failure ให้ทุก caller; คำขอบันทึกไม่ได้เพิ่ม timeout หรือ retry
- updateWeather เป็นจุดควบคุมเดียว: cache ผลลม auto สำเร็จ 10 นาทีตามพิกัด, single-flight, timeout 12 วินาที, network failure cooldown 60 วินาที, ไม่ดึง auto เมื่อรู้ว่าเป็นเหตุน้ำท่วม, รายงานลมจากเจ้าหน้าที่มี priority, ผลช้าจากพิกัดเก่าไม่ทับพิกัดใหม่ ไม่ใช้ localStorage/backend
- Metadata น้ำท่วมอาจยังไม่โหลดตอนแรก จึงอาจมีคำขอลมครั้งแรกก่อนทราบชนิดเหตุ แต่คำขอถัดไปหยุดเมื่อ metadata พร้อม

สำรองก่อนแก้: commit `945d092`, branch `backup/pre-dashboard-perf-20261005`, workspace backups/The-1-ICS-Connect-pre-dashboard-perf-20261005.zip และ verified bundle. เป็นสำรองโค้ด/ประวัติ ไม่ใช่ฐานข้อมูล

ทดสอบใหม่ tests/dashboard-performance.test.cjs ทั้ง helper และ inline bridge จริง: overlapping read 2 callers -> 1 fetch, callbacks แยก, agency/token ไม่รวม, completed read ใหม่ยิงใหม่, failure แจ้งทุกคน/เรียกใหม่ได้, write 2 ครั้งยัง 2 fetch; weather cache/expiry/flood/manual/stale/abort/cooldown. Regression ทั้งหมด 12 ชุดต้องผ่านก่อนเผยแพร่

ตัวเลขข้างบนเป็นผลจำลองจำนวนคำขอ ไม่ใช่การวัด latency บนอินเทอร์เน็ตจริง และไม่ใช่ load test หลายผู้ใช้. ปัญหา Longdo quota ไม่ได้แก้ในรอบนี้

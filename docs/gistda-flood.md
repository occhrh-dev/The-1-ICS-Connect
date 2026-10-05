# น้ำท่วม GISTDA ย้อนหลัง 1 / 7 / 30 วัน

## สถานะ 5 ตุลาคม 2026

- เตรียม frontend ในเครื่องแล้ว ยังไม่ push/เผยแพร่; ตัวเชื่อมทดสอบจริงผ่านแล้ว แต่ยังต้องตรวจการแสดงผล Chrome ก่อนเผยแพร่ frontend
- Worker แยก `the-1-ics-gistda-flood` รุ่น Active `dc20a166`, health version 2; ผู้ใช้เปลี่ยน `GISTDA_API_KEY` เป็น Secret แล้ว ตรวจเฉพาะชนิด ไม่อ่าน/เก็บ/พิมพ์ค่าคีย์
- ผู้ใช้อนุญาตสำรองและ Deploy เฉพาะ Worker ใหม่นี้ รุ่นก่อนแก้ `76c9428f` มี Secret และโค้ดตรงกับสำเนา Git; รุ่น diagnostic แรก `6f2d2100`
- ตรวจจริง 5 ตุลาคม 2026 เวลา 03:23–03:24 UTC: 1 วัน = 0, 7 วัน = 0, 30 วัน = 420 features; ทุกชุด complete=true และ provinceId=21 ข้อมูลว่างไม่ใช่ยืนยันว่าไม่มีน้ำท่วม
- ปรับการเรียกต้นทางเป็น URL string, trim คีย์ และ redirect manual ที่ไม่ตาม redirect พร้อมรหัสผิดพลาดปลอดภัย; หลังปรับเชื่อมสำเร็จ ยังไม่แยกพิสูจน์ว่าการปรับใดเป็นสาเหตุหลัก
- ไม่ได้แก้ Worker `the-1-ics-connect` / `citizen-checkin-worker`, GAS, Supabase หรือข้อมูลเหตุ
- Chrome เคยเปิด `/health` รายงาน `net::ERR_BLOCKED_BY_CLIENT` ยังไม่ได้ยืนยัน browser end-to-end; การตรวจ HTTPS ผ่าน curl นอก sandbox สำเร็จโดยตรวจ certificate ตามปกติ ไม่มีการข้ามการป้องกัน

## ใช้งานเมื่อเชื่อมสำเร็จ

ชั้นข้อมูล > น้ำท่วม GISTDA > เลือกย้อนหลัง 1, 7 หรือ 30 วัน ครั้งละช่วง ไม่ซ้อนชุดสะสมที่ซ้ำกัน
เฉพาะจังหวัดระยอง (21) พื้นที่สีฟ้าเป็นข้อมูลดาวเทียมอ้างอิง ไม่ใช่สีระดับความรุนแรง ไม่ใช่ข้อมูลระดับน้ำ และไม่แทนพื้นที่แอดมินวาด
กด polygon เพื่อดูตำบล/อำเภอ/จังหวัด ระดับน้ำระบุ “ไม่มีข้อมูล” และวันที่จากชื่อชุดภาพต้นทาง (อาจอ้างหลายภาพ ไม่ใช่วันยืนยันเฉพาะจุด)
ข้อมูลว่างแสดง “ไม่พบข้อมูล ไม่ได้แปลว่าไม่มีน้ำท่วม” ไม่เติมพื้นที่เดาเองหรือสลับเป็น 30 วันเงียบ ๆ
ชุด 30 วันไม่หมายความว่าทุกพื้นที่ยังท่วมอยู่ปัจจุบัน

## ตัวเชื่อมและการลดคำขอ

- โค้ด `workers/gistda-flood.mjs` ไม่ผูกฐานข้อมูล มี GET `/flood?days=1|7|30` และ `/health`
- ใช้ header `API-Key` ส่งตรงบริการ GISTDA โดยไม่วางคีย์ใน URL และไม่ตาม redirect
- ปลายทางคงที่ `https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/1day|7days|30days`
- ส่ง `pv_idn=21`, `limit=100`, อ่าน pagination จนครบ ไม่รับ province/bbox/limit จากผู้เรียก ไม่เป็น generic proxy
- เพดาน 2,000 features / 8 MiB / 25 วินาที; ถ้าข้อมูลผิดหรือไม่ครบแจ้งผิดพลาด ไม่แสดงบางส่วนเป็นข้อมูลทั้งหมด
- ส่งออกเฉพาะ geometry, ชื่อพื้นที่ และวันที่ในชื่อภาพ ตัด `links` ที่มี key, ผู้สร้าง/แก้ไข และ metadata ที่ไม่จำเป็น
- Cache API ของ Cloudflare พักข้อมูลมีผล 60 นาที, ข้อมูลว่าง 15 นาที, ข้อผิดพลาด 1 นาที; รวมคำขอที่กำลังอ่านชุดเดียวกันภายใน Worker instance
- Cache API เป็นราย data center ไม่ใช่โควตากลางทั่วโลก; ไม่รับประกันว่าเรียกต้นทางแค่ครั้งเดียวทั้งโลก
- หน้าเว็บเปิดชั้นนี้เป็นค่าเริ่มต้นปิด ไม่ผูกการเรียกกับ ACTIVE หรือ polling เหตุ, ไม่ reset กล้อง, มี cancellation และ cache แยกช่วงในหน่วยความจำ
- Service Worker ไม่ cache-first ปลายทางน้ำท่วม; เกณฑ์ความเก่าอิงเวลาที่ Worker ดึงข้อมูล ไม่ใช่เวลาเบราว์เซอร์รับหรือเวลาภาพ
- มีป้ายช่วงเวลาเล็กในแผนที่แม้ปิดเมนู หาก cache หมดอายุจะซ่อนชุดเก่าและแจ้งให้กดตรวจข้อมูล ไม่เติมข้อมูลเก่าเป็นชุดปัจจุบันและไม่เรียก API เองซ้ำไม่หยุด
- Origin จำกัด `https://occhrh-dev.github.io` แต่ CORS ไม่ใช่การยืนยันตัวตน นี่เป็น endpoint สำหรับชุดข้อมูลสาธารณะจำกัดขอบเขต ไม่ใช่การเปิดเผย API key ต้องตรวจสิทธิ์/เงื่อนไข/โควตาของคีย์สำหรับ production
- ไม่มี cron และไม่เรียกอัตโนมัติขณะปิดชั้นข้อมูล ปุ่มตรวจข้อมูลเคารพ cache/cooldown ไม่บังคับข้าม cache

## สำรอง / ย้อนกลับ

ก่อนแก้จาก `3f2f4b5c48bae555724ec535d30bee1f6846c870`:

- local branch `backup/pre-gistda-live-20261005`
- `backups/The-1-ICS-Connect-pre-gistda-live-20261005.zip`
- `backups/The-1-ICS-Connect-pre-gistda-live-20261005.bundle` verify ผ่าน

ก่อนแก้ diagnostic สำรอง commit `629186c3536e636f4b6d7590b631560f5852d5e2` อีกครั้ง:

- local branch `backup/pre-gistda-diagnostics-20261005`
- `backups/The-1-ICS-Connect-pre-gistda-diagnostics-20261005.zip` และ `.bundle` verify ผ่าน
- ย้อน Worker ใหม่ได้ที่ Cloudflare version `76c9428f`; ไม่ต้องย้อน Worker เหตุเดิม

สำรองโค้ด/ประวัติ ไม่ใช่ export ฐานข้อมูล รอบนี้ไม่เปลี่ยนฐานข้อมูล หากเผยแพร่แล้วให้ revert commit frontend นี้ตามสถานะ Git ล่าสุด ไม่ใช้ reset --hard; ไม่ต้องย้อน Worker เดิมเพราะไม่ได้แก้
หากไม่ต้องการใช้ตัวเชื่อมใหม่ให้ปิด checkbox และถอน frontend integration ก่อน จากนั้นผู้ใช้จึงเลือกปิด/ลบบริการใหม่ตามปกติ (ไม่ลบอัตโนมัติ)

## ตรวจสอบ

`node tests/gistda-worker.test.mjs` ตรวจ whitelist, origin, pagination, secret stripping, cache, ข้อมูลว่าง, ข้อมูลไม่ครบและความผิดพลาด
`node tests/gistda-layer.test.cjs` ตรวจ 1/7/30, cache, cancellation, ไม่ขยับกล้อง/ไม่เขียน backend, popup escaping, ลำดับซ้อนและเปลี่ยนแผนที่พื้น
ชุด regression เดิม 7 ชุดผ่านขณะเตรียม ไม่มีการ ACTIVE / วาด / บันทึกข้อมูลเหตุจริงระหว่างทดสอบ

## แหล่งทางการ

- https://disaster.gistda.or.th/services/open-api
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/configuration/secrets/

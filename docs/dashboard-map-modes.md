# โหมดแผนที่แดชบอร์ด — 2 ตุลาคม 2026

## วิธีใช้

- **ถนน / ดาวเทียม:** เปลี่ยนพื้นแผนที่ โดยรักษาตำแหน่งซูม หมุด และชั้นข้อมูลที่เปิดไว้
- **จราจร:** ใช้พื้นถนนและเปิดจราจร Longdo ซ้อนบนแผนที่หลัก ไม่เปิดแผนที่อีกหน้าต่าง
- **น้ำท่วม:** ใช้พื้นถนนและเปิดขอบเขต / จุดรายงานระดับน้ำที่ Admin บันทึกไว้
- **ชั้นข้อมูล:** เลือกเปิดจราจรกับน้ำหน้างานซ้อนกันได้ รวมทั้งบนพื้นดาวเทียม กดนอกกล่องหรือ Escape เพื่อปิดกล่อง
- การซ่อนน้ำหน้างานไม่ซ่อนจุดเกิดเหตุ EOC จุดรับอาหาร พื้นที่ปลอดภัย จุดเสี่ยงไฟฟ้า หรือเส้นถนนปิด
- สีขอบเขตน้ำเป็นสถานะที่ผู้รายงานกำหนด ไม่ใช่ระดับความลึกที่คำนวณจากสี ความลึกใช้ค่าที่บันทึกจริง และแสดง “ไม่มีข้อมูล” หากไม่มี
- ตัวเลือกชั้นข้อมูลเป็นการดูในเบราว์เซอร์เท่านั้น ไม่แก้ฐานข้อมูลหรือสิทธิ์ Admin ผู้ดูอย่างเดียวใช้ได้เฉพาะส่วนดูแผนที่นี้

## แหล่งข้อมูลและข้อจำกัด

### จราจร

ใช้ public vector style ที่ `longdo.Layers.TRAFFIC` ใน SDK ทางการอ้างถึง ไม่คัดลอกข้อมูลจราจรเก็บใน repo และแสดงเครดิต Longdo Traffic บนแผนที่

- [คู่มือจราจร Longdo](https://map.longdo.com/docs/v3/javascript/maplayers/trafficmap/)
- [Longdo API reference](https://api.longdo.com/map3/doc.html)
- [Longdo กับ MapTiler](https://map.longdo.com/docs/v3/map-service/third-party/maptiler/)
- สไตล์: `https://msv.longdo.com/vector/longdo_traffic.json`
- TileJSON: `https://msv.longdo.com/capabilities/traffic.json`

ตรวจชั้นจราจรใหม่ทุก 3 นาทีเมื่อเปิดอยู่และแท็บมองเห็น ไม่ใช้ service worker cache-first กับโดเมน `msv.longdo.com` เวลาในเมนูคือเวลาโหลด/ขอชั้นข้อมูล ไม่ใช่วันเวลาสำรวจต้นทาง ไม่รับประกันว่าครอบคลุมทุกถนนหรือมีข้อมูลทุกช่วงเวลา หากโหลดไม่ได้จะแจ้งข้อจำกัดโดยไม่กระทบข้อมูลหน้างาน

### น้ำท่วม

รอบนี้ใช้พื้นที่วาดมือและระดับน้ำที่มีในระบบเดิมเท่านั้น **ยังไม่เชื่อมข้อมูลดาวเทียม GISTDA** จึงแสดงตัวเลือกนั้นแบบ disabled และข้อความชัดเจน ไม่เรียกข้อมูลหน้างานว่าเป็นน้ำท่วมสด

ต้องได้รับสิทธิ์/API ของโครงการ ตรวจเงื่อนไขข้อมูล วันที่ภาพ พื้นที่ครอบคลุม และอัตราเรียก ก่อนเชื่อม GISTDA จริง ไม่ใช้ example API key หรือ snapshot ทดลองเผยแพร่ใน production พื้นที่ไม่มีสีไม่ได้หมายความว่าไม่มีน้ำท่วมหรือปลอดภัย

## ความปลอดภัยและสำรองก่อนแก้

- จุดเริ่มต้น `f4e6ae386c13977db6b3cc3800778c88f9f5eba6`
- GitHub/local branch: `backup/pre-map-modes-20261002`
- สำรองในเครื่อง: `backups/The-1-ICS-Connect-pre-map-modes-20261002.zip` และ `.bundle` (นอก repo, bundle verify ผ่าน)
- สำรองโค้ดและประวัติ Git ไม่ใช่ export ฐานข้อมูล
- ไม่แก้ GAS, Supabase, Cloudflare Worker หรือข้อมูลเหตุ/พื้นที่ที่บันทึกไว้
- หากต้องย้อน ให้หา commit ของรอบโหมดแผนที่แล้วใช้ `git revert <commit>` หลังตรวจสถานะงานล่าสุด ห้ามใช้ reset --hard ทับงานใหม่

## ตรวจสอบ

รันชุดทดสอบใน repo:

```
node tests/dashboard-map-modes.test.cjs
node tests/dashboard-layout.test.cjs
node tests/flood-picker.test.cjs
node tests/flood-depth.test.cjs
```

ทดสอบ no camera reset, marker retention, overlay restoration, async cancellation, delayed overlay cancellation, provider failure/origin validation, water-off retaining road closures, independent checkboxes, boundary restoration, viewer-only controls และการไม่ cache traffic

หน้าทดสอบในเครื่อง `outputs/dashboard-map-modes-preview.cjs` อยู่ **นอก repo** ไม่มี backend bridge ใช้จุดจำลองและพื้น Longdo เพราะ MapTiler key เดิมจำกัด origin ระบบจริง ตรวจการเปลี่ยนพื้นถนน/ภาพดาวเทียมจริงเพิ่มเติมบน production หลังเผยแพร่

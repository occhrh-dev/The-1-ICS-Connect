# ชั้นข้อมูลแผนที่แดชบอร์ด — 2 ตุลาคม 2026

## วิธีใช้

- **ชั้นข้อมูล:** เมนูเดียวมี checkbox ถนน / ดาวเทียม / น้ำท่วม / การจราจร / เขตตำบล กดนอกกล่องหรือ Escape เพื่อปิด
- **ถนน:** MapTiler STREETS; **ดาวเทียม:** SATELLITE; เลือกพร้อมกันใช้ HYBRID (ภาพดาวเทียมพร้อมถนน/ชื่อสถานที่) ไม่ใช่พื้นถนนทึบบังดาวเทียม ทั้งสองอยู่ใต้ชั้นข้อมูลอื่น ปิดทั้งสองได้เป็นพื้นสีเทาโดยหมุด/เส้น/พื้นที่ยังอยู่
- **การจราจร:** เปิด Longdo Traffic ซ้อนโดยไม่เปลี่ยนพื้น ไม่ปิดเขตตำบล/พื้นที่หน้างาน
- **เขตตำบล:** checkbox เป็นผู้กำหนดการแสดง ซูมแล้วไม่เปลี่ยนการเลือกให้อัตโนมัติ คืนชั้นข้อมูลเมื่อเปลี่ยนพื้น
- **น้ำท่วม:** หมายถึงแหล่งภายนอก Longdo / GISTDA เท่านั้น ยัง disabled พร้อม “ยังไม่เชื่อม” จนตรวจบริการ พื้นที่ครอบคลุม วันที่ข้อมูล และสิทธิ์เรียบร้อย ไม่โยง checkbox นี้กับพื้นที่วาดมือ
- **จัดการจุด / เพิ่มโครงสร้างอาคาร:** คงไว้ตามสิทธิ์เดิม
- **พื้นที่น้ำท่วม:** แสดงเฉพาะ Admin และเหตุที่ติ๊ก checkbox น้ำท่วมตอนเปิดเหตุ สำหรับเหตุเก่าที่ไม่มี metadata แสดงเมื่อมี FloodArea อยู่แล้ว ไม่เดาจากชื่อเหตุ
- **แถบเครื่องมือกระชับ:** หัวข้อ ปุ่ม และกล่องลมอยู่แถบเดียวบนจอกว้าง สถานะแหล่งข้อมูลอยู่ภายในเมนูชั้นข้อมูล ไม่กินแถวเหนือแผนที่เพิ่ม จอเล็กห่อแถวเมื่อพื้นที่ไม่พอ
- **ทิศทางลม:** อยู่ท้ายแถบเครื่องมือ แสดงทิศที่ลมพัดไป ความเร็ว และแหล่งข้อมูล ไม่บังแผนที่
- สีขอบเขตน้ำเป็นสถานะที่ผู้รายงานกำหนด ไม่ใช่ระดับความลึกที่คำนวณจากสี ความลึกใช้ค่าที่บันทึกจริง และแสดง “ไม่มีข้อมูล” หากไม่มี
- **กล่องสถานการณ์น้ำท่วม:** ลากจากหัวกล่องได้โดยขนาดคงเดิม ยุบ/ขยายจากปุ่มลูกศร ขณะลากปล่อย bottom/right anchors และคงความกว้างเดิม ไม่ยืดกล่องระหว่างย้าย
- **รายละเอียดพื้นที่:** กดบนสีหรือเส้นขอบจริงของ polygon ได้ ไม่ต้องเล็งป้ายชื่อ แสดงชื่อ สถานการณ์ และระดับน้ำเดียวกับป้ายชื่อ ไม่มีข้อมูลให้ระบุ “ไม่มีข้อมูล” หากซ้อนกันเลือกพื้นที่ที่วาดทับอยู่บนสุด ไม่ใช้กรอบสี่เหลี่ยมแทนขอบเขตจริง และไม่เปลี่ยนข้อมูล/กล้อง การคลิกหมุดหรือ popup เดิมไม่ถูกพื้นที่ด้านใต้แย่งการคลิก
- ตัวเลือกชั้นข้อมูลเป็นการดูในเบราว์เซอร์เท่านั้น ไม่แก้ฐานข้อมูลหรือสิทธิ์ Admin ผู้ดูอย่างเดียวใช้ได้เฉพาะส่วนดูแผนที่นี้

## แหล่งข้อมูลและข้อจำกัด

- [MapTiler built-in styles](https://docs.maptiler.com/sdk-js/api/map-styles/): ใช้ SATELLITE / STREETS / HYBRID จาก SDK เดิม ไม่เปลี่ยนเอนจินหรือ key และรักษามุมมองกล้อง

### จราจร

ใช้ public vector style ที่ `longdo.Layers.TRAFFIC` ใน SDK ทางการอ้างถึง ไม่คัดลอกข้อมูลจราจรเก็บใน repo และแสดงเครดิต Longdo Traffic บนแผนที่

- [คู่มือจราจร Longdo](https://map.longdo.com/docs/v3/javascript/maplayers/trafficmap/)
- [Longdo API reference](https://api.longdo.com/map3/doc.html)
- [Longdo กับ MapTiler](https://map.longdo.com/docs/v3/map-service/third-party/maptiler/)
- สไตล์: `https://msv.longdo.com/vector/longdo_traffic.json`
- TileJSON: `https://msv.longdo.com/capabilities/traffic.json`

ตรวจชั้นจราจรใหม่ทุก 3 นาทีเมื่อเปิดอยู่และแท็บมองเห็น ไม่ใช้ service worker cache-first กับโดเมน `msv.longdo.com` เวลาในเมนูคือเวลาโหลด/ขอชั้นข้อมูล ไม่ใช่วันเวลาสำรวจต้นทาง ไม่รับประกันว่าครอบคลุมทุกถนนหรือมีข้อมูลทุกช่วงเวลา หากโหลดไม่ได้จะแจ้งข้อจำกัดโดยไม่กระทบข้อมูลหน้างาน

### น้ำท่วม

**ยังไม่เชื่อมข้อมูลน้ำท่วมภายนอก** จึงแสดงตัวเลือกนั้นแบบ disabled และข้อความชัดเจน พื้นที่วาดมือ/ระดับน้ำเดิมยังอยู่และไม่ถูก checkbox ภายนอกซ่อนหรือแทนที่

ต้องตรวจเงื่อนไขข้อมูล วันที่ภาพ พื้นที่ครอบคลุม และอัตราเรียกก่อนเชื่อม ถ้าเชื่อม GISTDA โดยตรงใช้สิทธิ์/API ของโครงการ ส่วน Longdo ต้องทดลองและตรวจเงื่อนไขช่องทางที่รองรับ ไม่ใช้ example key หรือ snapshot ทดลองเผยแพร่ พื้นที่ไม่มีสีไม่ได้หมายความว่าไม่มีน้ำท่วมหรือปลอดภัย

### การจำ checkbox ตอนเปิดเหตุ

`flood-incident-settings.js` เรียก API เดิม `getZoneMarkers` และ `updateZoneMarker` **เฉพาะหลังผู้ใช้ยืนยัน ACTIVE สำเร็จ** เติม boolean `floodEnabled` ลง note JSON ของ IncidentPoint จุดแรก โดยรักษา primary/ชื่อ/พิกัด/metadata เดิม ไม่สร้าง marker ชนิดใหม่ ไม่เพิ่ม schema และไม่ใช้ localStorage ที่หายเมื่อเปลี่ยนเครื่อง ติ๊กแต่ยังไม่วาดก็จำได้ เอาติ๊กออกบันทึก false ชัดเจน API เดิม scope ตามหน่วยงานและมี Admin guard

ถ้าการบันทึก metadata ล้มเหลว จะแจ้งใน popup ว่า ACTIVE สำเร็จแต่ checkbox ไม่ได้บันทึก ไม่เปิดเหตุซ้ำอัตโนมัติ เหตุเก่าที่ติ๊กแต่ไม่วาดและไม่มี metadata ไม่สามารถกู้ checkbox เดิมได้ จึงไม่แสดงเมนูโดยเดา

## ความปลอดภัยและสำรองก่อนแก้

- จุดเริ่มต้น `950fc50e1a16f093b018601bbc38db7508c4574e`
- GitHub/local branch: `backup/pre-layer-menu-20261002`
- สำรองในเครื่อง: `backups/The-1-ICS-Connect-pre-layer-menu-20261002.zip` และ `.bundle` (นอก repo, bundle verify ผ่าน)
- สำรองโค้ดและประวัติ Git ไม่ใช่ export ฐานข้อมูล
- ก่อนยุบแถบเครื่องมือเพิ่มเติม สำรองจาก `19e34a4` ที่ local/GitHub branch `backup/pre-compact-map-toolbar-20261002` และ `backups/The-1-ICS-Connect-pre-compact-map-toolbar-20261002.zip` / `.bundle` (verify ผ่าน)
- ก่อนแก้การลาก/คลิกพื้นที่ สำรองจาก `0afa660` ที่ local/GitHub branch `backup/pre-flood-interaction-20261002` และ `backups/The-1-ICS-Connect-pre-flood-interaction-20261002.zip` / `.bundle` (verify ผ่าน)
- ไม่แก้โค้ด GAS, schema Supabase หรือ Cloudflare Worker ไม่เขียน/ลบข้อมูลเหตุเดิมระหว่างทดสอบ; flow ACTIVE ครั้งถัดไปจะบันทึก metadata ใหม่ผ่าน API เดิมตามที่กล่าวข้างต้น
- หากต้องย้อน ให้หา commit ของรอบโหมดแผนที่แล้วใช้ `git revert <commit>` หลังตรวจสถานะงานล่าสุด ห้ามใช้ reset --hard ทับงานใหม่

## ตรวจสอบ

รันชุดทดสอบใน repo:

```
node tests/dashboard-map-modes.test.cjs
node tests/dashboard-layout.test.cjs
node tests/flood-picker.test.cjs
node tests/flood-depth.test.cjs
node tests/flood-incident-settings.test.cjs
node tests/flood-interaction.test.cjs
```

ทดสอบ no camera reset, marker retention, overlay restoration, async cancellation, delayed overlay cancellation, provider failure/origin validation, water-off retaining road closures, independent checkboxes, boundary restoration, viewer-only controls และการไม่ cache traffic

หน้าทดสอบในเครื่อง `outputs/dashboard-map-modes-preview.cjs` อยู่ **นอก repo** ไม่มี backend bridge ใช้จุดจำลองและพื้น Longdo เพราะ MapTiler key เดิมจำกัด origin ระบบจริง ตรวจการเปลี่ยนพื้นถนน/ภาพดาวเทียมจริงเพิ่มเติมบน production หลังเผยแพร่

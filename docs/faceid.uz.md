# FaceID Pipeline — Chuqur Hujjat (O'zbek tilida)

Ushbu hujjat FaceID oqimini boshidan oxirigacha chuqur yoritadi: frontendda kamera va embedding yig'ish, backendda deteksiya/descriptor, qidiruv (index), moslashtirish va xavfsizlik.

## 1) Arxitektura va oqim

- Frontend (kamera -> embeddings):
  - `frontend/assets/js/face-unified.js` — kamera, validatsiya, embedding generatsiya (face-api.js bo'lsa undan, bo'lmasa heuristika) va API bilan muloqot.
  - `FaceRecognition.extractMultiple()` — face-api.js modellaridan 3–5 freym descriptor.
  - `FaceUtils.captureFace()` — umumiy oqim: validatsiya, bir nechta freym, fallback.
- Backend (deteksiya -> descriptor -> index):
  - `src/services/face-detection.js` — Haar Cascade yoki heuristik fallback bilan yuz aniqlash va kengaytirilgan descriptor (LBP/HOG/Gabor + 128D normalize).
  - `src/services/face-index.js` — in-memory index: mean/median/samples bilan qidiruv (cosine distance, margin).
  - `src/utils/face-utils.js` — masofa, agregatsiya, thresholdlar, validatsiya va moslik topish.

Oqim (login misoli):
1. Brauzer kamera orqali 5 freym descriptorini yig'adi (yoki serverga rasm yuboradi).
2. `/api/users/login` (embeddinglar bilan) yoki `/api/users/login/image` (rasm) chaqiriladi.
3. Backend `findByEmbedding` yoki `searchByImage` orqali indexda eng yaqin moslikni topadi, threshold+margin asosida tasdiqlaydi.
4. Topilsa JWT qaytadi.

## 2) Sozlamalar (FaceConfig)

Manba: `src/utils/face-utils.js`
- `COSINE_DISTANCE_THRESHOLD` (default 0.65): moslik uchun maksimal kosinus masofa.
- `DISTANCE_MARGIN` (0.0005): eng yaxshi va ikkinchi eng yaxshi mosliklar orasidagi minimal farq.
- `MIN_VALID_FRAMES` (3), `CAPTURE_FRAMES` (5), `FRAME_DELAY_MS` (120): frontend capture parametrlari.
- `MIN_SKIN_RATIO`, `MAX_SKIN_RATIO`, `MIN_EDGE_VARIANCE`: kadr sifati heuristikalari.
- `EMBEDDING_DIMENSION` (128): frontend/heuristik embedding o‘lchami.
- `DEBUG_ENABLED`: `FACE_DEBUG=1` bo'lsa diagnostika loglari chiqadi.

Env orqali moslashtirish: `.env` da mos kalitlar mavjud (README.uz.md 2-bo'limiga qarang).

## 3) Ma’lumot shakllari (Data Shapes)

- Frontend embeddings: `number[][]` — har freym uchun 128D (yoki face-api.js descriptor uzunligi ~128/512) normalizatsiya qilingan vektorlar.
- Backend `User.faceEmbeddings` (jsonb):
  ```json
  {
    "samples": number[][],
    "mean": number[],
    "median": number[],
    "qualityMetrics"?: { "overall": number, ... }
  }
  ```
- Index yozuvi: `{ id: string, embeddings: number[][] }` — `mean`, `median`, `samples`dan 3–5 ta.
- Moslik javobi (`FaceUtils.findBestMatch`): `{ match, distance, secondDistance, margin, confidence, allMatches }` yoki `null`.

## 4) API-lar (FaceID bilan bog‘liq)

- POST `/api/users/register` — JSON: `{ firstName, lastName, faceEmbeddings:number[][] }` (admin tokeni)
- POST `/api/users/register/image` — multipart: `faceImages[]` (admin tokeni) — serverda descriptor generatsiya.
- POST `/api/users/login` — JSON: `{ faceEmbeddings:number[][] }`
- POST `/api/users/login/image` — multipart: `faceImage`
- POST `/api/users/face-index/rebuild` — indexni DB dan qayta qurish (admin tokeni)

Auth: `Authorization: Bearer <JWT>`.

## 5) Frontend — Kamera va Embedding

Asosiy joylar: `frontend/assets/js/face-unified.js`
- `FaceCapture.startCamera()/stopCamera()` — webcam boshqaruvi.
- `FaceUtils.captureFace(faceCapture, frames, delay, opts)` —
  - Avval `face-api.js` bilan `extractMultiple()` urinish.
  - Yetarli descriptor bo'lmasa heuristik: `validateFace()` (skin/edge/yorug'lik), `generateFaceEmbedding()` (128D), `minValid` ga yetgunga qadar yig'adi.
  - Natija: `{ imageData, embeddings:number[][], validFrames, method: 'face-api'|'heuristic' }`.
- Yaxshi amaliyotlar:
  - Yoritishni tekislash, kamerani ko‘z darajasida ushlash.
  - 3–5 freym yig‘ish, bemalol turib, kameraga qarash.

## 6) Backend — Deteksiya va Descriptor

`src/services/face-detection.js`:
- `initialize()` — Haar Cascade XML (`src/data/haarcascade_frontalface_alt.xml`) yuklanadi, bo‘lmasa fallback.
- `detectFaces(buf, opts)` — Haar -> `detectWithHaarCascade` (bbox, landmarks, sifat) -> `generateEnhancedEmbedding` (LBP/HOG/Gabor/Geometric/Intensity, 256D -> 128D).
- `extractMultipleDescriptors(buffers)` — bir nechta rasm uchun yuqori sifatli descriptorlar ro‘yxati.
- `validateDetection()` — yuz o‘lchami, sifat, ishonchlilik thresholdlari.

Eslatma: Bu modul ML kutubxonalarsiz klassik xususiyatlar asosidagi descriptor yaratadi; ishlab chiqarishda real model (face-api/TF/ONNX) tavsiya etiladi.

## 7) Backend — Index va Qidiruv

`src/services/face-index.js`:
- `rebuild()` — DB dagi barcha foydalanuvchilardan index tuzadi.
- `search(queryEmbedding, { threshold, margin })` — `FaceUtils.findBestMatch` bilan eng yaxshi moslikni topadi.
- `searchByImage(imageBuffer)` — suratdan descriptor + `search()`; natijaga `faceQuality` qo‘shadi.
- `generateEmbeddings(imageBuffers)` — ko‘p rasm, sifat bo‘yicha filtrlash, `aggregateEmbeddings()` bilan `{ mean, median }`.

`src/utils/face-utils.js`:
- `cosineDistance`, `normalize`, `aggregateEmbeddings`, `validateEmbeddingQuality`, `findBestMatch` (threshold+margin).

## 8) Threshold va Margin strategiyasi

- `COSINE_DISTANCE_THRESHOLD` — maksimal ruxsat etilgan masofa (kichik bo‘lsa, qat’iyroq).
- `DISTANCE_MARGIN` — birinchi va ikkinchi eng yaqin mosliklar o‘rtasidagi minimal farq (spoof/noaniqlikka qarshi).
- Amaliy tavsiya: avval defaultlardan boshlang (0.65 va 0.0005), so‘ng validatsiya ma’lumotlari asosida sozlang.

## 9) Xatoliklar va diagnostika

- 400 — noto‘g‘ri payload (embedding uzunligi, bo‘sh massivlar).
- 401 — token yo‘q/yaroqsiz.
- 403 — rol mos emas.
- 404 — foydalanuvchi topilmadi.
- 429 — rate limit.
- 500 — ichki xatoliklar (deteksiya, index, DB).
- Debug: `.env` da `FACE_DEBUG=1` -> `FaceUtils.logDebug()` bilan izchil loglar.

## 10) Sifat bo‘yicha tavsiyalar

- Ro‘yxatdan o‘tkazishda: 3+ rasm/freym, turli yoritish/qiyofa burchagi ozgina farqli.
- Kamera sifati: kamida 480p, yuz kadrda 160px+.
- Fonde: oddiy, yuzdan chalg‘ituvchi naqshlar bo‘lmasin.

## 11) Tezkor misollar

- Frontendda login oqimi:
  ```js
  const result = await FaceUtils.captureFace(faceCapture, 5, 120, { minValid: 3, useModel: true });
  const resp = await api.userLogin(result.embeddings);
  if (resp.success) api.setAuthToken(resp.token);
  ```

- Backendda embedding bilan qidirish:
  ```js
  const { FaceUtils } = require('../utils/face-utils');
  const aggregated = FaceUtils.aggregateEmbeddings(embeddings);
  const match = faceIndex.search(aggregated.mean, { threshold: FaceConfig.COSINE_DISTANCE_THRESHOLD, margin: FaceConfig.DISTANCE_MARGIN });
  ```

## 12) Cheklovlar va keyingi ishlar

- Index xotirada; server restartida yo‘qoladi — `rebuild()` kerak.
- Klassik descriptor — ishlab chiqarishda haqiqiy deep model bilan almashtirish tavsiya etiladi.
- Swagger/OpenAPI bilan FaceID bo‘limini avtomatik hujjatlashtirish mumkin.

— Tugadi —

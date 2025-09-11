# FaceID Tizimi — To'liq hujjat (O'zbek tilida)

Quyidagi hujjat FaceID loyiha arxitekturasi, o'rnatish va ishga tushirish, backend API endpointlari, frontend oqimlari hamda kod ichidagi barcha asosiy funksiya va metodlar uchun izohlarni qamrab oladi.

## 1. Umumiy ko'rinish

- Texnologiyalar: Node.js (Express 5), TypeORM, PostgreSQL, JWT, Multer, Jimp
- Biometriya: Embedding asosida moslashtirilgan yuzni taqqoslash (cosine distance), Haar Cascade asosida aniqlash + heuristik fallback
- Arxitektura:
  - `server.js`: Express server, statik frontend, `/api` marshruti
  - `src/config`: ma'lumotlar bazasi ulanishi (`data-source.js`)
  - `src/entities`: TypeORM EntitySchema (`User`, `Admin`)
  - `src/controllers`: HTTP qatlam (`user.controller.js`, `admin.controller.js`)
  - `src/services`: biznes mantiq (foydalanuvchi, admin, index va deteksiya)
  - `src/routes`: marshrutlar
  - `src/middleware`: autentifikatsiya, rol, rate-limit, payload tekshirish
  - `src/utils`: umumiy yordamchi util funksiyalar (FaceUtils, JWT)
  - `frontend`: UI sahifalari va brauzer JS yordamchilari

## 2. O'rnatish va ishga tushirish

1) Muhit o'zgaruvchilari (`.env`):
- PORT
- DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME
- JWT_SECRET, JWT_SECRET_DATE
- Ixtiyoriy: FACE_MATCH_THRESHOLD, EUCLIDEAN_THRESHOLD, MIN_VALID_FRAMES, CAPTURE_FRAMES, FRAME_DELAY_MS, MIN_SKIN_RATIO, MAX_SKIN_RATIO, MIN_EDGE_VARIANCE, FACE_DEBUG, EMBEDDING_DIMENSION, MODEL_INPUT_SIZE, DETECTION_SCORE_THRESHOLD, RATE_LIMIT_MAX

2) Paketlarni o'rnatish va serverni ishga tushirish (PowerShell):

```powershell
npm install
$env:PORT="5000"; $env:DB_HOST="localhost"; $env:DB_PORT="5432"; $env:DB_USERNAME="postgres"; $env:DB_PASSWORD="password"; $env:DB_NAME="faceid"; $env:JWT_SECRET="secret"; $env:JWT_SECRET_DATE="7d"; npm run dev
```

3) Frontendga kirish: `http://localhost:5000/`

Eslatma: Face index xotirada saqlanadi va server restartida tozalanadi. Kerak bo'lsa `/api/users/face-index/rebuild` (admin tokeni bilan) chaqirib qayta qurish mumkin.

## 3. Entitylar

### 3.1 User (`src/entities/User.js`)
- Maydonlar: `id (uuid)`, `firstName`, `lastName`, `faceEmbedding` (float8[]), `faceEmbeddings` (jsonb: {samples, mean, median, qualityMetrics?}), `embeddingVersion`, `lastEmbeddingUpdate`, `role` (default: user), `createdAt`

### 3.2 Admin (`src/entities/Admin.js`)
- Maydonlar: `id`, `username`, `password` (bcrypt bilan xeshlanadi), `role` (default: admin), `createdAt`

## 4. Middlewarelar

### 4.1 Auth (`src/middleware/auth.middleware.js`)
- `authenticate(req,res,next)`: `Authorization: Bearer <token>` dan JWT tekshiradi. `req.userId` va `req.user`/`req.admin` ni to'ldiradi.

### 4.2 Role (`src/middleware/role.middleware.js`)
- `requireRole(roles)`: foydalanuvchi/admin rolini tekshiradi, mos rol bo'lmasa 403.

### 4.3 RateLimit va Payload (`src/middleware/rateLimit.middleware.js`)
- `rateLimit`: IP+path bo'yicha 1 daqiqada MAX_REQUESTS dan oshsa 429.
- `validateFacePayload`: `faceEmbedding` yoki `faceEmbeddings` struktura va o'lcham tekshiruvi.

## 5. Utils

### 5.1 JWT (`src/utils/jwt.js`)
- `sign(payload, options)`: JWT yaratadi.
- `verify(token)`: JWT ni tekshiradi.

### 5.2 FaceUtils (`src/utils/face-utils.js`)
- FaceConfig: turli threshold va sozlamalar.
- `cosineDistance(a,b)`, `euclideanDistance(a,b)`, `normalize(v)`
- `aggregateEmbeddings(embs)`: mean va median hisoblaydi.
- `validateEmbeddingQuality(embs, opts)`: sifat metrikalari (variance, meanDistance)
- `findBestMatch(query, candidates, opts)`: threshold+margin bilan eng yaqin moslikni topadi.
- Frontendga mo'ljalangan: `processImageToEmbedding(imageData)`, `calculateFaceMetrics(imageData)`, `validateFaceInImage(imageData, opts)`
- `logDebug(ctx,data)`, `getConfig()`

Kontrakt (findBestMatch):
- Kirish: `queryEmbedding:number[]`, `candidates:[{id, embeddings:number[][]}]`
- Chiqish: `{match, distance, secondDistance, margin, confidence, allMatches}|null`
- Xatoliklar: noto'g'ri tip/yaroqsiz vektorlar

## 6. Services

### 6.1 AdminService (`src/services/admin.service.js`)
- `createAdmin(username, password, role='admin')`: mavjudligini tekshiradi, bcrypt bilan xesh, saqlaydi.
- `login(username,password)`: mos kelsa JWT qaytaradi.
- `getAllAdmins()`: parolsiz ro'yxat.
- `findByUsername(username)`

### 6.2 UserService (`src/services/user.service.js`)
- `createUser(firstName,lastName,faceEmbeddingOrEmbeddings)`: 
  - Embedding(lar)ni tekshiradi, normalize qiladi, mean/median saqlaydi.
  - `faceIndex.addUser(saved)` bilan indexga qo'shadi.
- `createUserFromImages(firstName,lastName,imageBuffers)`: 
  - `faceIndex.generateEmbeddings` orqali bir nechta suratdan sifatli descriptorlar, agregatsiya va saqlash.
- `findByEmbedding(faceEmbeddingOrEmbeddings, options)`: 
  - Kirishni agregatsiya qiladi (mean), avval index orqali qidiradi, topilmasa chiziqli qidiruv.
  - Mos kelsa `token` va meta (debug rejimida) qaytaradi.
- `loginByImage(imageBuffer, options)`: 
  - `faceIndex.searchByImage` (deteksiya+descriptor), topilsa foydalanuvchini JWT bilan qaytaradi.
- CRUD: `getAllUsers()`, `getUserById(id)`, `updateUserById(id, data)` (indexni ham yangilaydi), `deleteUserById(id)` (indexdan ham o'chiradi)

Muvofiqlashtirilgan xatoliklar: bo'sh yoki turli o'lchamdagi embeddinglar, foydalanuvchi topilmasligi, index yuklanmagan holatida rebuild.

### 6.3 FaceIndex (`src/services/face-index.js`)
- In-memory index: `{ id, embeddings:[mean, median, samples...] }`
- `initializeDetection()`: `FaceDetectionService` ni tayyorlaydi.
- `rebuild()`: DB dan barcha userlarni olib indexni qayta tuzadi.
- `search(queryEmbedding, {threshold, margin, maxResults})`: `FaceUtils.findBestMatch` orqali qidiradi.
- `addUser(user)`, `removeUser(userId)`, `clear()`
- `processFaceImage(imageBuffer, opts)`: deteksiya+descriptor, sifat tekshiruvi.
- `generateEmbeddings(imageBuffers)`: ko'p rasm, yuqori sifatli descriptorlar filtrlanadi, agregatsiya qaytaradi.
- `searchByImage(imageBuffer, opts)`: suratdan descriptor olib `search` qiladi, qo'shimcha sifat metadatasini birga qaytaradi.
- `getStats()`: xizmat holati va imkoniyatlar.

### 6.4 FaceDetectionService (`src/services/face-detection.js`)
- `initialize()`: Haar Cascade ni yuklaydi, bo'lmasa heuristik fallback.
- `detectFaces(imageBuffer, opts)`: Haar Cascade -> xato bo'lsa `detectWithEnhancedFallback`.
- `detectWithHaarCascade(buf, opts)`: Haar natijalari bo'yicha bbox, descriptor (generateEnhancedEmbedding), sifat, landmarklar.
- `detectWithEnhancedFallback(buf, opts)`: heuristik (skin/edge/center) mintaqalar, descriptor, sifat.
- `preprocessImage(image)`: kontrast/yorug'likni yaxshilash.
- `generateEnhancedEmbedding(image, region)`: LBP/HOG/Gabor/geometric/intensity xususiyatlari, 256D -> 128D normallashtirilgan vektor.
- Qo'shimcha yordamchilar: `extractLocalBinaryPatterns`, `extractHistogramOfGradients`, `extractGaborFeatures`, `extractGeometricFeatures`, `extractIntensityFeatures`, `applyDimensionalityReduction`, `assessImageQuality`, `calculateSharpness`, `calculateLightingQuality`, `estimateBasicPose`, `validateDetection`, `extractMultipleDescriptors`, va h.k.

### 6.5 HaarCascadeDetector (`src/services/haar-cascade.js`)
- `loadCascade()`: XML ni o'qish va parse.
- `detectFaces(buf, opts)`: integral tasvir, ko'p o'lchovli qidiruv, oddiy NMS, bounding boxlar.

## 7. Controllers

### 7.1 AdminController (`src/controllers/admin.controller.js`)
- `register(req,res)`: admin yaratish.
- `login(req,res)`: token qaytaradi.
- `getAllAdmins(req,res)`: list.

### 7.2 UserController (`src/controllers/user.controller.js`)
- `registerWithImages(req,res)`: admin tomonidan ko'p rasm bilan ro'yxatdan o'tkazish (multer memoryStorage, `faceImages[]`).
- `register(req,res)`: embedding(lar) bilan ro'yxatdan o'tkazish.
- `loginWithImage(req,res)`: surat orqali autentifikatsiya.
- `login(req,res)`: embedding(lar) orqali autentifikatsiya.
- `getAllUsers`, `getUserById`, `updateUserById`, `deleteUserById`, `getMe`

## 8. Marshrutlar (API)

Barcha API prefiks: `/api`

- Admin:
  - POST `/admins/register`
  - POST `/admins/login`
  - GET `/admins/` (admin tokeni)

- Users:
  - POST `/users/register` (admin tokeni, JSON: faceEmbedding yoki faceEmbeddings)
  - POST `/users/login` (JSON: faceEmbedding/faceEmbeddings)
  - POST `/users/register/image` (admin tokeni, multipart form-data: `faceImages`[])
  - POST `/users/login/image` (multipart form-data: `faceImage`)
  - GET `/users/` (admin)
  - GET `/users/me` (user yoki admin)
  - GET `/users/:id` (user/admin)
  - PUT `/users/:id` (user/admin)
  - DELETE `/users/:id` (user/admin)
  - POST `/users/face-index/rebuild` (admin)

Autentifikatsiya: `Authorization: Bearer <JWT>`

## 9. Frontend

- Asosiy sahifa: `frontend/index.html`
- Admin: `frontend/admin/login.html`, `register.html`, `dashboard.html` (+ `dashboard.js`)
- User: `frontend/user/login.html`, `dashboard.html` (+ `dashboard.js`)
- Stil: `frontend/assets/css/main.css`
- JS yordamchilar:
  - `assets/js/api.js`: API chaqiriqlari, token saqlash, UI util
  - `assets/js/face-unified.js`: kamera boshqaruvi, face capture, face-api.js bilan ishlash, embedding generatsiya, validatsiya
  - `assets/js/face-recognition.js` va `assets/js/face-capture.js`: avvalgi modular variantlar (yagona `face-unified.js` ichida ham qamrab olingan)

Tipik oqimlar:
- Admin login -> dashboard -> foydalanuvchi qo'shish (kamera orqali capture -> embeddings -> `/users/register`)
- User login -> kamera orqali `FaceUtils.captureFace` -> `/users/login` -> token -> personal dashboard

## 10. Xavfsizlik va cheklovlar
- Rate limit mavjud (config bilan sozlanadi)
- Multer upload cheklovi: rasm (image/*), 5MB, maksimum 5 ta
- JWT muddati `JWT_SECRET_DATE`
- Face index xotirada; restartdan keyin yo'qoladi (rebuild endpoint bor)

## 11. Muammo va xatoliklarni boshqarish
- Ko'p joyda `FaceUtils.logDebug` (FACE_DEBUG=1 bo'lsa) diagnostika beradi
- Controller/service darajasida izohli xabarlar
- Embedding o'lcham nomuvofiqligi, yaroqsiz inputlar uchun 400/401/403/404/429/500 javoblar

## 12. Ishlatish bo'yicha tezkor qo'llanma

- Admin yaratish:
  - POST `/api/admins/register` body: `{"username":"admin","password":"pass"}`
- Admin login va token olish:
  - POST `/api/admins/login` => `{ token }`
- Foydalanuvchi qo'shish (embeddinglar bilan):
  - Authorization: Bearer <token>
  - POST `/api/users/register` body: `{ firstName, lastName, faceEmbeddings: number[][] }`
- Foydalanuvchi qo'shish (rasmlar bilan):
  - Authorization: Bearer <token>
  - POST multipart `/api/users/register/image` files: `faceImages[]`
- User login (embeddinglar bilan):
  - POST `/api/users/login` body: `{ faceEmbeddings: number[][] }`
- User login (rasm bilan):
  - POST multipart `/api/users/login/image` file: `faceImage`

## 13. Funksiya/metodlar ro'yxati (asosiylari)

- Controllers: `AdminController.register/login/getAllAdmins`, `UserController.register/registerWithImages/login/loginWithImage/getAllUsers/getUserById/updateUserById/deleteUserById/getMe`
- Services: `AdminService.createAdmin/login/getAllAdmins/findByUsername`, `UserService.createUser/createUserFromImages/findByEmbedding/loginByImage/getAllUsers/getUserById/updateUserById/deleteUserById`, `FaceIndex.rebuild/search/addUser/removeUser/processFaceImage/generateEmbeddings/searchByImage/getStats/clear`, `FaceDetectionService.initialize/detectFaces/... (ko'plab ekstraktorlar)`, `HaarCascadeDetector.loadCascade/detectFaces/...`
- Utils: `FaceUtils.*`, `jwt.sign/verify`
- Middleware: `authenticate`, `requireRole`, `rateLimit`, `validateFacePayload`

## 14. Test va tekshiruvlar
- Minimal smoke-test: `/status` ga GET — `API is working on port <PORT>`
- Admin -> login -> token bilan protected endpointlarni sinash
- `/api/users/face-index/rebuild` orqali indexni qayta qurish

## 15. Keyingi rivojlantirish takliflari
- Face indexni doimiy saqlash (disk/DB) va server ishga tushganda avtomatik rebuild
- Real model (face-api.js server tomonda yoki TensorFlow/ONNX) bilan descriptor olish
- Audit loglar (login tarixini backendda saqlash)
- E2E testlar va Swagger/OpenAPI hujjatlari

— Tugadi —

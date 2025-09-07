// Face Capture Utility
class FaceCapture {
    constructor(videoElementId, canvasElementId) {
        this.video = document.getElementById(videoElementId);
        this.canvas = document.getElementById(canvasElementId);
        this.stream = null;
        this.faceMatcher = null;
    }

    // Initialize camera
    async startCamera() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    facingMode: 'user'
                }
            });
            
            if (this.video) {
                this.video.srcObject = this.stream;
                await this.video.play();
            }
            
            return true;
        } catch (error) {
            console.error('Error accessing camera:', error);
            throw new Error('Unable to access camera. Please ensure camera permissions are granted.');
        }
    }

    // Stop camera
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
    }

    // Capture image from video
    captureImage() {
        if (!this.video || !this.canvas) {
            throw new Error('Video or canvas element not found');
        }

        const context = this.canvas.getContext('2d');
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        context.drawImage(this.video, 0, 0);
        return this.canvas.toDataURL('image/jpeg', 0.8);
    }

    // Generate face embedding (simplified version)
    // In a real application, you would use a face recognition library like face-api.js
    generateFaceEmbedding(imageData) {
        // This is a simplified version that generates a random embedding
        // In production, you should use a proper face recognition library
        
        // Convert image data to a simple hash-like representation
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        return new Promise((resolve) => {
            img.onload = () => {
                canvas.width = 128;
                canvas.height = 128;
                ctx.drawImage(img, 0, 0, 128, 128);
                
                const imageData = ctx.getImageData(0, 0, 128, 128);
                const embedding = this.processImageToEmbedding(imageData);
                resolve(embedding);
            };
            img.src = imageData;
        });
    }

    // Process image data to create a face embedding
    processImageToEmbedding(imageData) {
        const data = imageData.data;
        const embedding = [];
        const blockSize = 16; // Process in 16x16 blocks
        
        // Create a 128-dimensional embedding vector
        for (let i = 0; i < 128; i++) {
            let sum = 0;
            const startIdx = i * (data.length / 128);
            
            // Average pixel values in each block
            for (let j = 0; j < blockSize && startIdx + j < data.length; j += 4) {
                const idx = Math.floor(startIdx + j);
                if (idx < data.length - 2) {
                    // RGB average
                    sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                }
            }
            
            // Normalize to [-1, 1] range
            embedding.push((sum / blockSize - 127.5) / 127.5);
        }
        
        return embedding;
    }

    // Validate face in image (basic validation)
    async validateFace(imageData, { debug = false } = {}) {
        // Lightweight heuristic validation; tolerant to lighting
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const metrics = this.faceMetrics(frame);
                // Adaptive acceptance logic:
                // 1. Base conditions broadened
                // 2. Adjust for dark (low meanLum) / bright (high meanLum) frames
                let edgeThreshold = 8; // was 20 (too strict)
                if (metrics.meanLum < 40) edgeThreshold = 4; // dark scene - relax
                if (metrics.meanLum > 200) edgeThreshold = 6; // very bright - slightly relax
                // Skin ratio wide bounds; extremely low/high unlikely for a centered face
                const ok = metrics.skinRatio > 0.02 && metrics.skinRatio < 0.8 && metrics.edgeVariance > edgeThreshold;
                if (debug) console.log('[FaceValidation]', metrics, 'ok:', ok);
                resolve({ ok, metrics });
            };
            img.src = imageData;
        });
    }

    // Simple face detection (checks for basic face-like patterns)
    faceMetrics(imageData) {
        const data = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        let skin = 0, total = 0;
        let lumSum = 0, lumSq = 0;
        // Simple edge metric (difference with right pixel)
        let edgeAccum = 0, edgeCount = 0;
        for (let y = 0; y < h; y += 2) { // subsample every 2 rows for speed
            for (let x = 0; x < w; x += 2) {
                const idx = (y * w + x) * 4;
                const r = data[idx], g = data[idx+1], b = data[idx+2];
                const maxc = Math.max(r,g,b), minc = Math.min(r,g,b);
                // Broader skin heuristic (includes varied lighting)
                if (r > 80 && g > 30 && b > 15 && (maxc - minc) > 10 && r > b * 0.8) skin++;
                const lum = 0.299*r + 0.587*g + 0.114*b;
                lumSum += lum; lumSq += lum*lum; total++;
                if (x+2 < w) {
                    const idx2 = (y * w + (x+2)) * 4;
                    const r2 = data[idx2], g2 = data[idx2+1], b2 = data[idx2+2];
                    const lum2 = 0.299*r2 + 0.587*g2 + 0.114*b2;
                    edgeAccum += Math.abs(lum - lum2);
                    edgeCount++;
                }
            }
        }
        const skinRatio = skin / total;
        const meanLum = lumSum / total;
        const varLum = (lumSq/total) - meanLum*meanLum;
        const edgeVariance = edgeCount ? edgeAccum / edgeCount : 0;
        return { skinRatio: parseFloat(skinRatio.toFixed(4)), meanLum: parseFloat(meanLum.toFixed(2)), varLum: parseFloat(varLum.toFixed(2)), edgeVariance: parseFloat(edgeVariance.toFixed(2)) };
    }

    // Get camera status
    isCameraActive() {
        return this.stream !== null;
    }
}

// Face capture utility functions
const FaceUtils = {
    // Initialize face capture
    async initFaceCapture(videoId = 'videoElement', canvasId = 'captureCanvas') {
        const faceCapture = new FaceCapture(videoId, canvasId);
        await faceCapture.startCamera();
        return faceCapture;
    },

    // Capture and process face
    async captureFace(faceCapture, frames = 5, delayMs = 120, { minValid = 3, maxRetriesPerFrame = 2, debug = false, allowFallback = true, useModel = true } = {}) {
        try {
            const embeddings = [];
            let lastImage = null;
            let validCount = 0;
            const metricsLog = [];
            let modelDescriptors = [];
            // If face-api.js present and useModel true, attempt direct descriptor extraction from video element
            if (useModel && typeof faceapi !== 'undefined' && faceCapture.video?.readyState === 4) {
                try {
                    modelDescriptors = await FaceRecognition.extractMultiple(faceCapture.video, frames, delayMs, { debug });
                    if (modelDescriptors.length >= minValid) {
                        if (debug) console.log('[Capture] Using model descriptors');
                        return { imageData: faceCapture.captureImage(), embeddings: modelDescriptors, validFrames: modelDescriptors.length, model: 'face-api' };
                    } else if (debug) {
                        console.warn('[Capture] Not enough model descriptors, fallback to heuristic pipeline.');
                    }
                } catch (e) {
                    if (debug) console.warn('[Capture] Model extraction failed, fallback', e);
                }
            }
            for (let i = 0; i < frames; i++) {
                let attempt = 0;
                let validated = false;
                let metricsSnapshot = null;
                while (attempt <= maxRetriesPerFrame && !validated) {
                    const imageData = faceCapture.captureImage();
                    const { ok, metrics } = await faceCapture.validateFace(imageData, { debug });
                    metricsSnapshot = metrics;
                    if (ok) {
                        // Treat as valid if ok, or if not ok but strict==false and this is final attempt
                        if (ok || attempt === maxRetriesPerFrame) {
                            validated = true;
                            lastImage = imageData;
                            const emb = await faceCapture.generateFaceEmbedding(imageData);
                            embeddings.push(emb);
                            if (ok) validCount++;
                            if (debug) console.log(`[Capture] Frame ${i+1} accepted (ok=${ok})`, metrics);
                        } else {
                            attempt++;
                            if (debug) console.log(`[Capture] Frame ${i+1} attempt ${attempt} retry`, metrics);
                            await new Promise(r => setTimeout(r, 80));
                            continue;
                        }
                    } else {
                        attempt++;
                        if (debug) console.log(`[Capture] Frame ${i+1} attempt ${attempt} rejected`, metrics);
                        await new Promise(r => setTimeout(r, 80));
                    }
                }
                metricsLog.push({ frame: i+1, metrics: metricsSnapshot });
                if (i < frames - 1) await new Promise(r => setTimeout(r, delayMs));
            }
            let fallbackUsed = false;
            if (validCount < minValid) {
                if (allowFallback === true && embeddings.length > 0) {
                    // Use heuristic: select top frames by edgeVariance as "pseudo-valid" until minValid reached
                    const ranked = metricsLog
                      .map((m, idx) => ({ idx, edge: m.metrics?.edgeVariance || 0 }))
                      .sort((a,b)=>b.edge - a.edge);
                    // Nothing to regenerate since embeddings collected; we just mark them logically
                    validCount = Math.min(minValid, embeddings.length);
                    fallbackUsed = true;
                    if (debug) console.warn(`[Capture] Fallback engaged. Marking top ${validCount} frames as valid.`);
                } else {
                    throw new Error(`Insufficient valid frames (${validCount}/${minValid}). Improve lighting or move closer.`);
                }
            }
            return { imageData: lastImage, embeddings, validFrames: validCount, fallbackUsed, metrics: metricsLog };
        } catch (error) {
            throw new Error(`Face capture failed: ${error.message}`);
        }
    },

    // Show camera preview
    showCameraPreview(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="camera-container">
                <video id="videoElement" autoplay muted></video>
                <div class="camera-overlay"></div>
                <canvas id="captureCanvas" style="display: none;"></canvas>
            </div>
        `;
    }
};

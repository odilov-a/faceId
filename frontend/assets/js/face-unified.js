// Unified Face ID Frontend Utilities
// Combines face capture, recognition, and validation in one module
// Uses centralized configuration and utilities

// Import the shared face utilities if available
if (typeof require !== 'undefined') {
    try {
        const { FaceUtils: SharedFaceUtils, FaceConfig } = require('../../src/utils/face-utils.js');
        window.SharedFaceUtils = SharedFaceUtils;
        window.FaceConfig = FaceConfig;
    } catch (e) {
        // Fallback configuration for frontend-only mode
        console.warn('Could not import shared face utilities, using frontend fallback');
    }
}

// Face configuration (fallback if shared config not available)
const FrontendFaceConfig = window.FaceConfig || {
    COSINE_DISTANCE_THRESHOLD: 0.6,
    DISTANCE_MARGIN: 0.05,
    MIN_VALID_FRAMES: 3,
    CAPTURE_FRAMES: 5,
    FRAME_DELAY_MS: 120,
    MIN_SKIN_RATIO: 0.02,
    MAX_SKIN_RATIO: 0.8,
    MIN_EDGE_VARIANCE: 8,
    DEBUG_ENABLED: false,
    EMBEDDING_DIMENSION: 128,
    MODEL_INPUT_SIZE: 224,
    FACE_DETECTION_SCORE_THRESHOLD: 0.4
};

/**
 * Face Recognition Helper using face-api.js
 * Provides model loading and descriptor extraction
 */
const FaceRecognition = (() => {
    let modelsLoaded = false;
    let loadPromise = null;

    /**
     * Load face-api.js models
     * @param {string} basePath - Base path for models
     * @returns {Promise} Loading promise
     */
    async function loadModels(basePath = '/models') {
        if (modelsLoaded) return;
        
        if (typeof faceapi === 'undefined') {
            throw new Error('face-api.js is not loaded. Please include the face-api.js script.');
        }

        if (!loadPromise) {
            loadPromise = Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(basePath),
                faceapi.nets.faceLandmark68TinyNet.loadFromUri(basePath),
                faceapi.nets.faceRecognitionNet.loadFromUri(basePath)
            ]).then(() => { 
                modelsLoaded = true; 
                if (FrontendFaceConfig.DEBUG_ENABLED) {
                    console.log('[FaceRecognition] Models loaded successfully');
                }
            });
        }
        return loadPromise;
    }

    /**
     * Get detection options for face-api.js
     * @returns {Object} Detection options
     */
    function getDetectionOptions() {
        return new faceapi.TinyFaceDetectorOptions({ 
            inputSize: FrontendFaceConfig.MODEL_INPUT_SIZE, 
            scoreThreshold: FrontendFaceConfig.FACE_DETECTION_SCORE_THRESHOLD 
        });
    }

    /**
     * Extract multiple face descriptors from video element
     * @param {HTMLVideoElement} videoElement - Video element
     * @param {number} frames - Number of frames to capture
     * @param {number} delayMs - Delay between captures
     * @param {Object} options - Options
     * @returns {Array} Array of face descriptors
     */
    async function extractMultiple(videoElement, frames = FrontendFaceConfig.CAPTURE_FRAMES, delayMs = FrontendFaceConfig.FRAME_DELAY_MS, options = {}) {
        const { debug = FrontendFaceConfig.DEBUG_ENABLED } = options;
        
        await loadModels();
        const descriptors = [];

        for (let i = 0; i < frames; i++) {
            try {
                const detection = await faceapi
                    .detectSingleFace(videoElement, getDetectionOptions())
                    .withFaceLandmarks(true)
                    .withFaceDescriptor();

                if (detection && detection.descriptor) {
                    descriptors.push(Array.from(detection.descriptor));
                    if (debug) {
                        console.log(`[FaceRecognition] Frame ${i + 1}: descriptor extracted (${detection.descriptor.length}D)`);
                    }
                } else if (debug) {
                    console.warn(`[FaceRecognition] Frame ${i + 1}: No face detected`);
                }
            } catch (error) {
                if (debug) {
                    console.warn(`[FaceRecognition] Frame ${i + 1}: Detection failed:`, error.message);
                }
            }

            if (i < frames - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }

        return descriptors;
    }

    /**
     * Quality check for face descriptors
     * @param {Array} descriptors - Array of descriptors
     * @param {Object} options - Quality check options
     * @returns {Object} Quality check result
     */
    function qualityCheck(descriptors, options = {}) {
        const {
            min = FrontendFaceConfig.MIN_VALID_FRAMES,
            maxMeanDistance = 0.9,
            minVariance = 0.0005
        } = options;

        if (descriptors.length < min) {
            return { isValid: false, reason: 'insufficient_samples' };
        }

        // Use shared utilities if available, otherwise fallback to local implementation
        if (window.SharedFaceUtils) {
            return window.SharedFaceUtils.validateEmbeddingQuality(descriptors, {
                minSamples: min,
                maxMeanDistance,
                minVariance
            });
        }

        // Fallback implementation
        return { isValid: true, reason: 'fallback_validation' };
    }

    return { loadModels, extractMultiple, qualityCheck };
})();

/**
 * Face Capture Class
 * Handles camera operations and face capture
 */
class FaceCapture {
    constructor(videoElementId, canvasElementId) {
        this.video = document.getElementById(videoElementId);
        this.canvas = document.getElementById(canvasElementId);
        this.stream = null;
        this.isCapturing = false;
    }

    /**
     * Initialize and start camera
     * @returns {Promise<boolean>} Success status
     */
    async startCamera() {
        try {
            if (this.stream) {
                return true; // Already started
            }

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

            if (FrontendFaceConfig.DEBUG_ENABLED) {
                console.log('[FaceCapture] Camera started successfully');
            }

            return true;
        } catch (error) {
            console.error('[FaceCapture] Camera error:', error);
            throw new Error('Unable to access camera. Please ensure camera permissions are granted.');
        }
    }

    /**
     * Stop camera
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.isCapturing = false;
        
        if (FrontendFaceConfig.DEBUG_ENABLED) {
            console.log('[FaceCapture] Camera stopped');
        }
    }

    /**
     * Capture image from video
     * @returns {string} Base64 image data
     */
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

    /**
     * Generate face embedding from image data
     * @param {string} imageData - Base64 image data
     * @returns {Promise<number[]>} Face embedding vector
     */
    async generateFaceEmbedding(imageData) {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const img = new Image();

            img.onload = () => {
                canvas.width = 128;
                canvas.height = 128;
                ctx.drawImage(img, 0, 0, 128, 128);

                const imageData = ctx.getImageData(0, 0, 128, 128);
                let embedding;

                // Use shared utilities if available
                if (window.SharedFaceUtils) {
                    embedding = window.SharedFaceUtils.processImageToEmbedding(imageData);
                } else {
                    // Fallback implementation
                    embedding = this.processImageToEmbeddingFallback(imageData);
                }

                resolve(embedding);
            };

            img.src = imageData;
        });
    }

    /**
     * Fallback embedding generation (when shared utilities not available)
     * @param {ImageData} imageData - Canvas ImageData
     * @returns {number[]} Embedding vector
     */
    processImageToEmbeddingFallback(imageData) {
        const data = imageData.data;
        const embedding = [];
        const blockSize = 16;

        for (let i = 0; i < FrontendFaceConfig.EMBEDDING_DIMENSION; i++) {
            let sum = 0;
            const startIdx = i * Math.floor(data.length / FrontendFaceConfig.EMBEDDING_DIMENSION);

            for (let j = 0; j < blockSize && startIdx + j < data.length; j += 4) {
                const idx = Math.floor(startIdx + j);
                if (idx < data.length - 2) {
                    sum += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                }
            }

            embedding.push((sum / blockSize - 127.5) / 127.5);
        }

        return this.normalizeVector(embedding);
    }

    /**
     * Normalize vector to unit length
     * @param {number[]} vector - Vector to normalize
     * @returns {number[]} Normalized vector
     */
    normalizeVector(vector) {
        if (window.SharedFaceUtils) {
            return window.SharedFaceUtils.normalize(vector);
        }

        // Fallback normalization
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude === 0) return vector.slice();
        return vector.map(val => val / magnitude);
    }

    /**
     * Validate face in image
     * @param {string} imageData - Base64 image data
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateFace(imageData, options = {}) {
        const { debug = FrontendFaceConfig.DEBUG_ENABLED } = options;

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                let result;
                
                // Use shared utilities if available
                if (window.SharedFaceUtils) {
                    result = window.SharedFaceUtils.validateFaceInImage(frameData, { debug });
                    resolve({
                        ok: result.isValid,
                        metrics: result.metrics,
                        thresholds: result.thresholds
                    });
                } else {
                    // Fallback validation
                    const metrics = this.calculateFaceMetricsFallback(frameData);
                    const isValid = metrics.skinRatio > 0.02 && 
                                   metrics.skinRatio < 0.8 && 
                                   metrics.edgeVariance > 8;
                    
                    resolve({
                        ok: isValid,
                        metrics,
                        thresholds: { edgeThreshold: 8 }
                    });
                }
            };
            img.src = imageData;
        });
    }

    /**
     * Fallback face metrics calculation
     * @param {ImageData} imageData - Canvas ImageData
     * @returns {Object} Face metrics
     */
    calculateFaceMetricsFallback(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        let skinPixels = 0;
        let totalPixels = 0;
        let luminanceSum = 0;
        let edgeSum = 0;
        let edgeCount = 0;

        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // Basic skin detection
                const maxColor = Math.max(r, g, b);
                const minColor = Math.min(r, g, b);
                
                if (r > 80 && g > 30 && b > 15 && 
                    (maxColor - minColor) > 10 && 
                    r > b * 0.8) {
                    skinPixels++;
                }

                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                luminanceSum += luminance;
                totalPixels++;

                if (x + 2 < width) {
                    const nextIdx = (y * width + (x + 2)) * 4;
                    const nextR = data[nextIdx];
                    const nextG = data[nextIdx + 1];
                    const nextB = data[nextIdx + 2];
                    const nextLuminance = 0.299 * nextR + 0.587 * nextG + 0.114 * nextB;
                    
                    edgeSum += Math.abs(luminance - nextLuminance);
                    edgeCount++;
                }
            }
        }

        return {
            skinRatio: parseFloat((skinPixels / totalPixels).toFixed(4)),
            meanLuminance: parseFloat((luminanceSum / totalPixels).toFixed(2)),
            edgeVariance: parseFloat((edgeSum / edgeCount).toFixed(2))
        };
    }

    /**
     * Check if camera is active
     * @returns {boolean} Camera status
     */
    isCameraActive() {
        return this.stream !== null;
    }
}

/**
 * Face Utilities - High-level functions for face operations
 */
const FaceUtils = {
    /**
     * Initialize face capture system
     * @param {string} videoId - Video element ID
     * @param {string} canvasId - Canvas element ID
     * @returns {Promise<FaceCapture>} Face capture instance
     */
    async initFaceCapture(videoId = 'videoElement', canvasId = 'captureCanvas') {
        const faceCapture = new FaceCapture(videoId, canvasId);
        await faceCapture.startCamera();
        return faceCapture;
    },

    /**
     * Capture and process face with multiple validation methods
     * @param {FaceCapture} faceCapture - Face capture instance
     * @param {number} frames - Number of frames to capture
     * @param {number} delayMs - Delay between frames
     * @param {Object} options - Capture options
     * @returns {Promise<Object>} Capture result with embeddings
     */
    async captureFace(faceCapture, frames = FrontendFaceConfig.CAPTURE_FRAMES, delayMs = FrontendFaceConfig.FRAME_DELAY_MS, options = {}) {
        const {
            minValid = FrontendFaceConfig.MIN_VALID_FRAMES,
            maxRetriesPerFrame = 2,
            debug = FrontendFaceConfig.DEBUG_ENABLED,
            allowFallback = true,
            useModel = true
        } = options;

        try {
            const embeddings = [];
            let lastImage = null;
            let validCount = 0;
            const metricsLog = [];
            let modelDescriptors = [];

            // Try face-api.js model extraction first if available
            if (useModel && typeof faceapi !== 'undefined' && faceCapture.video?.readyState === 4) {
                try {
                    modelDescriptors = await FaceRecognition.extractMultiple(faceCapture.video, frames, delayMs, { debug });
                    if (modelDescriptors.length >= minValid) {
                        if (debug) {
                            console.log('[FaceUtils] Using face-api.js descriptors');
                        }
                        return {
                            imageData: faceCapture.captureImage(),
                            embeddings: modelDescriptors,
                            validFrames: modelDescriptors.length,
                            method: 'face-api'
                        };
                    } else if (debug) {
                        console.warn('[FaceUtils] Insufficient face-api descriptors, falling back to heuristic');
                    }
                } catch (e) {
                    if (debug) {
                        console.warn('[FaceUtils] Face-api.js extraction failed, using fallback:', e.message);
                    }
                }
            }

            // Heuristic pipeline fallback
            for (let i = 0; i < frames; i++) {
                let attempt = 0;
                let validated = false;
                let metricsSnapshot = null;

                while (attempt <= maxRetriesPerFrame && !validated) {
                    const imageData = faceCapture.captureImage();
                    const { ok, metrics } = await faceCapture.validateFace(imageData, { debug });
                    metricsSnapshot = metrics;

                    if (ok || attempt === maxRetriesPerFrame) {
                        validated = true;
                        lastImage = imageData;
                        const embedding = await faceCapture.generateFaceEmbedding(imageData);
                        embeddings.push(embedding);
                        if (ok) validCount++;
                        
                        if (debug) {
                            console.log(`[FaceUtils] Frame ${i + 1} accepted (valid=${ok})`);
                        }
                    } else {
                        attempt++;
                        if (debug) {
                            console.log(`[FaceUtils] Frame ${i + 1} attempt ${attempt} rejected`);
                        }
                        await new Promise(resolve => setTimeout(resolve, 80));
                        continue;
                    }
                }

                metricsLog.push({ frame: i + 1, metrics: metricsSnapshot });
                
                if (i < frames - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }

            // Quality fallback logic
            let fallbackUsed = false;
            if (validCount < minValid) {
                if (allowFallback && embeddings.length > 0) {
                    validCount = Math.min(minValid, embeddings.length);
                    fallbackUsed = true;
                    if (debug) {
                        console.warn(`[FaceUtils] Quality fallback engaged. Using ${validCount} frames.`);
                    }
                } else {
                    throw new Error(`Insufficient valid frames (${validCount}/${minValid}). Please improve lighting or positioning.`);
                }
            }

            return {
                imageData: lastImage,
                embeddings,
                validFrames: validCount,
                fallbackUsed,
                metrics: metricsLog,
                method: 'heuristic'
            };
        } catch (error) {
            throw new Error(`Face capture failed: ${error.message}`);
        }
    },

    /**
     * Show camera preview in container
     * @param {string} containerId - Container element ID
     */
    showCameraPreview(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div class="camera-container">
                <video id="videoElement" autoplay muted playsinline></video>
                <div class="camera-overlay">
                    <div class="face-outline"></div>
                </div>
                <canvas id="captureCanvas" style="display: none;"></canvas>
            </div>
        `;
    },

    /**
     * Get current configuration
     * @returns {Object} Current configuration
     */
    getConfig() {
        return { ...FrontendFaceConfig };
    },

    /**
     * Log debug information
     * @param {string} context - Context of the operation
     * @param {*} data - Data to log
     */
    logDebug(context, data) {
        if (FrontendFaceConfig.DEBUG_ENABLED) {
            console.log(`[FaceID:${context}]`, data);
        }
    }
};

// Export for use in HTML pages
window.FaceCapture = FaceCapture;
window.FaceRecognition = FaceRecognition;
window.FaceUtils = FaceUtils;
window.FrontendFaceConfig = FrontendFaceConfig;

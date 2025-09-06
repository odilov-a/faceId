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
    async validateFace(imageData) {
        // This is a simplified validation
        // In production, use proper face detection libraries
        
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const hasValidFace = this.detectFaceInImageData(imageData);
                resolve(hasValidFace);
            };
            img.src = imageData;
        });
    }

    // Simple face detection (checks for basic face-like patterns)
    detectFaceInImageData(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        // Look for face-like patterns (simplified)
        let skinColorPixels = 0;
        let totalPixels = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // Basic skin color detection
            if (r > 95 && g > 40 && b > 20 && 
                Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
                Math.abs(r - g) > 15 && r > g && r > b) {
                skinColorPixels++;
            }
            totalPixels++;
        }
        
        const skinRatio = skinColorPixels / totalPixels;
        return skinRatio > 0.1 && skinRatio < 0.6; // Face should have some skin but not too much
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
    async captureFace(faceCapture, frames = 3, delayMs = 120) {
        try {
            const embeddings = [];
            let lastImage = null;
            for (let i = 0; i < frames; i++) {
                const imageData = faceCapture.captureImage();
                const isValidFace = await faceCapture.validateFace(imageData);
                if (!isValidFace) {
                    throw new Error('No face detected in the image. Please position your face clearly in the camera.');
                }
                const emb = await faceCapture.generateFaceEmbedding(imageData);
                embeddings.push(emb);
                lastImage = imageData;
                if (i < frames - 1) {
                    await new Promise(r => setTimeout(r, delayMs));
                }
            }
            // Average embeddings element-wise
            const length = embeddings[0].length;
            const avg = new Array(length).fill(0);
            embeddings.forEach(e => {
                for (let i = 0; i < length; i++) avg[i] += e[i];
            });
            for (let i = 0; i < length; i++) avg[i] /= embeddings.length;
            return { imageData: lastImage, embedding: avg };
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

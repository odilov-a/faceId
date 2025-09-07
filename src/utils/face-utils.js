// Centralized Face ID Utilities
// This module provides shared utilities for face recognition operations
// Used by both frontend and backend to maintain consistency

const FaceConfig = {
    // Face recognition thresholds
    COSINE_DISTANCE_THRESHOLD: parseFloat(process.env.FACE_MATCH_THRESHOLD || "0.6"),
    EUCLIDEAN_DISTANCE_THRESHOLD: parseFloat(process.env.EUCLIDEAN_THRESHOLD || "0.8"),
    DISTANCE_MARGIN: parseFloat(process.env.FACE_DISTANCE_MARGIN || "0.05"),
    
    // Face validation parameters
    MIN_VALID_FRAMES: parseInt(process.env.MIN_VALID_FRAMES || "3"),
    CAPTURE_FRAMES: parseInt(process.env.CAPTURE_FRAMES || "5"),
    FRAME_DELAY_MS: parseInt(process.env.FRAME_DELAY_MS || "120"),
    
    // Face metrics thresholds
    MIN_SKIN_RATIO: parseFloat(process.env.MIN_SKIN_RATIO || "0.02"),
    MAX_SKIN_RATIO: parseFloat(process.env.MAX_SKIN_RATIO || "0.8"),
    MIN_EDGE_VARIANCE: parseFloat(process.env.MIN_EDGE_VARIANCE || "8"),
    
    // Debug settings
    DEBUG_ENABLED: process.env.FACE_DEBUG === "1",
    
    // Model settings
    EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || "128"),
    MODEL_INPUT_SIZE: parseInt(process.env.MODEL_INPUT_SIZE || "224"),
    FACE_DETECTION_SCORE_THRESHOLD: parseFloat(process.env.DETECTION_SCORE_THRESHOLD || "0.4")
};

class FaceUtils {
    /**
     * Calculate cosine distance between two vectors
     * @param {number[]} vectorA - First vector
     * @param {number[]} vectorB - Second vector
     * @returns {number} Cosine distance (0-2, where 0 is identical)
     */
    static cosineDistance(vectorA, vectorB) {
        if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
            throw new Error('Both inputs must be arrays');
        }
        
        if (vectorA.length !== vectorB.length) {
            throw new Error('Vectors must have the same length');
        }

        if (vectorA.length === 0) {
            throw new Error('Vectors cannot be empty');
        }

        let dot = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < vectorA.length; i++) {
            const a = vectorA[i];
            const b = vectorB[i];
            
            if (typeof a !== 'number' || typeof b !== 'number') {
                throw new Error('All vector elements must be numbers');
            }
            
            dot += a * b;
            normA += a * a;
            normB += b * b;
        }
        
        const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
        if (magnitude === 0) {
            return 2; // Maximum distance for zero vectors
        }
        
        return 1 - (dot / magnitude);
    }

    /**
     * Calculate Euclidean distance between two vectors
     * @param {number[]} vectorA - First vector
     * @param {number[]} vectorB - Second vector
     * @returns {number} Euclidean distance
     */
    static euclideanDistance(vectorA, vectorB) {
        if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
            throw new Error('Both inputs must be arrays');
        }

        if (vectorA.length !== vectorB.length) {
            throw new Error('Vectors must have the same length');
        }

        let sum = 0;
        for (let i = 0; i < vectorA.length; i++) {
            const a = vectorA[i];
            const b = vectorB[i];
            
            if (typeof a !== 'number' || typeof b !== 'number') {
                throw new Error('All vector elements must be numbers');
            }
            
            const diff = a - b;
            sum += diff * diff;
        }
        
        return Math.sqrt(sum);
    }

    /**
     * Normalize a vector to unit length
     * @param {number[]} vector - Vector to normalize
     * @returns {number[]} Normalized vector
     */
    static normalize(vector) {
        if (!Array.isArray(vector)) {
            throw new Error('Input must be an array');
        }

        if (vector.length === 0) {
            return [];
        }

        // Calculate magnitude
        const magnitude = Math.sqrt(vector.reduce((sum, val) => {
            if (typeof val !== 'number') {
                throw new Error('All vector elements must be numbers');
            }
            return sum + val * val;
        }, 0));

        // Handle zero vector
        if (magnitude === 0 || !Number.isFinite(magnitude)) {
            return vector.slice(); // Return copy of original
        }

        // Return normalized vector
        return vector.map(val => val / magnitude);
    }

    /**
     * Aggregate multiple embeddings into mean and median
     * @param {number[][]} embeddings - Array of embedding vectors
     * @returns {Object} Object with mean and median embeddings
     */
    static aggregateEmbeddings(embeddings) {
        if (!Array.isArray(embeddings) || embeddings.length === 0) {
            throw new Error('Embeddings array cannot be empty');
        }

        const firstEmbedding = embeddings[0];
        if (!Array.isArray(firstEmbedding)) {
            throw new Error('Each embedding must be an array');
        }

        const dimension = firstEmbedding.length;
        
        // Validate all embeddings have same dimension
        for (let i = 0; i < embeddings.length; i++) {
            if (!Array.isArray(embeddings[i]) || embeddings[i].length !== dimension) {
                throw new Error(`Embedding ${i} has inconsistent dimension`);
            }
        }

        // Calculate mean
        const mean = new Array(dimension).fill(0);
        embeddings.forEach(embedding => {
            for (let i = 0; i < dimension; i++) {
                if (typeof embedding[i] !== 'number') {
                    throw new Error('All embedding elements must be numbers');
                }
                mean[i] += embedding[i];
            }
        });
        
        for (let i = 0; i < dimension; i++) {
            mean[i] /= embeddings.length;
        }

        // Calculate median per dimension
        const median = [];
        for (let i = 0; i < dimension; i++) {
            const values = embeddings.map(emb => emb[i]).sort((a, b) => a - b);
            const mid = Math.floor(values.length / 2);
            
            if (values.length % 2 === 0) {
                median.push((values[mid - 1] + values[mid]) / 2);
            } else {
                median.push(values[mid]);
            }
        }

        return { mean, median };
    }

    /**
     * Validate face embeddings quality
     * @param {number[][]} embeddings - Array of embeddings to validate
     * @param {Object} options - Validation options
     * @returns {Object} Validation result with quality metrics
     */
    static validateEmbeddingQuality(embeddings, options = {}) {
        const {
            minSamples = FaceConfig.MIN_VALID_FRAMES,
            maxMeanDistance = 0.9,
            minVariance = 0.0005
        } = options;

        if (!Array.isArray(embeddings) || embeddings.length < minSamples) {
            return {
                isValid: false,
                reason: 'insufficient_samples',
                sampleCount: embeddings.length,
                required: minSamples
            };
        }

        const dimension = embeddings[0].length;
        
        // Calculate variance across all dimensions
        const mean = this.aggregateEmbeddings(embeddings).mean;
        let totalVariance = 0;
        
        embeddings.forEach(embedding => {
            for (let i = 0; i < dimension; i++) {
                const diff = embedding[i] - mean[i];
                totalVariance += diff * diff;
            }
        });
        
        const variance = totalVariance / (embeddings.length * dimension);

        // Calculate mean pairwise distance
        let pairwiseSum = 0;
        let pairCount = 0;
        
        for (let i = 0; i < embeddings.length; i++) {
            for (let j = i + 1; j < embeddings.length; j++) {
                pairwiseSum += this.cosineDistance(embeddings[i], embeddings[j]);
                pairCount++;
            }
        }
        
        const meanDistance = pairCount > 0 ? pairwiseSum / pairCount : 0;

        const isValid = variance >= minVariance && meanDistance < maxMeanDistance;

        return {
            isValid,
            variance,
            meanDistance,
            sampleCount: embeddings.length,
            reason: isValid ? 'valid' : 'quality_issues'
        };
    }

    /**
     * Find best matching embedding from a set of candidates
     * @param {number[]} queryEmbedding - The embedding to match
     * @param {Array} candidates - Array of {id, embeddings} objects
     * @param {Object} options - Matching options
     * @returns {Object|null} Best match result or null
     */
    static findBestMatch(queryEmbedding, candidates, options = {}) {
        const {
            threshold = FaceConfig.COSINE_DISTANCE_THRESHOLD,
            margin = FaceConfig.DISTANCE_MARGIN,
            distanceFunction = 'cosine'
        } = options;

        if (!Array.isArray(queryEmbedding)) {
            throw new Error('Query embedding must be an array');
        }

        if (!Array.isArray(candidates) || candidates.length === 0) {
            return null;
        }

        const distanceFunc = distanceFunction === 'euclidean' 
            ? this.euclideanDistance 
            : this.cosineDistance;

        let bestMatch = null;
        let bestDistance = Infinity;
        let secondBestDistance = Infinity;
        const allMatches = [];

        candidates.forEach(candidate => {
            if (!candidate.id || !Array.isArray(candidate.embeddings)) {
                return;
            }

            const distances = candidate.embeddings
                .filter(emb => Array.isArray(emb) && emb.length === queryEmbedding.length)
                .map(emb => distanceFunc(queryEmbedding, emb));

            if (distances.length === 0) return;

            const minDistance = Math.min(...distances);
            allMatches.push({ id: candidate.id, distance: minDistance });

            if (minDistance < bestDistance) {
                secondBestDistance = bestDistance;
                bestDistance = minDistance;
                bestMatch = candidate;
            } else if (minDistance < secondBestDistance) {
                secondBestDistance = minDistance;
            }
        });

        // Apply threshold and margin checks
        if (!bestMatch || bestDistance >= threshold) {
            return null;
        }

        const marginCheck = (secondBestDistance - bestDistance) >= margin || secondBestDistance === Infinity;
        if (!marginCheck) {
            return null;
        }

        return {
            match: bestMatch,
            distance: bestDistance,
            secondDistance: secondBestDistance,
            margin: secondBestDistance - bestDistance,
            confidence: 1 - (bestDistance / threshold),
            allMatches: allMatches.sort((a, b) => a.distance - b.distance).slice(0, 5)
        };
    }

    /**
     * Process image data to create face embedding (frontend/lightweight version)
     * @param {ImageData} imageData - Canvas ImageData object
     * @returns {number[]} Face embedding vector
     */
    static processImageToEmbedding(imageData) {
        const data = imageData.data;
        const embedding = [];
        const blockSize = 16;
        const targetDimension = FaceConfig.EMBEDDING_DIMENSION;

        for (let i = 0; i < targetDimension; i++) {
            let sum = 0;
            const startIdx = i * Math.floor(data.length / targetDimension);

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

        return this.normalize(embedding);
    }

    /**
     * Calculate face quality metrics from image data
     * @param {ImageData} imageData - Canvas ImageData object
     * @returns {Object} Quality metrics
     */
    static calculateFaceMetrics(imageData) {
        const data = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        
        let skinPixels = 0;
        let totalPixels = 0;
        let luminanceSum = 0;
        let luminanceSquareSum = 0;
        let edgeSum = 0;
        let edgeCount = 0;

        // Process every 2nd pixel for performance
        for (let y = 0; y < height; y += 2) {
            for (let x = 0; x < width; x += 2) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // Skin detection heuristic
                const maxColor = Math.max(r, g, b);
                const minColor = Math.min(r, g, b);
                
                if (r > 80 && g > 30 && b > 15 && 
                    (maxColor - minColor) > 10 && 
                    r > b * 0.8) {
                    skinPixels++;
                }

                // Luminance calculation
                const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
                luminanceSum += luminance;
                luminanceSquareSum += luminance * luminance;
                totalPixels++;

                // Edge detection (horizontal gradient)
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

        const skinRatio = totalPixels > 0 ? skinPixels / totalPixels : 0;
        const meanLuminance = totalPixels > 0 ? luminanceSum / totalPixels : 0;
        const luminanceVariance = totalPixels > 0 ? 
            (luminanceSquareSum / totalPixels) - (meanLuminance * meanLuminance) : 0;
        const edgeVariance = edgeCount > 0 ? edgeSum / edgeCount : 0;

        return {
            skinRatio: parseFloat(skinRatio.toFixed(4)),
            meanLuminance: parseFloat(meanLuminance.toFixed(2)),
            luminanceVariance: parseFloat(luminanceVariance.toFixed(2)),
            edgeVariance: parseFloat(edgeVariance.toFixed(2))
        };
    }

    /**
     * Validate if image contains a valid face
     * @param {ImageData} imageData - Canvas ImageData object
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     */
    static validateFaceInImage(imageData, options = {}) {
        const { debug = FaceConfig.DEBUG_ENABLED } = options;
        
        const metrics = this.calculateFaceMetrics(imageData);
        
        // Adaptive thresholds based on lighting conditions
        let edgeThreshold = FaceConfig.MIN_EDGE_VARIANCE;
        
        if (metrics.meanLuminance < 40) {
            edgeThreshold = 4; // Dark scene - relax threshold
        } else if (metrics.meanLuminance > 200) {
            edgeThreshold = 6; // Bright scene - slightly relax
        }

        const isValid = 
            metrics.skinRatio > FaceConfig.MIN_SKIN_RATIO &&
            metrics.skinRatio < FaceConfig.MAX_SKIN_RATIO &&
            metrics.edgeVariance > edgeThreshold;

        if (debug) {
            console.log('[FaceValidation]', {
                ...metrics,
                edgeThreshold,
                isValid
            });
        }

        return {
            isValid,
            metrics,
            thresholds: {
                edgeThreshold,
                skinRatioRange: [FaceConfig.MIN_SKIN_RATIO, FaceConfig.MAX_SKIN_RATIO]
            }
        };
    }

    /**
     * Log face recognition debug information
     * @param {string} context - Context of the operation
     * @param {Object} data - Data to log
     */
    static logDebug(context, data) {
        if (FaceConfig.DEBUG_ENABLED) {
            console.log(`[FaceID:${context}]`, data);
        }
    }

    /**
     * Get configuration values
     * @returns {Object} Current configuration
     */
    static getConfig() {
        return { ...FaceConfig };
    }
}

// Export for both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FaceUtils, FaceConfig };
} else if (typeof window !== 'undefined') {
    window.FaceUtils = FaceUtils;
    window.FaceConfig = FaceConfig;
}

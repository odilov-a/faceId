/**
 * Advanced Face Detection Service 
 * Uses Haar Cascade for accurate face detection and improved heuristic methods
 * Now includes the haarcascade_frontalface_alt.xml for better detection
 */
const jimp = require('jimp');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const HaarCascadeDetector = require('./haar-cascade');

class FaceDetectionService {
  constructor() {
    this.modelsLoaded = false;
    this.modelPath = path.join(__dirname, '../../models');
    this.haarDetector = new HaarCascadeDetector();
    this.useHaarCascade = true; // Enable Haar Cascade by default
    console.log('Face Detection Service: Using Haar Cascade with fallback methods');
  }

  /**
   * Initialize the detection service
   */
  async initialize() {
    try {
      // Try to load Haar Cascade
      console.log('Loading Haar Cascade detector...');
      const haarLoaded = await this.haarDetector.loadCascade();
      
      if (haarLoaded) {
        console.log('Face Detection Service: Haar Cascade loaded successfully');
        this.useHaarCascade = true;
      } else {
        console.log('Face Detection Service: Falling back to heuristic methods');
        this.useHaarCascade = false;
      }
      
      return Promise.resolve();
    } catch (error) {
      console.error('Error initializing face detection:', error.message);
      this.useHaarCascade = false;
      return Promise.resolve();
    }
  }

  /**
   * Detect and extract face descriptors from image buffer
   * @param {Buffer} imageBuffer - Image data buffer
   * @param {Object} options - Detection options
   * @returns {Promise<Object>} Detection result with descriptors and metadata
   */
  async detectFaces(imageBuffer, options = {}) {
    const {
      minFaceSize = 160,
      scoreThreshold = 0.5,
      maxFaces = 1,
      requireLandmarks = true,
      requireDescriptors = true
    } = options;

    try {
      // Process image with jimp for preprocessing
      const image = await jimp.read(imageBuffer);
      const processedBuffer = await this.preprocessImage(image);
      
      // Try Haar Cascade first if available
      if (this.useHaarCascade) {
        try {
          console.log('Using Haar Cascade for face detection...');
          return await this.detectWithHaarCascade(processedBuffer, options);
        } catch (haarError) {
          console.warn('Haar Cascade detection failed, falling back to heuristic methods:', haarError.message);
          this.useHaarCascade = false;
        }
      }
      
      // Fallback to enhanced heuristic methods
      console.log('Using enhanced fallback methods for face detection...');
      return await this.detectWithEnhancedFallback(processedBuffer, options);
    } catch (error) {
      throw new Error(`Face detection failed: ${error.message}`);
    }
  }

  /**
   * Face detection using Haar Cascade classifier
   */
  async detectWithHaarCascade(imageBuffer, options) {
    const { minFaceSize = 160, maxFaces = 1 } = options;
    
    try {
      // Use Haar Cascade for detection
      const cascadeDetections = await this.haarDetector.detectFaces(imageBuffer, {
        scaleFactor: 1.1,
        minNeighbors: 3,
        minSize: { width: minFaceSize, height: minFaceSize }
      });
      
      if (cascadeDetections.length === 0) {
        return {
          success: false,
          faces: [],
          error: 'No faces detected by Haar Cascade',
          method: 'haar-cascade'
        };
      }
      
      const image = await jimp.read(imageBuffer);
      const validFaces = [];
      
      // Process detected faces
      for (let i = 0; i < Math.min(cascadeDetections.length, maxFaces); i++) {
        const detection = cascadeDetections[i];
        
        // Create bounding box
        const boundingBox = {
          x: detection.x,
          y: detection.y,
          width: detection.width,
          height: detection.height
        };
        
        // Generate enhanced embedding
        const embedding = await this.generateEnhancedEmbedding(image, boundingBox);
        const quality = await this.assessImageQuality(image, boundingBox);
        
        // Estimate basic landmarks (simplified)
        const landmarks = this.estimateLandmarks(boundingBox);
        
        validFaces.push({
          id: uuidv4(),
          boundingBox: boundingBox,
          confidence: detection.confidence || 0.85,
          landmarks: landmarks,
          descriptor: embedding,
          quality: quality,
          pose: this.estimateBasicPose(boundingBox, { width: image.bitmap.width, height: image.bitmap.height }),
          size: Math.min(boundingBox.width, boundingBox.height),
          detectionMethod: 'haar-cascade'
        });
      }
      
      return {
        success: validFaces.length > 0,
        faces: validFaces,
        metadata: {
          totalDetected: cascadeDetections.length,
          validFaces: validFaces.length,
          method: 'haar-cascade',
          timestamp: new Date().toISOString(),
          cascadeFile: 'haarcascade_frontalface_alt.xml'
        }
      };
    } catch (error) {
      throw new Error(`Haar Cascade detection error: ${error.message}`);
    }
  }

  /**
   * Estimate basic facial landmarks from bounding box
   */
  estimateLandmarks(boundingBox) {
    const { x, y, width, height } = boundingBox;
    
    // Estimate basic facial landmarks based on typical face proportions
    return {
      leftEye: { x: x + width * 0.3, y: y + height * 0.35 },
      rightEye: { x: x + width * 0.7, y: y + height * 0.35 },
      nose: { x: x + width * 0.5, y: y + height * 0.55 },
      leftMouth: { x: x + width * 0.35, y: y + height * 0.75 },
      rightMouth: { x: x + width * 0.65, y: y + height * 0.75 },
      chin: { x: x + width * 0.5, y: y + height * 0.9 }
    };
  }

  /**
   * Enhanced fallback face detection using improved heuristics
   */
  async detectWithEnhancedFallback(imageBuffer, options) {
    const { minFaceSize = 160 } = options;
    const image = await jimp.read(imageBuffer);
    const { width, height } = image.bitmap;
    
    // Enhanced face region detection using multiple techniques
    const faceRegions = await this.findFaceRegions(image);
    
    if (faceRegions.length === 0) {
      return {
        success: false,
        faces: [],
        error: 'No face regions detected',
        method: 'enhanced-fallback'
      };
    }

    const validFaces = [];
    
    for (const region of faceRegions) {
      if (Math.min(region.width, region.height) >= minFaceSize) {
        // Generate enhanced embedding
        const embedding = await this.generateEnhancedEmbedding(image, region);
        const quality = await this.assessImageQuality(image, region);
        
        validFaces.push({
          id: uuidv4(),
          boundingBox: region,
          confidence: region.confidence || 0.8,
          landmarks: region.landmarks || null,
          descriptor: embedding,
          quality: quality,
          pose: this.estimateBasicPose(region, { width, height }),
          size: Math.min(region.width, region.height)
        });
      }
    }

    return {
      success: validFaces.length > 0,
      faces: validFaces.slice(0, options.maxFaces || 1),
      metadata: {
        totalDetected: faceRegions.length,
        validFaces: validFaces.length,
        method: 'enhanced-fallback',
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Preprocess image for better face detection
   */
  async preprocessImage(image) {
    const maxSize = 1024;
    const { width, height } = image.bitmap;

    // Resize if too large
    if (width > maxSize || height > maxSize) {
      const scale = maxSize / Math.max(width, height);
      image = image.resize(width * scale, height * scale);
    }

    // Enhance contrast and brightness
    image = image
      .contrast(0.1)
      .brightness(0.05)
      .normalize();

    return await image.getBufferAsync(jimp.MIME_JPEG);
  }

  /**
   * Calculate face quality metrics
   */
  calculateFaceQuality(boundingBox, landmarks) {
    const size = Math.min(boundingBox.width, boundingBox.height);
    
    // Size quality (prefer faces >= 160px)
    const sizeQuality = Math.min(1.0, size / 160);
    
    // Overall quality estimation
    const overall = sizeQuality * 0.8 + 0.2; // Base quality

    return {
      overall: Math.round(overall * 100) / 100,
      sharpness: 0.8, // Would need blur detection
      lighting: 0.8, // Would need lighting analysis
      pose: landmarks ? this.calculatePoseQuality(landmarks) : 0.8,
      size: sizeQuality
    };
  }

  /**
   * Calculate pose quality from landmarks
   */
  calculatePoseQuality(landmarks) {
    // Simplified pose quality based on facial symmetry
    // In production, this would analyze actual pose angles
    return 0.8;
  }

  /**
   * Find potential face regions using multiple heuristic techniques
   */
  async findFaceRegions(image) {
    const { width, height } = image.bitmap;
    const regions = [];

    // Method 1: Center-weighted region (most common for selfies)
    regions.push({
      x: Math.round(width * 0.15),
      y: Math.round(height * 0.1),
      width: Math.round(width * 0.7),
      height: Math.round(height * 0.8),
      confidence: 0.8,
      method: 'center-weighted'
    });

    // Method 2: Skin tone detection
    const skinRegion = await this.detectSkinRegion(image);
    if (skinRegion) {
      regions.push({
        ...skinRegion,
        confidence: 0.7,
        method: 'skin-detection'
      });
    }

    // Method 3: Edge-based detection
    const edgeRegion = await this.detectEdgeRegion(image);
    if (edgeRegion) {
      regions.push({
        ...edgeRegion,
        confidence: 0.6,
        method: 'edge-detection'
      });
    }

    // Return the best region (highest confidence)
    return regions.sort((a, b) => b.confidence - a.confidence).slice(0, 1);
  }

  /**
   * Detect face region using skin tone heuristics
   */
  async detectSkinRegion(image) {
    const { width, height } = image.bitmap;
    let skinPixels = 0;
    let totalPixels = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;

    image.scan(0, 0, width, height, function (x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];

      // Simple skin tone detection
      if (r > 95 && g > 40 && b > 20 && 
          Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
          Math.abs(r - g) > 15 && r > g && r > b) {
        skinPixels++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      totalPixels++;
    });

    const skinRatio = skinPixels / totalPixels;
    
    if (skinRatio > 0.1 && maxX > minX && maxY > minY) {
      // Expand region slightly
      const padding = 20;
      return {
        x: Math.max(0, minX - padding),
        y: Math.max(0, minY - padding),
        width: Math.min(width, maxX - minX + 2 * padding),
        height: Math.min(height, maxY - minY + 2 * padding)
      };
    }

    return null;
  }

  /**
   * Detect face region using edge detection
   */
  async detectEdgeRegion(image) {
    const { width, height } = image.bitmap;
    
    // Simple edge detection by looking for high-contrast areas
    const edges = new Array(width * height).fill(0);
    
    image.scan(1, 1, width - 2, height - 2, function (x, y, idx) {
      const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      
      // Get neighboring pixels
      const neighbors = [
        (this.bitmap.data[idx - 4] + this.bitmap.data[idx - 3] + this.bitmap.data[idx - 2]) / 3, // left
        (this.bitmap.data[idx + 4] + this.bitmap.data[idx + 5] + this.bitmap.data[idx + 6]) / 3, // right
        (this.bitmap.data[idx - width * 4] + this.bitmap.data[idx - width * 4 + 1] + this.bitmap.data[idx - width * 4 + 2]) / 3, // up
        (this.bitmap.data[idx + width * 4] + this.bitmap.data[idx + width * 4 + 1] + this.bitmap.data[idx + width * 4 + 2]) / 3 // down
      ];
      
      const edgeStrength = neighbors.reduce((sum, neighbor) => sum + Math.abs(gray - neighbor), 0);
      edges[y * width + x] = edgeStrength;
    });

    // Find region with highest edge density (likely to contain facial features)
    let bestRegion = null;
    let bestScore = 0;
    
    const regionSize = Math.min(width, height) * 0.4;
    
    for (let y = 0; y < height - regionSize; y += 20) {
      for (let x = 0; x < width - regionSize; x += 20) {
        let edgeSum = 0;
        for (let dy = 0; dy < regionSize; dy += 5) {
          for (let dx = 0; dx < regionSize; dx += 5) {
            edgeSum += edges[(y + dy) * width + (x + dx)] || 0;
          }
        }
        
        if (edgeSum > bestScore) {
          bestScore = edgeSum;
          bestRegion = {
            x: x,
            y: y,
            width: regionSize,
            height: regionSize
          };
        }
      }
    }

    return bestRegion;
  }

  /**
   * Generate enhanced face embedding using multiple sophisticated features
   */
  async generateEnhancedEmbedding(image, region) {
    const embedding = new Array(256).fill(0); // Increased to 256 dimensions for better discrimination
    
    // Extract multiple types of sophisticated features
    const features = {
      lbp: this.extractLocalBinaryPatterns(image, region),        // 64 dimensions
      hog: this.extractHistogramOfGradients(image, region),       // 64 dimensions  
      gabor: this.extractGaborFeatures(image, region),            // 64 dimensions
      geometric: this.extractGeometricFeatures(image, region),    // 32 dimensions
      intensity: this.extractIntensityFeatures(image, region),    // 32 dimensions
    };

    // Combine features into embedding with careful weighting
    let idx = 0;
    
    // LBP features (most important for face recognition)
    for (let i = 0; i < Math.min(64, features.lbp.length); i++) {
      embedding[idx++] = features.lbp[i] * 1.2; // Higher weight
    }
    
    // HOG features (important for structural information)
    for (let i = 0; i < Math.min(64, features.hog.length); i++) {
      embedding[idx++] = features.hog[i] * 1.0;
    }
    
    // Gabor features (texture information)
    for (let i = 0; i < Math.min(64, features.gabor.length); i++) {
      embedding[idx++] = features.gabor[i] * 0.8;
    }
    
    // Geometric features (face proportions)
    for (let i = 0; i < Math.min(32, features.geometric.length); i++) {
      embedding[idx++] = features.geometric[i] * 1.1;
    }
    
    // Intensity features
    for (let i = 0; i < Math.min(32, features.intensity.length); i++) {
      embedding[idx++] = features.intensity[i] * 0.9;
    }

    // Apply PCA-like dimensionality reduction (simplified)
    const reducedEmbedding = this.applyDimensionalityReduction(embedding);
    
    // L2 normalize embedding for cosine similarity
    const norm = Math.sqrt(reducedEmbedding.reduce((sum, val) => sum + val * val, 0));
    return reducedEmbedding.map(val => norm > 0 ? val / norm : 0);
  }

  /**
   * Extract Local Binary Patterns (LBP) - excellent for face recognition
   */
  extractLocalBinaryPatterns(image, region) {
    const features = [];
    const { x, y, width, height } = region;
    const histogram = new Array(256).fill(0);
    
    // Convert region to grayscale and calculate LBP
    const grayData = [];
    image.scan(x, y, width, height, function (px, py, idx) {
      const gray = Math.round(0.299 * this.bitmap.data[idx] + 0.587 * this.bitmap.data[idx + 1] + 0.114 * this.bitmap.data[idx + 2]);
      grayData.push(gray);
    });
    
    // Calculate LBP for each pixel (excluding borders)
    for (let py = 1; py < height - 1; py++) {
      for (let px = 1; px < width - 1; px++) {
        const centerIdx = py * width + px;
        const center = grayData[centerIdx];
        
        let pattern = 0;
        const offsets = [-width-1, -width, -width+1, 1, width+1, width, width-1, -1];
        
        for (let i = 0; i < 8; i++) {
          const neighborIdx = centerIdx + offsets[i];
          if (neighborIdx >= 0 && neighborIdx < grayData.length) {
            if (grayData[neighborIdx] >= center) {
              pattern |= (1 << i);
            }
          }
        }
        
        histogram[pattern]++;
      }
    }
    
    // Normalize histogram
    const total = histogram.reduce((sum, val) => sum + val, 0);
    return histogram.map(val => total > 0 ? val / total : 0);
  }

  /**
   * Extract Histogram of Oriented Gradients (HOG)
   */
  extractHistogramOfGradients(image, region) {
    const { x, y, width, height } = region;
    const cellSize = Math.max(8, Math.floor(Math.min(width, height) / 8));
    const numBins = 9;
    const features = [];
    
    // Convert to grayscale
    const grayData = [];
    image.scan(x, y, width, height, function (px, py, idx) {
      const gray = Math.round(0.299 * this.bitmap.data[idx] + 0.587 * this.bitmap.data[idx + 1] + 0.114 * this.bitmap.data[idx + 2]);
      grayData.push(gray);
    });
    
    // Calculate gradients
    const gradX = [];
    const gradY = [];
    const magnitude = [];
    const orientation = [];
    
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const idx = py * width + px;
        
        // Calculate gradients (with boundary checks)
        const gx = px < width - 1 ? (grayData[idx + 1] || 0) - (px > 0 ? grayData[idx - 1] || 0 : 0) : 0;
        const gy = py < height - 1 ? (grayData[idx + width] || 0) - (py > 0 ? grayData[idx - width] || 0 : 0) : 0;
        
        gradX[idx] = gx;
        gradY[idx] = gy;
        magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
        orientation[idx] = Math.atan2(gy, gx) * 180 / Math.PI;
        if (orientation[idx] < 0) orientation[idx] += 180;
      }
    }
    
    // Calculate HOG for each cell
    for (let cellY = 0; cellY < Math.floor(height / cellSize); cellY++) {
      for (let cellX = 0; cellX < Math.floor(width / cellSize); cellX++) {
        const histogram = new Array(numBins).fill(0);
        
        for (let py = cellY * cellSize; py < (cellY + 1) * cellSize && py < height; py++) {
          for (let px = cellX * cellSize; px < (cellX + 1) * cellSize && px < width; px++) {
            const idx = py * width + px;
            const bin = Math.floor(orientation[idx] / (180 / numBins));
            const binIdx = Math.max(0, Math.min(numBins - 1, bin));
            histogram[binIdx] += magnitude[idx];
          }
        }
        
        // Normalize histogram
        const total = histogram.reduce((sum, val) => sum + val, 0);
        if (total > 0) {
          histogram.forEach(val => features.push(val / total));
        } else {
          histogram.forEach(() => features.push(0));
        }
      }
    }
    
    return features.slice(0, 64);
  }

  /**
   * Extract Gabor filter responses for texture analysis
   */
  extractGaborFeatures(image, region) {
    const { x, y, width, height } = region;
    const features = [];
    
    // Simple approximation of Gabor filters using different orientations
    const orientations = [0, 45, 90, 135];
    const frequencies = [0.1, 0.2, 0.3, 0.4];
    
    for (const orientation of orientations) {
      for (const frequency of frequencies) {
        let response = 0;
        let count = 0;
        
        image.scan(x, y, width, height, function (px, py, idx) {
          const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
          
          // Simple gabor-like response calculation
          const angle = orientation * Math.PI / 180;
          const rotatedX = (px - x - width/2) * Math.cos(angle) + (py - y - height/2) * Math.sin(angle);
          const rotatedY = -(px - x - width/2) * Math.sin(angle) + (py - y - height/2) * Math.cos(angle);
          
          const gaborResponse = Math.exp(-(rotatedX*rotatedX + rotatedY*rotatedY) / (2 * 100)) * 
                               Math.cos(2 * Math.PI * frequency * rotatedX) * gray / 255;
          
          response += gaborResponse;
          count++;
        });
        
        features.push(count > 0 ? response / count : 0);
      }
    }
    
    return features;
  }

  /**
   * Extract geometric features based on face proportions
   */
  extractGeometricFeatures(image, region) {
    const { x, y, width, height } = region;
    const features = [];
    
    // Face proportions and ratios
    features.push(width / height);                    // Aspect ratio
    features.push(width / image.bitmap.width);        // Relative width
    features.push(height / image.bitmap.height);      // Relative height
    features.push((x + width/2) / image.bitmap.width); // Center X position
    features.push((y + height/2) / image.bitmap.height); // Center Y position
    
    // Intensity distribution features
    let topHalf = 0, bottomHalf = 0, leftHalf = 0, rightHalf = 0;
    let count = 0;
    
    image.scan(x, y, width, height, function (px, py, idx) {
      const intensity = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      
      if (py - y < height / 2) topHalf += intensity;
      else bottomHalf += intensity;
      
      if (px - x < width / 2) leftHalf += intensity;
      else rightHalf += intensity;
      
      count++;
    });
    
    if (count > 0) {
      features.push(topHalf / (count/2));     // Average top half intensity
      features.push(bottomHalf / (count/2));  // Average bottom half intensity
      features.push(leftHalf / (count/2));    // Average left half intensity
      features.push(rightHalf / (count/2));   // Average right half intensity
      features.push((topHalf - bottomHalf) / count);  // Top-bottom contrast
      features.push((leftHalf - rightHalf) / count);  // Left-right contrast
    }
    
    // Add statistical moments
    const pixels = [];
    image.scan(x, y, width, height, function (px, py, idx) {
      pixels.push((this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3);
    });
    
    if (pixels.length > 0) {
      const mean = pixels.reduce((sum, val) => sum + val, 0) / pixels.length;
      const variance = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pixels.length;
      const skewness = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 3), 0) / (pixels.length * Math.pow(variance, 1.5));
      const kurtosis = pixels.reduce((sum, val) => sum + Math.pow(val - mean, 4), 0) / (pixels.length * Math.pow(variance, 2));
      
      features.push(mean / 255);
      features.push(Math.sqrt(variance) / 255);
      features.push(skewness);
      features.push(kurtosis);
    }
    
    // Pad or truncate to exactly 32 features
    while (features.length < 32) features.push(0);
    return features.slice(0, 32);
  }

  /**
   * Extract intensity-based features
   */
  extractIntensityFeatures(image, region) {
    const { x, y, width, height } = region;
    const features = [];
    const histogram = new Array(32).fill(0); // 32-bin intensity histogram
    
    // Build intensity histogram
    let pixelCount = 0;
    image.scan(x, y, width, height, function (px, py, idx) {
      const intensity = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      const bin = Math.min(31, Math.floor(intensity / 8)); // 256/32 = 8
      histogram[bin]++;
      pixelCount++;
    });
    
    // Normalize histogram
    for (let i = 0; i < histogram.length; i++) {
      features.push(pixelCount > 0 ? histogram[i] / pixelCount : 0);
    }
    
    return features;
  }

  /**
   * Apply simple dimensionality reduction (PCA-like)
   */
  applyDimensionalityReduction(embedding) {
    // Simple feature selection and compression
    const reduced = new Array(128);
    
    // Take every other feature and combine with weighted neighbors
    for (let i = 0; i < 128; i++) {
      const sourceIdx = i * 2;
      if (sourceIdx < embedding.length) {
        reduced[i] = embedding[sourceIdx];
        
        // Add weighted contribution from neighbors
        if (sourceIdx + 1 < embedding.length) {
          reduced[i] = reduced[i] * 0.8 + embedding[sourceIdx + 1] * 0.2;
        }
      } else {
        reduced[i] = 0;
      }
    }
    
    return reduced;
  }

  /**
   * Extract texture features from image region
   */
  extractTextureFeatures(image, region) {
    const features = [];
    const { x, y, width, height } = region;
    
    // Calculate local binary patterns
    image.scan(x + 1, y + 1, width - 2, height - 2, function (px, py, idx) {
      const center = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      
      let pattern = 0;
      const neighbors = [
        [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1]
      ];
      
      neighbors.forEach((neighbor, i) => {
        const nx = px + neighbor[0];
        const ny = py + neighbor[1];
        if (nx >= 0 && nx < image.bitmap.width && ny >= 0 && ny < image.bitmap.height) {
          const nIdx = (ny * image.bitmap.width + nx) * 4;
          const neighborGray = (this.bitmap.data[nIdx] + this.bitmap.data[nIdx + 1] + this.bitmap.data[nIdx + 2]) / 3;
          if (neighborGray >= center) {
            pattern |= (1 << i);
          }
        }
      });
      
      features.push(pattern / 255);
    });

    return features.slice(0, 32);
  }

  /**
   * Extract color distribution features
   */
  extractColorFeatures(image, region) {
    const features = [];
    const { x, y, width, height } = region;
    
    const colorBins = { r: new Array(8).fill(0), g: new Array(8).fill(0), b: new Array(8).fill(0) };
    let pixelCount = 0;
    
    image.scan(x, y, width, height, function (px, py, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      
      colorBins.r[Math.floor(r / 32)]++;
      colorBins.g[Math.floor(g / 32)]++;
      colorBins.b[Math.floor(b / 32)]++;
      pixelCount++;
    });

    // Normalize histograms
    Object.values(colorBins).forEach(bins => {
      bins.forEach(count => features.push(count / pixelCount));
    });

    return features;
  }

  /**
   * Extract gradient features
   */
  extractGradientFeatures(image, region) {
    const features = [];
    const { x, y, width, height } = region;
    
    image.scan(x + 1, y + 1, width - 2, height - 2, function (px, py, idx) {
      const current = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      
      // Calculate gradients
      const rightIdx = idx + 4;
      const bottomIdx = idx + image.bitmap.width * 4;
      
      if (rightIdx < this.bitmap.data.length && bottomIdx < this.bitmap.data.length) {
        const right = (this.bitmap.data[rightIdx] + this.bitmap.data[rightIdx + 1] + this.bitmap.data[rightIdx + 2]) / 3;
        const bottom = (this.bitmap.data[bottomIdx] + this.bitmap.data[bottomIdx + 1] + this.bitmap.data[bottomIdx + 2]) / 3;
        
        const gx = right - current;
        const gy = bottom - current;
        const magnitude = Math.sqrt(gx * gx + gy * gy);
        
        features.push(magnitude / 255);
      }
    });

    return features.slice(0, 32);
  }

  /**
   * Extract local pattern features
   */
  extractLocalFeatures(image, region) {
    const features = [];
    const { x, y, width, height } = region;
    
    // Divide region into grid and extract statistics
    const gridSize = 4;
    const cellWidth = Math.floor(width / gridSize);
    const cellHeight = Math.floor(height / gridSize);
    
    for (let gy = 0; gy < gridSize; gy++) {
      for (let gx = 0; gx < gridSize; gx++) {
        const cellX = x + gx * cellWidth;
        const cellY = y + gy * cellHeight;
        
        let sum = 0, count = 0, variance = 0;
        
        // Calculate mean
        image.scan(cellX, cellY, cellWidth, cellHeight, function (px, py, idx) {
          const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
          sum += gray;
          count++;
        });
        
        const mean = count > 0 ? sum / count : 0;
        
        // Calculate variance
        image.scan(cellX, cellY, cellWidth, cellHeight, function (px, py, idx) {
          const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
          variance += (gray - mean) * (gray - mean);
        });
        
        variance = count > 0 ? variance / count : 0;
        
        features.push(mean / 255, Math.sqrt(variance) / 255);
      }
    }

    return features;
  }

  /**
   * Assess image quality for the face region
   */
  async assessImageQuality(image, region) {
    const { width, height } = region;
    
    // Sharpness assessment using Laplacian variance
    const sharpness = this.calculateSharpness(image, region);
    
    // Lighting assessment
    const lighting = this.calculateLightingQuality(image, region);
    
    // Size quality
    const sizeQuality = Math.min(1.0, Math.min(width, height) / 160);
    
    // Overall quality
    const overall = (sharpness * 0.4 + lighting * 0.4 + sizeQuality * 0.2);
    
    return {
      overall: Math.round(overall * 100) / 100,
      sharpness: Math.round(sharpness * 100) / 100,
      lighting: Math.round(lighting * 100) / 100,
      pose: 0.8, // Default pose quality for fallback
      size: Math.round(sizeQuality * 100) / 100
    };
  }

  /**
   * Calculate sharpness using Laplacian variance
   */
  calculateSharpness(image, region) {
    const { x, y, width, height } = region;
    let variance = 0;
    let count = 0;
    
    image.scan(x + 1, y + 1, width - 2, height - 2, function (px, py, idx) {
      const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      
      // Laplacian kernel
      const laplacian = -4 * gray +
        (this.bitmap.data[idx - 4] + this.bitmap.data[idx - 3] + this.bitmap.data[idx - 2]) / 3 +
        (this.bitmap.data[idx + 4] + this.bitmap.data[idx + 5] + this.bitmap.data[idx + 6]) / 3 +
        (this.bitmap.data[idx - image.bitmap.width * 4] + this.bitmap.data[idx - image.bitmap.width * 4 + 1] + this.bitmap.data[idx - image.bitmap.width * 4 + 2]) / 3 +
        (this.bitmap.data[idx + image.bitmap.width * 4] + this.bitmap.data[idx + image.bitmap.width * 4 + 1] + this.bitmap.data[idx + image.bitmap.width * 4 + 2]) / 3;
      
      variance += laplacian * laplacian;
      count++;
    });
    
    const sharpnessScore = count > 0 ? variance / count : 0;
    return Math.min(1.0, sharpnessScore / 1000); // Normalize
  }

  /**
   * Calculate lighting quality
   */
  calculateLightingQuality(image, region) {
    const { x, y, width, height } = region;
    let sum = 0;
    let count = 0;
    let variance = 0;
    
    // Calculate mean brightness
    image.scan(x, y, width, height, function (px, py, idx) {
      const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      sum += gray;
      count++;
    });
    
    const mean = count > 0 ? sum / count : 0;
    
    // Calculate variance
    image.scan(x, y, width, height, function (px, py, idx) {
      const gray = (this.bitmap.data[idx] + this.bitmap.data[idx + 1] + this.bitmap.data[idx + 2]) / 3;
      variance += (gray - mean) * (gray - mean);
    });
    
    variance = count > 0 ? variance / count : 0;
    
    // Good lighting: not too dark, not too bright, reasonable contrast
    const brightnessScore = 1.0 - Math.abs(mean - 128) / 128; // Penalize extreme brightness
    const contrastScore = Math.min(1.0, Math.sqrt(variance) / 50); // Reward good contrast
    
    return (brightnessScore + contrastScore) / 2;
  }

  /**
   * Estimate basic pose information
   */
  estimateBasicPose(region, imageSize) {
    const centerX = region.x + region.width / 2;
    const centerY = region.y + region.height / 2;
    
    // Simple pose estimation based on position
    const relativeX = centerX / imageSize.width;
    const relativeY = centerY / imageSize.height;
    
    // Estimate yaw based on horizontal position
    const yaw = (relativeX - 0.5) * 30; // Max 15 degrees left/right
    
    // Estimate pitch based on vertical position  
    const pitch = (relativeY - 0.4) * 20; // Max 10 degrees up/down (0.4 because faces are usually in upper part)
    
    return {
      yaw: Math.round(yaw),
      pitch: Math.round(pitch),
      roll: 0,
      frontal: Math.abs(yaw) < 15 && Math.abs(pitch) < 15
    };
  }

  /**
   * Validate face detection result
   */
  validateDetection(detection) {
    if (!detection.success || !detection.faces || detection.faces.length === 0) {
      return { valid: false, reason: 'No faces detected' };
    }

    const face = detection.faces[0];
    
    if (face.confidence < 0.5) {
      return { valid: false, reason: 'Face confidence too low' };
    }

    if (face.quality.overall < 0.6) {
      return { valid: false, reason: 'Face quality insufficient' };
    }

    if (face.size < 100) {
      return { valid: false, reason: 'Face size too small' };
    }

    return { valid: true };
  }

  /**
   * Extract multiple descriptors for training
   */
  async extractMultipleDescriptors(imageBuffers) {
    const descriptors = [];
    
    for (const buffer of imageBuffers) {
      const detection = await this.detectFaces(buffer, {
        requireDescriptors: true,
        maxFaces: 1
      });
      
      if (detection.success && detection.faces.length > 0) {
        const face = detection.faces[0];
        if (face.descriptor) {
          descriptors.push({
            descriptor: face.descriptor,
            quality: face.quality.overall,
            metadata: face
          });
        }
      }
    }

    return descriptors;
  }
}

module.exports = new FaceDetectionService();

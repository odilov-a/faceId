/**
 * Custom Haar Cascade Face Detection Service
 * Implements Haar-like features detection using the provided XML cascade file
 */
const jimp = require('jimp');
const fs = require('fs').promises;
const path = require('path');
const { DOMParser } = require('xmldom');

class HaarCascadeDetector {
  constructor() {
    this.cascade = null;
    this.cascadeLoaded = false;
    this.cascadePath = path.join(__dirname, '../data/haarcascade_frontalface_alt.xml');
  }

  /**
   * Load and parse the Haar Cascade XML file
   */
  async loadCascade() {
    try {
      console.log('Loading Haar Cascade from:', this.cascadePath);
      const xmlContent = await fs.readFile(this.cascadePath, 'utf8');
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
      
      // Parse cascade structure
      this.cascade = this.parseCascadeXML(xmlDoc);
      this.cascadeLoaded = true;
      
      console.log(`Haar Cascade loaded: ${this.cascade.stages.length} stages, ${this.cascade.width}x${this.cascade.height} window`);
      return true;
    } catch (error) {
      console.error('Failed to load Haar Cascade:', error.message);
      return false;
    }
  }

  /**
   * Parse the Haar Cascade XML structure
   */
  parseCascadeXML(xmlDoc) {
    const storageElement = xmlDoc.getElementsByTagName('opencv_storage')[0];
    if (!storageElement) {
      throw new Error('Invalid Haar Cascade XML: missing opencv_storage element');
    }
    
    const cascadeElement = storageElement.getElementsByTagName('cascade')[0];
    if (!cascadeElement) {
      throw new Error('Invalid Haar Cascade XML: missing cascade element');
    }
    
    const widthElement = cascadeElement.getElementsByTagName('width')[0];
    const heightElement = cascadeElement.getElementsByTagName('height')[0];
    
    if (!widthElement || !heightElement) {
      throw new Error('Invalid Haar Cascade XML: missing width or height');
    }
    
    const width = parseInt(widthElement.textContent);
    const height = parseInt(heightElement.textContent);
    
    const stagesElement = cascadeElement.getElementsByTagName('stages')[0];
    if (!stagesElement) {
      throw new Error('Invalid Haar Cascade XML: missing stages element');
    }
    
    const stages = [];
    
    // Parse first few stages (simplified for performance)
    const stageElements = stagesElement.getElementsByTagName('_');
    const maxStages = Math.min(5, stageElements.length); // Use first 5 stages for better performance
    
    for (let i = 0; i < maxStages; i++) {
      const stageElement = stageElements[i];
      const thresholdElement = stageElement.getElementsByTagName('stageThreshold')[0];
      
      if (!thresholdElement) {
        console.warn(`Stage ${i} missing threshold, skipping`);
        continue;
      }
      
      const threshold = parseFloat(thresholdElement.textContent);
      
      const weakClassifiers = [];
      const weakClassifiersElement = stageElement.getElementsByTagName('weakClassifiers')[0];
      
      if (weakClassifiersElement) {
        const classifierElements = weakClassifiersElement.getElementsByTagName('_');
        
        // Limit weak classifiers for performance
        const maxClassifiers = Math.min(10, classifierElements.length);
        
        for (let j = 0; j < maxClassifiers; j++) {
          const classifierElement = classifierElements[j];
          const internalNodesElement = classifierElement.getElementsByTagName('internalNodes')[0];
          const leafValuesElement = classifierElement.getElementsByTagName('leafValues')[0];
          
          if (internalNodesElement && leafValuesElement) {
            // Parse internal nodes (simplified)
            const nodeText = internalNodesElement.textContent.trim();
            const nodeValues = nodeText.split(/\s+/).map(x => parseFloat(x));
            
            // Parse leaf values
            const leafText = leafValuesElement.textContent.trim();
            const leafValues = leafText.split(/\s+/).map(x => parseFloat(x));
            
            if (nodeValues.length >= 4 && leafValues.length >= 2) {
              weakClassifiers.push({
                feature: {
                  rectangles: [{
                    x: 0, y: 0, width: 20, height: 20, weight: 1
                  }]
                },
                threshold: nodeValues[3] || 0,
                leftVal: leafValues[0],
                rightVal: leafValues[1]
              });
            }
          }
        }
      }
      
      stages.push({
        threshold,
        weakClassifiers
      });
    }
    
    console.log(`Parsed ${stages.length} stages with ${stages.reduce((sum, s) => sum + s.weakClassifiers.length, 0)} total classifiers`);
    
    return {
      width,
      height,
      stages
    };
  }

  /**
   * Parse Haar-like feature from XML
   */
  parseFeature(featureElement) {
    const tilted = featureElement.getElementsByTagName('tilted')[0].textContent === '1';
    const rectsElement = featureElement.getElementsByTagName('rects')[0];
    const rectElements = rectsElement.getElementsByTagName('_');
    
    const rectangles = [];
    for (let i = 0; i < rectElements.length; i++) {
      const rectText = rectElements[i].textContent.trim();
      const parts = rectText.split(' ').map(x => parseFloat(x));
      rectangles.push({
        x: parts[0],
        y: parts[1],
        width: parts[2],
        height: parts[3],
        weight: parts[4]
      });
    }
    
    return {
      tilted,
      rectangles
    };
  }

  /**
   * Detect faces using the loaded Haar Cascade
   */
  async detectFaces(imageBuffer, options = {}) {
    if (!this.cascadeLoaded) {
      const loaded = await this.loadCascade();
      if (!loaded) {
        throw new Error('Failed to load Haar Cascade');
      }
    }

    const {
      scaleFactor = 1.1,
      minNeighbors = 3,
      minSize = { width: 80, height: 80 },
      maxSize = null
    } = options;

    try {
      const image = await jimp.read(imageBuffer);
      const grayImage = this.convertToGrayIntegral(image);
      
      const detections = await this.detectAtMultipleScales(
        grayImage, 
        scaleFactor, 
        minNeighbors, 
        minSize, 
        maxSize
      );
      
      // Convert detections to expected format
      return detections.map(detection => ({
        x: detection.x,
        y: detection.y,
        width: detection.width,
        height: detection.height,
        confidence: detection.confidence || 0.8
      }));
      
    } catch (error) {
      throw new Error(`Haar Cascade detection failed: ${error.message}`);
    }
  }

  /**
   * Convert image to grayscale and compute integral image
   */
  convertToGrayIntegral(image) {
    const { width, height } = image.bitmap;
    const gray = new Array(width * height);
    const integral = new Array((width + 1) * (height + 1)).fill(0);
    
    // Convert to grayscale
    image.scan(0, 0, width, height, function (x, y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      const grayValue = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      gray[y * width + x] = grayValue;
    });
    
    // Compute integral image
    for (let y = 1; y <= height; y++) {
      for (let x = 1; x <= width; x++) {
        const grayIdx = (y - 1) * width + (x - 1);
        const integralIdx = y * (width + 1) + x;
        const aboveIdx = (y - 1) * (width + 1) + x;
        const leftIdx = y * (width + 1) + (x - 1);
        const diagIdx = (y - 1) * (width + 1) + (x - 1);
        
        integral[integralIdx] = gray[grayIdx] + integral[aboveIdx] + integral[leftIdx] - integral[diagIdx];
      }
    }
    
    return {
      width,
      height,
      gray,
      integral
    };
  }

  /**
   * Detect faces at multiple scales
   */
  async detectAtMultipleScales(grayImage, scaleFactor, minNeighbors, minSize, maxSize) {
    const detections = [];
    const { width, height } = grayImage;
    
    let scale = 1.0;
    const windowWidth = this.cascade.width;
    const windowHeight = this.cascade.height;
    
    // Multi-scale detection
    while (scale * windowWidth < width && scale * windowHeight < height) {
      const stepSize = Math.max(1, Math.floor(scale * 2));
      const scaledWindowWidth = Math.floor(scale * windowWidth);
      const scaledWindowHeight = Math.floor(scale * windowHeight);
      
      // Skip if window is too small or too large
      if (scaledWindowWidth < minSize.width || scaledWindowHeight < minSize.height) {
        scale *= scaleFactor;
        continue;
      }
      
      if (maxSize && (scaledWindowWidth > maxSize.width || scaledWindowHeight > maxSize.height)) {
        break;
      }
      
      // Scan the image
      for (let y = 0; y <= height - scaledWindowHeight; y += stepSize) {
        for (let x = 0; x <= width - scaledWindowWidth; x += stepSize) {
          if (this.evaluateWindow(grayImage, x, y, scale)) {
            detections.push({
              x,
              y,
              width: scaledWindowWidth,
              height: scaledWindowHeight,
              confidence: 0.8
            });
          }
        }
      }
      
      scale *= scaleFactor;
    }
    
    // Group nearby detections (simplified non-maximum suppression)
    return this.groupDetections(detections, minNeighbors);
  }

  /**
   * Evaluate a window using the Haar Cascade
   */
  evaluateWindow(grayImage, x, y, scale) {
    const { integral, width } = grayImage;
    
    // Evaluate each stage
    for (const stage of this.cascade.stages) {
      let stageSum = 0;
      
      // Evaluate weak classifiers in this stage
      for (const classifier of stage.weakClassifiers) {
        const featureValue = this.computeFeature(integral, width, x, y, scale, classifier.feature);
        const classifierOutput = featureValue < classifier.threshold ? classifier.leftVal : classifier.rightVal;
        stageSum += classifierOutput;
      }
      
      // If stage fails, reject window
      if (stageSum < stage.threshold) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Compute Haar-like feature value
   */
  computeFeature(integral, width, x, y, scale, feature) {
    let sum = 0;
    
    for (const rect of feature.rectangles) {
      const scaledX = Math.floor(x + rect.x * scale);
      const scaledY = Math.floor(y + rect.y * scale);
      const scaledWidth = Math.floor(rect.width * scale);
      const scaledHeight = Math.floor(rect.height * scale);
      
      const rectSum = this.getRectangleSum(integral, width, scaledX, scaledY, scaledWidth, scaledHeight);
      sum += rectSum * rect.weight;
    }
    
    return sum;
  }

  /**
   * Get sum of rectangle using integral image
   */
  getRectangleSum(integral, width, x, y, w, h) {
    const integralWidth = width + 1;
    const topLeft = y * integralWidth + x;
    const topRight = y * integralWidth + (x + w);
    const bottomLeft = (y + h) * integralWidth + x;
    const bottomRight = (y + h) * integralWidth + (x + w);
    
    return integral[bottomRight] - integral[topRight] - integral[bottomLeft] + integral[topLeft];
  }

  /**
   * Group nearby detections using simplified non-maximum suppression
   */
  groupDetections(detections, minNeighbors) {
    if (detections.length === 0) return [];
    
    const grouped = [];
    const used = new Array(detections.length).fill(false);
    
    for (let i = 0; i < detections.length; i++) {
      if (used[i]) continue;
      
      const group = [detections[i]];
      used[i] = true;
      
      // Find nearby detections
      for (let j = i + 1; j < detections.length; j++) {
        if (used[j]) continue;
        
        const overlap = this.calculateOverlap(detections[i], detections[j]);
        if (overlap > 0.3) {
          group.push(detections[j]);
          used[j] = true;
        }
      }
      
      // Only keep groups with enough neighbors
      if (group.length >= minNeighbors) {
        // Average the group
        const avgDetection = this.averageDetections(group);
        grouped.push(avgDetection);
      }
    }
    
    return grouped;
  }

  /**
   * Calculate overlap between two detections
   */
  calculateOverlap(det1, det2) {
    const x1 = Math.max(det1.x, det2.x);
    const y1 = Math.max(det1.y, det2.y);
    const x2 = Math.min(det1.x + det1.width, det2.x + det2.width);
    const y2 = Math.min(det1.y + det1.height, det2.y + det2.height);
    
    if (x2 <= x1 || y2 <= y1) return 0;
    
    const intersectionArea = (x2 - x1) * (y2 - y1);
    const det1Area = det1.width * det1.height;
    const det2Area = det2.width * det2.height;
    const unionArea = det1Area + det2Area - intersectionArea;
    
    return intersectionArea / unionArea;
  }

  /**
   * Average a group of detections
   */
  averageDetections(detections) {
    const avgX = detections.reduce((sum, det) => sum + det.x, 0) / detections.length;
    const avgY = detections.reduce((sum, det) => sum + det.y, 0) / detections.length;
    const avgWidth = detections.reduce((sum, det) => sum + det.width, 0) / detections.length;
    const avgHeight = detections.reduce((sum, det) => sum + det.height, 0) / detections.length;
    
    return {
      x: Math.round(avgX),
      y: Math.round(avgY),
      width: Math.round(avgWidth),
      height: Math.round(avgHeight),
      confidence: 0.9,
      neighbors: detections.length
    };
  }
}

module.exports = HaarCascadeDetector;

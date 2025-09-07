/**
 * Test script to verify improved face recognition for multiple people
 * This script tests the enhanced face descriptors and matching system
 */

const FaceDetectionService = require('./src/services/face-detection');
const faceIndex = require('./src/services/face-index');
const { FaceUtils, FaceConfig } = require('./src/utils/face-utils');
const jimp = require('jimp');

async function testMultiPersonFaceRecognition() {
  console.log('=== Enhanced Face Recognition Multi-Person Test ===\n');
  
  try {
    // Initialize services
    console.log('Initializing face detection service...');
    await FaceDetectionService.initialize();
    
    console.log('Face detection method:', FaceDetectionService.useHaarCascade ? 'Haar Cascade' : 'Fallback');
    console.log('Current thresholds:', {
      cosineThreshold: FaceConfig.COSINE_DISTANCE_THRESHOLD,
      distanceMargin: FaceConfig.DISTANCE_MARGIN
    });
    console.log('');

    // Test descriptor generation
    console.log('Testing enhanced descriptor generation...');
    
    // Create test images with different characteristics to simulate different people
    const testImages = await createTestImages();
    const descriptors = [];
    
    console.log(`Created ${testImages.length} test images representing different people\n`);

    // Process each test image
    for (let i = 0; i < testImages.length; i++) {
      console.log(`Processing person ${i + 1}...`);
      
      try {
        const detection = await FaceDetectionService.detectFaces(testImages[i].buffer, {
          minFaceSize: 80,
          maxFaces: 1,
          requireDescriptors: true
        });

        if (detection.success && detection.faces.length > 0) {
          const face = detection.faces[0];
          descriptors.push({
            personId: i + 1,
            descriptor: face.descriptor,
            confidence: face.confidence,
            quality: face.quality.overall,
            method: detection.metadata.method,
            characteristics: testImages[i].characteristics
          });
          
          console.log(`  ✅ Success - Confidence: ${face.confidence.toFixed(3)}, Quality: ${face.quality.overall.toFixed(3)}`);
          console.log(`  📊 Method: ${detection.metadata.method}, Descriptor size: ${face.descriptor.length}`);
        } else {
          console.log(`  ❌ Failed to detect face: ${detection.error}`);
        }
      } catch (error) {
        console.log(`  ❌ Error processing person ${i + 1}: ${error.message}`);
      }
    }

    console.log(`\nGenerated ${descriptors.length} descriptors from ${testImages.length} test images\n`);

    // Test descriptor discrimination
    console.log('Testing descriptor discrimination (how well they distinguish between people)...');
    
    if (descriptors.length >= 2) {
      // Calculate distances between different people's descriptors
      const distances = [];
      
      for (let i = 0; i < descriptors.length; i++) {
        for (let j = i + 1; j < descriptors.length; j++) {
          const distance = FaceUtils.cosineDistance(descriptors[i].descriptor, descriptors[j].descriptor);
          distances.push({
            person1: descriptors[i].personId,
            person2: descriptors[j].personId,
            distance: distance,
            chars1: descriptors[i].characteristics,
            chars2: descriptors[j].characteristics
          });
          
          console.log(`Distance between person ${descriptors[i].personId} and ${descriptors[j].personId}: ${distance.toFixed(4)}`);
          console.log(`  Person ${descriptors[i].personId}: ${descriptors[i].characteristics}`);
          console.log(`  Person ${descriptors[j].personId}: ${descriptors[j].characteristics}`);
          
          if (distance < FaceConfig.COSINE_DISTANCE_THRESHOLD) {
            console.log(`  🚨 WARNING: Distance ${distance.toFixed(4)} is below threshold ${FaceConfig.COSINE_DISTANCE_THRESHOLD} - might be recognized as same person`);
          } else {
            console.log(`  ✅ Good separation - above threshold ${FaceConfig.COSINE_DISTANCE_THRESHOLD}`);
          }
          console.log('');
        }
      }

      // Analyze results
      const avgDistance = distances.reduce((sum, d) => sum + d.distance, 0) / distances.length;
      const minDistance = Math.min(...distances.map(d => d.distance));
      const maxDistance = Math.max(...distances.map(d => d.distance));
      
      console.log('📈 Discrimination Analysis:');
      console.log(`  Average distance between different people: ${avgDistance.toFixed(4)}`);
      console.log(`  Minimum distance: ${minDistance.toFixed(4)}`);
      console.log(`  Maximum distance: ${maxDistance.toFixed(4)}`);
      console.log(`  Current threshold: ${FaceConfig.COSINE_DISTANCE_THRESHOLD}`);
      console.log('');

      if (minDistance > FaceConfig.COSINE_DISTANCE_THRESHOLD) {
        console.log('✅ EXCELLENT: All people are well-separated above the threshold');
      } else if (avgDistance > FaceConfig.COSINE_DISTANCE_THRESHOLD) {
        console.log('⚠️  GOOD: Average separation is above threshold, but some pairs are close');
      } else {
        console.log('❌ POOR: Descriptors are not discriminative enough - people may be confused');
        console.log('💡 Suggestion: The enhanced descriptors need further tuning or threshold adjustment');
      }
    }

    // Test same person recognition (descriptor consistency)
    console.log('\n🔄 Testing same-person consistency...');
    if (descriptors.length > 0) {
      // Simulate processing the same person's image multiple times (with slight variations)
      const firstPerson = descriptors[0];
      console.log(`Re-processing person ${firstPerson.personId} to test consistency...`);
      
      try {
        // Add some noise to simulate slight image variations
        const slightlyModifiedImage = await addImageNoise(testImages[0].buffer, 0.05);
        const reDetection = await FaceDetectionService.detectFaces(slightlyModifiedImage, {
          minFaceSize: 80,
          maxFaces: 1,
          requireDescriptors: true
        });

        if (reDetection.success && reDetection.faces.length > 0) {
          const samePersonDistance = FaceUtils.cosineDistance(
            firstPerson.descriptor, 
            reDetection.faces[0].descriptor
          );
          
          console.log(`Distance to same person (slightly modified): ${samePersonDistance.toFixed(4)}`);
          
          if (samePersonDistance < FaceConfig.COSINE_DISTANCE_THRESHOLD) {
            console.log('✅ GOOD: Same person correctly recognized (below threshold)');
          } else {
            console.log('❌ POOR: Same person not recognized (above threshold)');
            console.log('💡 This suggests descriptors are too sensitive to minor variations');
          }
        }
      } catch (error) {
        console.log(`Error in consistency test: ${error.message}`);
      }
    }

    // Recommendations
    console.log('\n📋 System Status & Recommendations:');
    console.log('Detection Method:', FaceDetectionService.useHaarCascade ? 'Haar Cascade (Good)' : 'Fallback (Basic)');
    console.log('Descriptor Improvements:', '✅ Enhanced with LBP, HOG, Gabor, Geometric features');
    console.log('Descriptor Size:', '128 dimensions (after reduction)');
    console.log('Current Threshold:', FaceConfig.COSINE_DISTANCE_THRESHOLD);
    
    if (descriptors.length < 2) {
      console.log('\n⚠️  Limited testing due to insufficient face detection');
      console.log('💡 Try testing with actual photos for more comprehensive results');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

async function createTestImages() {
  // Create synthetic test images with different characteristics to represent different people
  const images = [];
  
  // Person 1: Bright, centered rectangle (simulating face)
  const img1 = new jimp(200, 200, 0xFFFFFFFF);
  // Draw a face-like rectangle
  for (let y = 60; y < 140; y++) {
    for (let x = 60; x < 140; x++) {
      const distance = Math.sqrt((x-100)*(x-100) + (y-100)*(y-100));
      if (distance < 40) {
        img1.setPixelColor(0x8B4513FF, x, y); // Brown face color
      }
    }
  }
  // Add eyes
  for (let y = 80; y < 90; y++) {
    for (let x = 80; x < 90; x++) img1.setPixelColor(0x000000FF, x, y);
    for (let x = 110; x < 120; x++) img1.setPixelColor(0x000000FF, x, y);
  }
  images.push({
    buffer: await img1.getBufferAsync(jimp.MIME_JPEG),
    characteristics: 'bright, centered, medium size'
  });

  // Person 2: Darker, offset
  const img2 = new jimp(200, 200, 0x808080FF);
  for (let y = 50; y < 110; y++) {
    for (let x = 90; x < 150; x++) {
      const distance = Math.sqrt((x-120)*(x-120) + (y-80)*(y-80));
      if (distance < 30) {
        img2.setPixelColor(0xCD853FFF, x, y); // Different face color
      }
    }
  }
  // Add eyes  
  for (let y = 65; y < 75; y++) {
    for (let x = 105; x < 115; x++) img2.setPixelColor(0x000000FF, x, y);
    for (let x = 125; x < 135; x++) img2.setPixelColor(0x000000FF, x, y);
  }
  images.push({
    buffer: await img2.getBufferAsync(jimp.MIME_JPEG),
    characteristics: 'darker, offset, smaller size'
  });

  // Person 3: Large, different proportions
  const img3 = new jimp(200, 200, 0xF0F0F0FF);
  for (let y = 40; y < 160; y++) {
    for (let x = 40; x < 160; x++) {
      const distance = Math.sqrt((x-100)*(x-100) + (y-100)*(y-100));
      if (distance < 60) {
        img3.setPixelColor(0xDEB887FF, x, y); // Large face
      }
    }
  }
  // Add eyes
  for (let y = 85; y < 105; y++) {
    for (let x = 70; x < 90; x++) img3.setPixelColor(0x000000FF, x, y);
    for (let x = 110; x < 130; x++) img3.setPixelColor(0x000000FF, x, y);
  }
  images.push({
    buffer: await img3.getBufferAsync(jimp.MIME_JPEG),
    characteristics: 'large, different proportions'
  });

  return images;
}

async function addImageNoise(imageBuffer, noiseLevel = 0.05) {
  const image = await jimp.read(imageBuffer);
  
  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
    // Add small random noise to each pixel
    const noise = (Math.random() - 0.5) * noiseLevel * 255;
    this.bitmap.data[idx] = Math.max(0, Math.min(255, this.bitmap.data[idx] + noise));
    this.bitmap.data[idx + 1] = Math.max(0, Math.min(255, this.bitmap.data[idx + 1] + noise));
    this.bitmap.data[idx + 2] = Math.max(0, Math.min(255, this.bitmap.data[idx + 2] + noise));
  });
  
  return await image.getBufferAsync(jimp.MIME_JPEG);
}

// Run the test
testMultiPersonFaceRecognition();

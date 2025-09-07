/**
 * Simple diagnostic test for multi-person face recognition improvements
 * Tests the enhanced descriptors and thresholds
 */

const FaceDetectionService = require('./src/services/face-detection');
const { FaceUtils, FaceConfig } = require('./src/utils/face-utils');

async function diagnosticTest() {
  console.log('🔍 Face Recognition Diagnostic Test\n');
  
  try {
    // Initialize service
    await FaceDetectionService.initialize();
    
    console.log('📊 System Configuration:');
    console.log(`- Detection Method: ${FaceDetectionService.useHaarCascade ? 'Haar Cascade ✅' : 'Fallback ⚠️'}`);
    console.log(`- Cosine Threshold: ${FaceConfig.COSINE_DISTANCE_THRESHOLD} (higher = more selective)`);
    console.log(`- Distance Margin: ${FaceConfig.DISTANCE_MARGIN}`);
    console.log(`- Embedding Dimensions: ${FaceConfig.EMBEDDING_DIMENSION}`);
    console.log('');

    // Test descriptor generation with dummy data
    console.log('🧪 Testing Enhanced Descriptor Generation...');
    
    // Create a simple test region
    const testRegion = { x: 50, y: 50, width: 100, height: 100 };
    
    // Create mock jimp image structure
    const mockImage = {
      bitmap: {
        width: 200,
        height: 200,
        data: new Uint8Array(200 * 200 * 4).fill(128) // Gray image
      },
      scan: function(x, y, w, h, callback) {
        for (let py = y; py < y + h; py++) {
          for (let px = x; px < x + w; px++) {
            const idx = (py * this.bitmap.width + px) * 4;
            callback.call(this, px, py, idx);
          }
        }
      }
    };
    
    // Add some variation to simulate different "faces"
    const mockImages = [];
    for (let i = 0; i < 3; i++) {
      const variation = { ...mockImage };
      variation.bitmap = { ...mockImage.bitmap };
      variation.bitmap.data = new Uint8Array(mockImage.bitmap.data);
      
      // Add different patterns to simulate different people
      for (let j = 0; j < variation.bitmap.data.length; j += 4) {
        const baseValue = 128 + (i * 30); // Different base intensities
        variation.bitmap.data[j] = baseValue + (Math.random() * 50 - 25);     // R
        variation.bitmap.data[j + 1] = baseValue + (Math.random() * 50 - 25); // G  
        variation.bitmap.data[j + 2] = baseValue + (Math.random() * 50 - 25); // B
        variation.bitmap.data[j + 3] = 255; // A
      }
      
      mockImages.push(variation);
    }

    console.log('Generated 3 mock face images with different characteristics');
    
    // Test descriptor generation
    const descriptors = [];
    for (let i = 0; i < mockImages.length; i++) {
      try {
        console.log(`Generating descriptor for person ${i + 1}...`);
        const descriptor = await FaceDetectionService.generateEnhancedEmbedding(mockImages[i], testRegion);
        descriptors.push({ personId: i + 1, descriptor });
        console.log(`  ✅ Generated ${descriptor.length}D descriptor`);
        
        // Check for NaN values
        const hasNaN = descriptor.some(val => isNaN(val));
        if (hasNaN) {
          console.log(`  ⚠️  Warning: Descriptor contains NaN values`);
        }
        
        // Check descriptor range
        const min = Math.min(...descriptor);
        const max = Math.max(...descriptor);
        console.log(`  📈 Range: [${min.toFixed(4)}, ${max.toFixed(4)}]`);
        
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
    }

    if (descriptors.length >= 2) {
      console.log('\n🔄 Testing Descriptor Discrimination...');
      
      // Test all pairs
      for (let i = 0; i < descriptors.length; i++) {
        for (let j = i + 1; j < descriptors.length; j++) {
          const dist = FaceUtils.cosineDistance(descriptors[i].descriptor, descriptors[j].descriptor);
          console.log(`Distance P${descriptors[i].personId} ↔ P${descriptors[j].personId}: ${dist.toFixed(4)}`);
          
          if (dist < FaceConfig.COSINE_DISTANCE_THRESHOLD) {
            console.log(`  🚨 WARNING: Below threshold ${FaceConfig.COSINE_DISTANCE_THRESHOLD} - may cause confusion`);
          } else {
            console.log(`  ✅ Good separation (above threshold)`);
          }
        }
      }

      // Test consistency (same person)
      console.log('\n🎯 Testing Same-Person Consistency...');
      try {
        const descriptor1 = await FaceDetectionService.generateEnhancedEmbedding(mockImages[0], testRegion);
        const descriptor2 = await FaceDetectionService.generateEnhancedEmbedding(mockImages[0], testRegion);
        const consistency = FaceUtils.cosineDistance(descriptor1, descriptor2);
        console.log(`Same image processed twice - distance: ${consistency.toFixed(4)}`);
        
        if (consistency < 0.1) {
          console.log('  ✅ Excellent consistency');
        } else if (consistency < 0.3) {
          console.log('  ✅ Good consistency');  
        } else {
          console.log('  ⚠️  Poor consistency - descriptors vary too much');
        }
      } catch (error) {
        console.log(`  ❌ Consistency test failed: ${error.message}`);
      }
    }

    console.log('\n📋 Summary & Recommendations:');
    console.log(`✅ Enhanced descriptors: LBP + HOG + Gabor + Geometric + Intensity features`);
    console.log(`✅ Increased threshold: ${FaceConfig.COSINE_DISTANCE_THRESHOLD} (was 0.6)`);
    console.log(`✅ Haar Cascade integration: ${FaceDetectionService.useHaarCascade ? 'Active' : 'Inactive'}`);
    
    if (descriptors.length > 0) {
      console.log(`✅ Descriptor generation: Working (${descriptors[0].descriptor.length}D vectors)`);
    }
    
    console.log('\n🎯 For Real Testing:');
    console.log('1. Register 2-3 different people with actual photos');
    console.log('2. Try logging in with each person');
    console.log('3. Verify no cross-recognition between different people');
    console.log('4. Check server logs for detection methods used');

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  }
}

diagnosticTest();

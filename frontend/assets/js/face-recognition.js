// Face Recognition Helper using face-api.js
// Loads models and provides descriptor extraction utilities.
// Assumes face-api.js script is included in the HTML before this script.

const FaceRecognition = (function(){
  let modelsLoaded = false;
  let loadPromise = null;

  async function loadModels(basePath = '/models') {
    if (modelsLoaded) return;
    if (!loadPromise) {
      loadPromise = Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(basePath),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(basePath),
        faceapi.nets.faceRecognitionNet.loadFromUri(basePath)
      ]).then(()=>{ modelsLoaded = true; });
    }
    return loadPromise;
  }

  function detectionOptions() {
    return new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
  }

  async function extractMultiple(videoEl, frames = 5, delayMs = 120, { debug = false } = {}) {
    await loadModels();
    const descriptors = [];
    for (let i=0;i<frames;i++) {
      const detection = await faceapi.detectSingleFace(videoEl, detectionOptions()).withFaceLandmarks(true).withFaceDescriptor();
      if (detection && detection.descriptor) {
        descriptors.push(Array.from(detection.descriptor));
        if (debug) console.log('[FaceRec] Frame', i+1, 'descriptor length', detection.descriptor.length);
      } else if (debug) {
        console.warn('[FaceRec] No face detected frame', i+1);
      }
      if (i < frames - 1) await new Promise(r=>setTimeout(r, delayMs));
    }
    return descriptors;
  }

  // Basic quality heuristic: ensure distinctness across captured descriptors
  function qualityCheck(descriptors, { min = 3, maxMeanDistance = 0.9, minVariance = 0.0005 } = {}) {
    if (descriptors.length < min) return { ok:false, reason: 'not_enough_samples' };
    const mean = new Array(descriptors[0].length).fill(0);
    descriptors.forEach(d=>{ for (let i=0;i<mean.length;i++) mean[i]+=d[i]; });
    for (let i=0;i<mean.length;i++) mean[i]/=descriptors.length;
    let variance = 0;
    descriptors.forEach(d=>{ for (let i=0;i<mean.length;i++){ const diff = d[i]-mean[i]; variance += diff*diff; } });
    variance/= (descriptors.length*mean.length);
    // mean pairwise distance
    let pairSum=0, pairs=0;
    for (let i=0;i<descriptors.length;i++) for (let j=i+1;j<descriptors.length;j++){ pairSum += cosineDistance(descriptors[i], descriptors[j]); pairs++; }
    const meanDist = pairs? pairSum/pairs : 0;
    const ok = variance >= minVariance && meanDist < maxMeanDistance; // descriptors shouldn't be almost identical noise
    return { ok, variance, meanDist };
  }

  function cosineDistance(a,b){
    let dot=0, na=0, nb=0; for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    return 1 - (dot / (Math.sqrt(na)*Math.sqrt(nb)));
  }

  function aggregate(descriptors){
    if(!descriptors.length) return null;
    const len = descriptors[0].length; const mean = new Array(len).fill(0);
    descriptors.forEach(d=>{ for (let i=0;i<len;i++) mean[i]+=d[i]; });
    for (let i=0;i<len;i++) mean[i]/=descriptors.length;
    return { mean };
  }

  return { loadModels, extractMultiple, qualityCheck, aggregate, cosineDistance };
})();

// Simple in-memory rate limiter (IP + path) - not production ready (no clustering persistence)
const buckets = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '60', 10);

module.exports.rateLimit = (req, res, next) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { count: 0, start: now };
    buckets.set(key, bucket);
  }
  if (now - bucket.start > WINDOW_MS) {
    bucket.count = 0;
    bucket.start = now;
  }
  bucket.count++;
  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({ message: 'Too many requests, slow down.' });
  }
  next();
};

// Basic face embedding payload validator
module.exports.validateFacePayload = (req, res, next) => {
  const { faceEmbedding, faceEmbeddings } = req.body || {};
  const candidate = faceEmbeddings || faceEmbedding;
  if (!candidate) return res.status(400).json({ message: 'faceEmbedding(s) required' });
  if (Array.isArray(candidate[0])) {
    // array of arrays
    if (candidate.length > 15) return res.status(400).json({ message: 'Too many embeddings (max 15)' });
    for (const emb of candidate) {
      if (!Array.isArray(emb) || emb.length < 32 || emb.length > 512) return res.status(400).json({ message: 'Invalid embedding vector size' });
    }
  } else {
    if (!Array.isArray(candidate) || candidate.length < 32 || candidate.length > 512) return res.status(400).json({ message: 'Invalid embedding vector size' });
  }
  next();
};
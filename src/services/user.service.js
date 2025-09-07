const { User } = require("../entities/User.js");
const { AppDataSource } = require("../config/data-source.js");
const { sign } = require("../utils/jwt.js");
const faceIndex = require('./face-index.js');

// Configurable threshold & debug flag via environment variables
// Adjust FACE_MATCH_THRESHOLD in your .env (e.g., 0.75 for more tolerance, 0.5 for stricter)
const FACE_MATCH_THRESHOLD = parseFloat(process.env.FACE_MATCH_THRESHOLD || "0.6");
const FACE_DEBUG = process.env.FACE_DEBUG === "1"; // enable detailed matching logs
const FACE_DISTANCE_MARGIN = parseFloat(process.env.FACE_DISTANCE_MARGIN || "0.05"); // min gap between best and second best

class UserService {
  constructor() {
    this.userRepository = AppDataSource.getRepository(User);
  }

  async createUser(firstName, lastName, faceEmbeddingOrEmbeddings) {
    try {
      if (!firstName || !lastName) throw new Error("firstName & lastName required");
      if (!faceEmbeddingOrEmbeddings) throw new Error("face embeddings required");

      // Accept single embedding (array) or array of embeddings (array of array)
      let embeddings = [];
      if (Array.isArray(faceEmbeddingOrEmbeddings[0])) {
        embeddings = faceEmbeddingOrEmbeddings;
      } else {
        embeddings = [faceEmbeddingOrEmbeddings];
      }
      // Validate and normalize each embedding (length consistency enforced later)
      embeddings = embeddings
        .filter(e => Array.isArray(e) && e.every(v => typeof v === 'number' && Number.isFinite(v)))
        .map(e => this.normalize(e));
      if (embeddings.length === 0) throw new Error("No valid embeddings supplied");

      // Ensure uniform length
      const len = embeddings[0].length;
      if (!embeddings.every(e => e.length === len)) throw new Error("Embeddings length mismatch");

      const representative = this.aggregateEmbeddings(embeddings);
      const newUser = this.userRepository.create({
        firstName,
        lastName,
        faceEmbedding: representative.mean, // backward compatibility (single embedding)
        faceEmbeddings: {
          samples: embeddings,
          mean: representative.mean,
          median: representative.median
        },
        embeddingVersion: 2,
        lastEmbeddingUpdate: new Date()
      });
  const saved = await this.userRepository.save(newUser);
  try { faceIndex.addUser(saved); } catch(e) { if (FACE_DEBUG) console.warn('[FaceID] addUser to index failed', e.message); }
  return saved;
    } catch (error) {
      throw new Error(`Error creating user: ${error.message}`);
    }
  }

  async login(faceEmbedding) {
    return await this.findByEmbedding(faceEmbedding);
  }

  async getAllUsers() {
    try {
      return await this.userRepository.find();
    } catch (error) {
      throw new Error(`Error retrieving users: ${error.message}`);
    }
  }

  async getUserById(id) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }
      return await this.userRepository.findOne({ where: { id } });
    } catch (error) {
      throw new Error(`Error retrieving user: ${error.message}`);
    }
  }

  async updateUserById(id, updateData) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }
      if (!updateData || Object.keys(updateData).length === 0) {
        throw new Error("Update data is required");
      }

      const user = await this.getUserById(id);
      if (user) {
        Object.assign(user, updateData);
        return await this.userRepository.save(user);
      }
      return null;
    } catch (error) {
      throw new Error(`Error updating user: ${error.message}`);
    }
  }

  async deleteUserById(id) {
    try {
      if (!id) {
        throw new Error("User ID is required");
      }

      const user = await this.getUserById(id);
      if (user) {
        await this.userRepository.remove(user);
        return true;
      }
      return false;
    } catch (error) {
      throw new Error(`Error deleting user: ${error.message}`);
    }
  }

  async findByEmbedding(faceEmbeddingOrEmbeddings, options = {}) {
    try {
      // Accept single embedding or array of embeddings (capture burst for stability)
      let embeddings = [];
      if (Array.isArray(faceEmbeddingOrEmbeddings[0])) {
        embeddings = faceEmbeddingOrEmbeddings;
      } else {
        embeddings = [faceEmbeddingOrEmbeddings];
      }
      embeddings = embeddings
        .filter(e => Array.isArray(e) && e.every(v => typeof v === 'number' && Number.isFinite(v)))
        .map(e => this.normalize(e));
      if (embeddings.length === 0) throw new Error("faceEmbedding(s) required");
      const inputAggregate = this.aggregateEmbeddings(embeddings);
      const normalizedInput = inputAggregate.mean; // use mean aggregate

  const users = await this.userRepository.find();
      if (users.length === 0) {
        if (FACE_DEBUG) console.warn("[FaceID] No users in database to compare against.");
        return null;
      }

  let closestUser = null;
  let minDistance = Infinity;
  let secondDistance = Infinity;
      const threshold = FACE_MATCH_THRESHOLD;
      const inspected = [];

      // Ensure index loaded (lazy rebuild if empty)
      if (!faceIndex.loaded) {
        try { await faceIndex.rebuild(); } catch(e) { if (FACE_DEBUG) console.warn('[FaceID] index rebuild failed', e.message); }
      }
      // Search via cosine distance index if available and dimensions align
      if (faceIndex.loaded) {
        const hit = faceIndex.search(normalizedInput, { threshold: FACE_MATCH_THRESHOLD, margin: FACE_DISTANCE_MARGIN });
        if (hit) {
          closestUser = users.find(u=>u.id===hit.id);
          minDistance = hit.distance;
          secondDistance = hit.secondDistance || Infinity;
          inspected.push({ id: hit.id, distance: hit.distance, via: 'index' });
        }
      }
      // Fallback direct linear scan if no index hit
      if (!closestUser) {
        users.forEach((user) => {
          let candidateVectors = [];
          if (user.faceEmbeddings && user.faceEmbeddings.samples) {
            candidateVectors = [user.faceEmbeddings.mean, user.faceEmbeddings.median, ...user.faceEmbeddings.samples.slice(0, 3)];
          } else if (user.faceEmbedding) {
            candidateVectors = [user.faceEmbedding];
          }
          candidateVectors = candidateVectors.filter(v => Array.isArray(v) && v.length === normalizedInput.length);
          if (candidateVectors.length === 0) return;
          const distances = candidateVectors.map(v => this.euclideanDistance(this.normalize(v), normalizedInput));
          const distance = Math.min(...distances);
          inspected.push({ id: user.id, distance, variants: distances.length });
          if (distance < minDistance) {
            secondDistance = minDistance;
            minDistance = distance;
            closestUser = user;
          } else if (distance < secondDistance) {
            secondDistance = distance;
          }
        });
      }

      if (FACE_DEBUG) {
        // Sort inspected by ascending distance (filter those that have distance)
        const ranked = inspected
          .filter((i) => typeof i.distance === "number")
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 5);
        console.log(
          `[FaceID] Evaluated ${inspected.length} embeddings. Threshold=${threshold}. Top candidates:`,
          ranked
        );
        if (!closestUser) console.log("[FaceID] No candidate under threshold.");
        else console.log(`[FaceID] Selected user ${closestUser.id} distance=${minDistance}`);
      }

      // If user is found, generate JWT token
  // Apply threshold AND margin criterion
  const marginOk = secondDistance - minDistance >= FACE_DISTANCE_MARGIN || secondDistance === Infinity;
  if (closestUser && minDistance < threshold && marginOk) {
        const token = sign({
          id: closestUser.id,
          role: "user",
          firstName: closestUser.firstName,
          lastName: closestUser.lastName,
          createdAt: closestUser.createdAt,
        });

        return {
          user: closestUser,
          token: token,
          meta: FACE_DEBUG
    ? { distance: minDistance, secondDistance, margin: secondDistance - minDistance, threshold: FACE_MATCH_THRESHOLD, marginRequired: FACE_DISTANCE_MARGIN }
            : undefined,
        };
      }

      return null;
    } catch (error) {
      throw new Error(`Error finding user by embedding: ${error.message}`);
    }
  }

  euclideanDistance(arr1, arr2) {
    if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
      throw new Error("Both inputs must be arrays");
    }

    if (arr1.length !== arr2.length) {
      throw new Error("Arrays must have the same length");
    }

    let sum = 0;
    for (let i = 0; i < arr1.length; i++) {
      if (typeof arr1[i] !== "number" || typeof arr2[i] !== "number") {
        throw new Error("All array elements must be numbers");
      }
      sum += Math.pow(arr1[i] - arr2[i], 2);
    }
    return Math.sqrt(sum);
  }

  normalize(arr) {
    const norm = Math.sqrt(arr.reduce((s, v) => s + v * v, 0));
    if (!norm || !Number.isFinite(norm)) return arr.slice(); // fallback: return copy
    return arr.map((v) => v / norm);
  }

  aggregateEmbeddings(embeddings) {
    if (!embeddings || embeddings.length === 0) throw new Error("No embeddings to aggregate");
    const len = embeddings[0].length;
    const mean = new Array(len).fill(0);
    embeddings.forEach(e => {
      for (let i = 0; i < len; i++) mean[i] += e[i];
    });
    for (let i = 0; i < len; i++) mean[i] /= embeddings.length;
    // median per dimension
    const median = [];
    for (let i = 0; i < len; i++) {
      const col = embeddings.map(e => e[i]).sort((a,b)=>a-b);
      const mid = Math.floor(col.length/2);
      median.push(col.length % 2 === 0 ? (col[mid-1]+col[mid])/2 : col[mid]);
    }
    return { mean, median };
  }
}

module.exports = new UserService();

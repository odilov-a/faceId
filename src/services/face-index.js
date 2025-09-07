// In-memory face embedding index for faster + more robust matching
// NOTE: Resets on server restart. For production persist or rebuild on boot.
const { User } = require('../entities/User.js');
const { AppDataSource } = require('../config/data-source.js');

class FaceIndex {
  constructor(){
    this.entries = []; // { id, mean, variants }
    this.version = 0;
    this.loaded = false;
  }

  async rebuild(){
    const repo = AppDataSource.getRepository(User);
    const users = await repo.find();
    this.entries = users.filter(u=>u.faceEmbeddings?.mean).map(u=>({
      id: u.id,
      mean: u.faceEmbeddings.mean,
      variants: [u.faceEmbeddings.mean, u.faceEmbeddings.median, ...(u.faceEmbeddings.samples||[]).slice(0,5)]
    }));
    this.version++;
    this.loaded = true;
    return { count: this.entries.length, version: this.version };
  }

  ensureLoaded(){ if(!this.loaded) throw new Error('Face index not loaded'); }

  cosineDistance(a,b){
    let dot=0, na=0, nb=0; for (let i=0;i<a.length;i++){ const av=a[i], bv=b[i]; dot+=av*bv; na+=av*av; nb+=bv*bv; }
    return 1 - (dot / (Math.sqrt(na)*Math.sqrt(nb)));
  }

  search(queryEmb, { threshold = 0.45, margin = 0.05 } = {}) {
    this.ensureLoaded();
    let best = null, bestDist = Infinity, second = Infinity;
    const ranked = [];
    for (const e of this.entries) {
      const distances = e.variants.filter(v=>v.length===queryEmb.length).map(v=>this.cosineDistance(v, queryEmb));
      if (!distances.length) continue;
      const dist = Math.min(...distances);
      ranked.push({ id: e.id, distance: dist });
      if (dist < bestDist) { second = bestDist; bestDist = dist; best = e; }
      else if (dist < second) { second = dist; }
    }
    if (!best) return null;
    const marginOk = (second - bestDist) >= margin || second === Infinity;
    if (bestDist < threshold && marginOk) {
      return { id: best.id, distance: bestDist, secondDistance: second, ranked: ranked.sort((a,b)=>a.distance-b.distance).slice(0,5) };
    }
    return null;
  }

  addUser(user){
    // user with faceEmbeddings
    if (!user || !user.id || !user.faceEmbeddings?.mean) return;
    const entry = {
      id: user.id,
      mean: user.faceEmbeddings.mean,
      variants: [user.faceEmbeddings.mean, user.faceEmbeddings.median, ...(user.faceEmbeddings.samples||[]).slice(0,5)]
    };
    // replace if exists
    const idx = this.entries.findIndex(e=>e.id===user.id);
    if (idx>=0) this.entries[idx] = entry; else this.entries.push(entry);
    this.version++;
    this.loaded = true;
  }
}

module.exports = new FaceIndex();
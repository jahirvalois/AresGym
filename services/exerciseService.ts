import { apiService } from './apiService';

const BASE = '/cosmos';

export const exerciseService = {
  async getMuscles() {
    return await apiService.post('/internal-proxy', {}); // placeholder if proxy is needed
  },

  async getMusclesDirect() {
    return await fetch(`/api/${BASE}/muscles`).then(r => r.json());
  },

  async getExercisesByMuscle(muscle: string) {
    return await fetch(`/api/${BASE}/exercises?muscle=${encodeURIComponent(muscle)}`).then(r => r.json());
  },

  async addExercise(doc: any) {
    return await fetch(`/api/${BASE}/exercises`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(doc) }).then(r => r.json());
  },

  async updateExercise(id: string, updates: any) {
    return await fetch(`/api/${BASE}/exercises/${encodeURIComponent(id)}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updates) }).then(r => r.ok);
  },

  async deleteExercise(id: string) {
    return await fetch(`/api/${BASE}/exercises/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(r => r.ok);
  },

  async requestUploadSas(blobName: string) {
    return await fetch(`/api/${BASE}/animations/sas`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ blobName }) }).then(r => r.json());
  },

  async registerAnimation(exerciseId: string, blobName: string, type?: string) {
    return await fetch(`/api/${BASE}/animations/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ exerciseId, blobName, type }) }).then(r => r.ok);
  }
};

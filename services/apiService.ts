
import { 
  User, 
  MonthlyRoutine, 
  WorkoutLog, 
  UserRole, 
  UserStatus,
  RoutineStatus, 
  AuditLog,
  SubscriptionState 
} from '../types';

const rawApiBase = (typeof window !== 'undefined' ? (window as any).__VITE_API_BASE_URL : undefined) || (import.meta as any)?.env?.VITE_API_BASE_URL || '/api';
const API_BASE = rawApiBase === '/api'
  ? '/api'
  : (rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`);
const isRemoteApi = API_BASE.startsWith('http');
console.info('[apiService] API_BASE resolved to:', API_BASE, 'rawApiBase:', rawApiBase, 'isRemoteApi:', isRemoteApi);

// Gestión de Datos Locales (Fallback)
const getLocal = (key: string, fallback: any) => {
  const saved = localStorage.getItem(`ares_${key}`);
  return saved ? JSON.parse(saved) : fallback;
};

const saveLocal = (key: string, data: any) => {
  localStorage.setItem(`ares_${key}`, JSON.stringify(data));
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let data: any = null;
      try {
        const contentTypeError = response.headers.get("content-type");
        if (contentTypeError && contentTypeError.includes("application/json")) {
          data = await response.json();
        } else {
          data = { message: await response.text() };
        }
      } catch {
        data = null;
      }

      const error: any = new Error(data?.message || data?.error || 'API_ERROR');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    if (response.status === 204) {
      return undefined as T;
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      let txt = '';
      try { txt = await response.text(); } catch (e) { txt = ''; }
      const err: any = new Error(`NOT_JSON: ${txt ? (txt.length > 1000 ? txt.slice(0,1000) + '...' : txt) : '<no body>'}`);
      err.status = response.status;
      err.data = { rawText: txt };
      throw err;
    }

    return await response.json();
  } catch (err) {
    // fallback to local data when remote fails - keep quiet in console
    console.debug && console.debug(`Ares Cloud fallback for ${path}:`, err?.message || err);
    throw err; // caller will decide to use local
  }
}

const normalizeUser = (user: any): User => {
  if (!user) return user as User;
  if (user.id) return { ...user, id: String(user.id) } as User;
  if (user._id) {
    const idValue = typeof user._id === 'object' && user._id.$oid
      ? user._id.$oid
      : String(user._id);
    return { ...user, id: idValue } as User;
  }
  return user as User;
};

export const apiService = {
  async init() {
    console.log("Ares Gym Pro: Sistema Híbrido inicializado.");
    try {
      // Remove any local users created by social signups (we want them in the DB)
      const users = getLocal('users', []);
      const filtered = users.filter((u: any) => {
        // keep only manual accounts (no provider/origin)
        return !(u?.provider || u?.providerId || u?.origin);
      });
      if (filtered.length !== users.length) {
        saveLocal('users', filtered);
        console.debug && console.debug('[apiService] removed local social users from localStorage');
      }
    } catch (e) {
      console.warn('[apiService] migration check failed', e);
    }
  },

  async getUsers(): Promise<User[]> {
    try {
      const users = await request<User[]>('/users');
      return users.map(normalizeUser);
    } catch {
      return getLocal('users', []);
    }
  },
  
  async createUser(currentUser: User, newUser: Partial<User>) {
    try {
      const created = await request<User>('/users', {
        method: 'POST',
        body: JSON.stringify({ currentUser, newUser })
      });
      return normalizeUser(created);
    } catch (err: any) {
      if (err?.status === 409 && err?.data?.error === 'USER_EXISTS') {
        const existsError: any = new Error(err?.data?.message || 'Usuario existe');
        existsError.code = 'USER_EXISTS';
        existsError.resetEmailSent = !!err?.data?.resetEmailSent;
        throw existsError;
      }

      const users = getLocal('users', []);
      const u: User = { 
        id: Math.random().toString(36).substr(2, 9), 
        ...newUser, 
        status: UserStatus.ACTIVE,
        createdAt: new Date().toISOString(),
        isFirstLogin: true 
      } as User;
      saveLocal('users', [...users, u]);
      return u;
    }
  },

  async updateUser(currentUser: User, id: string, updates: Partial<User>) {
    try {
      const updated = await request<User>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentUser, updates })
      });
      return normalizeUser(updated);
    } catch {
      const users = getLocal('users', []);
      const updated = users.map((u: User) => u.id === id ? { ...u, ...updates } : u);
      saveLocal('users', updated);
      return updated.find((u: User) => u.id === id);
    }
  },

  async deleteUser(currentUser: User, id: string) {
    console.debug('[apiService] deleteUser called with id:', id, 'currentUser:', currentUser?.id);
    if (!id) {
      console.warn('[apiService] deleteUser called with missing id');
      throw new Error('Missing user id');
    }
    try {
      await request<void>(`/users/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('[apiService] deleteUser request failed, falling back to local storage', err);
      if (isRemoteApi) throw err;
      const users = getLocal('users', []);
      saveLocal('users', users.filter((u: User) => u.id !== id));
    }
  },

  async getSubscriptionState(user: User): Promise<{ state: SubscriptionState; message: string | null }> {
    if (user.role === UserRole.ADMIN || user.role === UserRole.COACH) return { state: SubscriptionState.OK, message: null };
    const end = new Date(user.subscriptionEndDate).getTime();
    const now = Date.now();
    const diffDays = (end - now) / (1000 * 60 * 60 * 24);
    if (now > end) return { state: SubscriptionState.EXPIRED, message: 'Tu suscripción ha expirado.' };
    // Cambio: advertir cuando falten 2 días o menos
    if (diffDays <= 2) return { state: SubscriptionState.WARNING, message: `Vence en ${Math.ceil(diffDays)} días.` };
    return { state: SubscriptionState.OK, message: null };
  },

  async getLiveMetrics() {
    try {
      return await request<any>('/metrics/live');
    } catch {
      return { totalExercising: 5, categories: { "PECHO": 2, "PIERNA": 3 } };
    }
  },

  async getRoutines(role: UserRole, userId?: string) {
    try {
      const query = userId ? `?userId=${userId}` : '';
      const routines = await request<MonthlyRoutine[]>(`/routines${query}`);
      // normalize _id -> id for routines coming from Mongo/Cosmos
      return routines.map(r => {
        if ((r as any).id) return r;
        if ((r as any)._id) {
          const idValue = typeof (r as any)._id === 'object' && (r as any)._id.$oid ? (r as any)._id.$oid : String((r as any)._id);
          return { ...r, id: idValue } as MonthlyRoutine;
        }
        return r;
      });
    } catch {
      const all = getLocal('routines', []);
      return userId ? all.filter((r: any) => r.userId === userId) : all;
    }
  },

  async createRoutine(coachId: string, routine: Partial<MonthlyRoutine>) {
    try {
      return await request<MonthlyRoutine>('/routines', {
        method: 'POST',
        body: JSON.stringify({ coachId, routine })
      });
    } catch {
      const routines = getLocal('routines', []);
      const r = { id: Math.random().toString(36).substr(2, 9), ...routine, coachId, status: RoutineStatus.ACTIVE, createdAt: new Date().toISOString() };
      saveLocal('routines', [...routines, r]);
      return r as MonthlyRoutine;
    }
  },

  // Independent routines API (separate collection)
  async getIndependienteRoutines(userId?: string) {
    try {
      const query = userId ? `?userId=${encodeURIComponent(userId)}` : '';
      const routines = await request<MonthlyRoutine[]>(`/independiente/routines${query}`);
      return routines.map(r => {
        if ((r as any).id) return r;
        if ((r as any)._id) {
          const idValue = typeof (r as any)._id === 'object' && (r as any)._id.$oid ? (r as any)._id.$oid : String((r as any)._id);
          return { ...r, id: idValue } as MonthlyRoutine;
        }
        return r;
      });
    } catch {
      const all = getLocal('routines', []);
      return userId ? all.filter((r: any) => r.userId === userId) : all;
    }
  },

  async createIndependienteRoutine(coachId: string, routine: Partial<MonthlyRoutine>) {
    try {
      return await request<MonthlyRoutine>('/independiente/routines', {
        method: 'POST',
        body: JSON.stringify({ coachId, routine })
      });
    } catch {
      const routines = getLocal('routines', []);
      const r = { id: Math.random().toString(36).substr(2, 9), ...routine, coachId, source: 'independent', status: RoutineStatus.ACTIVE, createdAt: new Date().toISOString() };
      saveLocal('routines', [...routines, r]);
      return r as MonthlyRoutine;
    }
  },

  async updateIndependienteRoutine(id: string, updates: Partial<MonthlyRoutine>) {
    try {
      return await request<MonthlyRoutine>(`/independiente/routines/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ updates })
      });
    } catch {
      const routines = getLocal('routines', []);
      const updated = routines.map((r: any) => (String(r.id) === String(id) ? { ...r, ...updates } : r));
      saveLocal('routines', updated);
      return updated.find((r: any) => String(r.id) === String(id));
    }
  },

  async deleteIndependienteRoutine(id: string) {
    try {
      await request<void>(`/independiente/routines/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      const routines = getLocal('routines', []);
      saveLocal('routines', routines.filter((r: any) => String(r.id) !== String(id)));
      return true;
    }
  },

  async updateRoutine(id: string, updates: Partial<MonthlyRoutine>) {
    try {
      return await request<MonthlyRoutine>(`/routines/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    } catch {
      const routines = getLocal('routines', []);
      const updated = routines.map((r: any) => (String(r.id) === String(id) ? { ...r, ...updates } : r));
      saveLocal('routines', updated);
      return updated.find((r: any) => String(r.id) === String(id));
    }
  },

  async deleteRoutine(id: string) {
    try {
      await request<void>(`/routines/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      const routines = getLocal('routines', []);
      saveLocal('routines', routines.filter((r: any) => String(r.id) !== String(id)));
      return true;
    }
  },

  async getLogs(userId: string, options?: { limit?: number; skip?: number; exerciseId?: string; includeTotal?: boolean }) {
    try {
      const params: string[] = [];
      if (userId) params.push(`userId=${encodeURIComponent(userId)}`);
      if (options?.exerciseId) params.push(`exerciseId=${encodeURIComponent(options.exerciseId)}`);
      if (options?.limit != null) params.push(`limit=${Number(options.limit)}`);
      if (options?.skip != null) params.push(`skip=${Number(options.skip)}`);
      if (options?.includeTotal) params.push(`includeTotal=true`);
      const query = params.length ? `?${params.join('&')}` : '';
      const res: any = await request<any>(`/logs${query}`);
      if (options?.includeTotal && res && typeof res === 'object' && Array.isArray(res.items)) return res; // { items, total }
      // otherwise return array
      return res as WorkoutLog[];
    } catch {
      const all = getLocal('logs', []);
      let filtered = all.filter((l: any) => l.userId === userId);
      if (options?.exerciseId) filtered = filtered.filter((l: any) => String(l.exerciseId) === String(options.exerciseId));
      const skip = options?.skip ? Number(options.skip) : 0;
      const limit = options?.limit ? Number(options.limit) : undefined;
      if (options?.includeTotal) {
        const items = (typeof limit === 'number') ? filtered.slice(skip, skip + limit) : filtered.slice(skip);
        return { items, total: filtered.length };
      }
      if (typeof limit === 'number') return filtered.slice(skip, skip + limit);
      return filtered.slice(skip);
    }
  },

  async addLog(log: Omit<WorkoutLog, 'id' | 'date'>) {
    try {
      return await request<WorkoutLog>('/logs', {
        method: 'POST',
        body: JSON.stringify(log)
      });
    } catch {
      const logs = getLocal('logs', []);
      const newLog = { ...log, id: Math.random().toString(36).substr(2, 9), date: new Date().toISOString() };
      saveLocal('logs', [...logs, newLog]);
      return newLog as WorkoutLog;
    }
  },

  async updateLog(id: string, updates: Partial<WorkoutLog>) {
    try {
      return await request<WorkoutLog>(`/logs/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
    } catch {
      const logs = getLocal('logs', []);
      const updated = logs.map((l: any) => (String(l.id) === String(id) ? { ...l, ...updates } : l));
      saveLocal('logs', updated);
      return updated.find((l: any) => String(l.id) === String(id));
    }
  },

  async deleteLog(id: string) {
    try {
      await request<void>(`/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
      return true;
    } catch {
      const logs = getLocal('logs', []);
      saveLocal('logs', logs.filter((l: any) => String(l.id) !== String(id)));
      return true;
    }
  },

  async getAuditLogs() {
    try { return await request<AuditLog[]>('/audit'); } catch { return getLocal('audit', []); }
  },

  // Strict methods: throw on error (no local fallback) to detect DB connectivity
  async getUsersStrict(): Promise<User[]> {
    const users = await request<User[]>('/users');
    return users.map(normalizeUser);
  },

  async getAuditLogsStrict(): Promise<AuditLog[]> {
    return await request<AuditLog[]>('/audit');
  },

  async getExerciseBankStrict(): Promise<Record<string, string[]>> {
    return await request<Record<string, string[]>>('/exercises/bank');
  },

  async getRoutinesStrict(role: UserRole, userId?: string) {
    const query = userId ? `?userId=${userId}` : '';
    const routines = await request<MonthlyRoutine[]>(`/routines${query}`);
    return routines.map(r => {
      if ((r as any).id) return r;
      if ((r as any)._id) {
        const idValue = typeof (r as any)._id === 'object' && (r as any)._id.$oid ? (r as any)._id.$oid : String((r as any)._id);
        return { ...r, id: idValue } as MonthlyRoutine;
      }
      return r;
    });
  },

  async getAllExerciseMedia() {
    try { return await request<Record<string, string>>('/exercises/media'); } catch { return getLocal('media', {}); }
  },

  async requestUploadSas(filename: string) {
    try {
      const path = `/exercises/sas?filename=${encodeURIComponent(filename)}`;
      const fullUrl = `${API_BASE}${path}`;
      console.debug && console.debug('[apiService] requestUploadSas', { API_BASE, path, fullUrl });
      return await request<{ uploadUrl: string; blobUrl: string; expiresOn: string }>(path);
    } catch (err) {
      throw err;
    }
  },


  async getExerciseMedia(exerciseName: string) {
    const media = await this.getAllExerciseMedia();
    return media[exerciseName] || '';
  },

  async updateExerciseMedia(adminId: string, exerciseName: string, url: string) {
    try {
      await request<void>('/exercises/media', { method: 'PUT', body: JSON.stringify({ adminId, exerciseName, url }) });
    } catch {
      const media = getLocal('media', {});
      media[exerciseName] = url;
      saveLocal('media', media);
    }
  },

  async getExerciseBank() {
    try { return await request<Record<string, string[]>>('/exercises/bank'); } catch { return getLocal('bank', {}); }
  },

  async getExerciseCategories() {
    try {
      const bank = await this.getExerciseBank();
      return Object.keys(bank || {});
    } catch {
      const bank = getLocal('bank', {});
      return Object.keys(bank);
    }
  },

  async updateExerciseBank(adminId: string, category: string, exercises: string[]) {
    try {
      await request<void>('/exercises/bank', { method: 'PUT', body: JSON.stringify({ adminId, category, exercises }) });
    } catch {
      const bank = getLocal('bank', {});
      bank[category] = exercises;
      saveLocal('bank', bank);
    }
  },

  async addCategory(adminId: string, categoryName: string) {
    const bank = await this.getExerciseBank();
    const formatted = categoryName.toUpperCase().startsWith("RUTINA DE ") ? categoryName.toUpperCase() : `RUTINA DE ${categoryName.toUpperCase()}`;
    bank[formatted] = [];
    await this.updateExerciseBank(adminId, formatted, []);
  },

  async deleteCategory(adminId: string, categoryName: string) {
    try {
      await request<void>(`/exercises/bank/category/${encodeURIComponent(categoryName)}`, { method: 'DELETE' });
    } catch {
      const bank = getLocal('bank', {});
      delete bank[categoryName];
      saveLocal('bank', bank);
    }
  },

  async renameCategory(adminId: string, oldName: string, newName: string) {
    const formatted = newName.toUpperCase().startsWith("RUTINA DE ") ? newName.toUpperCase() : `RUTINA DE ${newName.toUpperCase()}`;
    try {
      await request<void>('/exercises/bank/category/rename', { method: 'PUT', body: JSON.stringify({ oldName, newName: formatted }) });
    } catch {
      const bank = await this.getExerciseBank();
      bank[formatted] = bank[oldName];
      delete bank[oldName];
      saveLocal('bank', bank);
    }
  },

  async renameExercise(adminId: string, category: string, oldName: string, newName: string) {
    const bank = await this.getExerciseBank();
    if (bank[category]) {
      bank[category] = bank[category].map((ex: string) => ex === oldName ? newName : ex);
      // persist change to server
      await this.updateExerciseBank(adminId, category, bank[category]);
      saveLocal('bank', bank);
    }
  },

  // Authentication Methods
  async post<T>(path: string, body: any): Promise<T> {
    return request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },

  async login(email: string, password: string) {
    try {
      return await this.post('/auth/login', { email, password });
    } catch (err) {
      throw new Error('Login failed. Please check your credentials.');
    }
  },

  async forgotPassword(email: string) {
    try {
      return await this.post('/auth/forgot-password', { email });
    } catch (err) {
      throw new Error('Failed to send reset email.');
    }
  },

  async resetPassword(token: string, newPassword: string, confirmPassword: string) {
    try {
      return await this.post('/auth/reset-password', { token, newPassword, confirmPassword });
    } catch (err) {
      throw new Error('Failed to reset password.');
    }
  },

  async socialLogin(...args: any[]) {
    // Args: (provider, providerIdOrIdToken, email?, name?, avatar?)
    const [provider, providerIdOrIdToken, email, name, avatar] = args;
    const payload: any = { provider };
    // For Microsoft we prefer to send an accessToken (Graph) for server-side verification
    if (provider === 'microsoft') {
      payload.accessToken = providerIdOrIdToken;
    } else {
      const isIdToken = typeof providerIdOrIdToken === 'string' && providerIdOrIdToken.split('.').length === 3;
      if (isIdToken) payload.idToken = providerIdOrIdToken;
      else payload.providerId = providerIdOrIdToken;
    }
    if (email) payload.email = email;
    if (name) payload.name = name;
    if (avatar) payload.avatar = avatar;

    try {
      return await this.post('/auth/social-login', payload);
    } catch (err) {
      console.debug && console.debug('[apiService] socialLogin failed:', err);
      // Don't create localStorage users for social signups — require server persistence
      throw err;
    }
  }
};

// Decode JWT payload (no verification) for local fallback use
const parseJwt = (token: string) => {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = parts[1];
    // base64url -> base64
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(b64).split('').map(function(c) {
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};
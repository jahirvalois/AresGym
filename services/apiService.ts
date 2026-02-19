
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

const rawApiBase = (import.meta as any)?.env?.VITE_API_BASE_URL || (typeof window !== 'undefined' ? (window as any).__VITE_API_BASE_URL : undefined) || '/api';
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
      throw new Error("NOT_JSON");
    }

    return await response.json();
  } catch (err) {
    console.warn(`Ares Cloud: Fallback a local para ${path}`);
    throw err; // Propagar para que el llamador decida si usar local
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
      // Migrate any local social-login users to INACTIVE and mark as first-login
      const users = getLocal('users', []);
      let changed = false;
      const migrated = users.map((u: any) => {
        if ((u.provider || u.providerId) && u.status === UserStatus.ACTIVE) {
          changed = true;
          return { ...u, status: UserStatus.INACTIVE, isFirstLogin: true };
        }
        return u;
      });
      if (changed) {
        saveLocal('users', migrated);
        console.log('[apiService] migrated local social users to INACTIVE');
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
    if (diffDays <= 3) return { state: SubscriptionState.WARNING, message: `Vence en ${Math.ceil(diffDays)} días.` };
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

  async getLogs(userId: string) {
    try {
      return await request<WorkoutLog[]>(`/logs?userId=${userId}`);
    } catch {
      const all = getLocal('logs', []);
      return all.filter((l: any) => l.userId === userId);
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

  async getAuditLogs() {
    try { return await request<AuditLog[]>('/audit'); } catch { return getLocal('audit', []); }
  },

  async getAllExerciseMedia() {
    try { return await request<Record<string, string>>('/exercises/media'); } catch { return getLocal('media', {}); }
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
    const isIdToken = typeof providerIdOrIdToken === 'string' && providerIdOrIdToken.split('.').length === 3;
    const payload: any = { provider };
    if (isIdToken) payload.idToken = providerIdOrIdToken;
    else payload.providerId = providerIdOrIdToken;
    if (email) payload.email = email;
    if (name) payload.name = name;
    if (avatar) payload.avatar = avatar;

    try {
      return await this.post('/auth/social-login', payload);
    } catch (err) {
      // Local fallback: find or create user in local storage
      const users = getLocal('users', []);
      // Try to extract data from id_token if available
      let decoded: any = null;
      if (isIdToken) decoded = parseJwt(providerIdOrIdToken as string);
      const normalized = (email || decoded?.email || '').trim().toLowerCase();
      let user = users.find((u: any) => (u.email || '').toLowerCase() === normalized);
      if (user) return { user };
      const chosenName = name || decoded?.name || 'Guerrero';
      const chosenAvatar = avatar || decoded?.picture || '';
      const chosenProviderId = isIdToken ? (decoded?.sub || undefined) : providerIdOrIdToken;
      const newUser: User = {
        id: Math.random().toString(36).substr(2, 9),
        email: normalized,
        name: chosenName,
        role: UserRole.USER,
        status: UserStatus.INACTIVE,
        subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        isFirstLogin: true,
        profilePicture: chosenAvatar
      } as User;
      // attach provider info for migration/inspection
      (newUser as any).provider = provider;
      if (chosenProviderId) (newUser as any).providerId = chosenProviderId;
      const updated = [...users, newUser];
      saveLocal('users', updated);
      return { user: newUser };
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
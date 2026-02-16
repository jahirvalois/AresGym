
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
import { MOCK_USERS } from '../constants';

const API_BASE = '/api';

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

    if (!response.ok) throw new Error('API_ERROR');
    
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

export const apiService = {
  async init() {
    console.log("Ares Gym Pro: Sistema Híbrido inicializado.");
  },

  async getUsers(): Promise<User[]> {
    try {
      return await request<User[]>('/users');
    } catch {
      return getLocal('users', MOCK_USERS);
    }
  },
  
  async createUser(currentUser: User, newUser: Partial<User>) {
    try {
      return await request<User>('/users', {
        method: 'POST',
        body: JSON.stringify({ currentUser, newUser })
      });
    } catch {
      const users = getLocal('users', MOCK_USERS);
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
      return await request<User>(`/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ currentUser, updates })
      });
    } catch {
      const users = getLocal('users', MOCK_USERS);
      const updated = users.map((u: User) => u.id === id ? { ...u, ...updates } : u);
      saveLocal('users', updated);
      return updated.find((u: User) => u.id === id);
    }
  },

  async deleteUser(currentUser: User, id: string) {
    try {
      await request<void>(`/users/${id}`, { method: 'DELETE' });
    } catch {
      const users = getLocal('users', MOCK_USERS);
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
      return await request<MonthlyRoutine[]>(`/routines${query}`);
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
    try { return await request<string[]>('/exercises/categories'); } catch { 
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
      await request<void>(`/exercises/categories/${encodeURIComponent(categoryName)}`, { method: 'DELETE' });
    } catch {
      const bank = getLocal('bank', {});
      delete bank[categoryName];
      saveLocal('bank', bank);
    }
  },

  async renameCategory(adminId: string, oldName: string, newName: string) {
    const bank = await this.getExerciseBank();
    bank[newName] = bank[oldName];
    delete bank[oldName];
    saveLocal('bank', bank);
  },

  async renameExercise(adminId: string, category: string, oldName: string, newName: string) {
    const bank = await this.getExerciseBank();
    if (bank[category]) {
      bank[category] = bank[category].map((ex: string) => ex === oldName ? newName : ex);
      saveLocal('bank', bank);
    }
  }
};

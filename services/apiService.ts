
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

/**
 * ADAPTACIÓN PARA AZURE CLOUD (MongoDB API)
 * Este servicio consume endpoints de Azure Functions que actúan como proxy para Cosmos DB for MongoDB.
 */

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Error en el servidor de Ares Gym' }));
    throw new Error(error.message || 'Error en la conexión con la red de combate');
  }
  return response.json();
}

export const apiService = {
  async init() {
    console.log("Ares Gym Pro: Sistema Cloud (MongoDB) inicializado.");
  },

  async getUsers(): Promise<User[]> {
    return request<User[]>('/users');
  },
  
  async createUser(currentUser: User, newUser: Partial<User>) {
    return request<User>('/users', {
      method: 'POST',
      body: JSON.stringify({ currentUser, newUser })
    });
  },

  async updateUser(currentUser: User, id: string, updates: Partial<User>) {
    return request<User>(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ currentUser, updates })
    });
  },

  async deleteUser(currentUser: User, id: string) {
    return request<void>(`/users/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ currentUser })
    });
  },

  async requestPasswordReset(email: string) {
    return request<{ success: boolean }>('/auth/reset-request', {
      method: 'POST',
      body: JSON.stringify({ email })
    }).then(res => res.success);
  },

  async getSubscriptionState(user: User): Promise<{ state: SubscriptionState; message: string | null }> {
    if (user.role === UserRole.ADMIN || user.role === UserRole.COACH) return { state: SubscriptionState.OK, message: null };
    
    const end = new Date(user.subscriptionEndDate).getTime();
    const now = Date.now();
    const diffDays = (end - now) / (1000 * 60 * 60 * 24);
    
    if (now > end) return { state: SubscriptionState.EXPIRED, message: 'Tu suscripción ha expirado. Por favor, acude a recepción para renovar tu acceso.' };
    if (diffDays <= 3) return { state: SubscriptionState.WARNING, message: `¡Atención Guerrero! Tu suscripción vence en ${Math.ceil(diffDays)} días.` };
    
    return { state: SubscriptionState.OK, message: null };
  },

  async getLiveMetrics() {
    return request<any>('/metrics/live');
  },

  async getRoutines(role: UserRole, userId?: string) {
    const query = userId ? `?userId=${userId}` : '';
    return request<MonthlyRoutine[]>(`/routines${query}`);
  },

  async createRoutine(coachId: string, routine: Partial<MonthlyRoutine>) {
    return request<MonthlyRoutine>('/routines', {
      method: 'POST',
      body: JSON.stringify({ coachId, routine })
    });
  },

  async getLogs(userId: string) {
    return request<WorkoutLog[]>(`/logs?userId=${userId}`);
  },

  async addLog(log: Omit<WorkoutLog, 'id' | 'date'>) {
    return request<WorkoutLog>('/logs', {
      method: 'POST',
      body: JSON.stringify(log)
    });
  },

  async getAuditLogs() {
    return request<AuditLog[]>('/audit');
  },

  async getAllExerciseMedia() {
    return request<Record<string, string>>('/exercises/media');
  },

  async getExerciseMedia(exerciseName: string) {
    return request<{ url: string }>(`/exercises/media/${encodeURIComponent(exerciseName)}`).then(res => res.url);
  },

  async updateExerciseMedia(adminId: string, exerciseName: string, url: string) {
    return request<void>('/exercises/media', {
      method: 'PUT',
      body: JSON.stringify({ adminId, exerciseName, url })
    });
  },

  async getExerciseBank() {
    return request<Record<string, string[]>>('/exercises/bank');
  },

  async getExerciseCategories() {
    return request<string[]>('/exercises/categories');
  },

  async updateExerciseBank(adminId: string, category: string, exercises: string[]) {
    return request<void>('/exercises/bank', {
      method: 'PUT',
      body: JSON.stringify({ adminId, category, exercises })
    });
  },

  async addCategory(adminId: string, categoryName: string) {
    return request<void>('/exercises/categories', {
      method: 'POST',
      body: JSON.stringify({ adminId, categoryName })
    });
  },

  async renameCategory(adminId: string, oldName: string, newName: string) {
    return request<void>('/exercises/categories/rename', {
      method: 'POST',
      body: JSON.stringify({ adminId, oldName, newName })
    });
  },

  async deleteCategory(adminId: string, categoryName: string) {
    return request<void>(`/exercises/categories/${encodeURIComponent(categoryName)}`, {
      method: 'DELETE',
      body: JSON.stringify({ adminId })
    });
  },

  async renameExercise(adminId: string, category: string, oldName: string, newName: string) {
    return request<void>('/exercises/rename', {
      method: 'POST',
      body: JSON.stringify({ adminId, category, oldName, newName })
    });
  }
};

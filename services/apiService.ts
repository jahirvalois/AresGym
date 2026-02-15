
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
import { MOCK_USERS, DEFAULT_BRANDING } from '../constants';
import { EXERCISE_BANK, EXERCISE_CATEGORIES } from '../exerciseBank';
import { db } from './db';

const syncUserStatus = (u: User): User => {
  if (u.role === UserRole.ADMIN || u.role === UserRole.COACH) {
    return { ...u, status: UserStatus.ACTIVE, subscriptionEndDate: '2050-12-31T23:59:59.000Z' };
  }
  const isExpired = new Date(u.subscriptionEndDate) < new Date();
  return {
    ...u,
    status: isExpired ? UserStatus.INACTIVE : UserStatus.ACTIVE
  };
};

export const apiService = {
  async init() {
    await db.init();
    // Seed data if empty
    const users = await db.getAll<User>('users');
    if (users.length === 0) {
      for (const u of MOCK_USERS) await db.put('users', u);
      for (const cat of EXERCISE_CATEGORIES) await db.put('categories', cat, cat);
      await db.put('exerciseBank', EXERCISE_BANK, 'current');
      await db.put('branding', DEFAULT_BRANDING, 'settings');
    }
  },

  async getUsers(): Promise<User[]> {
    const users = await db.getAll<User>('users');
    return users.map(syncUserStatus);
  },
  
  async createUser(currentUser: User, newUser: Partial<User>) {
    const isStaff = newUser.role === UserRole.ADMIN || newUser.role === UserRole.COACH;
    const subDate = isStaff ? '2050-12-31T23:59:59.000Z' : (newUser.subscriptionEndDate || new Date().toISOString());
    const u: User = {
      id: Math.random().toString(36).substr(2, 9),
      email: newUser.email!,
      name: newUser.name!,
      role: newUser.role || UserRole.USER,
      status: UserStatus.ACTIVE,
      subscriptionEndDate: subDate,
      createdAt: new Date().toISOString(),
      isFirstLogin: true 
    };
    await db.put('users', u);
    await this.addAudit(currentUser.id, 'CREATE_USER', `Reclutado: ${u.name} (${u.role})`);
    return u;
  },

  async updateUser(currentUser: User, id: string, updates: Partial<User>) {
    const user = await db.get<User>('users', id);
    if (!user) return null;
    const updated = { ...user, ...updates };
    if (updated.role === UserRole.ADMIN || updated.role === UserRole.COACH) {
      updated.subscriptionEndDate = '2050-12-31T23:59:59.000Z';
    }
    await db.put('users', updated);
    await this.addAudit(currentUser.id, 'UPDATE_USER', `Actualizado Guerrero ID: ${id}`);
    return updated;
  },

  async deleteUser(currentUser: User, id: string) {
    const users = await this.getUsers();
    const target = users.find(u => u.id === id);
    if (target?.role === UserRole.ADMIN && users.filter(u => u.role === UserRole.ADMIN).length <= 1) {
      throw new Error("No se puede eliminar al último administrador.");
    }
    await db.delete('users', id);
    await this.addAudit(currentUser.id, 'DELETE_USER', `Destierro del Guerrero: ${id}`);
  },

  async addAudit(userId: string, action: string, details: string) {
    const log: AuditLog = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      userId,
      action,
      details
    };
    await db.put('audit', log);
  },

  // Added missing method to handle password reset requests
  async requestPasswordReset(email: string) {
    const users = await this.getUsers();
    const user = users.find(u => u.email === email);
    if (user) {
      await this.addAudit(user.id, 'FORGOT_PASSWORD', `Solicitud de recuperación para ${email}`);
      return true;
    }
    return false;
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
    const allUsers = await this.getUsers();
    const cats = await this.getExerciseCategories();
    return {
      totalExercising: Math.floor(allUsers.filter(u => u.status === UserStatus.ACTIVE).length * 0.3) + 1,
      categories: cats.reduce((acc, cat) => {
        acc[cat.replace("RUTINA DE ", "")] = Math.floor(Math.random() * 5);
        return acc;
      }, {} as Record<string, number>)
    };
  },

  async getRoutines(role: UserRole, userId?: string) {
    const routines = await db.getAll<MonthlyRoutine>('routines');
    if (role === UserRole.USER) return routines.filter(r => r.userId === userId && r.status === RoutineStatus.ACTIVE);
    return routines;
  },

  async createRoutine(coachId: string, routine: Partial<MonthlyRoutine>) {
    const existing = await db.getAll<MonthlyRoutine>('routines');
    for (const r of existing) {
      if (r.userId === routine.userId) {
        await db.put('routines', { ...r, status: RoutineStatus.ARCHIVED });
      }
    }
    const r: MonthlyRoutine = {
      id: Math.random().toString(36).substr(2, 9),
      month: routine.month!,
      year: routine.year!,
      userId: routine.userId!,
      coachId: coachId,
      status: RoutineStatus.ACTIVE,
      weeks: routine.weeks || [],
      createdAt: new Date().toISOString()
    };
    await db.put('routines', r);
    await this.addAudit(coachId, 'CREATE_ROUTINE', `Plan táctico forjado para Guerrero ID: ${routine.userId}`);
    return r;
  },

  async getLogs(userId: string) {
    const logs = await db.getAll<WorkoutLog>('logs');
    return logs.filter(l => l.userId === userId);
  },

  async addLog(log: Omit<WorkoutLog, 'id' | 'date'>) {
    const newLog: WorkoutLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString()
    };
    await db.put('logs', newLog);
    return newLog;
  },

  async getAuditLogs() {
    const logs = await db.getAll<AuditLog>('audit');
    return logs.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  async getAllExerciseMedia() {
    return (await db.getAll<any>('exerciseMedia')).reduce((acc: any, curr: any) => {
      // In IndexedDB we might store objects or just direct key-vals depending on put usage
      // Here we assume key-val storage for simplicity
      return acc;
    }, {});
  },

  async getExerciseMedia(exerciseName: string) {
    return await db.get<string>('exerciseMedia', exerciseName) || '';
  },

  async updateExerciseMedia(adminId: string, exerciseName: string, url: string) {
    await db.put('exerciseMedia', url, exerciseName);
  },

  async getExerciseBank() {
    return await db.get<Record<string, string[]>>('exerciseBank', 'current') || {};
  },

  async getExerciseCategories() {
    return await db.getAll<string>('categories');
  },

  async updateExerciseBank(adminId: string, category: string, exercises: string[]) {
    const bank = await this.getExerciseBank();
    bank[category] = exercises;
    await db.put('exerciseBank', bank, 'current');
    await this.addAudit(adminId, 'UPDATE_BANK', `Ejercicios actualizados en ${category}`);
  },

  async addCategory(adminId: string, categoryName: string) {
    const formatted = categoryName.toUpperCase().startsWith("RUTINA DE ") ? categoryName.toUpperCase() : `RUTINA DE ${categoryName.toUpperCase()}`;
    const cats = await this.getExerciseCategories();
    if (!cats.includes(formatted)) {
      await db.put('categories', formatted, formatted);
      const bank = await this.getExerciseBank();
      bank[formatted] = [];
      await db.put('exerciseBank', bank, 'current');
      await this.addAudit(adminId, 'ADD_CATEGORY', `Nueva categoría: ${formatted}`);
    }
  },

  async renameCategory(adminId: string, oldName: string, newName: string) {
    const formatted = newName.toUpperCase().startsWith("RUTINA DE ") ? newName.toUpperCase() : `RUTINA DE ${newName.toUpperCase()}`;
    await db.delete('categories', oldName);
    await db.put('categories', formatted, formatted);
    const bank = await this.getExerciseBank();
    bank[formatted] = bank[oldName];
    delete bank[oldName];
    await db.put('exerciseBank', bank, 'current');
    await this.addAudit(adminId, 'RENAME_CATEGORY', `${oldName} -> ${formatted}`);
  },

  async deleteCategory(adminId: string, categoryName: string) {
    await db.delete('categories', categoryName);
    const bank = await this.getExerciseBank();
    delete bank[categoryName];
    await db.put('exerciseBank', bank, 'current');
    await this.addAudit(adminId, 'DELETE_CATEGORY', `Categoría borrada: ${categoryName}`);
  },

  async renameExercise(adminId: string, category: string, oldName: string, newName: string) {
    const bank = await this.getExerciseBank();
    if (!bank[category]) return;
    bank[category] = bank[category].map(ex => ex === oldName ? newName : ex);
    const media = await db.get<string>('exerciseMedia', oldName);
    if (media) {
      await db.put('exerciseMedia', media, newName);
      await db.delete('exerciseMedia', oldName);
    }
    await db.put('exerciseBank', bank, 'current');
    await this.addAudit(adminId, 'RENAME_EXERCISE', `${oldName} -> ${newName}`);
  }
};

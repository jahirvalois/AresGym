
import { 
  User, 
  MonthlyRoutine, 
  WorkoutLog, 
  UserRole, 
  UserStatus,
  RoutineStatus, 
  AuditLog,
  SubscriptionState 
} from './types';

// Simulated DB
let users: User[] = JSON.parse(localStorage.getItem('gym_users') || '[]');
let routines: MonthlyRoutine[] = JSON.parse(localStorage.getItem('gym_routines') || '[]');
let logs: WorkoutLog[] = JSON.parse(localStorage.getItem('gym_logs') || '[]');
let auditLogs: AuditLog[] = JSON.parse(localStorage.getItem('gym_audit') || '[]');
let exerciseMedia: Record<string, string> = JSON.parse(localStorage.getItem('gym_exercise_media') || '{}');

// exerciseBank defaults are optional in this environment; use empty defaults if not present
let dynamicExerciseBank: Record<string, string[]> = JSON.parse(
  localStorage.getItem('gym_exercise_bank') || '{}'
);
let dynamicCategories: string[] = JSON.parse(
  localStorage.getItem('gym_exercise_categories') || '[]'
);

const save = () => {
  localStorage.setItem('gym_users', JSON.stringify(users));
  localStorage.setItem('gym_routines', JSON.stringify(routines));
  localStorage.setItem('gym_logs', JSON.stringify(logs));
  localStorage.setItem('gym_audit', JSON.stringify(auditLogs));
  localStorage.setItem('gym_exercise_media', JSON.stringify(exerciseMedia));
  localStorage.setItem('gym_exercise_bank', JSON.stringify(dynamicExerciseBank));
  localStorage.setItem('gym_exercise_categories', JSON.stringify(dynamicCategories));
};

const addAudit = (userId: string, action: string, details: string) => {
  auditLogs.unshift({
    id: Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    userId,
    action,
    details
  });
  save();
};

const syncUserStatus = (u: User): User => {
  // Admin y Coach nunca expiran
  if (u.role === UserRole.ADMIN || u.role === UserRole.COACH) {
    return { ...u, status: UserStatus.ACTIVE, subscriptionEndDate: '2050-12-31T23:59:59.000Z' };
  }
  
  // Usuario normal depende de la fecha
  const isExpired = new Date(u.subscriptionEndDate) < new Date();
  return {
    ...u,
    status: isExpired ? UserStatus.INACTIVE : UserStatus.ACTIVE
  };
};

export const apiService = {
  getUsers: () => users.map(syncUserStatus),
  
  createUser: (currentUser: User, newUser: Partial<User>) => {
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
    users.push(u);
    addAudit(currentUser.id, 'CREATE_USER', `Reclutado: ${u.name} (${u.role})`);
    save();
    return u;
  },

  updateUser: (currentUser: User, id: string, updates: Partial<User>) => {
    users = users.map(u => {
      if (u.id === id) {
        const updated = { ...u, ...updates };
        // Asegurar que staff no expire aunque se intente editar
        if (updated.role === UserRole.ADMIN || updated.role === UserRole.COACH) {
          updated.subscriptionEndDate = '2050-12-31T23:59:59.000Z';
        }
        return updated;
      }
      return u;
    });
    addAudit(currentUser.id, 'UPDATE_USER', `Actualizado Guerrero ID: ${id}`);
    save();
    return users.find(u => u.id === id);
  },

  deleteUser: (currentUser: User, id: string) => {
    const target = users.find(u => u.id === id);
    if (target?.role === UserRole.ADMIN && users.filter(u => u.role === UserRole.ADMIN).length <= 1) {
      throw new Error("No se puede eliminar al último administrador.");
    }
    users = users.filter(u => u.id !== id);
    addAudit(currentUser.id, 'DELETE_USER', `Destierro del Guerrero: ${id}`);
    save();
  },

  requestPasswordReset: (email: string) => {
    const user = users.find(u => u.email === email);
    if (user) {
      addAudit(user.id, 'FORGOT_PASSWORD', `Solicitud de recuperación para ${email}`);
      return true;
    }
    return false;
  },

  getSubscriptionState: (user: User): { state: SubscriptionState; message: string | null } => {
    if (user.role === UserRole.ADMIN || user.role === UserRole.COACH) return { state: SubscriptionState.OK, message: null };
    
    const end = new Date(user.subscriptionEndDate).getTime();
    const now = Date.now();
    const diffDays = (end - now) / (1000 * 60 * 60 * 24);
    
    if (now > end) return { state: SubscriptionState.EXPIRED, message: 'Tu suscripción ha expirado. Por favor, acude a recepción para renovar tu acceso.' };
    if (diffDays <= 3) return { state: SubscriptionState.WARNING, message: `¡Atención Guerrero! Tu suscripción vence en ${Math.ceil(diffDays)} días.` };
    
    return { state: SubscriptionState.OK, message: null };
  },

  getLiveMetrics: () => {
    const allUsers = users.map(syncUserStatus);
    return {
      totalExercising: Math.floor(allUsers.filter(u => u.status === UserStatus.ACTIVE).length * 0.3) + 1,
      categories: dynamicCategories.reduce((acc, cat) => {
        acc[cat.replace("RUTINA DE ", "")] = Math.floor(Math.random() * 5);
        return acc;
      }, {} as Record<string, number>)
    };
  },

  getRoutines: (role: UserRole, userId?: string) => {
    if (role === UserRole.USER) return routines.filter(r => r.userId === userId && r.status === RoutineStatus.ACTIVE);
    return routines;
  },

  createRoutine: (coachId: string, routine: Partial<MonthlyRoutine>) => {
    routines = routines.map(r => r.userId === routine.userId ? { ...r, status: RoutineStatus.ARCHIVED } : r);
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
    routines.push(r);
    addAudit(coachId, 'CREATE_ROUTINE', `Plan táctico forjado para Guerrero ID: ${routine.userId}`);
    save();
    return r;
  },

  getLogs: (userId: string) => logs.filter(l => l.userId === userId),

  // Fix: Added missing addLog method required by DashboardUser.tsx
  addLog: (log: Omit<WorkoutLog, 'id' | 'date'>) => {
    const newLog: WorkoutLog = {
      ...log,
      id: Math.random().toString(36).substr(2, 9),
      date: new Date().toISOString()
    };
    logs.push(newLog);
    save();
    return newLog;
  },

  getAuditLogs: () => auditLogs,
  getAllExerciseMedia: () => exerciseMedia,
  getExerciseMedia: (exerciseName: string) => exerciseMedia[exerciseName] || '',
  updateExerciseMedia: (adminId: string, exerciseName: string, url: string) => {
    exerciseMedia[exerciseName] = url;
    save();
  },
  getExerciseBank: () => dynamicExerciseBank,
  getExerciseCategories: () => dynamicCategories,
  updateExerciseBank: (adminId: string, category: string, exercises: string[]) => {
    dynamicExerciseBank[category] = exercises;
    save();
  },
  addCategory: (adminId: string, categoryName: string) => {
    const formatted = categoryName.toUpperCase().startsWith("RUTINA DE ") ? categoryName.toUpperCase() : `RUTINA DE ${categoryName.toUpperCase()}`;
    if (!dynamicCategories.includes(formatted)) {
      dynamicCategories.push(formatted);
      dynamicExerciseBank[formatted] = [];
      save();
    }
  },
  deleteCategory: (adminId: string, categoryName: string) => {
    dynamicCategories = dynamicCategories.filter(c => c !== categoryName);
    delete dynamicExerciseBank[categoryName];
    save();
  },
  renameExercise: (adminId: string, category: string, oldName: string, newName: string) => {
    if (!dynamicExerciseBank[category]) return;
    dynamicExerciseBank[category] = dynamicExerciseBank[category].map(ex => ex === oldName ? newName : ex);
    if (exerciseMedia[oldName]) {
      exerciseMedia[newName] = exerciseMedia[oldName];
      delete exerciseMedia[oldName];
    }
    save();
  }
};

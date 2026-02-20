
export enum UserRole {
  ADMIN = 'ADMIN',
  COACH = 'COACH',
  USER = 'USER'
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}

export enum RoutineStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  subscriptionEndDate: string; // ISO string
  createdAt: string;
  profilePicture?: string; // Base64 string
  password?: string;
  isFirstLogin: boolean;
  // Optional provider/origin fields for social logins
  provider?: string;
  providerId?: string;
  origin?: 'manual' | 'google' | 'microsoft';
}

export interface Exercise {
  id: string;
  name: string;
  series: number;
  reps: string;
  targetWeight: number;
  rpe: number;
  rest: string;
  notes: string;
  mediaUrl?: string;
}

export interface DayRoutine {
  dayName: string;
  exercises: Exercise[];
}

export interface WeekRoutine {
  weekNumber: number;
  days: DayRoutine[];
}

export interface MonthlyRoutine {
  id: string;
  month: number;
  year: number;
  userId: string;
  coachId: string;
  status: RoutineStatus;
  weeks: WeekRoutine[];
  createdAt: string;
}

export interface WorkoutLog {
  id: string;
  exerciseId: string;
  routineId: string;
  userId: string;
  weightUsed: number;
  repsDone: number;
  rpe: number;
  notes: string;
  date: string;
}

export interface BrandingSettings {
  logo: string;
  gymName: string;
  primaryColor: string;
  secondaryColor: string;
  loginBgUrl: string;
  welcomeText: string;
  contactInfo: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  details: string;
}

export enum SubscriptionState {
  EXPIRED = 'EXPIRED',
  WARNING = 'WARNING',
  OK = 'OK'
}

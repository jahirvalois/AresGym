
import { BrandingSettings, UserRole, UserStatus, User } from './types';

export const DEFAULT_BRANDING: BrandingSettings = {
  logo: 'https://game-icons.net/icons/000000/ffffff/1x1/delapouite/spartan-helmet.png',
  gymName: 'Ares GYM',
  primaryColor: '#eab308', // yellow-600 (Oro)
  secondaryColor: '#000000', // Negro
  loginBgUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop',
  welcomeText: 'PREPÁRATE PARA LA GLORIA',
  contactInfo: '+1 234 567 890 | ares@gym.com'
};

// Fechas calculadas para las pruebas
const now = new Date();
const tomorrow = new Date(now);
tomorrow.setDate(now.getDate() + 1);

const nextMonth = new Date(now);
nextMonth.setMonth(now.getMonth() + 1);

const fiveDaysAgo = new Date(now);
fiveDaysAgo.setDate(now.getDate() - 5);

/* 
export const MOCK_USERS: User[] = [
  {
    id: 'admin-01',
    email: 'admin@ares.com',
    name: 'Admin Ares',
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    subscriptionEndDate: '2050-12-31',
    createdAt: now.toISOString(),
    isFirstLogin: false,
    password: 'password123'
  },
  {
    id: 'coach-01',
    email: 'coach@ares.com',
    name: 'Coach Leonidas',
    role: UserRole.COACH,
    status: UserStatus.ACTIVE,
    subscriptionEndDate: '2050-12-31',
    createdAt: now.toISOString(),
    isFirstLogin: false,
    password: 'password123'
  },
  {
    id: 'user-ok',
    email: 'cliente@ares.com',
    name: 'Juan Guerrero',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    subscriptionEndDate: nextMonth.toISOString(),
    createdAt: now.toISOString(),
    isFirstLogin: false,
    password: 'password123'
  },
  {
    id: 'user-warning',
    email: 'vence@ares.com',
    name: 'Marcos Alerta',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    subscriptionEndDate: tomorrow.toISOString(),
    createdAt: now.toISOString(),
    isFirstLogin: false,
    password: 'password123'
  },
  {
    id: 'user-expired',
    email: 'deudor@ares.com',
    name: 'Pedro Moroso',
    role: UserRole.USER,
    status: UserStatus.INACTIVE,
    subscriptionEndDate: fiveDaysAgo.toISOString(),
    createdAt: now.toISOString(),
    isFirstLogin: false,
    password: 'password123'
  },
  {
    id: 'user-new',
    email: 'recluta@ares.com',
    name: 'Nuevo Guerrero',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    subscriptionEndDate: nextMonth.toISOString(),
    createdAt: now.toISOString(),
    isFirstLogin: true,
    // Sin password inicial para forzar flujo de configuración
  }
];
*/
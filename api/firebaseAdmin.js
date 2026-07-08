import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Инициализация Firebase Admin SDK (один раз на холодный старт функции)
if (!getApps().length) {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  // Раньше при отсутствующей переменной окружения падало с невнятным
  // "Cannot read properties of undefined (reading 'replace')" — сложно
  // понять причину по логам Vercel. Проверяем явно и говорим прямо, чего не хватает.
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new Error('Не заданы переменные окружения Firebase (FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY)');
  }
  initializeApp({
    credential: cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      // В env-переменных Vercel переносы строк хранятся как "\n" (текст),
      // поэтому их нужно превратить в настоящие переносы строк
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

export const db = getFirestore();

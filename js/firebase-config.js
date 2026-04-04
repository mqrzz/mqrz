// Firebase SDK импорты
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Твоя конфигурация Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDnZYDZ4O8SceE-YE5VQmvHrQp11xmOwww",
  authDomain: "aaaa-1a258.firebaseapp.com",
  projectId: "aaaa-1a258",
  storageBucket: "aaaa-1a258.firebasestorage.app",
  messagingSenderId: "133636868630",
  appId: "1:133636868630:web:20ab0b2dabae524b950337",
  measurementId: "G-Q7HPYSX4QW"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);

// Экспорты для использования в других файлах
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

// Экспорты функций для удобства
export { 
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  writeBatch
};

// Настройка Google провайдера (добавляем дополнительные scope если нужно)
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

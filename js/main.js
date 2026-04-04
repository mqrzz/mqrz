import { 
    auth, 
    googleProvider, 
    signInWithPopup, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    sendPasswordResetEmail,
    sendEmailVerification,
    updateProfile,
    db, 
    doc, 
    setDoc, 
    getDoc, 
    updateDoc, 
    Timestamp 
} from './firebase-config.js';
import { showToast, showLoading, sendEmailNotification } from './main.js';

// ========== РЕГИСТРАЦИЯ ЧЕРЕЗ EMAIL ==========
export async function registerWithEmail(email, password, displayName = '') {
    if (!email || !password) {
        showToast('Заполните email и пароль', 'error');
        return false;
    }
    
    if (password.length < 6) {
        showToast('Пароль должен быть не менее 6 символов', 'error');
        return false;
    }
    
    showLoading(true);
    try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCred.user;
        
        // Отправка подтверждения email
        await sendEmailVerification(user);
        
        // Обновление профиля
        if (displayName) {
            await updateProfile(user, { displayName: displayName });
        }
        
        // Сохранение в Firestore
        await setDoc(doc(db, 'users', user.uid), {
            email: email,
            displayName: displayName || email.split('@')[0],
            role: 'user',
            createdAt: Timestamp.now(),
            lastLogin: Timestamp.now(),
            isBlocked: false,
            isDeleted: false,
            telegram: '',
            phone: '',
            emailVerified: false
        });
        
        showToast('Регистрация успешна! Подтвердите email', 'success');
        
        // Отправка приветственного письма
        await sendEmailNotification(
            email,
            'Добро пожаловать в Design Antviz!',
            `Здравствуйте, ${displayName || email.split('@')[0]}!\n\nСпасибо за регистрацию в Design Antviz.`
        );
        
        return true;
    } catch (error) {
        console.error('Register error:', error);
        let message = 'Ошибка регистрации';
        if (error.code === 'auth/email-already-in-use') message = 'Email уже используется';
        if (error.code === 'auth/weak-password') message = 'Слабый пароль (минимум 6 символов)';
        if (error.code === 'auth/invalid-email') message = 'Неверный формат email';
        if (error.code === 'auth/operation-not-allowed') message = 'Регистрация отключена. Включите Email/Password в консоли Firebase';
        showToast(message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== ВХОД ЧЕРЕЗ EMAIL ==========
export async function loginWithEmail(email, password) {
    if (!email || !password) {
        showToast('Заполните email и пароль', 'error');
        return false;
    }
    
    showLoading(true);
    try {
        const userCred = await signInWithEmailAndPassword(auth, email, password);
        const user = userCred.user;
        
        // Проверка на блокировку
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists() && userDoc.data().isBlocked) {
            await signOut(auth);
            showToast('Ваш аккаунт заблокирован. Свяжитесь с поддержкой.', 'error');
            return false;
        }
        
        if (userDoc.exists() && userDoc.data().isDeleted) {
            await signOut(auth);
            showToast('Аккаунт удален', 'error');
            return false;
        }
        
        // Обновляем lastLogin
        await updateDoc(doc(db, 'users', user.uid), {
            lastLogin: Timestamp.now()
        });
        
        showToast('Вход выполнен успешно!', 'success');
        return true;
    } catch (error) {
        console.error('Login error:', error);
        let message = 'Ошибка входа';
        if (error.code === 'auth/invalid-credential') message = 'Неверный email или пароль';
        if (error.code === 'auth/user-not-found') message = 'Пользователь не найден';
        if (error.code === 'auth/too-many-requests') message = 'Слишком много попыток. Попробуйте позже';
        if (error.code === 'auth/operation-not-allowed') message = 'Вход отключен. Включите Email/Password в консоли Firebase';
        showToast(message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== ВХОД ЧЕРЕЗ GOOGLE ==========
export async function loginWithGoogle() {
    showLoading(true);
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists() && userDoc.data().isBlocked) {
            await signOut(auth);
            showToast('Ваш аккаунт заблокирован', 'error');
            return false;
        }
        
        if (!userDoc.exists()) {
            await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: 'user',
                createdAt: Timestamp.now(),
                lastLogin: Timestamp.now(),
                isBlocked: false,
                isDeleted: false,
                telegram: '',
                phone: '',
                avatar: user.photoURL || '',
                emailVerified: user.emailVerified
            });
            
            await sendEmailNotification(
                user.email,
                'Добро пожаловать в Design Antviz!',
                `Здравствуйте, ${user.displayName || user.email.split('@')[0]}!\n\nСпасибо за регистрацию через Google.`
            );
        } else {
            await updateDoc(userRef, {
                lastLogin: Timestamp.now(),
                avatar: user.photoURL || userDoc.data().avatar
            });
        }
        
        showToast('Вход через Google выполнен!', 'success');
        return true;
    } catch (error) {
        console.error('Google login error:', error);
        showToast('Ошибка входа через Google', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== ВЫХОД ==========
export async function logout() {
    showLoading(true);
    try {
        await signOut(auth);
        showToast('Вы вышли из аккаунта', 'success');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1000);
    } catch (error) {
        showToast('Ошибка выхода', 'error');
    } finally {
        showLoading(false);
    }
}

// ========== СБРОС ПАРОЛЯ ==========
export async function resetPassword(email) {
    if (!email) {
        showToast('Введите email', 'error');
        return false;
    }
    
    showLoading(true);
    try {
        await sendPasswordResetEmail(auth, email);
        showToast('Ссылка для сброса пароля отправлена на email', 'success');
        return true;
    } catch (error) {
        console.error('Reset password error:', error);
        let message = 'Ошибка сброса пароля';
        if (error.code === 'auth/user-not-found') message = 'Пользователь с таким email не найден';
        if (error.code === 'auth/invalid-email') message = 'Неверный формат email';
        showToast(message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== ОБНОВЛЕНИЕ ПРОФИЛЯ ==========
export async function updateUserProfile(userId, data) {
    showLoading(true);
    try {
        await updateDoc(doc(db, 'users', userId), {
            ...data,
            updatedAt: Timestamp.now()
        });
        
        if (data.displayName && auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName: data.displayName });
        }
        
        showToast('Профиль обновлен', 'success');
        return true;
    } catch (error) {
        console.error('Update profile error:', error);
        showToast('Ошибка обновления профиля', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== ПОВТОРНАЯ ОТПРАВКА ПОДТВЕРЖДЕНИЯ ==========
export async function resendVerificationEmail() {
    const user = auth.currentUser;
    if (!user) {
        showToast('Войдите в аккаунт', 'error');
        return false;
    }
    
    if (user.emailVerified) {
        showToast('Email уже подтвержден', 'warning');
        return false;
    }
    
    showLoading(true);
    try {
        await sendEmailVerification(user);
        showToast('Письмо подтверждения отправлено', 'success');
        return true;
    } catch (error) {
        showToast('Ошибка отправки', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== УДАЛЕНИЕ АККАУНТА ==========
export async function deleteAccount(userId) {
    if (!confirm('Вы уверены? Аккаунт будет помечен как удаленный.')) {
        return false;
    }
    
    showLoading(true);
    try {
        await updateDoc(doc(db, 'users', userId), {
            isDeleted: true,
            deletedAt: Timestamp.now(),
            deletedEmail: auth.currentUser?.email
        });
        
        await signOut(auth);
        showToast('Аккаунт удален', 'success');
        window.location.href = '/index.html';
        return true;
    } catch (error) {
        showToast('Ошибка удаления аккаунта', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// ========== ПОЛУЧЕНИЕ ДАННЫХ ПОЛЬЗОВАТЕЛЯ ==========
export async function getUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Get user data error:', error);
        return null;
    }
}

// ========== ПРОВЕРКА АДМИНА (CUSTOM CLAIMS) ==========
export async function checkIsAdmin(user) {
    if (!user) return false;
    try {
        const idTokenResult = await user.getIdTokenResult();
        return idTokenResult.claims.admin === true;
    } catch (error) {
        console.error('Check admin error:', error);
        return false;
    }
}

// ========== ОБНОВЛЕНИЕ НАВИГАЦИИ ==========
export function updateNavAuth(user) {
    const authContainer = document.getElementById('authContainer');
    if (!authContainer) return;
    
    if (user) {
        authContainer.innerHTML = `
            <div class="user-avatar" onclick="window.location.href='/profile.html'">
                <i class="fas fa-user"></i>
            </div>
        `;
    } else {
        authContainer.innerHTML = `<button class="auth-btn" onclick="window.showAuthModal && window.showAuthModal()">Войти / Регистрация</button>`;
    }
}

// Глобальные функции для HTML
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.loginWithGoogle = loginWithGoogle;
window.resetPassword = resetPassword;
window.logout = logout;
window.resendVerificationEmail = resendVerificationEmail;
window.checkIsAdmin = checkIsAdmin;
window.updateNavAuth = updateNavAuth;

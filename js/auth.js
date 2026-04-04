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
import { showToast, showLoading, checkIsAdmin, sendEmailNotification } from './main.js';

// Регистрация через Email
export async function registerWithEmail(email, password, displayName = '') {
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
        
        // Отправка приветственного email
        await sendEmailNotification(
            email,
            'Добро пожаловать в Design Antviz!',
            `Здравствуйте, ${displayName || email.split('@')[0]}!\n\nСпасибо за регистрацию в Design Antviz. Теперь вы можете оформлять заказы, добавлять услуги в избранное и общаться с поддержкой.\n\nС уважением, команда Design Antviz.`
        );
        
        return true;
    } catch (error) {
        let message = 'Ошибка регистрации';
        if (error.code === 'auth/email-already-in-use') message = 'Email уже используется';
        if (error.code === 'auth/weak-password') message = 'Слабый пароль (минимум 6 символов)';
        if (error.code === 'auth/invalid-email') message = 'Неверный формат email';
        showToast(message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// Вход через Email
export async function loginWithEmail(email, password) {
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
        let message = 'Ошибка входа';
        if (error.code === 'auth/invalid-credential') message = 'Неверный email или пароль';
        if (error.code === 'auth/user-not-found') message = 'Пользователь не найден';
        if (error.code === 'auth/too-many-requests') message = 'Слишком много попыток. Попробуйте позже';
        showToast(message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// Вход через Google
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
            const isAdmin = await checkIsAdmin(user);
            await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                role: isAdmin ? 'admin' : 'user',
                createdAt: Timestamp.now(),
                lastLogin: Timestamp.now(),
                isBlocked: false,
                isDeleted: false,
                telegram: '',
                phone: '',
                avatar: user.photoURL || '',
                emailVerified: user.emailVerified
            });
            
            // Приветственное письмо
            await sendEmailNotification(
                user.email,
                'Добро пожаловать в Design Antviz!',
                `Здравствуйте, ${user.displayName || user.email.split('@')[0]}!\n\nСпасибо за регистрацию через Google. Теперь вы можете оформлять заказы, добавлять услуги в избранное и общаться с поддержкой.\n\nС уважением, команда Design Antviz.`
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

// Выход из аккаунта
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

// Сброс пароля
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
        let message = 'Ошибка сброса пароля';
        if (error.code === 'auth/user-not-found') message = 'Пользователь с таким email не найден';
        if (error.code === 'auth/invalid-email') message = 'Неверный формат email';
        showToast(message, 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// Обновление профиля пользователя
export async function updateUserProfile(userId, data) {
    showLoading(true);
    try {
        await updateDoc(doc(db, 'users', userId), {
            ...data,
            updatedAt: Timestamp.now()
        });
        
        // Обновляем displayName в Auth если нужно
        if (data.displayName && auth.currentUser) {
            await updateProfile(auth.currentUser, { displayName: data.displayName });
        }
        
        showToast('Профиль обновлен', 'success');
        return true;
    } catch (error) {
        showToast('Ошибка обновления профиля', 'error');
        return false;
    } finally {
        showLoading(false);
    }
}

// Отправить повторное письмо подтверждения
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

// Мягкое удаление аккаунта
export async function deleteAccount(userId) {
    if (!confirm('Вы уверены? Аккаунт будет помечен как удаленный. Вы не сможете войти снова.')) {
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

// Получение данных пользователя
export async function getUserData(userId) {
    try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Ошибка получения данных пользователя:', error);
        return null;
    }
}

// Экспорт в глобальный объект для использования в HTML
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.loginWithGoogle = loginWithGoogle;
window.resetPassword = resetPassword;
window.logout = logout;
window.resendVerificationEmail = resendVerificationEmail;

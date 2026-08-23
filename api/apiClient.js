// Общий клиент для вызова API antviz (заменяет firebaseAdmin.js — теперь
// эта функция не читает/пишет Firestore напрямую, а обращается к нашему
// собственному бэкенду на VPS, где реально живут заказы и заявки.

const API_BASE = process.env.ANTVIZ_API_URL || 'https://antviz.ru/api';

// Вызов от лица юзера — передаём короткоживущий сервисный токен, который
// браузер получил через POST /api/auth/service-token и прислал сюда в
// заголовке Authorization при вызове createPayment/checkPayment.
export async function apiAsUser(path, token, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  return resp;
}

// Вызов от имени сервера (вебхук) — общий секрет, а не токен юзера,
// потому что у вебхука ЮКассы нет "текущего пользователя" вообще.
export async function apiAsWebhook(path, options = {}) {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Secret': process.env.PAYMENT_WEBHOOK_SECRET,
      ...(options.headers || {}),
    },
  });
  return resp;
}

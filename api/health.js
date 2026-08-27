// api/health.js
//
// Лёгкая проверка живости этого деплоя — специально БЕЗ авторизации и без
// похода в внешние сервисы (YooKassa и т.д.), чтобы не тратить их лимиты
// и не зависеть от них: если этот файл вообще выполнился и ответил 200 —
// значит серверлес-функции здесь живы.
//
// ВАЖНО: если в Project Settings → Deployment Protection у этого проекта
// включена защита (Vercel Authentication / пароль), она блокирует ВСЕ
// запросы, включая этот, ещё до того как код ниже успеет выполниться —
// снаружи это выглядит как 401/403 на любой путь. Либо выключи защиту для
// Production в настройках проекта, либо сгенерируй там же Protection Bypass
// for Automation и передай токен монитору статус-страницы (заголовок
// x-vercel-protection-bypass), см. check_headers в админке /status.

export default function handler(req, res) {
  res.status(200).json({ ok: true, service: 'antviz-payments', ts: new Date().toISOString() });
}

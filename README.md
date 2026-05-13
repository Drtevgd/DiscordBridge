# Discord Bridge — Railway Deploy

## Архитектура
```
[Rust Server + ACoreBridge.cs]
        │
        │  HTTP POST  (JSON + x-api-secret)
        ▼
[Railway — index.js]
        │
        │  discord.js
        ▼
[Discord Bot → каналы]
```

---

## 1. Деплой на Railway

### Шаг 1 — Создай репозиторий
Папку `DiscordBridge` залей в отдельный GitHub репозиторий.
```
discord-bridge/
  index.js
  package.json
  nixpacks.toml
  .railwayignore
```

### Шаг 2 — Создай проект на Railway
1. Зайди на [railway.app](https://railway.app)
2. **New Project → Deploy from GitHub repo** → выбери репозиторий
3. Railway сам определит Node.js и запустит `node index.js`

### Шаг 3 — Задай переменные окружения
В Railway открой проект → вкладка **Variables** → добавь:

| Переменная           | Значение                          |
|----------------------|-----------------------------------|
| `BOT_TOKEN`          | токен твоего Discord бота         |
| `API_SECRET`         | любой секрет, например `xK9mP2qR7vL` |
| `CH_SCREENSHOT_ADMIN`| ID канала для скринов (админы)    |
| `CH_SCREENSHOT_MODER`| ID канала для скринов (модеры)    |
| `CH_BAN_LOG`         | ID канала бан-лога                |
| `CH_KEY_LOG`         | ID канала кейлога                 |
| `CH_STEAM_ACCOUNTS`  | ID канала steam accounts          |

> `PORT` Railway выставляет сам — не трогай.

### Шаг 4 — Получи публичный URL
В Railway → вкладка **Settings → Networking → Generate Domain**
Получишь URL вида: `https://discord-bridge-production-xxxx.up.railway.app`

---

## 2. Настройка ACoreBridge.cs

Открой `ACoreBridge.cs` и замени две строки:
```csharp
private const string BridgeUrl    = "https://discord-bridge-production-xxxx.up.railway.app";
private const string BridgeSecret = "xK9mP2qR7vL";  // тот же что в Railway Variables
```

Положи файл в `oxide/plugins/` на Rust сервере.

---

## 3. Проверка

Открой в браузере:
```
https://YOUR_RAILWAY_URL/health
```
Должно вернуть:
```json
{ "ok": true, "bot": true, "uptime": 123 }
```

В логах Railway (вкладка **Deployments → View Logs**) должно быть:
```
[BOT] Залогинен как YourBot#1234
[HTTP] Сервер запущен на порту XXXX
```

---

## Безопасность

Railway автоматически даёт HTTPS — трафик зашифрован.
`API_SECRET` защищает от чужих запросов к твоему bridge.
Используй секрет длиной 20+ символов.

# green-api-test

Небольшое приложение для отправки и получения текстовых сообщений в MAX через GREEN-API. Поддерживает несколько чатов и работает на компьютерах и мобильных устройствах.

## Стек

React, TypeScript, Vite, SCSS/BEM, Netlify Functions.

## Локальный запуск

Требуется Node.js 22.12+.

```sh
git clone https://github.com/olestch/green-api-test.git
cd green-api-test
npm ci
npm run dev
```

Откройте [http://localhost:8888](http://localhost:8888).

Для подключения:

1. Создайте и авторизуйте инстанс MAX в [кабинете GREEN-API](https://console.green-api.com/).
2. Включите входящие уведомления (`incomingWebhook: yes`), очистите `webhookUrl` и сохраните настройки. Подождите около минуты.
3. Введите в приложении `idInstance`, `apiTokenInstance` и `apiUrl` из кабинета, затем нажмите «Подключиться».
4. Нажмите + и введите номер получателя: +7 для России или +375 для Беларуси.

## Деплой на Netlify

1. В Netlify импортируйте репозиторий [olestch/green-api-test](https://github.com/olestch/green-api-test) и выберите ветку `main`.
2. Используйте настройки из `netlify.toml`: сборка — `npm run build`, каталог публикации — `dist`, функции — `netlify/functions`. Переменные окружения не нужны.
3. Запустите деплой, откройте выданный HTTPS-адрес и подключите GREEN-API через форму приложения.

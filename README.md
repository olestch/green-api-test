# green-api-test

A small MAX text messenger using React, TypeScript, Vite, SCSS/BEM and one Netlify Function. Russian UI, multiple chats, search, phone resolution, Enter/Shift+Enter composer, automatic incoming messages and mobile back navigation. No database or state library.

## Install and run

Use Node 22.12+ (or Node 24):

```sh
npm ci
npm run dev
```

Open http://localhost:8888. Netlify Dev runs Vite and the function together; `npm run dev:ui` alone cannot connect to GREEN-API. No Netlify account or environment secrets are needed for local development.

```sh
npm test
npm run typecheck
npm run build
```

## Connect GREEN-API MAX

1. Create and authorize a **MAX** instance in the [GREEN-API console](https://console.green-api.com/).
2. Enable incoming message notifications (`incomingWebhook: yes`), clear `webhookUrl`, save and allow about a minute for settings to apply. Use only this application as the instance's notification consumer.
3. Copy `idInstance`, `apiTokenInstance` and **apiUrl** from the console into the connection form. Supported hosts: `https://<digits>.api.green-api.com` and `https://api.green-api.com`. Do not guess the host from the instance ID.
4. Click “Подключиться”, then + and enter an RF (+7) or Belarus (+375) phone number. Domestic RF 8 is normalized to 7. The documented `checkAccount` resolves the actual MAX `chatId`; phone visibility/privacy restrictions can prevent lookup.

Credentials remain in tab memory and are sent as JSON to the same-origin HTTPS function. They are never stored in localStorage, server state or application logs. GREEN-API itself requires the token in its upstream URL path; that URL is constructed only on the server and errors are sanitized. Avoid enabling request-body or upstream-URL logging in hosting instrumentation.

## API behavior

Verified against official MAX documentation: [request format](https://green-api.com/v3/docs/request-format/), [connection state](https://green-api.com/v3/docs/api/account/GetStateInstance/), [phone lookup](https://green-api.com/v3/docs/api/service/CheckAccount/), [send text](https://green-api.com/v3/docs/api/sending/SendMessage/), [HTTP reception and settings](https://green-api.com/v3/docs/api/receiving/technology-http-api/), [receive](https://green-api.com/v3/docs/api/receiving/technology-http-api/ReceiveNotification/), [acknowledge](https://green-api.com/v3/docs/api/receiving/technology-http-api/DeleteNotification/), [text payload](https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/TextMessage/), [URL text payload](https://green-api.com/v3/docs/api/receiving/notifications-format/incoming-message/ExtendedTextMessage/).

Sending is limited to 4000 characters (conservative JavaScript UTF-16 length). `idMessage` means queued by the API, so the UI shows “В очереди API”, never claims delivery. A failed/ambiguous request is not automatically resent. Incoming text and extended text route by `senderData.chatId`; IDs are deduplicated per chat. Notifications are processed before acknowledgement. Unsupported events are intentionally acknowledged and discarded. Failed acknowledgements retry through the queue without duplicating messages.

Polling uses a 5-second server wait plus 700ms between completed requests (5s on error), with no overlapping requests in a session. Disconnect/unmount aborts requests and cancels timers. Each function invocation is a regular HTTP request; no background server process is used.

## Netlify deployment

Create a new public GitHub repository named `green-api-test` under your account **only if it does not already exist**. Repository creation was unavailable through the connected GitHub tool, so no remote repository was created or pushed.

This folder is ready to publish. After creating the empty repository:

```sh
git remote add origin https://github.com/YOUR_ACCOUNT/green-api-test.git
git push -u origin main
```

In Netlify, import that repository. `netlify.toml` configures `npm run build`, publish directory `dist`, functions directory `netlify/functions`, Node 22 and SPA routing. No environment variables are needed. Use the resulting HTTPS URL; enter credentials in the application.

## Limitations and manual verification

Validation completed: TypeScript check and Vite production build passed; all five Node tests passed. Headless Edge checks passed for connection, multiline sending, multiple-chat routing, duplicate notification handling, acknowledgements, non-overlapping polling, mobile/back navigation, disconnect cancellation and absence of persistent token storage. The local Netlify Dev server loaded the function and responded to a validation request.

No real credentials were supplied: live authorization, phone lookup, send/receive, account privacy restrictions and real Netlify hosting remain to be verified. Unit tests mock the upstream API; they do not demonstrate real message delivery. Browser checks also use mocked API responses.

History and credentials disappear on reload/disconnect. Only text messages are displayed; attachments and message edits/deletions/status notifications are discarded. No historical synchronization, read receipts or delivery tracking. One active tab/consumer per instance. Background-tab throttling can delay polling. Reloading loses messages already acknowledged to GREEN-API; this is intentional for the memory-only MVP.

Manual smoke check: connect a real authorized MAX instance; create two chats; send with Enter and multiline with Shift+Enter; reply from each phone and check routing; disconnect during polling; verify invalid credentials, an unavailable recipient, empty/4001-character input, API/network failures, and the mobile back button. If a send times out, check MAX before retrying to avoid sending twice.

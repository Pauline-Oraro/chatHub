# ChatHub

ChatHub is a full-stack, real-time 1-to-1 messaging application. It pairs a React (Vite) single-page frontend with a Node.js/Express backend, uses **Clerk** for authentication, **MongoDB** for data storage, **Socket.IO** for live messaging and online-presence, and **ImageKit** for image/video uploads in chat.

Live demo: https://chathub-5c0e.onrender.com

---

## 1. How it all fits together

```
┌─────────────────────┐        HTTPS/REST (/api/*)        ┌───────────────────────┐
│   React + Vite SPA   │ ─────────────────────────────────▶│   Express API server   │
│  (frontend/src)      │ ◀───────────────────────────────── │   (backend/src)        │
│                       │        WebSocket (Socket.IO)       │                        │
│  - Clerk React SDK    │ ◀─────────────────────────────────▶│  - Socket.IO server    │
│  - Zustand stores     │                                     │  - Clerk middleware   │
│  - HeroUI components  │                                     │                        │
└───────────┬──────────┘                                     └───────────┬────────────┘
            │  sign-up / sign-in UI                                       │
            ▼                                                             ▼
      ┌───────────┐        webhook (user.created/updated/deleted)  ┌─────────────┐
      │   Clerk    │ ────────────────────────────────────────────▶ │   MongoDB   │
      │ (identity) │                                                │ (users,     │
      └───────────┘                                                 │  messages)  │
                                                                     └─────────────┘
                          media uploads (images/video)
                    ┌───────────────────────────────────┐
                    │              ImageKit               │
                    └───────────────────────────────────┘
```

**In short:**
1. Users sign up / log in through **Clerk** (handled entirely on the frontend by Clerk's React components — the app never touches passwords).
2. Whenever Clerk creates, updates, or deletes a user, it calls a **webhook** on the backend, which mirrors that user into the app's own MongoDB `User` collection.
3. Once signed in, the frontend calls `GET /api/auth/check`. The backend verifies the Clerk session, looks up the matching local `User` document, and returns it — this is how the SPA knows "who am I" in terms of the app's own database.
4. The chat UI loads the user list/conversation list and messages via REST endpoints under `/api/messages`.
5. A Socket.IO connection is opened for real-time delivery of new messages and for broadcasting which users are currently online.
6. Sending an image or video attaches it as `multipart/form-data`; the backend uploads it to **ImageKit** and stores the resulting URL on the message document.

---

## 2. Tech stack

### Backend (`/backend`)
| Purpose | Library |
|---|---|
| HTTP server / routing | `express` v5 |
| Real-time messaging & presence | `socket.io` |
| Database / ODM | `mongoose` (MongoDB) |
| Authentication | `@clerk/express` (session verification), `@clerk/backend` (webhook signature verification) |
| File uploads (multipart parsing) | `multer` (in-memory storage) |
| Media hosting | `@imagekit/nodejs` |
| Scheduled job | `cron` (keep-alive ping) |
| Env config | `dotenv` |

### Frontend (`/frontend`)
| Purpose | Library |
|---|---|
| UI framework | `react` 19 + `react-dom` |
| Build tool | `vite` |
| Routing | `react-router` |
| Auth UI & session state | `@clerk/react` |
| Component library / styling | `@heroui/react`, `tailwindcss` v4 |
| Icons | `lucide-react` |
| Client state management | `zustand` (with `persist` middleware) |
| HTTP client | `axios` |
| Real-time client | `socket.io-client` |
| Notifications | `react-hot-toast` |

### Infrastructure
- **Docker**: a single multi-stage `Dockerfile` builds the Vite frontend, builds the backend, and produces one runtime image where Express serves both the API and the built static SPA (a "monolith" deployment — see §6).
- **Deployed on Render** (per the linked live URL).

---

## 3. Project structure

```
chatHub/
├── Dockerfile                 # 3-stage build: frontend → backend → runtime image
├── backend/
│   ├── package.json
│   └── src/
│       ├── index.js                    # Express app bootstrap / route mounting
│       ├── controllers/
│       │   ├── auth.controller.js      # GET /api/auth/check
│       │   └── message.controller.js   # users, conversations, messages, send
│       ├── routes/
│       │   ├── auth.route.js
│       │   └── message.route.js
│       ├── middleware/
│       │   ├── auth.middleware.js      # protectRoute: verifies Clerk session, loads local User
│       │   └── upload.middleware.js    # multer config (25MB limit, images+video only)
│       ├── models/
│       │   ├── user.model.js           # clerkId, email, fullName, profilePic
│       │   └── message.model.js        # senderId, receiverId, text, image, video, timestamps
│       ├── lib/
│       │   ├── db.js                   # MongoDB connection
│       │   ├── socket.js               # Socket.IO server + online-user map
│       │   ├── imagekit.js             # ImageKit upload helper
│       │   └── cron.js                 # periodic self-ping to keep the free-tier server warm
│       ├── webhooks/
│       │   └── clerk.webhook.js        # syncs Clerk users into MongoDB
│       └── seeds/
│           └── user.seed.js            # inserts 20 demo users for local testing
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx                    # ClerkProvider + BrowserRouter + App
        ├── App.jsx                     # route guard: signed-in → ChatPage, else → AuthPage
        ├── pages/
        │   ├── AuthPage.jsx             # sign-in/sign-up screen
        │   └── ChatPage.jsx             # main chat layout, wires up data fetching
        ├── components/
        │   ├── auth/                    # sign-in hero panel, action panel, header
        │   └── chat/                    # sidebar, conversation rows, message list/bubbles, composer
        ├── store/
        │   ├── useAuthStore.js          # authUser, online users, Socket.IO connection lifecycle
        │   └── useChatStore.js          # users/conversations/messages state + API calls (persisted with zustand)
        ├── context/                     # theme & wallpaper context providers
        ├── hooks/                       # keyboard sound, media queries, scroll-to-bottom, selected conversation
        ├── lib/
        │   ├── axios.js                 # axios instance (baseURL differs dev vs prod)
        │   └── imagekit.js
        └── data/                        # HeroUI theme presets, wallpaper options
```

---

## 4. Authentication flow (Clerk)

ChatHub does **not** implement its own sign-up/login forms or password storage — all of that is delegated to Clerk:

1. `main.jsx` wraps the app in `<ClerkProvider>` (frontend), which reads the publishable key from the `VITE_CLERK_PUBLISHABLE_KEY` env variable.
2. `App.jsx` uses Clerk's `useAuth()` hook to check `isSignedIn`/`isLoaded` and routes the user to `AuthPage` or `ChatPage` accordingly.
3. On the backend, `clerkMiddleware()` (from `@clerk/express`) is attached globally in `index.js`, which attaches session info to every request.
4. Protected API routes run `protectRoute` (`middleware/auth.middleware.js`), which:
   - Reads the authenticated Clerk `userId` via `getAuth(req)`.
   - Looks up the corresponding local `User` document by `clerkId`.
   - Returns `401`/`404` if the user isn't authenticated or hasn't been synced yet; otherwise attaches the Mongo user document to `req.user`.
5. **Keeping Clerk and MongoDB in sync**: `webhooks/clerk.webhook.js` exposes `POST /api/webhooks/clerk`. Clerk calls this endpoint whenever a user is created, updated, or deleted. The handler:
   - Verifies the payload signature with `verifyWebhook` (so only genuine Clerk requests are trusted).
   - On `user.created`/`user.updated`, upserts a matching `User` document (clerkId, email, fullName, profilePic).
   - On `user.deleted`, removes the corresponding `User` document.

This means the app's own `User` collection is always a mirror of Clerk's identity data, but all message/chat data is keyed off the local Mongo `_id`, not the Clerk ID directly.

---

## 5. Real-time messaging (Socket.IO)

- `backend/src/lib/socket.js` creates a single shared `http.Server` + `Socket.IO` server (also used to serve the Express app), restricted via CORS to `FRONTEND_URL`.
- On connection, the client passes its Mongo `userId` as a query param. The server keeps an in-memory map `{ userId: socketId }` of who's currently online, and broadcasts `getOnlineUsers` to everyone whenever a user connects or disconnects.
- When `sendMessage` (`controllers/message.controller.js`) saves a new message, it looks up the receiver's socket ID and — if they're online — emits a `newMessage` event directly to them for instant delivery. Offline users simply see the message the next time they fetch `/api/messages/:id`.
- On the frontend, `useAuthStore.connectSocket()` opens the socket right after login and listens for `getOnlineUsers`; `useChatStore.subscribeToMessages()` listens for `newMessage` events scoped to the currently open conversation.

---

## 6. Data model

**User**
| Field | Type | Notes |
|---|---|---|
| `clerkId` | String | unique, links to Clerk identity |
| `email` | String | unique |
| `fullName` | String | |
| `profilePic` | String | URL, defaults to `""` |

**Message**
| Field | Type | Notes |
|---|---|---|
| `senderId` / `receiverId` | ObjectId (ref `User`) | required |
| `text` | String | optional |
| `image` / `video` | String | optional ImageKit URL (mutually exclusive per message) |
| `createdAt` / `updatedAt` | timestamps | auto |

Key backend queries (`controllers/message.controller.js`):
- `getUsersForSidebar` — all users except the current one (for starting new conversations).
- `getConversationsForSidebar` — an aggregation that groups messages by "the other participant" and sorts by most recent message, effectively building an inbox/conversation list.
- `getMessages` — full message history between the current user and one other user.
- `sendMessage` — creates a message, optionally uploads an attached file to ImageKit first, saves it, and pushes it over the socket to the receiver if they're online.

---

## 7. Media uploads (ImageKit)

- `middleware/upload.middleware.js` configures `multer` with in-memory storage, a 25 MB size limit, and a file filter that only allows `image/*` or `video/*` mimetypes.
- `POST /api/messages/send/:id` runs `upload.single("media")` before the controller, so an optional file is available as `req.file`.
- `lib/imagekit.js` wraps the ImageKit SDK: it builds a collision-safe filename, uploads the buffer to the `/chat` folder, and returns the public URL, which is then stored on the `Message` document as `image` or `video` depending on the mimetype.
- If `IMAGEKIT_PRIVATE_KEY` isn't configured, media uploads are rejected with a `500` rather than failing silently.

---

## 8. Frontend application structure

- **`useAuthStore`** (Zustand) — holds `authUser`, the list of `onlineUsers`, and the Socket.IO client instance; exposes `checkAuth`, `clearAuth`, `connectSocket`, `disconnectSocket`.
- **`useChatStore`** (Zustand, persisted to localStorage for the sound preference) — holds `users`, `conversations`, `messages`, `selectedUser`/`activeConversationId`, sidebar search/tab state, and the composer's draft text; exposes all the REST calls (`getUsers`, `getConversations`, `getMessages`, `sendMessage`) plus socket subscription helpers.
- **`ChatPage`** — on mount, loads the user list and conversation list; whenever the active conversation changes, it loads that conversation's messages and subscribes to new incoming messages over the socket.
- **UI building blocks** (`components/chat/*`): `ChatSidebar` (search + tabs for "chats" vs "all users"), `ConversationRow`, `AvatarWithOnlineIndicator`, `ChatHeader`, `MessageList`/`MessageBubble`/`MessageVideo`, `ChatComposer` (text + attachment sending), and `NoConversationPlaceholder` for the empty state.
- **Theming**: `ThemeContext`/`ThemeToggle`/`ThemePresetPicker` manage light/dark mode and a set of HeroUI color presets; `WallpaperContext`/`WallpaperPicker` let the user pick a background image/pattern behind the chat window.
- **Hooks**: `useSelectedConversation` derives the active conversation + responsive layout state; `useMediaQuery` for breakpoints; `useScrollToBottom` for auto-scrolling the message list; `useKeyboardSound` for optional typing sound effects.

---

## 9. Environment variables

### Backend (`backend/.env`)
| Variable | Required | Purpose |
|---|---|---|
| `PORT` | yes | Port the Express/Socket.IO server listens on |
| `MONGO_URI` | yes | MongoDB connection string |
| `FRONTEND_URL` | yes | Allowed CORS origin for REST + sockets, and the base URL the cron job pings |
| `CLERK_WEBHOOK_SIGNING_SECRET` | yes (for user sync) | Verifies incoming Clerk webhook requests |
| `IMAGEKIT_PRIVATE_KEY` | optional | Enables image/video message uploads |
| `NODE_ENV` | optional | `"production"` enables the keep-alive cron job |
| Clerk secret key | yes | `@clerk/express` reads Clerk's standard `CLERK_SECRET_KEY` env var automatically |

### Frontend (`frontend/.env`)
| Variable | Required | Purpose |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | Public Clerk key, embedded into the client bundle at build time |
| `VITE_API_URL` | no | Left empty in production so the SPA calls `/api` on the same origin it's served from; in dev the app hardcodes `http://localhost:3000` |

---

## 10. Running locally

**Prerequisites:** Node.js 22+, a MongoDB instance (local or Atlas), and a Clerk application (for its publishable/secret keys).

```bash
# 1. Backend
cd backend
npm install
# create backend/.env with the variables listed in §9
npm run dev          # runs `node --watch src/index.js` on the port from PORT

# (optional) seed 20 demo users into MongoDB
npm run db:seed

# 2. Frontend (in a second terminal)
cd frontend
npm install
# create frontend/.env with VITE_CLERK_PUBLISHABLE_KEY
npm run dev           # Vite dev server, default http://localhost:5173
```

In development, the frontend axios client and socket client point at `http://localhost:3000` (backend), so run the backend on port `3000` locally, or update `frontend/src/lib/axios.js` / `frontend/src/store/useAuthStore.js` to match.

---

## 11. Docker / production build

The root `Dockerfile` is a 3-stage build that produces a single **monolithic** image:

1. **`frontend-build`** — installs frontend deps, builds the Vite SPA with `VITE_API_URL` empty (so the built app calls `/api` on its own origin) and `VITE_CLERK_PUBLISHABLE_KEY` baked in via a build arg.
2. **`backend-build`** — installs backend deps and copies `src/` to `dist/` (the backend's "build" step, since it's plain ESM JavaScript needing no transpilation).
3. **`runner`** — installs only production backend dependencies, copies in the built backend (`dist/`) and the built frontend static files (as `public/`), and starts the server with `node dist/index.js`. Express serves the API under `/api/*` and falls back to `index.html` for every other route (`app.get("/{*any}", ...)`), so client-side routing works.

Build it with:
```bash
docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx -t chathub .
docker run -p 3001:3001 --env-file backend/.env chathub
```

`backend/src/lib/cron.js` runs a job every 14 minutes in production that pings `FRONTEND_URL/health`, which is a common trick to prevent free-tier hosts (like Render's free plan) from spinning the service down due to inactivity.

---

## 12. API reference (summary)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | none | Health check (also used by the keep-alive cron) |
| `POST` | `/api/webhooks/clerk` | Clerk signature | Syncs Clerk user create/update/delete into MongoDB |
| `GET` | `/api/auth/check` | Clerk session | Returns the current user's local Mongo profile |
| `GET` | `/api/messages/users` | Clerk session | All other users (for starting new chats) |
| `GET` | `/api/messages/conversations` | Clerk session | Users you've already exchanged messages with, most recent first |
| `GET` | `/api/messages/:id` | Clerk session | Full message history with user `:id` |
| `POST` | `/api/messages/send/:id` | Clerk session | Send a message (JSON `text`, or `multipart/form-data` with a `media` file) to user `:id` |

Real-time (Socket.IO) events:
| Event | Direction | Payload |
|---|---|---|
| `getOnlineUsers` | server → all clients | array of online user IDs |
| `newMessage` | server → receiving client | the new `Message` document |
| `disconnect` | client → server | (built-in) removes the user from the online map |

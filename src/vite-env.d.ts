/// <reference types="vite/client" />

// Per-deployment configuration, injected at build time by Vite. See .env.example.
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_GOOGLE_API_KEY?: string;
  readonly VITE_LIVE_EDIT_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

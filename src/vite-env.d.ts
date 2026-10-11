/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to allow a registered analytics adapter to send events. Off by default. */
  readonly VITE_ANALYTICS_ENABLED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

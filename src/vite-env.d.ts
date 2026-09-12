/* vite-env.d.ts — Типы для Vite-плейсхолдеров */

/// <reference types="vite/client" />

declare module '*?raw' {
  const content: string;
  export default content;
}

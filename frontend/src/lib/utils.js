import { clsx } from "clsx";
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Garante que a URL base use HTTPS em produção.
 * Em desenvolvimento (localhost / 127.0.0.1) HTTP é permitido.
 */
export function enforceHttps(url) {
  if (!url) return url;
  const isDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!isDev && url.startsWith("http://")) {
    return url.replace(/^http:\/\//, "https://");
  }
  return url;
}

/**
 * Lança um erro se a URL de destino não for HTTPS em produção.
 * Use antes de enviar dados PII/sensíveis.
 */
export function assertHttps(url) {
  const isDev =
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1";
  if (!isDev && !url.startsWith("https://")) {
    throw new Error(
      "Bloqueado: envio de dados sensíveis requer HTTPS. Verifique a variável REACT_APP_BACKEND_URL."
    );
  }
}

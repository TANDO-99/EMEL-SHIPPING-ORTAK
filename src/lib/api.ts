const TOKEN_STORAGE_KEY = 'emel_auth_token';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function isJsonContentType(contentType: string): boolean {
  const lower = contentType.toLowerCase();
  return lower.includes('application/json') || lower.includes('+json');
}

function looksLikeHtml(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html') || trimmed.startsWith('<');
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'include',
      headers,
    });
  } catch (networkErr) {
    console.error('[apiFetch] Ağ bağlantı hatası:', { url, error: networkErr });
    throw new Error('Sunucuya bağlanılamadı. Ağ bağlantınızı kontrol edin.');
  }

  const contentType = res.headers.get('content-type') || '';
  const rawText = await res.text();
  const hasJsonHeader = isJsonContentType(contentType);
  const htmlBody = looksLikeHtml(rawText);

  if (!res.ok) {
    if (hasJsonHeader && !htmlBody && rawText.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawText) as { error?: string; message?: string };
        const err = new Error(
          parsed.error || parsed.message || `İstek başarısız oldu (${res.status})`
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      } catch (parseErr) {
        if (parseErr instanceof Error && 'status' in parseErr) {
          throw parseErr;
        }
        console.error('[apiFetch] Hata yanıtı JSON olarak ayrıştırılamadı:', {
          url,
          status: res.status,
          contentType,
          bodyPreview: rawText.slice(0, 400),
          parseErr,
        });
      }
    } else {
      console.error('[apiFetch] Sunucu JSON dışında bir hata sayfası/yanıt döndürdü:', {
        url,
        status: res.status,
        contentType,
        bodyPreview: rawText.slice(0, 400),
      });
    }

    const err = new Error(
      `Sunucu isteği işleyemedi (HTTP ${res.status}). Ayrıntılar geliştirici konsoluna yazıldı.`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  if (!hasJsonHeader || htmlBody) {
    console.error('[apiFetch] Başarılı HTTP yanıtı ancak içerik JSON değil (HTML/Metin):', {
      url,
      status: res.status,
      contentType,
      bodyPreview: rawText.slice(0, 400),
    });
    throw new Error(
      'Sunucudan geçerli JSON yerine beklenmeyen bir sayfa yanıtı alındı. Ayrıntılar konsola kaydedildi.'
    );
  }

  if (!rawText.trim()) {
    return {} as T;
  }

  try {
    return JSON.parse(rawText) as T;
  } catch (parseErr) {
    console.error('[apiFetch] JSON ayrıştırma hatası:', {
      url,
      status: res.status,
      contentType,
      bodyPreview: rawText.slice(0, 400),
      parseErr,
    });
    throw new Error('Sunucudan gelen JSON verisi okunamadı. Ayrıntılar konsola kaydedildi.');
  }
}

export async function downloadAuthorizedFile(url: string, fallbackName: string): Promise<void> {
  const token = getStoredToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, { credentials: 'include', headers });
  } catch (networkErr) {
    console.error('[downloadAuthorizedFile] Ağ hatası:', { url, error: networkErr });
    throw new Error('Dosya indirilirken sunucuya bağlanılamadı.');
  }

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    const errText = await res.text();
    if (isJsonContentType(contentType) && !looksLikeHtml(errText)) {
      try {
        const parsed = JSON.parse(errText) as { error?: string };
        throw new Error(parsed.error || `Dosya indirilemedi (${res.status}).`);
      } catch (e) {
        if (e instanceof Error && e.message && !e.message.includes('JSON')) {
          throw e;
        }
      }
    }
    console.error('[downloadAuthorizedFile] İndirme hata yanıtı:', {
      url,
      status: res.status,
      contentType,
      bodyPreview: errText.slice(0, 400),
    });
    throw new Error(`Dosya indirilemedi (HTTP ${res.status}). Ayrıntılar konsolda.`);
  }

  if (contentType.toLowerCase().includes('text/html')) {
    const htmlPreview = await res.text();
    console.error('[downloadAuthorizedFile] Dosya yerine HTML yanıtı döndü:', {
      url,
      status: res.status,
      contentType,
      bodyPreview: htmlPreview.slice(0, 400),
    });
    throw new Error('Dosya indirilemedi: Sunucu beklenmeyen bir HTML yanıtı döndürdü.');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || fallbackName;
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

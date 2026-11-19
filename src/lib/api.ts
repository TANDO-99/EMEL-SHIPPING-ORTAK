const TOKEN_STORAGE_KEY = 'emel_auth_token';
const MOCK_STORAGE_KEY = 'emel_mock_data_v1';

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

function getMockStore(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(MOCK_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveMockStore(data: Record<string, unknown>): void {
  try {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  await new Promise((r) => setTimeout(r, 250));
  const method = (init.method || 'GET').toUpperCase();

  // Giriş Kontrolü (Frontend Modu)
  if (url.includes('/api/auth/login') && method === 'POST') {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const user = String(body.username || '').trim().toUpperCase();
    const pass = String(body.password || '').trim();

    if (user === 'EMELSHIPPING' && pass === '*A4484Emel82*') {
      return {
        token: 'github-pages-session-token',
        user: {
          id: 1,
          username: 'EMELSHIPPING',
          role: 'admin',
          fullName: 'Emel Shipping Operasyon',
        },
      } as unknown as T;
    }
    throw new Error('Kullanıcı adı veya şifre hatalı.');
  }

  // Oturum Doğrulama
  if (url.includes('/api/auth/me')) {
    const token = getStoredToken();
    if (!token) {
      throw new Error('Oturum bulunamadı.');
    }
    return {
      user: {
        id: 1,
        username: 'EMELSHIPPING',
        role: 'admin',
        fullName: 'Emel Shipping Operasyon',
      },
    } as unknown as T;
  }

  // Çıkış İşlemi
  if (url.includes('/api/auth/logout')) {
    setStoredToken(null);
    return { success: true } as unknown as T;
  }

  // Diğer tüm GET ve POST isteklerini tarayıcı hafızasından karşıla
  const store = getMockStore();
  if (method === 'GET') {
        if (store[url]) return store[url] as T;
    return {
      items: [],
      containers: [],
      records: [],
      rows: [],
      files: [],
      sheets: [],
      history: [],
      logs: [],
      vessels: [],
      results: [],
      data: [],
    } as unknown as T;

  }

  if (method === 'POST' || method === 'PUT') {
    const payload = init.body && !(init.body instanceof FormData) ? JSON.parse(String(init.body)) : {};
    store[url] = payload;
    saveMockStore(store);
    return { success: true, data: payload } as unknown as T;
  }

  return { success: true } as unknown as T;
}

export async function downloadAuthorizedFile(_url: string, fallbackName: string): Promise<void> {
  const blob = new Blob(['EMEL SHIPPING Rapor Verisi'], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fallbackName || 'rapor.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

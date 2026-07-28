// Dünner Client für die lokale Server-API.
async function request(url, options) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Fehler ${res.status}`);
  return body;
}

export const api = {
  get: (url) => request(url),
  post: (url, data) =>
    request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
  patch: (url, data) =>
    request(url, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }),
  del: (url) => request(url, { method: 'DELETE' }),
};

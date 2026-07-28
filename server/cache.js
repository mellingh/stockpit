// Einfacher In-Memory-Cache mit Ablaufzeit.
// Schützt vor Yahoo-Rate-Limits: identische Anfragen innerhalb der TTL
// treffen den Server nur einmal (auch bei parallelen Aufrufen, weil das
// Promise selbst gecacht wird).
const store = new Map();

export function cached(key, ttlMs, fetcher) {
  const hit = store.get(key);
  if (hit && Date.now() - hit.time < ttlMs) return hit.promise;

  const promise = Promise.resolve()
    .then(fetcher)
    .catch((err) => {
      store.delete(key); // Fehler nicht cachen
      throw err;
    });

  store.set(key, { time: Date.now(), promise });
  return promise;
}

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

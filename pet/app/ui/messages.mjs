export function createMessages(catalogue, language) {
  return function message(id, values = {}) {
    const text = catalogue[id]?.[language] || catalogue[id]?.en || id;
    return text.replace(/\{(\w+)\}/g, (token, key) => values[key] ?? token);
  };
}

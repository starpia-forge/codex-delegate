export function createMessages(catalogue, language) {
  return function message(id, values = {}) {
    const text = catalogue[id]?.[language] || catalogue[id]?.en || id;
    return text.replace(/\{(\w+)\}/g, (token, key) => values[key] ?? token);
  };
}

// Subscribe first. A switch received during a command read must win over that
// command's potentially older language snapshot.
export async function subscribeLanguage(listen, onChange) {
  let events = 0;
  const unlisten = await listen("pet-language", ({ payload }) => {
    events++;
    onChange(payload.language);
  });
  return {
    unlisten,
    async read(readCurrent) {
      const version = events;
      const current = await readCurrent();
      if (version === events) onChange(current.language);
      return current;
    },
  };
}

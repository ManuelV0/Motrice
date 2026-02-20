export function readFiltersFromSearch(searchParams, defaults) {
  const parsed = { ...defaults };

  Object.keys(defaults).forEach((key) => {
    const value = searchParams.get(key);
    if (value !== null) parsed[key] = value;
  });

  return parsed;
}

export function writeFiltersToSearch(searchParams, filters, defaults) {
  const next = new URLSearchParams(searchParams);

  Object.keys(filters).forEach((key) => {
    const value = filters[key];
    if (!value || value === defaults[key]) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  });

  return next;
}

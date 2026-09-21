export function createCapacitorPluginLoader(loadModule, selectPlugin) {
  let pluginContainerPromise;

  return function loadPluginContainer() {
    if (!pluginContainerPromise) {
      pluginContainerPromise = Promise.resolve()
        .then(() => loadModule())
        // I plugin Capacitor sono Proxy che espongono qualsiasi proprieta come
        // metodo nativo, compresa `then`. Tenerli dentro un oggetto normale
        // evita che Promise/await li scambino per thenable.
        .then((module) => ({ plugin: selectPlugin(module) }))
        .catch(() => null);
    }

    return pluginContainerPromise;
  };
}

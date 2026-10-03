import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapacitorPluginLoader } from './capacitorPluginLoader.js';

test('mantiene il proxy Capacitor fuori dalla risoluzione delle Promise', async () => {
  const accessedProperties = [];
  const plugin = new Proxy({}, {
    get(_target, property) {
      accessedProperties.push(property);
      if (property === 'then') {
        throw new Error('Il proxy Capacitor non deve essere trattato come thenable');
      }
      return undefined;
    }
  });
  let imports = 0;
  const loadPlugin = createCapacitorPluginLoader(
    async () => {
      imports += 1;
      return { PushNotifications: plugin };
    },
    (module) => module.PushNotifications
  );

  const first = await loadPlugin();
  const second = await loadPlugin();

  assert.ok(first);
  assert.strictEqual(first.plugin, plugin);
  assert.strictEqual(second, first);
  assert.equal(imports, 1);
  assert.equal(accessedProperties.includes('then'), false);
});

test('isola un errore di caricamento del plugin', async () => {
  const loadPlugin = createCapacitorPluginLoader(
    async () => { throw new Error('plugin non disponibile'); },
    (module) => module.PushNotifications
  );

  assert.equal(await loadPlugin(), null);
  assert.equal(await loadPlugin(), null);
});

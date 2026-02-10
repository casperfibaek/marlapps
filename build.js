const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APPS_DIR = path.join(ROOT, 'apps');

// Discover all apps from apps/*/manifest.json
function discoverApps() {
  const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });
  const apps = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(APPS_DIR, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    apps.push({ folder: entry.name, manifest });
  }

  apps.sort((a, b) => (a.manifest.order || 999) - (b.manifest.order || 999));
  return apps;
}

// Generate registry/apps.json
function generateRegistry(apps) {
  const registry = {
    version: '2.0.0',
    lastUpdated: new Date().toISOString(),
    apps: apps.map(app => ({
      id: app.manifest.id,
      folder: app.folder,
      pinned: app.manifest.order === 1,
      hidden: false,
      order: app.manifest.order || 999
    }))
  };

  const registryPath = path.join(ROOT, 'registry', 'apps.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2) + '\n');
  console.log(`  registry/apps.json (${apps.length} apps)`);
}

// Patch manifest.json shortcuts
function patchManifest(apps) {
  const manifestPath = path.join(ROOT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  manifest.shortcuts = apps.map(app => ({
    name: app.manifest.name,
    short_name: app.manifest.shortName || app.manifest.name,
    description: app.manifest.description,
    url: `./index.html?app=${app.manifest.id}`,
    icons: [{ src: `./apps/${app.folder}/icon.svg`, sizes: 'any', type: 'image/svg+xml' }]
  }));

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`  manifest.json (${manifest.shortcuts.length} shortcuts)`);
}

// Patch service-worker.js cache list between markers
function patchServiceWorker(apps) {
  const swPath = path.join(ROOT, 'service-worker.js');
  let content = fs.readFileSync(swPath, 'utf8');

  const startMarker = '// AUTO:APP-CACHE-START';
  const endMarker = '// AUTO:APP-CACHE-END';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx === -1 || endIdx === -1) {
    console.error('  ERROR: Could not find AUTO:APP-CACHE markers in service-worker.js');
    process.exit(1);
  }

  const listAppFiles = (folderPath) => {
    const files = [];
    const walk = (currentPath) => {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
          continue;
        }
        if (!entry.isFile()) continue;
        const relPath = path.relative(ROOT, fullPath).split(path.sep).join('/');
        files.push(`./${relPath}`);
      }
    };

    walk(folderPath);
    return files;
  };

  const appFiles = apps.map((app) => listAppFiles(path.join(APPS_DIR, app.folder)));
  const cacheLines = appFiles.map((files) => files.map((file) => `  '${file}'`).join(',\n')).join(',\n\n');

  const before = content.substring(0, startIdx);
  const after = content.substring(endIdx + endMarker.length);

  content = before + startMarker + '\n' + cacheLines + '\n  ' + endMarker + after;

  // Bump cache version
  content = content.replace(/const CACHE_NAME = 'marlapps-v(\d+)'/, (match, version) => {
    return `const CACHE_NAME = 'marlapps-v${parseInt(version) + 1}'`;
  });

  fs.writeFileSync(swPath, content);

  // Extract the new version number and write version.json
  const versionMatch = content.match(/const CACHE_NAME = 'marlapps-v(\d+)'/);
  if (versionMatch) {
    const version = parseInt(versionMatch[1], 10);
    const versionData = {
      version,
      buildDate: new Date().toISOString()
    };
    fs.writeFileSync(path.join(ROOT, 'version.json'), JSON.stringify(versionData, null, 2) + '\n');
    console.log(`  version.json (build ${version})`);
  }

  const totalCachedFiles = appFiles.reduce((count, files) => count + files.length, 0);
  console.log(`  service-worker.js (${totalCachedFiles} cached files)`);
}

// Run
console.log('Discovering apps...');
const apps = discoverApps();
console.log(`Found ${apps.length} apps: ${apps.map(a => a.manifest.id).join(', ')}\n`);

console.log('Generating:');
generateRegistry(apps);
patchManifest(apps);
patchServiceWorker(apps);

console.log('\nDone.');

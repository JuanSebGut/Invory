const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const targets = [
  { name: 'RaÃ­z del proyecto', dir: rootDir },
  { name: 'Auth Service', dir: path.join(rootDir, 'services', 'auth-service') },
  { name: 'User Service', dir: path.join(rootDir, 'services', 'user-service') },
  { name: 'Category Service', dir: path.join(rootDir, 'services', 'category-service') },
  { name: 'Product Service', dir: path.join(rootDir, 'services', 'product-service') },
  { name: 'Inventory Service', dir: path.join(rootDir, 'services', 'inventory-service') },
  { name: 'Audit Service', dir: path.join(rootDir, 'services', 'audit-service') },
  { name: 'API Gateway', dir: path.join(rootDir, 'api-gateway') },
];

function runInstall(target) {
  console.log(`\nðŸ“¦ Instalando dependencias en: ${target.name}`);
  console.log(`   Ruta: ${target.dir}`);

  const result = spawnSync('npm', ['install'], {
    cwd: target.dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`FallÃ³ la instalaciÃ³n en ${target.name}`);
  }
}

function main() {
  console.log('ðŸš€ Inicio de bootstrap de dependencias por servicio');
  targets.forEach(runInstall);
  console.log('\nâœ… Bootstrap completado correctamente');
}

try {
  main();
} catch (error) {
  console.error(`\nâŒ ${error.message}`);
  process.exit(1);
}

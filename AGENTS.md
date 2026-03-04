# IPTV Server Development Guidelines

## Build & Test Commands
- Backend: `cd iptv-server && npm run dev|build|lint|test`. Single test: `npm run test -- filename.test.ts`
- Frontend: `cd iptv-frontend && npm run dev|build|lint` (no tests configured)
- Database: `npm run db:generate|db:migrate|db:push|db:seed` (Prisma)
- Docker: `make dev` (local), `make up|down` (full stack), `make logs-f`

## Critical ES Module Requirements
- **MUST** use `.js` extensions in TypeScript imports: `import { prisma } from './config/database.js'`
- Use `import { fileURLToPath } from 'url'` for `__dirname` in ES modules
- Never import without `.js` extension - will fail at runtime

## Code Style & Conventions
- TypeScript strict mode, 2-space indentation, ES2022 target
- `camelCase` vars/functions, `PascalCase` classes/types, kebab-case files (except React components)
- Thin route handlers, business logic in `src/services/**`, Zod validation, Pino logging
- Always use Prisma with proper `include` relations, cache auth in Redis with TTL

## Authentication Patterns
- Xtream API: `?username=X&password=X` → `authenticateIptvLine` middleware
- Admin API: `X-API-Key` header or JWT Bearer → `authenticateAdmin` middleware
- Domain concepts: `User` = admin/reseller, `IptvLine` = subscriber, `Stream` = content

## Testing & Quality
- Run `npm run lint` before commits, avoid committing `dist/` or `.env` files
- Test credentials after seed: admin/admin123, test/test123
- Use load-test scripts for streaming performance validation

## Frontend Deployment to LXC Container 103
Deploy standalone Next.js app to `/opt/iptv-frontend`:

```bash
# 1. Build standalone app
cd /storage-pool/xtream/iptv-frontend && npm run build

# 2. Stop container and mount rootfs
pct stop 103
pct mount 103

# 3. Clean and copy build artifacts (includes .next from standalone + static assets)
rm -rf /var/lib/lxc/103/rootfs/opt/iptv-frontend
mkdir -p /var/lib/lxc/103/rootfs/opt/iptv-frontend
cd /storage-pool/xtream/iptv-frontend
cp -r .next/standalone/* /var/lib/lxc/103/rootfs/opt/iptv-frontend/
cp -r .next/standalone/.next /var/lib/lxc/103/rootfs/opt/iptv-frontend/
cp -r .next/static /var/lib/lxc/103/rootfs/opt/iptv-frontend/.next/
cp -r public /var/lib/lxc/103/rootfs/opt/iptv-frontend/

# 4. Set ownership (101000 = nodeapp user in unprivileged container)
chown -R 101000:101000 /var/lib/lxc/103/rootfs/opt/iptv-frontend

# 5. Unmount and start container
pct unmount 103 && pct start 103
```

- Container IP: 10.10.0.13, Port: 3000
- Service: `iptv-frontend.service` runs as `nodeapp` user
- Config: `/opt/iptv-frontend/.env`

## Backend Deployment to LXC Container 102
Deploy compiled TypeScript to `/opt/iptv-server`:

```bash
# 1. Build the backend
cd /storage-pool/xtream/iptv-server && npm run build

# 2. Stop container and mount rootfs
pct shutdown 102 --forceStop 1 --timeout 30
sleep 5
pct mount 102

# 3. Copy compiled files to top-level (NOT to dist/ - the service runs from top-level)
cp -r /storage-pool/xtream/iptv-server/dist/api /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/config /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/services /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/types /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/utils /var/lib/lxc/102/rootfs/opt/iptv-server/
cp -r /storage-pool/xtream/iptv-server/dist/workers /var/lib/lxc/102/rootfs/opt/iptv-server/
cp /storage-pool/xtream/iptv-server/dist/server.* /var/lib/lxc/102/rootfs/opt/iptv-server/

# 4. Set ownership (101000 = nodeapp user in unprivileged container)
chown -R 101000:101000 /var/lib/lxc/102/rootfs/opt/iptv-server/

# 5. Unmount and start container
pct unmount 102 && pct start 102
```

- Container IP: 10.10.0.12, Port: 3001
- Service: `iptv-backend.service` runs as `nodeapp` user
- Config: `/opt/iptv-server/.env`
- **IMPORTANT**: The service runs `node server.js` from `/opt/iptv-server/` (top-level), NOT from `/opt/iptv-server/dist/`

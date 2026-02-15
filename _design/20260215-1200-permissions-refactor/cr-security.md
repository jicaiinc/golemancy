# Security Review: Permissions Refactor

**Reviewer**: CR-Security
**Date**: 2026-02-15
**Scope**: Sandbox permissions refactor implementation

## Executive Summary

**Overall Risk**: HIGH
**P0 Issues**: 3 (MUST FIX before deployment)
**P1 Issues**: 3 (Should fix soon)
**P2 Issues**: 2 (Consider for future)

**Critical Findings**:
1. Input validation bypassed in API routes
2. Path traversal via template injection
3. Missing authorization checks

---

## P0 - Critical Issues (Block Deployment)

### P0-1: Missing Input Validation in API Routes

**File**: `packages/server/src/routes/permissions-config.ts`
**Lines**: 29, 39, 56

**Issue**: Routes accept raw JSON and pass it directly to storage without validation, despite validation functions existing in `validate-permissions-config.ts`.

```typescript
// Line 27-33: NO validation before create
app.post('/', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const data = await c.req.json()  // ⚠️ Unvalidated input
  log.debug({ projectId }, 'creating permissions config')
  const config = await storage.create(projectId, data)  // ⚠️ Passed directly
  log.debug({ projectId, configId: config.id }, 'created permissions config')
  return c.json(config, 201)
})

// Line 36-43: NO validation before update
app.patch('/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const data = await c.req.json()  // ⚠️ Unvalidated input
  log.debug({ projectId, configId: id }, 'updating permissions config')
  const config = await storage.update(projectId, id, data)  // ⚠️ Passed directly
  return c.json(config)
})

// Line 53-61: NO validation on title field
app.post('/:id/duplicate', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const { title } = await c.req.json()  // ⚠️ Unvalidated title
  log.debug({ projectId, sourceId: id, newTitle: title }, 'duplicating permissions config')
  const config = await storage.duplicate(projectId, id, title)  // ⚠️ Passed directly
  log.debug({ projectId, configId: config.id }, 'duplicated permissions config')
  return c.json(config, 201)
})
```

**Attack Scenario**:
- Attacker sends malformed JSON with invalid types (e.g., `title: null`, `mode: "invalid"`, `config: "string"`)
- Storage layer may fail unexpectedly or write corrupted data
- Array fields could be replaced with non-arrays, causing runtime errors

**Impact**: Data corruption, service disruption, potential type confusion vulnerabilities

**Recommendation**:
```typescript
import { validatePermissionsConfigFile } from '../agent/validate-permissions-config'

app.post('/', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const data = await c.req.json()

  // Validate input
  const validation = validatePermissionsConfigFile(data)
  if (!validation.valid) {
    return c.json({ error: 'Validation failed', details: validation.errors }, 400)
  }

  const config = await storage.create(projectId, data)
  return c.json(config, 201)
})
```

---

### P0-2: Path Traversal via Template Injection

**File**: `packages/server/src/agent/resolve-permissions.ts`
**Lines**: 40-46

**Issue**: Template replacement allows path traversal by injecting `../` sequences after `{{workspaceDir}}`.

```typescript
// Current implementation
const config: PermissionsConfig = {
  ...configFile.config,
  allowWrite: configFile.config.allowWrite.map(p =>
    p.replace('{{workspaceDir}}', workspaceDir),  // ⚠️ No path normalization
  ),
}
```

**Attack Scenario**:
1. User creates config with `allowWrite: ['{{workspaceDir}}/../../../etc']`
2. Template resolves to `/Users/xxx/.golemancy/projects/proj-abc/workspace/../../../etc`
3. After path normalization: `/Users/xxx/etc` or higher
4. Agent can now write to arbitrary filesystem locations outside workspace

**Proof of Concept**:
```json
{
  "title": "Malicious Config",
  "mode": "sandbox",
  "config": {
    "allowWrite": [
      "{{workspaceDir}}/../../../.ssh",
      "{{workspaceDir}}/../../../../../../etc/passwd"
    ],
    "denyRead": [],
    "denyWrite": []
  }
}
```

**Impact**: Complete filesystem access bypass, arbitrary file writes, privilege escalation

**Recommendation**:
```typescript
import path from 'node:path'

// Resolve and validate paths
const workspaceRealPath = path.resolve(workspaceDir)
const config: PermissionsConfig = {
  ...configFile.config,
  allowWrite: configFile.config.allowWrite.map(p => {
    const resolved = path.resolve(p.replace('{{workspaceDir}}', workspaceDir))

    // Ensure resolved path is still within workspace
    if (!resolved.startsWith(workspaceRealPath + path.sep) && resolved !== workspaceRealPath) {
      log.warn({ pattern: p, resolved }, 'allowWrite path escapes workspace, rejecting')
      return workspaceRealPath  // Fallback to workspace root
    }

    return resolved
  }),
  // Apply same validation to denyRead and denyWrite
}
```

---

### P0-3: Missing Authorization Checks

**File**: `packages/server/src/routes/permissions-config.ts`
**Lines**: All endpoints

**Issue**: No authorization checks - any authenticated user can modify permissions for any project.

```typescript
app.patch('/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  // ⚠️ No check if current user owns this project
  const id = c.req.param('id') as PermissionsConfigId
  const data = await c.req.json()
  const config = await storage.update(projectId, id, data)
  return c.json(config)
})
```

**Attack Scenario**:
- User A creates Project X
- User B (malicious) discovers Project X's ID (e.g., via URL enumeration, logs, or social engineering)
- User B calls `PATCH /api/projects/proj-X/permissions-config/default` to set mode to `unrestricted`
- User B can now execute arbitrary commands in User A's project

**Impact**: Privilege escalation, cross-user permission manipulation, complete sandbox bypass

**Recommendation**:
```typescript
// Add middleware or check in each route
async function requireProjectAccess(c: Context, projectId: ProjectId) {
  const userId = c.get('userId')  // From auth middleware
  const project = await projectStorage.getById(projectId)

  if (!project || project.ownerId !== userId) {
    throw new Error('Unauthorized: You do not own this project')
  }
}

app.patch('/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  await requireProjectAccess(c, projectId)  // ✓ Authorization check

  const id = c.req.param('id') as PermissionsConfigId
  const data = await c.req.json()
  const config = await storage.update(projectId, id, data)
  return c.json(config)
})
```

---

## P1 - High Priority Issues

### P1-1: Incomplete Sensitive Path Coverage

**File**: `packages/shared/src/types/permissions.ts`
**Lines**: 155-168

**Issue**: Default `denyRead` list is missing critical credential locations.

**Current Coverage**:
```typescript
denyRead: [
  '~/.ssh',      // ✓ SSH keys
  '~/.aws',      // ✓ AWS credentials
  '~/.gnupg',    // ✓ GPG keys
  '/etc/passwd', // ✓ System users
  '/etc/shadow', // ✓ Password hashes
  '**/.env',     // ✓ Environment files
  '**/*.pem',    // ✓ Certificate keys
  // ... etc
]
```

**Missing Paths**:
```typescript
// Docker credentials
'~/.docker/config.json',

// Kubernetes credentials
'~/.kube/config',

// NPM authentication tokens
'~/.npmrc',

// Git credentials (may contain tokens)
'~/.gitconfig',
'~/.git-credentials',

// Browser credential stores
'~/Library/Application Support/Google/Chrome/Default/Login Data',  // macOS Chrome
'~/.config/google-chrome/Default/Login Data',  // Linux Chrome
'~/Library/Application Support/Firefox/Profiles/*/logins.json',  // macOS Firefox

// macOS Keychain (binary access, but still sensitive)
'~/Library/Keychains/**',

// Environment variable files
'~/.bashrc',  // May export secrets
'~/.zshrc',   // May export secrets
'~/.profile',

// Cloud provider CLIs
'~/.config/gcloud/**',  // Google Cloud
'~/.azure/**',           // Azure
'~/.oci/**',             // Oracle Cloud

// Database client configs
'~/.pgpass',             // PostgreSQL passwords
'~/.my.cnf',             // MySQL credentials

// Terraform state (may contain secrets)
'**/terraform.tfstate',
'**/terraform.tfstate.backup',
```

**Impact**: Credentials leakage, token theft, authentication bypass

**Recommendation**: Expand the default `denyRead` list to include the paths above. Consider grouping by category with comments for maintainability.

---

### P1-2: No Audit Logging for Permission Changes

**File**: `packages/server/src/routes/permissions-config.ts`
**Lines**: All mutation endpoints

**Issue**: Permission changes are not logged for security auditing.

**Current Behavior**:
```typescript
app.patch('/:id', async (c) => {
  // ... update happens ...
  log.debug({ projectId, configId: id }, 'updating permissions config')  // ⚠️ debug level only
  const config = await storage.update(projectId, id, data)
  return c.json(config)
})
```

**Problem**:
- Debug logs may be disabled in production
- No record of WHO made changes
- No record of WHAT changed (before/after diff)
- Cannot investigate security incidents retroactively

**Recommendation**:
```typescript
app.patch('/:id', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const id = c.req.param('id') as PermissionsConfigId
  const userId = c.get('userId')
  const data = await c.req.json()

  // Get before state
  const before = await storage.getById(projectId, id)

  const config = await storage.update(projectId, id, data)

  // Audit log at WARN or INFO level (always enabled)
  log.warn({
    event: 'permissions_config_updated',
    projectId,
    configId: id,
    userId,
    before: before?.mode,
    after: config.mode,
    timestamp: new Date().toISOString(),
  }, 'permissions configuration updated')

  return c.json(config)
})
```

---

### P1-3: No Rate Limiting on Config Creation

**File**: `packages/server/src/routes/permissions-config.ts`
**Lines**: 27-33

**Issue**: Unlimited config creation can fill disk or cause DOS.

**Attack Scenario**:
```bash
# Create 10,000 configs to fill disk
for i in {1..10000}; do
  curl -X POST http://localhost:3000/api/projects/proj-abc/permissions-config \
    -H 'Content-Type: application/json' \
    -d '{"title":"Spam '$i'","mode":"sandbox","config":{...}}'
done
```

**Impact**: Disk space exhaustion, service degradation

**Recommendation**:
- Add per-project limit (e.g., max 100 configs per project)
- Add rate limiting middleware (e.g., 10 creates per minute per user)

```typescript
app.post('/', async (c) => {
  const projectId = c.req.param('projectId') as ProjectId
  const data = await c.req.json()

  // Check limit
  const existing = await storage.list(projectId)
  if (existing.length >= 100) {
    return c.json({ error: 'Config limit reached (max 100 per project)' }, 429)
  }

  const config = await storage.create(projectId, data)
  return c.json(config, 201)
})
```

---

## P2 - Medium Priority Issues

### P2-1: Unrestricted Mode Has No Additional API Protection

**File**: `packages/server/src/routes/permissions-config.ts`
**Issue**: UI shows a scary modal for `unrestricted` mode, but the API has no additional checks.

**Recommendation**: Add a confirmation token requirement for unrestricted mode:
```typescript
app.post('/', async (c) => {
  const data = await c.req.json()

  // Require explicit confirmation for unrestricted mode
  if (data.mode === 'unrestricted' && !data.confirmUnrestricted) {
    return c.json({
      error: 'Unrestricted mode requires explicit confirmation',
      hint: 'Set confirmUnrestricted: true in request body'
    }, 400)
  }

  // ... proceed with creation
})
```

---

### P2-2: Weak Wildcard Domain Matching (Assumed)

**File**: `packages/shared/src/types/permissions.ts`
**Lines**: 44, 49

**Issue**: The code accepts wildcard patterns like `*.github.com` for domain filtering, but the actual matching implementation is not visible in the reviewed files.

**Concern**: If wildcard matching is implemented naively (e.g., simple string replace `*` → `.*` in regex), it could be vulnerable to bypasses:

```javascript
// Dangerous pattern:
allowedDomains: ['*.github.com']

// If implemented as regex: /^.*\.github\.com$/
// Bypasses:
'evil.github.com.attacker.com'  // May match if regex doesn't anchor properly
```

**Recommendation**: Review the actual domain matching implementation (likely in sandbox runtime) and ensure:
- Wildcards only match DNS labels, not arbitrary strings
- TLD wildcards are disallowed (`*.com` is too broad)
- Patterns are properly anchored

---

## Additional Observations

### ✓ Security Controls Working Well

1. **Default Config Protection** (`storage/permissions-config.ts:68-91`)
   - System default cannot be updated or deleted
   - Disk 'default' files are filtered out in favor of code constant
   - Properly enforced ✓

2. **ID Validation** (`utils/paths.ts:6-12`)
   - Regex pattern prevents `../` in IDs: `/^[a-z]+-[A-Za-z0-9_-]+$/`
   - Used consistently before path operations ✓

3. **React XSS Protection** (`PermissionsSettings.tsx`)
   - User input (title, config fields) rendered via React JSX
   - React automatically escapes values
   - No `dangerouslySetInnerHTML` usage ✓

4. **Platform Safety Check** (`resolve-permissions.ts:49-63`)
   - Windows properly restricted to deniedCommands only
   - No filesystem/network sandbox on unsupported platforms ✓

---

## Remediation Priority

**Before Deployment (P0 Blockers)**:
1. Add input validation to all API routes
2. Fix path traversal in template resolution
3. Add authorization checks for project ownership

**After Deployment (P1 Critical)**:
4. Expand default sensitive path coverage
5. Add audit logging for permission changes
6. Add rate limiting and config count limits

**Future Hardening (P2)**:
7. Add confirmation token for unrestricted mode
8. Review domain wildcard matching implementation

---

## Testing Recommendations

### Penetration Tests to Run

1. **Path Traversal**:
   ```bash
   # Create config with traversal attempt
   curl -X POST http://localhost:3000/api/projects/proj-test/permissions-config \
     -d '{"title":"Evil","mode":"sandbox","config":{"allowWrite":["{{workspaceDir}}/../../../.ssh"]}}'

   # Verify agent cannot write to ~/.ssh
   ```

2. **Cross-Project Access**:
   ```bash
   # User A creates project proj-aaa
   # User B tries to modify proj-aaa's permissions
   curl -X PATCH http://localhost:3000/api/projects/proj-aaa/permissions-config/default \
     -H 'Authorization: Bearer <user-b-token>' \
     -d '{"mode":"unrestricted"}'

   # Should return 403 Forbidden
   ```

3. **Input Fuzzing**:
   ```bash
   # Send invalid types
   curl -X POST http://localhost:3000/api/projects/proj-test/permissions-config \
     -d '{"title":null,"mode":"invalid","config":"not-an-object"}'

   # Should return 400 with validation errors
   ```

---

## Compliance Notes

**OWASP Top 10 2021 Mapping**:
- **A01 Broken Access Control**: P0-3 (missing authorization)
- **A03 Injection**: P0-2 (path traversal), P0-1 (input validation)
- **A04 Insecure Design**: P1-1 (incomplete deny list), P1-2 (no audit log)
- **A05 Security Misconfiguration**: P2-1 (unrestricted mode), P1-1 (missing paths)

**CWE Mapping**:
- CWE-22: Path Traversal (P0-2)
- CWE-20: Improper Input Validation (P0-1)
- CWE-862: Missing Authorization (P0-3)
- CWE-778: Insufficient Logging (P1-2)

---

## Sign-off

**Status**: **FAILED** - 3 P0 issues must be resolved before deployment

**CR-Security**: Security review completed. See P0 issues above for blocking concerns.

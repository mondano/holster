# Listener Bug Analysis

## Current Behavior

### Issue Summary
`.on()` listeners only fire for the **first** update, then stop firing for subsequent updates when using object data.

### Root Cause: Soul Migration
When you call `db.get("key").put({data})` multiple times:

1. **First put** → writes to soul `"root"` (initial soul from `get("key")`)
   - Listener registered on soul `"root"`
   - Listener fires ✓

2. **Listener callback executes** → triggers internal holster logic
   - Holster creates a NEW soul (random UUID like `"T1VA5GP4eksnB9KD9GjKd0VP"`)
   - This is the actual data storage soul

3. **Second put** → writes to the NEW soul `"T1VA..."`
   - Listener still registered on OLD soul `"root"`
   - Listener doesn't fire ✗

4. **Subsequent puts** → continue writing to `"T1VA..."`
   - Listener never fires again ✗

### Proof from Logs
```
PUT #1: soul="root", listeners=1 → fires ✓
  └─ Nested put creates soul="T1VA5GP4eksnB9KD9GjKd0VP"

PUT #2: soul="T1VA5GP4eksnB9KD9GjKd0VP", listeners=0 → no fire ✗
PUT #3: soul="T1VA5GP4eksnB9KD9GjKd0GP", listeners=0 → no fire ✗
```

### Why Primitives Work but Objects Don't

**Primitives** (strings, numbers):
- Simple value storage, no nested soul creation
- All puts write to same soul consistently
- Listeners work correctly ✓

**Objects**:
- Complex graph structure with nested souls
- First put triggers soul creation/migration
- Subsequent puts use different soul than listener expects
- Listeners break ✗

### Secondary Issue: `_get` Parameter

The `.on()` method requires an undocumented `_get=true` parameter to fetch existing data:

```typescript
// Doesn't work for existing data:
db.get("key").on(callback)

// Works:
db.get("key").on(callback, true)
```

This is unintuitive - users expect `.on()` to:
1. Fetch current data immediately
2. Listen for future updates

Currently it only does #2 by default.

## Architecture Understanding

### Current Soul System

```typescript
// User calls:
db.get("mykey").put({value: 1})

// Holster internal structure:
"root" → reference to → "T1VA5GP4..." (actual data soul)

// Why:
// - "root" is the lookup/alias soul
// - "T1VA..." is the actual data storage soul
// - This enables graph relationships and CRDT merging
```

### Listener Registration (holster.ts:709)

```typescript
wire.on(initialLex as never, map.get(callback)!, false, opts)
```

Listeners are registered on the **initial soul** from `get("key")`, which is `"root"`.

### Data Writing (holster.ts:483-486)

```typescript
const g = await graph(soul, node as never, ctx.user, _ack as never)
wire.put(g, _ack as never)
```

After first put, the `soul` becomes the NEW migrated soul, not `"root"`.

### Listener Migration Code (holster.ts:722-726)

```typescript
if (id) {
  wire.off(initialLex as never, map.get(callback)!)
  const relLex = { "#": id, ".": null } as Lex
  wire.on(relLex, map.get(callback)!, _get, opts)
}
```

This code EXISTS to migrate listeners to new souls, but only runs for **explicit graph references** like `{author: {"#": "user123"}}`, not for regular data updates.

## Solution Options

### Option 1: Fix Listener Migration (Recommended)

**What:** Make listeners automatically follow soul changes

**How:**
- After each put, check if the resolved soul changed
- If changed, migrate listener from old soul to new soul
- Use existing migration code pattern from line 722-726

**Pros:**
- Fixes the root cause
- Maintains current architecture
- Minimal API changes
- Works for all data types (objects, primitives, references)

**Cons:**
- Requires careful tracking of soul changes
- Need to handle race conditions
- More complex implementation

**Implementation:**
```typescript
// In holster.ts put() after wire.put completes:
1. Track original soul from ctx
2. After put, resolve the actual soul used
3. If souls differ AND listener exists:
   - wire.off(originalSoul, callback)
   - wire.on(newSoul, callback, ...)
```

### Option 2: Consistent Soul Assignment

**What:** Always use the same soul for a given key

**How:**
- First `get("key")` determines the soul forever
- All puts for that key use the same soul
- No soul migration needed

**Pros:**
- Simplest conceptually
- Listeners naturally work
- No migration logic needed

**Cons:**
- **BREAKS CORE ARCHITECTURE**: GunDB/Holster relies on soul migration for graph relationships
- Would require massive refactoring
- Might break existing features (user data, references, etc.)
- Not backwards compatible

**Assessment:** ❌ Not viable - conflicts with fundamental design

### Option 3: Document + Workaround

**What:** Document the current behavior and provide workarounds

**How:**
- Document that `.on()` needs `true` parameter for existing data
- Document that object updates require re-subscribing
- Provide helper methods or patterns

**Pros:**
- No code changes
- Zero risk
- Fast to implement

**Cons:**
- **TERRIBLE UX**: Users must manually re-subscribe after updates
- Breaks expected reactive behavior
- Makes library harder to use
- Doesn't fix the actual bug

**Assessment:** ❌ Not acceptable - poor developer experience

### Option 4: Hybrid Approach (Also Recommended)

**What:** Fix both issues comprehensively

**How:**
1. Make `_get=true` the default behavior
2. Implement listener migration (Option 1)
3. Add comprehensive integration tests

**Pros:**
- Best user experience
- Fixes both issues at once
- Makes API intuitive
- Future-proof

**Cons:**
- Most work required
- Need to ensure no regressions

**Implementation Plan:**
1. Change holster.ts line 709: pass `true` instead of `false` for initial get
2. Implement soul migration tracking after puts
3. Add tests for multi-update scenarios
4. Update documentation

## Recommended Approach

**Option 4: Hybrid Approach**

### Rationale:
1. **Listener migration is essential** - the core bug MUST be fixed
2. **`_get=true` default** improves UX significantly with minimal risk
3. **Both changes are complementary** and solve related problems
4. **Integration tests exist** to catch regressions

### Implementation Priority:
1. ✅ First: Make `_get=true` the default (simple, low risk)
2. ✅ Second: Implement listener migration (complex, high value)
3. ✅ Third: Clean up debug tests and add proper integration tests
4. ✅ Fourth: Update documentation and examples

### Risk Assessment:
- **Low risk**: `_get=true` default (only adds initial fetch)
- **Medium risk**: Listener migration (need careful testing)
- **Mitigation**: Comprehensive test suite already in place

## Next Steps

1. Implement `_get=true` default in holster.ts:709
2. Add soul tracking to context
3. Implement listener migration after puts
4. Run full test suite
5. Test integration scenarios (relay sync, user auth, etc.)
6. Clean up debug test files
7. Document the fix in CHANGELOG

## Files to Modify

- [src/holster.ts](src/holster.ts) - Listener registration and soul tracking
- [src/wire.ts](src/wire.ts) - Already clean, no changes needed
- [test/integration/](test/integration/) - Clean up debug tests, keep good ones
- [README.md](README.md) - Update `.on()` usage examples
- [CHANGELOG.md](CHANGELOG.md) - Document the fix

# A.H.I Studio — Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Strict Workspace Ownership:** Every document under `/users/{userId}` and its subcollections (`projects`, `characters`, `creations`) can ONLY be read, created, updated, or deleted by the authenticated, email-verified user whose `request.auth.uid == userId`.
2. **Master Gate Parent Integrity:** No subcollection document (`projects`, `characters`, `creations`) may be created, updated, or deleted unless the parent `/users/{userId}` workspace document exists and has `uid == request.auth.uid`.
3. **Immutable Ownership & Creation Timestamps:** `uid`, `ownerId`, `id`, and `createdAt` can never be mutated after document creation. `createdAt` on create and `updatedAt` on create/update must equal `request.time`.
4. **No Shadow Fields / No Binary Exhaustion:** Every write checks `keys().hasAll(...) && keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` per action on update, bounded strings (`.size()`), and bounded arrays (`characterIds <= 20`, `scenes <= 24`, `personalityTraits <= 10`, `colorPalette <= 8`).
5. **No PII Leakage / No Client Query Trust:** `allow list` on `/users` is strictly denied (`if false`); subcollection `allow list` enforces `isOwner(userId) && existing().ownerId == request.auth.uid` without `get()`/`exists()` O(n) reads.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Read/Write (`request.auth == null`)** on `/users/u1/projects/p1` -> `PERMISSION_DENIED`.
2. **Unverified Email Spoofing (`email_verified == false`)** creating `/users/u1` or `/users/u1/projects/p1` -> `PERMISSION_DENIED`.
3. **Cross-Tenant Read (`uid = "attacker"` reading `/users/victim/projects/p1`)** -> `PERMISSION_DENIED`.
4. **Cross-Tenant Owner Spoofing (`uid = "u1"` writing `ownerId: "victim"` inside `/users/u1/projects/p1`)** -> `PERMISSION_DENIED`.
5. **Orphan Subcollection Write** creating `/users/u1/projects/p1` when `/users/u1` parent document does not exist -> `PERMISSION_DENIED`.
6. **ID Poisoning** creating `/users/u1/projects/bad$id_with_spaces` or 500-char document ID -> `PERMISSION_DENIED`.
7. **Shadow Ghost Field Injection** adding `{ isPro: true, role: "admin" }` on create or update -> `PERMISSION_DENIED`.
8. **Immutable Field Mutation** changing `ownerId` or `createdAt` during an update -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery** passing a backdated `createdAt` or `updatedAt != request.time` -> `PERMISSION_DENIED`.
10. **Value Type Poisoning** updating `title` to a number `12345` or `aspectRatio` to `"99:1"` -> `PERMISSION_DENIED`.
11. **Denial-of-Wallet Oversized String / Array** sending 400KB `thumbnailUrl` (> 200KB limit) or 50 items in `characterIds` (> 20 limit) -> `PERMISSION_DENIED`.
12. **Blanket User List Scraping** attempting `list` on `/users` -> `PERMISSION_DENIED`.

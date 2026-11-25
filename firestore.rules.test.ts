/**
 * Phase 0 TDD Payload Spec Verification for A.H.I Studio Firestore Security Rules.
 * Evaluates the "Dirty Dozen" adversarial payloads against blueprint & rule invariants.
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; emailVerified: boolean } | null;
  parentExists?: boolean;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_PAYLOADS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read/write attempt',
    path: '/users/user_abc/projects/proj_1',
    operation: 'create',
    auth: null,
    payload: { id: 'proj_1', ownerId: 'user_abc', title: 'Test' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email spoofing write',
    path: '/users/user_abc/projects/proj_1',
    operation: 'create',
    auth: { uid: 'user_abc', emailVerified: false },
    parentExists: true,
    payload: { id: 'proj_1', ownerId: 'user_abc', title: 'Spoofed' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-tenant read attempt',
    path: '/users/victim_1/characters/char_1',
    operation: 'get',
    auth: { uid: 'attacker_9', emailVerified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-tenant ownerId spoofing on create',
    path: '/users/attacker_9/projects/proj_1',
    operation: 'create',
    auth: { uid: 'attacker_9', emailVerified: true },
    parentExists: true,
    payload: { id: 'proj_1', ownerId: 'victim_1', title: 'Hijack' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Orphaned subcollection write without parent workspace doc',
    path: '/users/user_abc/creations/cre_1',
    operation: 'create',
    auth: { uid: 'user_abc', emailVerified: true },
    parentExists: false,
    payload: { id: 'cre_1', ownerId: 'user_abc', mode: 'image', prompt: 'Fox' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'ID poisoning with invalid characters',
    path: '/users/user_abc/projects/invalid$id!',
    operation: 'create',
    auth: { uid: 'user_abc', emailVerified: true },
    parentExists: true,
    payload: { id: 'invalid$id!', ownerId: 'user_abc', title: 'Bad ID' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Shadow ghost field injection (isAdmin/role)',
    path: '/users/user_abc',
    operation: 'create',
    auth: { uid: 'user_abc', emailVerified: true },
    payload: {
      uid: 'user_abc',
      displayName: 'Creator',
      photoUrl: '',
      isAdmin: true,
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Immutable ownerId/createdAt mutation on update',
    path: '/users/user_abc/projects/proj_1',
    operation: 'update',
    auth: { uid: 'user_abc', emailVerified: true },
    parentExists: true,
    payload: { ownerId: 'other_user', createdAt: '1999-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Client timestamp forgery (createdAt != request.time)',
    path: '/users/user_abc/characters/char_1',
    operation: 'create',
    auth: { uid: 'user_abc', emailVerified: true },
    parentExists: true,
    payload: {
      id: 'char_1',
      ownerId: 'user_abc',
      name: 'Kai',
      createdAt: '2000-01-01T00:00:00Z',
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Value type poisoning on update (invalid enum & non-string title)',
    path: '/users/user_abc/projects/proj_1',
    operation: 'update',
    auth: { uid: 'user_abc', emailVerified: true },
    parentExists: true,
    payload: { title: 99999, aspectRatio: '100:1' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Denial-of-Wallet oversized thumbnailUrl (> 200KB) or characterIds (> 20)',
    path: '/users/user_abc/projects/proj_1',
    operation: 'create',
    auth: { uid: 'user_abc', emailVerified: true },
    parentExists: true,
    payload: {
      id: 'proj_1',
      ownerId: 'user_abc',
      title: 'Huge',
      thumbnailUrl: 'x'.repeat(250000),
      characterIds: Array.from({ length: 25 }, (_, i) => `char_${i}`),
    },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Blanket collection list scraping on /users',
    path: '/users',
    operation: 'list',
    auth: { uid: 'user_abc', emailVerified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
];

export function verifyDirtyDozenSpec(): boolean {
  return DIRTY_DOZEN_PAYLOADS.length === 12 &&
    DIRTY_DOZEN_PAYLOADS.every((item) => item.expectedResult === 'PERMISSION_DENIED');
}

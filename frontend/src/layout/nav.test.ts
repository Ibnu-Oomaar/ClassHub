import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Role } from '@/auth/types';
import { NAVIGATION, PROFILE_ITEM } from './nav';

const ROLES: Role[] = ['CLASS_MASTER', 'TEACHER', 'STUDENT'];
const linksFor = (role: Role) => NAVIGATION[role].flatMap((group) => group.items.map((item) => item.to));

/** Reads which roles each path in the route table is limited to, straight from App.tsx. */
function routeRoles(): Map<string, Role[] | 'everyone'> {
  const source = readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8');
  const table = new Map<string, Role[] | 'everyone'>();
  for (const path of source.matchAll(/path:\s*'([^']+)'/g)) table.set(path[1], 'everyone');
  for (const group of source.matchAll(/<RequireRole roles=\{\[([^\]]*)\]\} \/>,\s*children:\s*\[([\s\S]*?)\n\s*\],/g)) {
    const roles = [...group[1].matchAll(/'([A-Z_]+)'/g)].map((m) => m[1] as Role);
    for (const path of group[2].matchAll(/path:\s*'([^']+)'/g)) table.set(path[1], roles);
  }
  return table;
}

describe('navigation', () => {
  it('has a menu for exactly the three roles', () => {
    expect(Object.keys(NAVIGATION).sort()).toEqual([...ROLES].sort());
  });

  it('lists nothing twice for one person', () => {
    for (const role of ROLES) expect(new Set(linksFor(role)).size).toBe(linksFor(role).length);
  });

  it('starts every menu with Home and Announcements', () => {
    for (const role of ROLES) expect(linksFor(role).slice(0, 2)).toEqual(['/dashboard', '/announcements']);
  });

  it('only ever links to pages that exist in the route table', () => {
    const table = routeRoles();
    for (const role of ROLES) for (const link of linksFor(role)) expect({ role, link, exists: table.has(link) }).toEqual({ role, link, exists: true });
    expect(table.has(PROFILE_ITEM.to)).toBe(true);
  });

  it('never shows a person a link to a page their role is not allowed to open', () => {
    const table = routeRoles();
    for (const role of ROLES) {
      for (const link of linksFor(role)) {
        const allowed = table.get(link);
        expect({ role, link, allowed: allowed === 'everyone' || allowed?.includes(role) }).toEqual({ role, link, allowed: true });
      }
    }
  });

  it('shows the Class Master every administration page, and nobody else any of them', () => {
    const administration = ['/backups', '/audit-log', '/settings', '/grading', '/marks-review', '/teachers', '/subjects'];
    expect(linksFor('CLASS_MASTER')).toEqual(expect.arrayContaining(administration));
    for (const role of ['TEACHER', 'STUDENT'] as Role[]) for (const link of administration) expect(linksFor(role)).not.toContain(link);
  });

  it('gives students their own results and no student list; teachers the student list and no results', () => {
    expect(linksFor('STUDENT')).toContain('/results');
    expect(linksFor('STUDENT')).not.toContain('/students');
    expect(linksFor('TEACHER')).toContain('/students');
    expect(linksFor('TEACHER')).not.toContain('/results');
  });

  it('has no attendance or lesson pages for anyone', () => {
    for (const role of ROLES) for (const link of linksFor(role)) expect(link).not.toMatch(/attendance|lesson/);
  });
});

import { matchPattern } from '../src/match';

describe('matchPattern', () => {
  it('matches a literal path', () => {
    expect(matchPattern('/projects', '/projects')).toEqual({});
  });

  it('captures named params', () => {
    expect(matchPattern('/projects/:id/members', '/projects/7/members')).toEqual({
      id: '7',
    });
  });

  it('captures several params', () => {
    expect(matchPattern('/a/:x/b/:y', '/a/1/b/2')).toEqual({ x: '1', y: '2' });
  });

  it('decodes percent-encoded params', () => {
    expect(matchPattern('/donors/:name', '/donors/a%20b')).toEqual({ name: 'a b' });
  });

  it('rejects a segment-count mismatch', () => {
    expect(matchPattern('/projects/:id', '/projects')).toBeNull();
    expect(matchPattern('/projects/:id', '/projects/7/members')).toBeNull();
  });

  it('rejects a differing literal segment', () => {
    expect(matchPattern('/projects/:id/members', '/projects/7/donors')).toBeNull();
  });

  it('treats trailing slashes as equivalent', () => {
    expect(matchPattern('/projects/', '/projects')).toEqual({});
  });
});

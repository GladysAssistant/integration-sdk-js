const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { parseMdnsTxt } = require('../lib');

describe('parseMdnsTxt(txt)', () => {
  it('should turn the raw key=value entries into an object', () => {
    assert.deepEqual(parseMdnsTxt(['id=AA:BB:CC:DD:EE:FF', 'md=Eve Energy', 'c#=2', 'sf=1']), {
      id: 'AA:BB:CC:DD:EE:FF',
      md: 'Eve Energy',
      'c#': '2',
      sf: '1',
    });
  });

  it('should keep everything after the first "=" as the value', () => {
    assert.deepEqual(parseMdnsTxt(['path=/api?a=1&b=2', 'empty=']), { path: '/api?a=1&b=2', empty: '' });
  });

  it('should lowercase the keys, which are case-insensitive', () => {
    assert.deepEqual(parseMdnsTxt(['MD=Hue Bridge', 'BridgeId=001788']), { md: 'Hue Bridge', bridgeid: '001788' });
  });

  it('should keep only the first occurrence of a key', () => {
    assert.deepEqual(parseMdnsTxt(['id=first', 'ID=second', 'id=third']), { id: 'first' });
  });

  it('should read an entry without "=" as a boolean attribute', () => {
    assert.deepEqual(parseMdnsTxt(['secure', 'id=1']), { secure: true, id: '1' });
  });

  it('should ignore empty entries, empty keys and non-string entries', () => {
    assert.deepEqual(parseMdnsTxt(['', '=orphan', null, 42, { id: 'x' }, 'id=1']), { id: '1' });
  });

  it('should keep a "__proto__" key as a plain key', () => {
    const txt = parseMdnsTxt(['__proto__=value', 'id=1']);
    assert.equal(Object.getPrototypeOf(txt), Object.prototype);
    assert.ok(Object.prototype.hasOwnProperty.call(txt, '__proto__'));
    assert.equal(txt.id, '1');
  });

  it('should return an empty object when txt is not an array', () => {
    assert.deepEqual(parseMdnsTxt(undefined), {});
    assert.deepEqual(parseMdnsTxt(null), {});
    assert.deepEqual(parseMdnsTxt('id=1'), {});
  });
});

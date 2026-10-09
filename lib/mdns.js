/**
 * @description Parse the raw TXT record entries of an 'mdns' scan result
 * (`["id=AA:BB", "sf=1"]`) into an object, following the DNS-SD rules of
 * RFC 6763 section 6: keys are case-insensitive (returned lowercased), the
 * value is everything after the FIRST '=' (it may itself contain '='), an
 * entry without '=' is a boolean attribute (`true`), and when a key appears
 * more than once only its first occurrence counts. Empty entries, entries
 * with an empty key ("=value") and non-string entries are ignored.
 * @param {Array<string>} txt - Raw TXT record entries (`result.txt`).
 * @returns {object} Keys/values, e.g. `{ id: 'AA:BB', sf: '1' }`; empty when
 * `txt` is not an array.
 * @example
 * parseMdnsTxt(['id=AA:BB:CC:DD:EE:FF', 'md=Eve Energy', 'sf=1']);
 * // { id: 'AA:BB:CC:DD:EE:FF', md: 'Eve Energy', sf: '1' }
 */
const parseMdnsTxt = (txt) => {
  if (!Array.isArray(txt)) {
    return {};
  }
  const entries = new Map();
  txt.forEach((entry) => {
    if (typeof entry !== 'string') {
      return;
    }
    const separator = entry.indexOf('=');
    const key = (separator === -1 ? entry : entry.slice(0, separator)).toLowerCase();
    if (key.length === 0 || entries.has(key)) {
      return;
    }
    entries.set(key, separator === -1 ? true : entry.slice(separator + 1));
  });
  // Object.fromEntries defines own properties: a "__proto__" key stays a plain key.
  return Object.fromEntries(entries);
};

module.exports = { parseMdnsTxt };

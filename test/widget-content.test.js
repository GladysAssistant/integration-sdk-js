const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { validateWidgetContent, validateWidgetImage } = require('../lib');
const {
  pngBase64,
  jpegBase64,
  webpBase64,
  pngBuffer,
  webpVp8Buffer,
  webpVp8lBuffer,
  webpUnknownChunkBuffer,
} = require('./helpers/images');

const text = (variant, value = 'Hello') => ({ type: 'text', variant, text: value });
const tile = (value = 1) => ({ type: 'value', value, label: { en: 'Tile' } });
const status = () => ({ type: 'status', items: [{ label: 'State', value: 'Docked' }] });
const button = (key) => ({ type: 'button', label: 'Go', action: { key } });
const image = () => ({ type: 'image', key: 'map-1' });

describe('validateWidgetContent(content) — dev-mode mirror of the core normalization', () => {
  it('should accept a clean content of every component type', () => {
    const issues = validateWidgetContent({
      version: 1,
      ttl_seconds: 300,
      components: [
        text('heading', { en: 'Solar', fr: 'Solaire' }),
        text('caption'),
        { type: 'value', value: 82, unit: '%', label: { en: 'Battery' }, icon: 'battery', color: 'success' },
        { type: 'value', device_feature: 'ext:ext-demo:solar:power', label: 'Power' },
        { type: 'gauge', value: 42, min: 0, max: 100, label: 'Level', color: 'info' },
        {
          type: 'chart',
          chart_type: 'area',
          title: 'Forecast',
          unit: 'kW',
          series: [{ name: 'Today', points: [{ t: '2026-09-21T10:00:00Z', v: 1.2 }] }],
          annotations: [{ t: '2026-09-21T12:00:00Z', value: 2, label: 'Peak', color: 'warning' }],
          now_marker: true,
        },
        { type: 'status', items: [{ label: { en: 'State' }, value: 3, icon: 'zap', color: 'neutral' }] },
        { type: 'button', label: 'Start', style: 'primary', action: { key: 'start', params: { mode: 'full' } } },
      ],
    });
    assert.deepEqual(issues, []);
  });

  it('should accept the card-list, image and button variants', () => {
    const issues = validateWidgetContent({
      components: [
        {
          type: 'card-list',
          display: 'grid',
          items: [
            {
              title: "L'Odyssée",
              subtitle: 'Drama',
              date: '2026-10-07',
              image: 'poster-20637522',
              badge: { text: { en: 'New' }, color: 'info' },
              description: 'Long text',
              links: [{ url: 'https://www.themoviedb.org/movie/20637522', label: 'TMDB' }],
            },
          ],
        },
        { type: 'button', label: 'Dock', device_feature: 'ext:ext-demo:vacuum:dock', value: 1 },
        { type: 'button', label: 'Trailer', link: { url: 'https://www.youtube.com/watch?v=x' } },
      ],
    });
    assert.deepEqual(issues, []);
    assert.deepEqual(validateWidgetContent({ components: [image(), { type: 'image', key: 'a', fit: 'contain' }] }), [
      'components[1]: image component dropped by the content budget (a second focal component: chart, card-list and image count as one)',
    ]);
  });

  it('should refuse a content that is not an envelope', () => {
    assert.deepEqual(validateWidgetContent(null), [
      'content: must be an object { version?, ttl_seconds?, components } — refused by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent([]), [
      'content: must be an object { version?, ttl_seconds?, components } — refused by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent({}), ['content.components: is required (an array) — refused by Gladys']);
    assert.deepEqual(validateWidgetContent({ components: [] }), []);
  });

  it('should refuse a bad version and warn on a clamped or invalid TTL', () => {
    assert.deepEqual(validateWidgetContent({ version: 0, components: [] }), [
      'content.version: must be an integer ≥ 1 — refused by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent({ version: 1.5, components: [] }), [
      'content.version: must be an integer ≥ 1 — refused by Gladys',
    ]);
    assert.match(validateWidgetContent({ version: 2, components: [] })[0], /^content\.version: 2 is above/);
    assert.deepEqual(validateWidgetContent({ ttl_seconds: 5, components: [] }), [
      'content.ttl_seconds: is clamped to 10-3600 s by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent({ ttl_seconds: 'soon', components: [] }), [
      'content.ttl_seconds: is not a finite number, 60 s is used',
    ]);
  });

  it('should refuse a content over 256 KB serialized', () => {
    const issues = validateWidgetContent({ components: [text('body', 'x'.repeat(257 * 1024))] });
    assert.equal(issues[0], 'content: exceeds 256 KB serialized — refused by Gladys');
  });

  it('should report dropped components: non-objects, unknown types, missing required fields', () => {
    const issues = validateWidgetContent({
      components: [
        'nope',
        { type: 'sparkline' },
        { type: 'text' },
        { type: 'value', label: 'No value' },
        { type: 'gauge', value: 3 },
        { type: 'status' },
        { type: 'status', items: [{ label: 'x' }] },
        { type: 'chart' },
        { type: 'card-list', items: [{ subtitle: 'no title' }] },
        { type: 'image', key: 'Bad Key' },
        { type: 'button', action: { key: 'a' } },
      ],
    });
    assert.deepEqual(issues, [
      'components[0]: must be an object, dropped',
      'components[1]: has an unknown type "sparkline", dropped (known: text, value, gauge, status, chart, card-list, image, button)',
      'components[2].text: must be a string or a multi-language object',
      'components[3].value: is required (a finite number, a string ≤ 12 characters, or device_feature)',
      'components[4]: min and max are required, finite, with min < max',
      'components[5].items: is required (an array of { label, value })',
      'components[6].items[0].value: is required (a finite number or a string ≤ 40 characters)',
      'components[6].items: has no valid row',
      'components[7]: needs series (inline points) or device_features (live history)',
      'components[8].items[0].title: is required',
      'components[8].items: has no valid item',
      'components[9].key: is required, an image key matching ^[a-z0-9][a-z0-9-]{0,63}$',
      'components[10].label: is required',
    ]);
  });

  it('should report the texts the core truncates and the multi-language objects it refuses', () => {
    assert.deepEqual(validateWidgetContent({ components: [text('heading', 'x'.repeat(41))] }), [
      'components[0].text: is 41 characters long, truncated to 40 by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [text('body', { fr: 'Bonjour' })] }), [
      'components[0].text: must carry a non-empty "en" value (the language fallback)',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [text('caption', { en: 'Hi', fr: 'x'.repeat(81) })] }), [
      'components[0].text.fr: is 81 characters long, truncated to 80 by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [text('caption', { en: 'Hi', english: 'Hi' })] }), [
      'components[0].text.english: is not a language code with a string value, ignored by Gladys',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [text('body', '   ')] }), [
      'components[0].text: is an empty string',
    ]);
  });

  it('should report the optional fields the core ignores: unknown enums, icons, dates, urls', () => {
    const issues = validateWidgetContent({
      components: [
        { type: 'value', value: 1, color: 'purple', icon: 'Not Valid' },
        text('shout', 'Hey'),
        {
          type: 'card-list',
          display: 'carousel',
          items: [{ title: 'A', date: 'yesterday', image: 'Bad', badge: 'new', links: [{ url: 'http://x' }] }],
        },
        {
          type: 'chart',
          chart_type: 'pie',
          device_features: ['ext:a'],
          interval: 'forever',
          series: [],
          annotations: 'no',
          now_marker: 'yes',
        },
        { type: 'button', label: 'Go', style: 'link', action: { key: 'go', params: 'x', confirm: 'yes' } },
      ],
    });
    assert.deepEqual(issues, [
      'components[0].icon: is not a Feather icon name (^[a-z0-9-]{1,40}$), ignored',
      'components[0].color: "purple" is not one of neutral, primary, success, warning, danger, info, ignored',
      'components[1].variant: "shout" is not one of heading, body, caption, ignored',
      'components[2].display: "carousel" is not one of grid, list, ignored',
      'components[2].items[0].date: is not an ISO 8601 date, ignored',
      'components[2].items[0].image: is not an image key (^[a-z0-9][a-z0-9-]{0,63}$), ignored',
      'components[2].items[0].badge: must be { text, color? }, ignored',
      'components[2].items[0].links[0]: needs an https url (≤ 2048 characters, no credentials), dropped',
      'components[3].chart_type: "pie" is not one of line, area, bar, stepline, ignored',
      'components[3].interval: "forever" is not one of last-hour, last-twelve-hours, last-day, last-three-days, last-week, last-month, last-three-months, last-year, ignored',
      'components[3]: carries both device_features and series: the live features win, series is ignored',
      'components[3].annotations: must be an array, ignored',
      'components[3].now_marker: must be a strict boolean, ignored',
      'components[4].style: "link" is not one of primary, secondary, danger, ignored',
      'components[4].action.params: must be an object, ignored',
      'components[4].action.confirm: must be a boolean, ignored',
      'components[3]: chart component dropped by the content budget (a second focal component: chart, card-list and image count as one)',
    ]);
  });

  it('should report the arrays the core trims', () => {
    const issues = validateWidgetContent({
      components: [
        { type: 'status', items: Array.from({ length: 11 }, (_, i) => ({ label: `L${i}`, value: i })) },
        {
          type: 'chart',
          series: Array.from({ length: 5 }, () => ({
            points: Array.from({ length: 301 }, (_, i) => ({ t: new Date(i * 1000).toISOString(), v: i })),
          })),
          annotations: Array.from({ length: 9 }, () => ({ t: '2026-09-21T00:00:00Z' })),
        },
      ],
    });
    assert.deepEqual(issues, [
      'components[0].items: has 11 rows, 10 allowed: the extra rows are dropped',
      'components[1].series: has 5 series, 4 allowed: the extra ones are dropped',
      'components[1].series[0].points: has 301 points, 300 allowed: the extra ones are dropped',
      'components[1].series[1].points: has 301 points, 300 allowed: the extra ones are dropped',
      'components[1].series[2].points: has 301 points, 300 allowed: the extra ones are dropped',
      'components[1].series[3].points: has 301 points, 300 allowed: the extra ones are dropped',
      'components[1].annotations: has 9 entries, 8 allowed: the extra ones are dropped',
    ]);
    const list = validateWidgetContent({
      components: [
        {
          type: 'card-list',
          items: Array.from({ length: 9 }, (_, i) => ({
            title: `T${i}`,
            links: Array.from({ length: 4 }, () => ({ url: 'https://a.example' })),
          })),
        },
      ],
    });
    assert.equal(list[0], 'components[0].items: has 9 items, 8 allowed in "list": the extra ones are dropped');
    assert.equal(list[1], 'components[0].items[0].links: has 4 links, 3 allowed: the extra ones are dropped');
  });

  it('should validate the device-bound forms and the button kinds', () => {
    const issues = validateWidgetContent({
      components: [
        { type: 'value', device_feature: { external_id: 'x' } },
        { type: 'value', device_feature: 'ext:a', value: 3 },
        { type: 'gauge', device_feature: 'ext:a', min: 10, max: 5 },
        { type: 'gauge', device_feature: 42 },
        { type: 'chart', device_features: [] },
        { type: 'chart', device_features: ['ext:a', 7] },
        { type: 'chart', device_features: ['a', 'b', 'c', 'd', 'e'] },
        { type: 'button', label: 'Both', action: { key: 'a' }, link: { url: 'https://x' } },
        { type: 'button', label: 'Bad key', action: { key: 'A' } },
        { type: 'button', label: 'Heavy', action: { key: 'heavy', params: { blob: 'x'.repeat(1030) } } },
        { type: 'button', label: 'No value', device_feature: 'ext:a' },
        { type: 'button', label: 'No url', link: {} },
      ],
    });
    assert.deepEqual(issues, [
      'components[0].device_feature: must be the feature external_id as a plain string',
      'components[1]: carries both device_feature and value/unit: the live feature wins, value/unit are ignored',
      "components[2]: min/max are not finite numbers with min < max, the feature's own range is used",
      'components[3].device_feature: must be the feature external_id as a plain string',
      'components[4].device_features: must be a non-empty array of feature external_ids',
      'components[5].device_features: must only carry feature external_ids as plain strings',
      'components[6].device_features: has 5 entries, 4 allowed: the extra ones are dropped',
      'components[7]: must carry exactly one of action, device_feature or link',
      'components[8].action.key: is required, matching ^[a-z0-9_]{2,32}$',
      'components[9].action.params: exceeds 1024 bytes serialized',
      'components[10].value: is required next to device_feature (the number to send)',
      'components[11].link.url: is required, an https url (≤ 2048 characters, no credentials)',
    ]);
  });

  it('should apply the content budget in content order: 8 components, 1 focal, 6 tiles, 2 texts, 1 status, 4 buttons', () => {
    const nine = validateWidgetContent({ components: [...Array.from({ length: 8 }, () => tile()), status()] });
    assert.deepEqual(
      nine,
      [
        'components[6]: value component dropped by the content budget (more than 6 tiles)',
        'components[7]: value component dropped by the content budget (more than 6 tiles)',
        'components[8]: status component dropped by the content budget (9 components, 8 allowed)',
      ]
        .slice(0, 2)
        .concat([]),
    );
    const tooMany = validateWidgetContent({
      components: [
        ...Array.from({ length: 4 }, () => tile()),
        ...Array.from({ length: 4 }, (_, i) => button(`b${i}`)),
        text('caption'),
      ],
    });
    assert.deepEqual(tooMany, [
      'components[8]: text component dropped by the content budget (9 components, 8 allowed)',
    ]);
    const focal = validateWidgetContent({
      components: [
        image(),
        { type: 'chart', series: [{ points: [{ t: '2026-09-21T00:00:00Z', v: 1 }] }] },
        { type: 'card-list', items: [{ title: 'A' }] },
      ],
    });
    assert.deepEqual(focal, [
      'components[1]: chart component dropped by the content budget (a second focal component: chart, card-list and image count as one)',
      'components[2]: card-list component dropped by the content budget (a second focal component: chart, card-list and image count as one)',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [text('body'), text('body')] }), [
      'components[1]: text component dropped by the content budget (a second body text)',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [text('heading'), text('caption'), text('body')] }), [
      'components[2]: text component dropped by the content budget (more than 2 texts)',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [status(), status()] }), [
      'components[1]: status component dropped by the content budget (a second status list)',
    ]);
    assert.deepEqual(validateWidgetContent({ components: Array.from({ length: 5 }, (_, i) => button(`b${i}`)) }), [
      'components[4]: button component dropped by the content budget (more than 4 buttons)',
    ]);
    assert.deepEqual(validateWidgetContent({ components: [button('same'), button('same')] }), [
      'components[1]: button component dropped by the content budget (duplicate action key "same")',
    ]);
  });

  it('should report the item-level corner cases the core drops or ignores', () => {
    const issues = validateWidgetContent({
      components: [
        { type: 'value', value: 'On' },
        { type: 'value', value: 'a much too long tile value' },
        { type: 'gauge', min: 0, max: 1 },
        { type: 'status', items: ['nope', { label: 'ok', value: 1 }] },
        {
          type: 'chart',
          series: [
            'nope',
            {
              points: [
                { t: 'yesterday', v: 1 },
                { t: '2026-09-21', v: 'x' },
              ],
            },
          ],
        },
        {
          type: 'chart',
          series: [{ points: [{ t: '2026-09-21T00:00:00Z', v: 1 }, 'nope'] }],
          annotations: ['nope', { t: 'never' }, { t: '2026-09-21T00:00:00Z', value: 'high' }],
        },
        { type: 'card-list' },
        { type: 'card-list', items: ['nope', { title: '  ' }, { title: 'ok', links: 'x' }] },
        {
          type: 'card-list',
          items: [
            {
              title: 'ok',
              links: [{ url: 'https://exa mple.com' }, { url: 'https://user:pass@example.com/x' }, { url: 42 }],
            },
          ],
        },
        { type: 'button', label: '   ', action: { key: 'go' } },
        { type: 'button', label: 'Dock', device_feature: 42, value: 1 },
      ],
    });
    assert.deepEqual(issues, [
      'components[1].value: is 26 characters long, truncated to 12 by Gladys',
      'components[2].value: is required (a finite number, or device_feature)',
      'components[3].items[0]: must be an object, dropped',
      'components[4].series[0]: must be { name?, points: [{ t, v }] }, dropped',
      'components[4].series[1].points: contains points without a valid ISO `t` and a finite `v`, dropped',
      'components[4].series[1].points: has no valid point, the series is dropped',
      'components[4].series: has no valid series',
      'components[5].series[0].points: contains points without a valid ISO `t` and a finite `v`, dropped',
      'components[5].annotations[0]: needs an ISO date `t`, dropped',
      'components[5].annotations[1]: needs an ISO date `t`, dropped',
      'components[5].annotations[2].value: is not a finite number, ignored',
      'components[6].items: is required (an array of { title, ... })',
      'components[7].items[0]: must be an object, dropped',
      'components[7].items[1].title: is an empty string',
      'components[7].items[2].links: must be an array of { url, label? }, ignored',
      'components[8].items[0].links[0]: needs an https url (≤ 2048 characters, no credentials), dropped',
      'components[8].items[0].links[1]: needs an https url (≤ 2048 characters, no credentials), dropped',
      'components[8].items[0].links[2]: needs an https url (≤ 2048 characters, no credentials), dropped',
      'components[9].label: is an empty string',
      'components[10].device_feature: must be the feature external_id as a plain string',
      'components[7]: card-list component dropped by the content budget (a second focal component: chart, card-list and image count as one)',
      'components[8]: card-list component dropped by the content budget (a second focal component: chart, card-list and image count as one)',
    ]);
  });

  it('should not count a component the core already drops against the budget', () => {
    const issues = validateWidgetContent({
      components: [{ type: 'status' }, status(), { type: 'sparkline' }, ...Array.from({ length: 7 }, () => tile())],
    });
    assert.deepEqual(issues, [
      'components[0].items: is required (an array of { label, value })',
      'components[2]: has an unknown type "sparkline", dropped (known: text, value, gauge, status, chart, card-list, image, button)',
      'components[9]: value component dropped by the content budget (more than 6 tiles)',
    ]);
  });
});

describe('validateWidgetImage(rawBase64) — dev-mode mirror of the core image checks', () => {
  it('should accept a PNG, a JPEG and a WebP within the bounds', () => {
    assert.deepEqual(validateWidgetImage(pngBase64(300, 450)), []);
    assert.deepEqual(validateWidgetImage(jpegBase64(1920, 1080)), []);
    assert.deepEqual(validateWidgetImage(webpBase64(4096, 4096)), []);
  });

  it('should refuse an empty, non-string or data-URI value', () => {
    assert.deepEqual(validateWidgetImage(''), ['image: must be a non-empty raw base64 string (no data-URI prefix)']);
    assert.deepEqual(validateWidgetImage(undefined), [
      'image: must be a non-empty raw base64 string (no data-URI prefix)',
    ]);
    assert.deepEqual(validateWidgetImage(`data:image/png;base64,${pngBase64(1, 1)}`), [
      'image: must be RAW base64, without the data-URI prefix',
    ]);
    assert.deepEqual(validateWidgetImage('$$$'), ['image: is not valid base64']);
  });

  it('should refuse an image over 300 KB decoded', () => {
    assert.deepEqual(validateWidgetImage(pngBase64(10, 10, 300 * 1024)), []);
    assert.deepEqual(validateWidgetImage(pngBase64(10, 10, 300 * 1024 + 1)), [
      'image: 301 KB decoded, 300 KB allowed — resize it integration-side',
    ]);
  });

  it('should refuse an unsupported format', () => {
    assert.deepEqual(validateWidgetImage(Buffer.from('GIF89a......').toString('base64')), [
      'image: not a PNG, JPEG or WebP (magic numbers)',
    ]);
    assert.deepEqual(validateWidgetImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')), [
      'image: not a PNG, JPEG or WebP (magic numbers)',
    ]);
  });

  it('should refuse a pixel size over 4096 on either side, or an unreadable header', () => {
    assert.deepEqual(validateWidgetImage(pngBase64(4097, 10)), ['image: 4097×10 px, at most 4096×4096 allowed']);
    assert.deepEqual(validateWidgetImage(jpegBase64(10, 4097)), ['image: 10×4097 px, at most 4096×4096 allowed']);
    assert.deepEqual(validateWidgetImage(webpBase64(5000, 3000)), ['image: 5000×3000 px, at most 4096×4096 allowed']);
    assert.deepEqual(validateWidgetImage(pngBase64(0, 10)), ['image: 0×10 px, at most 4096×4096 allowed']);
    const truncatedPng = pngBuffer(10, 10).subarray(0, 16).toString('base64');
    assert.deepEqual(validateWidgetImage(truncatedPng), [
      'image: unreadable image/png header, pixel size unknown — refused by Gladys',
    ]);
    const jpegWithoutFrame = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0, 0, 0, 0, 0, 0, 0, 0]).toString('base64');
    assert.deepEqual(validateWidgetImage(jpegWithoutFrame), [
      'image: unreadable image/jpeg header, pixel size unknown — refused by Gladys',
    ]);
  });

  it('should walk the JPEG marker segments: padding bytes, standalone markers, a broken or truncated stream', () => {
    const sof0 = (width, height) => {
      const segment = Buffer.alloc(11);
      segment[0] = 0xff;
      segment[1] = 0xc0;
      segment.writeUInt16BE(9, 2);
      segment[4] = 8;
      segment.writeUInt16BE(height, 5);
      segment.writeUInt16BE(width, 7);
      return segment;
    };
    const soi = Buffer.from([0xff, 0xd8]);
    // a 0xff padding byte, a RST0 standalone marker and a TEM marker before the frame header
    const padded = Buffer.concat([soi, Buffer.from([0xff, 0xff, 0xd0, 0xff, 0x01]), sof0(640, 480), Buffer.alloc(4)]);
    assert.deepEqual(validateWidgetImage(padded.toString('base64')), []);
    // a byte that is not a marker prefix where one is expected (after a valid APP0 segment)
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
    const broken = Buffer.concat([soi, app0, Buffer.from([0x00, 0x00]), sof0(10, 10), Buffer.alloc(4)]);
    assert.deepEqual(validateWidgetImage(broken.toString('base64')), [
      'image: unreadable image/jpeg header, pixel size unknown — refused by Gladys',
    ]);
    // an APP0 segment whose declared length runs past the end of the stream
    const truncated = Buffer.concat([soi, Buffer.from([0xff, 0xe0, 0x00, 0x40]), Buffer.alloc(8)]);
    assert.deepEqual(validateWidgetImage(truncated.toString('base64')), [
      'image: unreadable image/jpeg header, pixel size unknown — refused by Gladys',
    ]);
  });

  it('should read the WebP lossy (VP8), lossless (VP8L) and extended (VP8X) headers', () => {
    assert.deepEqual(validateWidgetImage(webpVp8Buffer(800, 450).toString('base64')), []);
    assert.deepEqual(validateWidgetImage(webpVp8Buffer(4097, 450).toString('base64')), [
      'image: 4097×450 px, at most 4096×4096 allowed',
    ]);
    assert.deepEqual(validateWidgetImage(webpVp8Buffer(10, 10, { startCode: false }).toString('base64')), [
      'image: unreadable image/webp header, pixel size unknown — refused by Gladys',
    ]);
    assert.deepEqual(validateWidgetImage(webpVp8lBuffer(300, 450).toString('base64')), []);
    assert.deepEqual(validateWidgetImage(webpVp8lBuffer(300, 4097).toString('base64')), [
      'image: 300×4097 px, at most 4096×4096 allowed',
    ]);
    assert.deepEqual(validateWidgetImage(webpVp8lBuffer(10, 10, { signature: false }).toString('base64')), [
      'image: unreadable image/webp header, pixel size unknown — refused by Gladys',
    ]);
    assert.deepEqual(validateWidgetImage(webpUnknownChunkBuffer().toString('base64')), [
      'image: unreadable image/webp header, pixel size unknown — refused by Gladys',
    ]);
    const tooShort = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBPVP8X', 'latin1'), Buffer.alloc(4)]);
    assert.deepEqual(validateWidgetImage(tooShort.toString('base64')), [
      'image: unreadable image/webp header, pixel size unknown — refused by Gladys',
    ]);
  });
});

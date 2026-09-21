/**
 * Minimal image headers for the widget image tests: only the bytes the
 * Gladys core reads (magic numbers + the pixel size in the header), padded
 * with zeros to the requested byte length. Not decodable pictures.
 */

const withPadding = (header, byteLength) => {
  if (byteLength === undefined || byteLength <= header.length) {
    return header;
  }
  return Buffer.concat([header, Buffer.alloc(byteLength - header.length)]);
};

/**
 * PNG: 8 signature bytes, then the IHDR chunk (length, 'IHDR', width, height).
 */
const pngBuffer = (width, height, byteLength) => {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return withPadding(header, byteLength);
};

/**
 * JPEG: SOI, an APP0 segment, then a SOF0 frame header (precision, height, width).
 */
const jpegBuffer = (width, height, byteLength) => {
  const soi = Buffer.from([0xff, 0xd8]);
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const sof0 = Buffer.alloc(11);
  sof0[0] = 0xff;
  sof0[1] = 0xc0;
  sof0.writeUInt16BE(9, 2);
  sof0[4] = 8;
  sof0.writeUInt16BE(height, 5);
  sof0.writeUInt16BE(width, 7);
  return withPadding(Buffer.concat([soi, app0, sof0, Buffer.alloc(2)]), byteLength);
};

/**
 * WebP (VP8X extended format): RIFF container, 'WEBP', then the VP8X chunk
 * carrying the canvas size minus one on 24 bits.
 */
const webpBuffer = (width, height, byteLength) => {
  const header = Buffer.alloc(30);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(22, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8X', 12, 'ascii');
  header.writeUInt32LE(10, 16);
  header.writeUIntLE(width - 1, 24, 3);
  header.writeUIntLE(height - 1, 27, 3);
  return withPadding(header, byteLength);
};

/**
 * WebP lossy (VP8 chunk): frame tag (3 bytes), the 9d 01 2a start code, then
 * width and height on 14 bits each (little-endian). `startCode: false`
 * corrupts the start code so the header is unreadable.
 */
const webpVp8Buffer = (width, height, { startCode = true } = {}) => {
  const header = Buffer.alloc(30);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(22, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8 ', 12, 'ascii');
  header.writeUInt32LE(10, 16);
  if (startCode) {
    header[23] = 0x9d;
    header[24] = 0x01;
    header[25] = 0x2a;
  }
  header.writeUInt16LE(width, 26);
  header.writeUInt16LE(height, 28);
  return header;
};

/**
 * WebP lossless (VP8L chunk): the 0x2f signature byte, then width - 1 and
 * height - 1 on 14 bits each, packed little-endian. `signature: false`
 * corrupts the signature so the header is unreadable.
 */
const webpVp8lBuffer = (width, height, { signature = true } = {}) => {
  const header = Buffer.alloc(30);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(22, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('VP8L', 12, 'ascii');
  header.writeUInt32LE(10, 16);
  header[20] = signature ? 0x2f : 0x00;
  header.writeUInt32LE(((height - 1) << 14) | (width - 1), 21);
  return header;
};

/**
 * WebP container whose first chunk is not a picture header.
 */
const webpUnknownChunkBuffer = () => {
  const header = Buffer.alloc(30);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(22, 4);
  header.write('WEBP', 8, 'ascii');
  header.write('ICCP', 12, 'ascii');
  return header;
};

const pngBase64 = (width, height, byteLength) => pngBuffer(width, height, byteLength).toString('base64');
const jpegBase64 = (width, height, byteLength) => jpegBuffer(width, height, byteLength).toString('base64');
const webpBase64 = (width, height, byteLength) => webpBuffer(width, height, byteLength).toString('base64');

module.exports = {
  pngBuffer,
  jpegBuffer,
  webpBuffer,
  webpVp8Buffer,
  webpVp8lBuffer,
  webpUnknownChunkBuffer,
  pngBase64,
  jpegBase64,
  webpBase64,
};

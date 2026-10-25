/**
 * Run a function with DEBUG=gladys-integration-sdk set and console.error
 * captured, and return the captured debug lines.
 */
const withDebug = async (fn) => {
  const originalDebug = process.env.DEBUG;
  const originalError = console.error;
  const lines = [];
  process.env.DEBUG = 'gladys-integration-sdk';
  console.error = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.error = originalError;
    if (originalDebug === undefined) {
      delete process.env.DEBUG;
    } else {
      process.env.DEBUG = originalDebug;
    }
  }
  return lines;
};

module.exports = { withDebug };

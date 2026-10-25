/**
 * Provider types answering the core on demand — AI providers (manifest
 * `type: "ai"`, contract capabilities/ai-type.md) and text-to-speech
 * providers (`type: "tts"`, contract capabilities/tts-type.md): the checks
 * the SDK runs on what their handlers resolve before it leaves the
 * integration. The rules mirror `externalIntegration.aiChat.js` and the
 * `tts.synthesize` relay of the Gladys core; keep them in sync when the
 * contracts grow.
 */

const {
  MAX_AI_CHAT_CONTENT_CHARS,
  MAX_AI_CHAT_TOOL_CALLS,
  MAX_AI_CHAT_TOOL_ARGUMENTS_CHARS,
  AI_CHAT_TOOL_NAME_REGEX,
  TTS_AUDIO_CONTENT_TYPES,
  MAX_TTS_AUDIO_SIZE_BYTES,
} = require('./constants');

const BASE64_REGEX = /^[A-Za-z0-9+/]+={0,2}$/;
const BASE64_SEPARATOR = ';base64,';
const DATA_SCHEME = 'data:';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * @description Whether a value has the shape of an OpenAI-compatible
 * completion the core can read at all: an object whose `choices[0].message`
 * is an object. Anything else is refused by the core as a whole
 * (EXTERNAL_INTEGRATION_INVALID_AI_RESPONSE) — the SDK acks it as a failure
 * instead of sending it.
 * @param {any} completion - The value resolved by the onAiChat handler.
 * @returns {boolean} True when the shape is readable.
 * @example
 * isCompletionShape({ choices: [{ message: { content: 'Hi' } }] }); // true
 */
function isCompletionShape(completion) {
  return (
    isPlainObject(completion) &&
    Array.isArray(completion.choices) &&
    isPlainObject(completion.choices[0]) &&
    isPlainObject(completion.choices[0].message)
  );
}

/**
 * @description Report what the Gladys core would refuse or truncate in an
 * OpenAI-compatible completion before it enters the tool-calling loop
 * (`normalizeAiCompletion`): a `content` that is neither a string nor null,
 * more than 20 `tool_calls`, a tool call without a valid `function.name` or
 * with non-string or oversized `arguments` fail the WHOLE completion
 * (EXTERNAL_INTEGRATION_INVALID_AI_RESPONSE); a `content` above 50,000
 * characters is truncated, a tool call `id` above 128 characters too, every
 * other field (`usage`, `model`, `finish_reason`, extra choices) is dropped.
 * One message per issue, an empty array when the completion goes through
 * unchanged. Run by the SDK in dev mode on every resolved completion;
 * exported so an adapter can assert its mapping in its own tests.
 * @param {any} completion - The completion.
 * @returns {Array<string>} The issues, in reading order.
 * @example
 * assert.deepEqual(validateAiCompletion(await adapter.chat(request)), []);
 */
function validateAiCompletion(completion) {
  if (!isCompletionShape(completion)) {
    return ['completion: must be an object whose choices[0].message is an object — refused by Gladys'];
  }
  const report = [];
  if (completion.choices.length > 1) {
    report.push(`choices: ${completion.choices.length} choices, only the first one is read by Gladys`);
  }
  const { message } = completion.choices[0];
  if (typeof message.content === 'string') {
    if (message.content.length > MAX_AI_CHAT_CONTENT_CHARS) {
      report.push(
        `choices[0].message.content: ${message.content.length} characters, truncated at ${MAX_AI_CHAT_CONTENT_CHARS}`,
      );
    }
  } else if (message.content !== null && message.content !== undefined) {
    report.push('choices[0].message.content: must be a string or null — completion refused by Gladys');
  }
  if (message.tool_calls !== undefined && message.tool_calls !== null) {
    if (!Array.isArray(message.tool_calls)) {
      report.push('choices[0].message.tool_calls: must be an array — completion refused by Gladys');
    } else {
      if (message.tool_calls.length > MAX_AI_CHAT_TOOL_CALLS) {
        report.push(
          `choices[0].message.tool_calls: ${message.tool_calls.length} tool calls, ${MAX_AI_CHAT_TOOL_CALLS} allowed — completion refused by Gladys`,
        );
      }
      message.tool_calls.forEach((toolCall, index) => {
        const path = `choices[0].message.tool_calls[${index}]`;
        if (!isPlainObject(toolCall) || !isPlainObject(toolCall.function)) {
          report.push(`${path}: must be an object with a "function" object — completion refused by Gladys`);
          return;
        }
        const { name } = toolCall.function;
        if (typeof name !== 'string' || !AI_CHAT_TOOL_NAME_REGEX.test(name)) {
          report.push(`${path}.function.name: must match ${AI_CHAT_TOOL_NAME_REGEX} — completion refused by Gladys`);
        }
        const args = toolCall.function.arguments;
        if (args !== undefined && (typeof args !== 'string' || args.length > MAX_AI_CHAT_TOOL_ARGUMENTS_CHARS)) {
          report.push(
            `${path}.function.arguments: must be a JSON string of at most ${MAX_AI_CHAT_TOOL_ARGUMENTS_CHARS} characters — completion refused by Gladys`,
          );
        }
        if (typeof toolCall.id === 'string' && toolCall.id.length > 128) {
          report.push(`${path}.id: ${toolCall.id.length} characters, truncated at 128`);
        }
      });
    }
  }
  return report;
}

/**
 * @description Check the audio resolved by the onTtsSynthesize handler the
 * way the Gladys core does before serving a byte: a
 * `<content type>;base64,<payload>` string (the `data:` scheme accepted
 * too) whose content type is one of TTS_AUDIO_CONTENT_TYPES, whose payload
 * is well-formed base64 (the core refuses it rather than decoding a partial
 * clip) and decodes to 1 byte to 5 MB — read from the base64 length, the
 * clip is never decoded here. Throws a descriptive error on anything else:
 * the core's own refusal is an opaque EXTERNAL_INTEGRATION_INVALID_TTS_AUDIO.
 * @param {any} audio - The value resolved by the handler.
 * @returns {string} The audio, as given.
 * @example
 * checkTtsAudio('audio/mpeg;base64,SUQz...');
 */
function checkTtsAudio(audio) {
  const accepted = Object.keys(TTS_AUDIO_CONTENT_TYPES).join(', ');
  if (typeof audio !== 'string' || audio.length === 0) {
    throw new Error(`onTtsSynthesize: the resolved audio must be a "<content type>;base64,..." string (${accepted})`);
  }
  const dataUri = audio.startsWith(DATA_SCHEME) ? audio.slice(DATA_SCHEME.length) : audio;
  const separatorIndex = dataUri.indexOf(BASE64_SEPARATOR);
  const contentType = separatorIndex === -1 ? null : dataUri.slice(0, separatorIndex);
  if (!Object.prototype.hasOwnProperty.call(TTS_AUDIO_CONTENT_TYPES, contentType)) {
    throw new Error(
      `onTtsSynthesize: the audio content type must be one of ${accepted} ("<content type>;base64,..." string)`,
    );
  }
  const encoded = dataUri.slice(separatorIndex + BASE64_SEPARATOR.length);
  if (!BASE64_REGEX.test(encoded)) {
    throw new Error('onTtsSynthesize: the audio payload must be base64 (a single line of the standard alphabet)');
  }
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedBytes = Math.floor((encoded.length * 3) / 4) - padding;
  if (decodedBytes > MAX_TTS_AUDIO_SIZE_BYTES) {
    throw new Error(
      `onTtsSynthesize: the audio decodes to ${Math.ceil(decodedBytes / 1024)} KB, ${MAX_TTS_AUDIO_SIZE_BYTES / 1024 / 1024} MB allowed`,
    );
  }
  return audio;
}

module.exports = { isCompletionShape, validateAiCompletion, checkTtsAudio };

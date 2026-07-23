import createPreset from 'conventional-changelog-conventionalcommits';

// Preset used by `npm run changelog` (see the release workflow). Same as the
// stock "conventionalcommits" preset, but with docs/refactor/perf/revert
// commits visible in the changelog instead of only feat/fix.
export default createPreset({
  types: [
    { type: 'feat', section: 'Features' },
    { type: 'fix', section: 'Bug Fixes' },
    { type: 'perf', section: 'Performance' },
    { type: 'revert', section: 'Reverts' },
    { type: 'docs', section: 'Documentation' },
    { type: 'refactor', section: 'Refactoring' },
  ],
});

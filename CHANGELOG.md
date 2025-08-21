# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-08-21

### Fixed

- The `retry` API now treats explicit `undefined` values the same as implicit `undefined` values.
Before this fix, if the options provided didn't contain a specific field, it would result in using
its corresponding default. When the field was provided explicitly with an `undefined` value, the
API would not use the corresponding default. The latter has been fixed so that the behavior is uniform
across `undefined` values.

## [0.1.1] - 2025-07-05

### Fixed

- Fixed legacy import of the module by adding a "main" field to the `package.json`.## [0.1.0] - 2025-06-17

### Added

- First implementation of the emitter like, promise like retry utility!

[0.1.0]: https://github.com/infra-blocks/ts-retry/releases/tag/v0.1.0

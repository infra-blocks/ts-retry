# ts-retry
[![Build](https://github.com/infra-blocks/ts-retry/actions/workflows/build.yml/badge.svg)](https://github.com/infra-blocks/ts-retry/actions/workflows/build.yml)
[![Release](https://github.com/infra-blocks/ts-retry/actions/workflows/release.yml/badge.svg)](https://github.com/infra-blocks/ts-retry/actions/workflows/release.yml)
[![Update From Template](https://github.com/infra-blocks/ts-retry/actions/workflows/update-from-template.yml/badge.svg)](https://github.com/infra-blocks/ts-retry/actions/workflows/update-from-template.yml)

This repository exports generic retry utilities. The main function returns a `PromiseLike` object that also has a small `Emitter` API, allowing client code to
be notified every time their function is attempted.

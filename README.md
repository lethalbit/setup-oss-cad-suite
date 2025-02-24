# Setup-OSS-CAD-Suite

This downloads and sets up a pre-build EDA environment from [OSS CAD Suite](https://github.com/YosysHQ/oss-cad-suite-build), allowing you to have all the most up-to-date tools available to you.


## Usage

The following examples show the basic usage for this action.

### Set up the latest release of the tools

This sets up the latest nightly build of the oss-cad-suite tools and adds them to your path.

```yaml
steps:
- uses: actions/checkout@v3
- uses: YosysHQ/setup-oss-cad-suite@v2
- run: yosys --version
```
### Set up a specific release of the tools

This sets up a specified build of the oss-cad-suite tools and adds them to your path.

```yaml
steps:
- uses: actions/checkout@v3
- uses: YosysHQ/setup-oss-cad-suite@v2
  with:
    version: '2021-05-28'
- run: yosys --version
```

### Cache a specific release of the tools

This is just like the setup above, but adds the `cache` option to tell the action to use a cached version of the tools if found, and if not it will add them to the cache automatically.

```yaml
steps:
- uses: actions/checkout@v3
- uses: YosysHQ/setup-oss-cad-suite@v2
  with:
    version: '2021-05-28'
    cache: true
- run: yosys --version
```


### Use `GITHUB_TOKEN` to prevent API rate limiting

Sometimes the action will fail due to the workers IP hitting the public API rate limit. With this the action will authenticate to the API with the token to allow you to hopefully eliminate the flakiness that would occur due to this.


```yaml
steps:
- uses: actions/checkout@v3
- uses: YosysHQ/setup-oss-cad-suite@v2
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
- run: yosys --version
```

> **Note** The action will not write to the API using the token, the only time the token is used is
> when reading the `releases` API endpoint for oss-cad-suite builds

### Use bundled python3 environment

You can override the systems python environment with the one bundled with oss-cad-suite as follows:

```yaml
steps:
- uses: actions/checkout@v3
- uses: YosysHQ/setup-oss-cad-suite@v2
  with:
    python-override: true
- run: yosys --version
```

# Example

```yaml
name: CI
on:
  workflow_dispatch:
jobs:
  build:
    runs-on: ubuntu-latest

    steps:
      - uses: YosysHQ/setup-oss-cad-suite@v2
      - run: yosys --version
```

## License

The scripts and documentation in this project are released under the [ISC](LICENSE)

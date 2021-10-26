# Setup ccache in Github Actions workflow [![GithubActionBadge]][GithubActionLink]

[GithubActionBadge]: https://github.com/Chocobo1/setup-ccache-action/actions/workflows/ci.yaml/badge.svg
[GithubActionLink]: https://github.com/Chocobo1/setup-ccache-action/actions

## Basic usage
If you have a simple workflow, the action can be used like this:
```yml
- name: Checkout repository
  uses: actions/checkout@v2

- name: Setup ccache
  uses: Chocobo1/setup-ccache-action@v1

- name: Build C++ program
  run: |
    ./configure
    make
```

## Advanced usage
This action provides a few flags for customizing the behavior. \
For description of all options, take a look at [action.yml](action.yml).

* `update_packager_index` \
  By default, this action will update packager's indexes to avoid installation issues
  (`apt`/`brew` on linux/macOS respectively). \
  You can disable it to save some time however you are then responsible for ensuring the packager's
  indexes are up-to-date *before* using this action.
  ```yml
  - name: Checkout repository
    uses: actions/checkout@v2

  - name: Install dependencies
    run: |
      sudo apt update  # ensure indexes are up-to-date
      sudo apt install \
        libboost-dev

  - name: Setup ccache
    uses: Chocobo1/setup-ccache-action@v1
    with:
      update_packager_index: false

  - name: Build C++ program
    run: |
      cmake -B build ./
      cmake --build build
  ```

* `install_ccache` \
  By default, this action will install ccache with package manager. \
  You can omit installation if you've already installed ccache and it is accessible in the shell.
  ```yml
  - name: Checkout repository
    uses: actions/checkout@v2

  - name: Install dependencies
    run: |
      sudo apt update  # ensure indexes are up-to-date
      sudo apt install \
        ccache \
        libboost-dev

  - name: Setup ccache
    uses: Chocobo1/setup-ccache-action@v1
    with:
      install_ccache: false
      update_packager_index: false

  - name: Build C++ program
    run: |
      cmake -B build ./
      ninja -C build
  ```

* `prepend_symlinks_to_path` \
  By default, this action will prepend ccache's compiler symlinks directory to `PATH` so that
  compiler invocations will be handled by ccache transparently. If you wish to handle it manually
  then you can set this option to `false`. Also see: https://ccache.dev/manual/latest.html#_run_modes \
  Note that the symlinks directory is different for each OS and to simplify this the action provides a
  handy environment variable that you can use: `${{ env.ccache_symlinks_path }}`.
  This variable is only available after the setup ccache step.
  ```yml
  - name: Setup ccache
    uses: Chocobo1/setup-ccache-action@v1
    with:
      prepend_symlinks_to_path: false

  - name: Build C++ program
    run: |
      export PATH="${{ env.ccache_symlinks_path }}:$PATH"
      cmake -B build ./
      make -C build
  ```

* `ccache_options` \
  You are able to pass/configure ccache's options with this flag. \
  Accepts multiline `key=value`. \
  See: https://ccache.dev/manual/latest.html#_configuration_options
  ```yml
  - name: Setup ccache
    uses: Chocobo1/setup-ccache-action@v1
    with:
      ccache_options: |
        max_size=200M
        compression=false
  ```

* `windows_compile_environment` \
  Specify which compiler environment you are going to use on Windows image. \
  This field is mandatory if you intend to use this action on a Windows image! \
  Refer to [action.yml](action.yml) for available options. \
  Note: as of October 2021, cmake still have some problems when using the default "Ninja" generator.
  I would suggest using "MSYS Makefiles" generator along with the `make` package
  (without `mingw-w64-*-` prefix in package name).
  ```yml
  # run this action before setting up ccache
  - name: Setup msys2
    uses: msys2/setup-msys2@v2
    with:
      install: |
        make
        mingw-w64-x86_64-toolchain

  - name: Setup ccache
    uses: Chocobo1/setup-ccache-action@v1
    with:
      windows_compile_environment: msys2  # this field is required
  ```

## Limitations
This action support running on Ubuntu (`ubuntu-*`) and macOS (`macos-*`). \
Windows is partly supported: only `msys2` is available currently.

tag-and-push version:
    #!/usr/bin/env bash
    set -euo pipefail
    VERSION="{{ version }}"
    VERSION="${VERSION#v}"
    TAG="v$VERSION"
    npm pkg set version="$VERSION"
    git add package.json
    git commit -m "chore: release $TAG"
    git tag "$TAG"
    git push origin main "$TAG"

# Record all README demo GIFs.
record-gifs:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p docs/images
    vhs docs/tapes/basic.tape
    vhs docs/tapes/nesting.tape
    vhs docs/tapes/showcase.tape

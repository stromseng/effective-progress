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

# Record the showcase example to docs/images/showcase.gif.
record-showcase-gif:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p docs/images
    vhs docs/tapes/showcase.tape

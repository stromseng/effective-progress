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

bump-patch:
    #!/usr/bin/env bash
    set -euo pipefail
    CURRENT_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' package.json | head -n1)"
    IFS='.' read -r major minor patch <<<"$CURRENT_VERSION"
    NEXT_VERSION="$major.$minor.$((patch + 1))"
    just tag-and-push "$NEXT_VERSION"

bump-minor:
    #!/usr/bin/env bash
    set -euo pipefail
    CURRENT_VERSION="$(sed -n 's/^[[:space:]]*"version":[[:space:]]*"\([0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*\)".*/\1/p' package.json | head -n1)"
    IFS='.' read -r major minor patch <<<"$CURRENT_VERSION"
    NEXT_VERSION="$major.$((minor + 1)).0"
    just tag-and-push "$NEXT_VERSION"

# Record all README demo GIFs.
record-gifs:
    #!/usr/bin/env bash
    set -euo pipefail
    mkdir -p docs/images
    vhs docs/tapes/basic.tape
    vhs docs/tapes/mixedOutcomes.tape
    vhs docs/tapes/nesting.tape
    vhs docs/tapes/showcase.tape

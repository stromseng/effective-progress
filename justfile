tag-and-push version:
  VERSION="{{version}}"; VERSION="${VERSION#v}"; npm pkg set version="$VERSION"
  git tag "{{version}}"
  git push origin "{{version}}"

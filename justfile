tag-and-push version:
  VERSION="{{version}}"; VERSION="${VERSION#v}"; TAG="v$VERSION"; npm pkg set version="$VERSION"; git add package.json; git commit -m "chore: release $TAG"; git tag "$TAG"; git push origin main "$TAG"

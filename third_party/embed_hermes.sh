#!/bin/sh
# An app's build step, from bureau_hermes_by_sdk: copies the Hermes framework for the
# SDK this build is for into the app, and signs it as the app is signed. Xcode gives
# a build step its build settings as the environment.
set -e
target="$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH/hermesvm.framework"
rm -rf "$target"
mkdir -p "$TARGET_BUILD_DIR/$FRAMEWORKS_FOLDER_PATH"
/usr/bin/ditto "$BUREAU_HERMES_DIR/hermesvm.framework" "$target"
if [ "$CODE_SIGNING_ALLOWED" != "NO" ] && [ -n "$EXPANDED_CODE_SIGN_IDENTITY" ]; then
  /usr/bin/codesign --force --sign "$EXPANDED_CODE_SIGN_IDENTITY" --timestamp=none "$target"
fi

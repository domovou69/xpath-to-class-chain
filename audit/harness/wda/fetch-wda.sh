#!/bin/sh
# Refreshes upstream/ from a WebDriverAgent release, e.g. ./fetch-wda.sh 17.1.4
# WDA lives in the appium/appium-ios monorepo (packages/webdriveragent, tags appium-webdriveragent@X.Y.Z);
# appium/WebDriverAgent only holds pre-built downloads and stops at v16.15.3.
# Afterwards: update VERSION, run build.sh (patches/ must still apply), then selftest.js and ./run.sh.
set -e
VERSION=${1:?usage: fetch-wda.sh <version>, e.g. 17.1.4}
HERE=$(cd "$(dirname "$0")" && pwd)
BASE=https://raw.githubusercontent.com/appium/appium-ios/appium-webdriveragent@$VERSION/packages/webdriveragent
for p in Utilities/FBClassChainQueryParser.h Utilities/FBClassChainQueryParser.m Routing/FBElement.h \
  Utilities/FBElementTypeTransformer.h Utilities/FBElementTypeTransformer.m Routing/FBElementUtils.m \
  Utilities/FBXPathExtensions.h Utilities/FBXPathExtensions.m Categories/NSExpression+FBFormat.h \
  Categories/NSExpression+FBFormat.m Utilities/NSPredicate+FBFormat.h Utilities/NSPredicate+FBFormat.m; do
  curl -fsSL "$BASE/WebDriverAgentLib/$p" -o "$HERE/upstream/$(basename "$p")"
done
curl -fsSL "$BASE/LICENSE" -o "$HERE/upstream/LICENSE"
echo "fetched appium-webdriveragent@$VERSION into upstream/ — review with: git diff -- $HERE/upstream"

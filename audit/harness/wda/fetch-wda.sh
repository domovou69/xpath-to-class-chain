#!/bin/sh
# Refreshes upstream/ from a WebDriverAgent tag, e.g. ./fetch-wda.sh v16.14.2
# Afterwards: update VERSION, run build.sh (patches/ must still apply), then selftest.js.
set -e
TAG=${1:?usage: fetch-wda.sh <tag>}
HERE=$(cd "$(dirname "$0")" && pwd)
BASE=https://raw.githubusercontent.com/appium/WebDriverAgent/$TAG
for p in Utilities/FBClassChainQueryParser.h Utilities/FBClassChainQueryParser.m Routing/FBElement.h \
  Utilities/FBElementTypeTransformer.h Utilities/FBElementTypeTransformer.m Routing/FBElementUtils.m \
  Utilities/FBXPathExtensions.h Utilities/FBXPathExtensions.m Categories/NSExpression+FBFormat.h \
  Categories/NSExpression+FBFormat.m Utilities/NSPredicate+FBFormat.h Utilities/NSPredicate+FBFormat.m; do
  curl -fsSL "$BASE/WebDriverAgentLib/$p" -o "$HERE/upstream/$(basename "$p")"
done
curl -fsSL "$BASE/LICENSE" -o "$HERE/upstream/LICENSE"
echo "fetched $TAG into upstream/ — review with: git diff -- $HERE/upstream"

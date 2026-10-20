#!/bin/bash
# Copy Play X-Ray to the stuffs site. It's a folder of plain files, so that's all deploying is.
set -euo pipefail
cd "$(dirname "$0")/.."
rsync -a --delete app/ /srv/docker/stuffs/site/play-xray/
echo "Live at https://stuffs.tiresia.xyz/play-xray/"

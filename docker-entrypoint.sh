#!/bin/sh
set -e
mkdir -p /data
exec node_modules/.bin/next start

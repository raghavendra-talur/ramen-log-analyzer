#!/bin/bash

set -xe
ls -la
./main &
sleep 5
curl -s http://127.0.0.1:8080/health
node server/dist/index.js
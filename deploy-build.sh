#!/bin/bash

set -xe

echo rtalur
go mod tidy
CGO_ENABLED=0 go build -o main .
cd client
npm install
npm run build
cd ../server
npm install
npm run build
#!/bin/bash

for i in $(seq 1 1 10)
do
	npm test
done

echo "WOOO"

#!/usr/bin/env bash
set -uo pipefail

output=$(bun test src 2>&1)
status=$?

echo "$output"

if [ $status -eq 0 ]; then
  exit 0
fi

if echo "$output" | grep -q "did not match any test files"; then
  exit 0
fi

exit $status

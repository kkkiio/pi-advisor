set shell := ["bash", "-uc"]

fmt:
	npm run fmt

check:
	npm run typecheck

test:
	npm test

test-e2e:
	npm run test:e2e

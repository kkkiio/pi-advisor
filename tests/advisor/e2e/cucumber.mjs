export default {
	paths: ["tests/advisor/e2e/features/**/*.feature"],
	import: [
		"tests/advisor/e2e/tsx-register.js",
		"tests/advisor/e2e/support/**/*.ts",
		"tests/advisor/e2e/steps/**/*.ts",
	],
	format: ["progress"],
	order: "defined",
	parallel: 0,
	strict: true,
};

export default {
	paths: ["e2e/features/**/*.feature"],
	import: ["e2e/tsx-register.js", "e2e/support/**/*.ts", "e2e/steps/**/*.ts"],
	format: ["progress"],
	order: "defined",
	parallel: 0,
	strict: true,
};

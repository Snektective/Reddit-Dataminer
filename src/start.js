const puppeteer = require("puppeteer");

const { log, dumping: dumpingLog, hashes: hashesLog } = require("./util/log.js");

const fse = require("fs-extra");

const { version } = require("../package.json");

const transformersGlobal = {
	VERSION: version,
};

const getHashes = require("./util/get-hashes.js");
const getScripts = require("./util/get-scripts.js");
const getRuntimeScripts = require("./util/get-runtime-scripts.js");
const dumpScripts = require("./util/dump-scripts.js");
const getToken = require("./util/get-token.js");

/**
 * Arguments to be passed to Puppeteer if the sandbox option is disabled.
 */
const noSandboxArgs = [
	"--no-sandbox",
	"--disable-setuid-sandbox",
];

/**
 * Runs the dataminer.
 * @param {Object} args The command-line arguments.
 */
async function start(args) {
	log(args);
	await fse.ensureDir(args.path);
	log("ensured output path exists");

	const hashes = await getHashes(args.hashes);

	const browser = await puppeteer.launch({
		args: args.sandbox ? [] : noSandboxArgs,
	});
	log("launched browser");

	const token = await getToken(args.redditUsername, args.redditPassword);
	if (token) {
		log("got reddit session token: '%s'", token);
	} else {
		log("not using a reddit session token");
	}
	const sessionCookie = {
		domain: ".reddit.com",
		name: "reddit-session",
		value: token,
	};

	const scriptsSet = new Set();

	const placeScripts = await getScripts(browser, hashes, sessionCookie, args.cache);
	for (const placeScript of placeScripts) {
		scriptsSet.add(placeScript);

		if (placeScript.startsWith("https://www.redditstatic.com/desktop2x/runtime~Reddit.")) {
			const runtimeScripts = await getRuntimeScripts(placeScript, hashes, args.mapIndex, args.mapBeforeJs);
			for (const runtimeScript of runtimeScripts) {
				scriptsSet.add(runtimeScript);
			}
		}
	}

	const scripts = [...scriptsSet];
	log("got list of scripts to dump");

	const transformersRun = {
		...transformersGlobal,
		DATE: new Date().toLocaleString("en-US"),
		SCRIPT_TOTAL: scripts.length,
	};

	if (await dumpScripts(scripts, transformersRun, args, hashes)) {
		dumpingLog("finished dumping all scripts");
	} else {
		dumpingLog("failed to dump all scripts");
	}

	if (args.hashes) {
		await fse.writeJSON(args.hashes, hashes).then(written => {
			hashesLog("saved new hashes to %s", args.hashes);
			return written;
		}).catch(() => {
			hashesLog("failed to save new hashes");
		});
	}

	// Clean up
	log("cleaning up");
	await browser.close();
	return scripts;
}
module.exports = start;

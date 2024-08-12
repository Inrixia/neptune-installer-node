import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";
import AdmZip from "adm-zip";
import { extract } from "tar";
import { pipeline } from "stream";
import { promisify } from "util";

const pipelineAsync = promisify(pipeline);

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const getTempDir = () => os.tmpdir();

const extractAll = async (zipPath: string, extractPath: string) => {
	try {
		// Ensure the extractPath directory exists
		if (!fs.existsSync(extractPath)) {
			fs.mkdirSync(extractPath, { recursive: true });
		}

		// Load the zip file
		const zip = new AdmZip(zipPath);

		// Extract all the contents to the specified directory
		zip.extractAllTo(extractPath, true);

		console.log(`Extracted files to ${extractPath}`);
	} catch (error) {
		console.error(`Failed to extract zip file: `, error);
	}
};

const moveDir = (source: string, destination: string) => fs.renameSync(source, destination);
const removeFile = (filePath: string) => fs.unlinkSync(filePath);
const removeDir = (dirPath: string) => fs.rmSync(dirPath, { recursive: true, force: true });

const getTidalDirectory = () => {
	switch (os.platform()) {
		case "win32": {
			const tidalDir = path.join(process.env.LOCALAPPDATA!, "TIDAL");
			const appDirs = fs.readdirSync(tidalDir).filter((subDir) => subDir.startsWith("app-"));
			const latestAppDir = appDirs.sort().pop();
			const tidalAppDir = latestAppDir ? path.join(tidalDir, latestAppDir, "resources") : null;
			if (tidalAppDir === null) throw new Error("Failed to find TIDAL directory");
			return tidalAppDir;
		}
		case "darwin":
			return "/Applications/TIDAL.app/Contents/Resources";
		default:
			console.error("Unsupported platform");
			process.exit(1);
	}
};

const install = async (NEPTUNE_URL: string) => {
	try {
		const tempDir = getTempDir();
		const zipPath = path.join(tempDir, "neptune.zip");
		const extractPath = path.join(tempDir, "neptune-unzipped");

		const res = await fetch(NEPTUNE_URL);
		if (res.body === null) throw new Error("Failed to download Neptune resources");
		const fileStream = fs.createWriteStream(zipPath);
		await pipelineAsync(res.body, fileStream);
		await extractAll(zipPath, extractPath);
		removeFile(zipPath);

		const tidalDirectory = getTidalDirectory();

		moveDir(path.join(extractPath, "neptune-master/injector"), path.join(tidalDirectory, "app"));
		removeDir(extractPath);

		const originalAsar = path.join(tidalDirectory, "original.asar");
		if (!fs.existsSync(originalAsar)) {
			moveDir(path.join(tidalDirectory, "app.asar"), originalAsar);
		}

		console.log("Installation complete.");
	} catch (err) {
		console.error(`Installation failed: `, err);
	}
};

const uninstall = () => {
	try {
		const tidalDirectory = getTidalDirectory();
		removeDir(path.join(tidalDirectory, "app"));
		moveDir(path.join(tidalDirectory, "original.asar"), path.join(tidalDirectory, "app.asar"));
		console.log("Uninstallation complete.");
	} catch (err) {
		console.error(`Uninstallation failed: `, err);
	}
};

const promptUser = () => {
	rl.question('Do you want to install or uninstall? (type "install" or "uninstall"): ', async (answer) => {
		if (answer === "install") {
			rl.question("Enter the Neptune URL (or press enter to use the default): ", async (NEPTUNE_URL) => {
				NEPTUNE_URL ||= "https://github.com/uwu/neptune/archive/refs/heads/master.zip";
				await install(NEPTUNE_URL);
				rl.close();
			});
		} else if (answer === "uninstall") {
			uninstall();
			rl.close();
		} else {
			console.log('Invalid input. Please type "install" or "uninstall".');
			promptUser();
		}
	});
};

promptUser();
